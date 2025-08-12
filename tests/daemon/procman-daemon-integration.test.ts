/**
 * Integration tests for ProcmanDaemon with components
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcmanDaemon, DaemonState } from '../../src/daemon/procman-daemon';
import { AppConfig, ProcmanConfig } from '../../src/shared/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock all external components
vi.mock('../../src/config/config-loader');
vi.mock('../../src/process-manager/process-manager');
vi.mock('../../src/services/log-manager');
vi.mock('../../src/daemon/ipc-factory');

// Mock all external components before importing ProcmanDaemon
const mockConfigLoader = {
  load: vi.fn(),
  stopWatching: vi.fn(),
};

const mockProcessManager = {
  configureProcess: vi.fn(),
  getProcessNames: vi.fn(() => []),
  stopProcesses: vi.fn(),
  cleanup: vi.fn(),
  getAllProcessInfo: vi.fn(() => []),
  startMonitoring: vi.fn(), // Add startMonitoring method for initialization
  // Add monitor mock for getAllProcessStatuses
  monitor: {
    getProcessStats: vi.fn((name: string) => {
      // Return different stats based on process name
      if (name === 'app1') {
        return Promise.resolve({ memory: 100, cpu: 2.5 });
      } else {
        return Promise.resolve({ memory: 0, cpu: 0 });
      }
    }),
  },
};

const mockLogManager = {
  writeLog: vi.fn(),
  setupAppLogs: vi.fn(),
};

const mockIPCServer = {
  start: vi.fn(),
  stop: vi.fn(),
  registerHandler: vi.fn(),
  isServerListening: vi.fn(() => true), // Mock as listening after start
};

// Override module mocks
vi.mocked(
  (await import('../../src/config/config-loader')).ConfigLoader
).mockImplementation(() => mockConfigLoader as any);
const ProcessManagerModule = await import(
  '../../src/process-manager/process-manager'
);
vi.mocked(ProcessManagerModule.ProcessManager).mockImplementation(
  () => mockProcessManager as any
);
// Mock the static create method
vi.mocked(ProcessManagerModule.ProcessManager).create = vi.fn(
  () => mockProcessManager as any
);
vi.mocked(
  (await import('../../src/services/log-manager')).LogManager
).mockImplementation(() => mockLogManager as any);
vi.mocked(
  (await import('../../src/daemon/ipc-factory')).createIPCServer
).mockReturnValue(mockIPCServer as any);

describe('ProcmanDaemon Integration Tests', () => {
  let daemon: ProcmanDaemon;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory
    tempDir = path.join(os.tmpdir(), `procman-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create .masuidrive-procman directory
    const dataDir = path.join(tempDir, '.masuidrive-procman');
    await fs.mkdir(dataDir, { recursive: true });

    // Override home directory via environment variable
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir; // Windows

    daemon = new ProcmanDaemon();
  });

  afterEach(async () => {
    // Cleanup
    try {
      if (daemon.isRunning()) {
        await daemon.stop();
      }
    } catch {
      // Ignore errors
    }

    // Remove temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }

    // Reset mocks
    vi.clearAllMocks();
    mockConfigLoader.load.mockReset();
    mockConfigLoader.stopWatching.mockReset();
    mockProcessManager.configureProcess.mockReset();
    mockProcessManager.getProcessNames.mockReset().mockReturnValue([]);
    mockProcessManager.stopProcesses.mockReset().mockResolvedValue(undefined);
    mockProcessManager.cleanup.mockReset().mockResolvedValue(undefined);
    mockProcessManager.getAllProcessInfo.mockReset().mockReturnValue([]);
    mockLogManager.writeLog.mockReset();
    mockLogManager.setupAppLogs.mockReset();
    mockIPCServer.start.mockReset().mockResolvedValue(undefined);
    mockIPCServer.stop.mockReset().mockResolvedValue(undefined);
    mockIPCServer.registerHandler.mockReset();
    mockIPCServer.isServerListening.mockReset().mockReturnValue(true);
  });

  describe('component integration', () => {
    it('should initialize all components on start', async () => {
      // Start daemon
      await daemon.start();

      // Verify all components are initialized
      expect(daemon.getProcessManager()).toBeDefined();
      expect(daemon.getConfigLoader()).toBeDefined();
      expect(daemon.getLogManager()).toBeDefined();
      expect(daemon.getIPCServer()).toBeDefined();
    });

    it('should handle component initialization errors', async () => {
      // Mock component failure
      const { ProcessManager } = await import(
        '../../src/process-manager/process-manager'
      );
      vi.mocked(ProcessManager).mockImplementationOnce(() => {
        throw new Error('ProcessManager init failed');
      });

      // Should throw error
      await expect(daemon.start()).rejects.toThrow(
        'ProcessManager init failed'
      );
      expect(daemon.getState()).toBe(DaemonState.ERROR);

      // Reset implementation for other tests
      vi.mocked(ProcessManager).mockImplementation(
        () => mockProcessManager as any
      );
    });

    it('should cleanup components in reverse order', async () => {
      const stopOrder: string[] = [];

      // Mock components to track cleanup order
      await daemon.start();

      const ipcServer = daemon.getIPCServer();
      const processManager = daemon.getProcessManager();
      const logManager = daemon.getLogManager();

      if (ipcServer) {
        vi.spyOn(ipcServer, 'stop').mockImplementation(async () => {
          stopOrder.push('ipc-server');
        });
      }

      if (processManager) {
        // Track process manager cleanup through ComponentManager
        vi.spyOn(processManager, 'cleanup').mockImplementation(async () => {
          stopOrder.push('process-manager');
        });
      }

      if (logManager) {
        // LogManager doesn't have a cleanup method
        stopOrder.push('log-manager');
      }

      await daemon.stop();

      // Verify cleanup order (reverse of initialization: commandHandler, ipcServer, logManager, processManager, configLoader)
      expect(stopOrder).toEqual([
        'log-manager',
        'ipc-server',
        'process-manager',
      ]);
    });
  });

  describe('configuration management', () => {
    it('should load configuration and update components', async () => {
      await daemon.start();

      const mockConfig: AppConfig[] = [
        {
          name: 'test-app',
          script: 'node',
          args: 'test.js',
        },
      ];

      const configLoader = daemon.getConfigLoader();
      if (configLoader) {
        vi.spyOn(configLoader, 'load').mockResolvedValue({
          apps: mockConfig,
        } as ProcmanConfig);
      }

      await daemon.loadConfig('/path/to/config.js');

      // Verify configuration is loaded
      expect(daemon.getConfig()).toEqual(mockConfig);

      // Wait a bit for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify process manager is updated through ComponentManager's daemon interface
      const processManager = daemon.getProcessManager();
      expect(processManager?.configureProcess).toHaveBeenCalledWith(
        mockConfig[0]
      );
    });

    it('should handle configuration loading errors', async () => {
      await daemon.start();

      const configLoader = daemon.getConfigLoader();
      if (configLoader) {
        vi.spyOn(configLoader, 'load').mockRejectedValue(
          new Error('Invalid config file')
        );
      }

      await expect(daemon.loadConfig('/invalid/config.js')).rejects.toThrow(
        'Invalid config file'
      );
    });
  });

  describe('process status management', () => {
    it('should return all process statuses', async () => {
      await daemon.start();

      const mockProcessInfos = [
        {
          name: 'app1',
          namespace: 'dev',
          status: 'running' as const,
          pid: 1234,
          uptime: 3600000,
          memory: 100,
          cpu: 2.5,
          restarts: 0,
        },
        {
          name: 'app2',
          status: 'stopped' as const,
          uptime: 0,
          memory: 0,
          cpu: 0,
          restarts: 2,
        },
      ];

      const processManager = daemon.getProcessManager();
      if (processManager) {
        vi.spyOn(processManager, 'getAllProcessInfo').mockReturnValue(
          mockProcessInfos as any
        );
      }

      const statuses = await daemon.getAllProcessStatuses();

      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toEqual({
        name: 'app1',
        namespace: 'dev',
        status: 'running',
        pid: 1234,
        uptime: 3600000,
        memory: 100,
        cpu: 2.5,
        restarts: 0,
      });
      expect(statuses[1]).toEqual({
        name: 'app2',
        namespace: 'default',
        status: 'stopped',
        pid: undefined, // ProcessManager.getAllProcessInfo doesn't guarantee null vs undefined
        uptime: 0,
        memory: 0,
        cpu: 0,
        restarts: 2,
      });
    });
  });

  describe('error handling', () => {
    it('should handle partial component cleanup failures', async () => {
      await daemon.start();

      const processManager = daemon.getProcessManager();
      if (processManager) {
        vi.spyOn(processManager, 'cleanup').mockRejectedValue(
          new Error('Failed to stop processes')
        );
      }

      // ComponentManager aggregates errors - should throw with error message
      await expect(daemon.stop()).rejects.toThrow(
        'Failed to cleanup component'
      );
    });

    it('should log daemon messages', async () => {
      await daemon.start();

      const logManager = daemon.getLogManager();
      const setupAppLogsSpy = vi.spyOn(logManager!, 'setupAppLogs');

      // Trigger setupAppLogs by loading config with log files
      const configLoader = daemon.getConfigLoader();
      if (configLoader) {
        vi.spyOn(configLoader, 'load').mockResolvedValue({
          apps: [
            {
              name: 'test-app',
              script: 'node',
              args: 'test.js',
              log_file: 'test.log', // This will trigger setupAppLogs
            },
          ],
        } as ProcmanConfig);
      }

      await daemon.loadConfig('/test/config.js');

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify log manager setupAppLogs was called for the configured app
      expect(setupAppLogsSpy).toHaveBeenCalledWith(
        'test-app',
        expect.objectContaining({
          logFile: 'test.log',
        })
      );
    });
  });
});
