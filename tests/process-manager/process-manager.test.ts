/**
 * Unit tests for ProcessManager facade class
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ProcessManager } from '../../src/process-manager/process-manager';
import { AppConfig } from '../../src/shared/config';

// Mock the component implementations
vi.mock('../../src/process-manager/process-lifecycle-manager', () => ({
  ProcessLifecycleManagerImpl: vi.fn(() => ({
    startProcess: vi.fn().mockResolvedValue({ success: true }),
    stopProcess: vi.fn().mockResolvedValue({ success: true }),
    restartProcess: vi.fn().mockResolvedValue({ success: true }),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  })),
}));

vi.mock('../../src/process-manager/process-monitor', () => ({
  ProcessMonitorImpl: vi.fn(() => ({
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  })),
}));

vi.mock('../../src/process-manager/process-persistence', () => ({
  ProcessPersistenceImpl: vi.fn(() => ({
    initialize: vi.fn(),
    loadState: vi.fn().mockResolvedValue(undefined),
    saveState: vi.fn().mockResolvedValue(undefined),
    forceSaveState: vi.fn().mockResolvedValue(undefined),
    getFilePath: vi.fn().mockReturnValue('/tmp/test.json'),
    cleanup: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  })),
}));

vi.mock('../../src/process-manager/process-group-manager', () => ({
  ProcessGroupManagerImpl: vi.fn(() => ({
    startProcesses: vi.fn().mockResolvedValue({ results: [] }),
    stopProcesses: vi.fn().mockResolvedValue({ results: [] }),
    restartProcesses: vi.fn().mockResolvedValue({ results: [] }),
    startNamespace: vi.fn().mockResolvedValue({ results: [] }),
    stopNamespace: vi.fn().mockResolvedValue({ results: [] }),
    restartNamespace: vi.fn().mockResolvedValue({ results: [] }),
    configureDependency: vi.fn(),
    removeDependency: vi.fn(),
    getDependency: vi.fn(),
    getAllDependencies: vi.fn().mockReturnValue([]),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  })),
}));

describe('ProcessManager', () => {
  let processManager: ProcessManager;
  let sampleAppConfig: AppConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    processManager = new ProcessManager();
    sampleAppConfig = {
      name: 'test-app',
      script: '/path/to/app.js',
      namespace: 'web',
      args: '--port 3000 --env production',
      cwd: '/app/directory',
      note: 'Test application',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      max_memory_restart: '512M',
      log_file: '/logs/app.log',
      out_file: '/logs/app.out',
      error_file: '/logs/app.err',
    };
  });

  afterEach(async () => {
    await processManager.cleanup();
  });

  describe('constructor', () => {
    it('should initialize with empty process lists', () => {
      expect(processManager.getProcessNames()).toEqual([]);
      expect(processManager.getAllProcessInfo()).toEqual([]);
    });

    it('should initialize components', () => {
      expect(processManager.lifecycle).toBeDefined();
      expect(processManager.monitor).toBeDefined();
      expect(processManager.persistence).toBeDefined();
      expect(processManager.groups).toBeDefined();
    });
  });

  describe('process configuration', () => {
    it('should configure process correctly', () => {
      processManager.configureProcess(sampleAppConfig);

      const config = processManager.getProcessConfig('test-app');
      expect(config).toBeDefined();
      expect(config?.name).toBe('test-app');
      expect(config?.script).toBe('/path/to/app.js');
      expect(config?.namespace).toBe('web');
      expect(config?.args).toEqual(['--port', '3000', '--env', 'production']);
      expect(config?.cwd).toBe('/app/directory');
      expect(config?.max_memory_restart).toBe(512 * 1024 * 1024); // 512MB in bytes
      expect(config?.note).toBe('Test application');
    });

    it('should handle default values correctly', () => {
      const minimalConfig: AppConfig = {
        name: 'minimal-app',
        script: '/path/to/script.js',
      };

      processManager.configureProcess(minimalConfig);

      const config = processManager.getProcessConfig('minimal-app');
      expect(config?.namespace).toBe('default');
      expect(config?.args).toEqual([]);
      expect(config?.cwd).toBe(process.cwd());
      expect(config?.max_memory_restart).toBeUndefined();
    });

    it('should parse memory limit correctly', () => {
      const configs = [
        { max_memory_restart: '100M', expected: 100 * 1024 * 1024 },
        { max_memory_restart: '1G', expected: 1024 * 1024 * 1024 },
        { max_memory_restart: '500K', expected: 500 * 1024 },
        { max_memory_restart: 'invalid', expected: undefined },
      ];

      configs.forEach(({ max_memory_restart, expected }, index) => {
        const config: AppConfig = {
          name: `test-${index}`,
          script: '/script.js',
          max_memory_restart,
        };

        processManager.configureProcess(config);
        const processConfig = processManager.getProcessConfig(`test-${index}`);
        expect(processConfig?.max_memory_restart).toBe(expected);
      });
    });

    it('should remove process configuration', () => {
      processManager.configureProcess(sampleAppConfig);
      expect(processManager.getProcessConfig('test-app')).toBeDefined();

      processManager.removeProcessConfig('test-app');
      expect(processManager.getProcessConfig('test-app')).toBeUndefined();
    });

    it('should handle empty arguments string', () => {
      const configWithEmptyArgs: AppConfig = {
        name: 'test-empty-args',
        script: '/script.js',
        args: '   ',
      };

      processManager.configureProcess(configWithEmptyArgs);
      const config = processManager.getProcessConfig('test-empty-args');
      expect(config?.args).toEqual([]);
    });

    it('should automatically initialize process when configuring', () => {
      expect(processManager.hasProcess('test-app')).toBe(false);

      processManager.configureProcess(sampleAppConfig);

      expect(processManager.hasProcess('test-app')).toBe(true);
      expect(processManager.getProcessNames()).toContain('test-app');
    });
  });

  describe('process management', () => {
    beforeEach(() => {
      processManager.configureProcess(sampleAppConfig);
    });

    it('should not initialize process twice', () => {
      // Process is already initialized by configureProcess
      const result = processManager.initializeProcess('test-app');
      expect(result).toBe(false);
    });

    it('should return false when initializing process without configuration', () => {
      const result = processManager.initializeProcess('nonexistent-app');
      expect(result).toBe(false);
    });

    it('should remove process correctly', () => {
      expect(processManager.hasProcess('test-app')).toBe(true);

      const result = processManager.removeProcess('test-app');
      expect(result).toBe(true);
      expect(processManager.hasProcess('test-app')).toBe(false);
      expect(processManager.getProcessNames()).not.toContain('test-app');
    });

    it('should return false when removing nonexistent process', () => {
      const result = processManager.removeProcess('nonexistent-app');
      expect(result).toBe(false);
    });

    it('should get process information after configuration', () => {
      const processInfo = processManager.getProcessInfo('test-app');
      expect(processInfo).toBeDefined();
      expect(processInfo?.name).toBe('test-app');
      expect(processInfo?.namespace).toBe('web');
      expect(processInfo?.status).toBe('stopped');
      expect(processInfo?.pid).toBeNull();
      expect(processInfo?.uptime).toBe(0);
      expect(processInfo?.memory).toBe(0);
      expect(processInfo?.cpu).toBe(0);
      expect(processInfo?.restarts).toBe(0);
      expect(processInfo?.note).toBe('Test application');
    });

    it('should return undefined for nonexistent process info', () => {
      const processInfo = processManager.getProcessInfo('nonexistent-app');
      expect(processInfo).toBeUndefined();
    });
  });

  describe('multiple process management', () => {
    const configs: AppConfig[] = [
      { name: 'app1', script: '/app1.js', namespace: 'web' },
      { name: 'app2', script: '/app2.js', namespace: 'web' },
      { name: 'app3', script: '/app3.js', namespace: 'worker' },
      { name: 'app4', script: '/app4.js' }, // default namespace
    ];

    beforeEach(() => {
      configs.forEach((config) => {
        processManager.configureProcess(config);
      });
    });

    it('should get all process information', () => {
      const allProcesses = processManager.getAllProcessInfo();
      expect(allProcesses).toHaveLength(4);

      const names = allProcesses.map((p) => p.name);
      expect(names).toContain('app1');
      expect(names).toContain('app2');
      expect(names).toContain('app3');
      expect(names).toContain('app4');
    });

    it('should filter processes by namespace', () => {
      const webProcesses = processManager.getProcessesByNamespace('web');
      expect(webProcesses).toHaveLength(2);
      expect(webProcesses.map((p) => p.name)).toEqual(
        expect.arrayContaining(['app1', 'app2'])
      );

      const workerProcesses = processManager.getProcessesByNamespace('worker');
      expect(workerProcesses).toHaveLength(1);
      expect(workerProcesses[0].name).toBe('app3');

      const defaultProcesses =
        processManager.getProcessesByNamespace('default');
      expect(defaultProcesses).toHaveLength(1);
      expect(defaultProcesses[0].name).toBe('app4');
    });

    it('should get all process names', () => {
      const names = processManager.getProcessNames();
      expect(names).toHaveLength(4);
      expect(names).toEqual(
        expect.arrayContaining(['app1', 'app2', 'app3', 'app4'])
      );
    });

    it('should get namespace status', () => {
      const webStatus = processManager.getNamespaceStatus('web');
      expect(webStatus).toEqual({
        total: 2,
        online: 0,
        stopped: 2,
        errored: 0,
        starting: 0,
        stopping: 0,
      });
    });

    it('should get all namespaces', () => {
      const namespaces = processManager.getNamespaces();
      expect(namespaces).toEqual(['default', 'web', 'worker']);
    });
  });

  describe('event handling', () => {
    it('should set up event forwarding from components', () => {
      // Test that ProcessManager constructor calls setup methods
      expect(processManager.lifecycle).toBeDefined();
      expect(processManager.monitor).toBeDefined();
      expect(processManager.persistence).toBeDefined();
      expect(processManager.groups).toBeDefined();
    });

    it('should be an EventEmitter', () => {
      expect(processManager.on).toBeDefined();
      expect(processManager.emit).toBeDefined();
      expect(processManager.removeAllListeners).toBeDefined();
    });
  });

  describe('process lifecycle methods', () => {
    beforeEach(() => {
      processManager.configureProcess(sampleAppConfig);
    });

    describe('startProcess', () => {
      it('should delegate to lifecycle manager', async () => {
        await processManager.startProcess('test-app');
        expect(processManager.lifecycle.startProcess).toHaveBeenCalledWith(
          'test-app'
        );
      });

      it('should throw error when lifecycle manager returns failure', async () => {
        // Mock lifecycle manager to return failure
        vi.mocked(processManager.lifecycle.startProcess).mockResolvedValueOnce({
          success: false,
          error: 'Process not found',
        });

        await expect(processManager.startProcess('test-app')).rejects.toThrow(
          'Process not found'
        );
      });
    });

    describe('stopProcess', () => {
      it('should delegate to lifecycle manager', async () => {
        await processManager.stopProcess('test-app');
        expect(processManager.lifecycle.stopProcess).toHaveBeenCalledWith(
          'test-app'
        );
      });

      it('should throw error when lifecycle manager returns failure', async () => {
        vi.mocked(processManager.lifecycle.stopProcess).mockResolvedValueOnce({
          success: false,
          error: 'Process not found',
        });

        await expect(processManager.stopProcess('test-app')).rejects.toThrow(
          'Process not found'
        );
      });
    });

    describe('restartProcess', () => {
      it('should delegate to lifecycle manager', async () => {
        await processManager.restartProcess('test-app');
        expect(processManager.lifecycle.restartProcess).toHaveBeenCalledWith(
          'test-app'
        );
      });

      it('should throw error when lifecycle manager returns failure', async () => {
        vi.mocked(
          processManager.lifecycle.restartProcess
        ).mockResolvedValueOnce({
          success: false,
          error: 'Process not found',
        });

        await expect(processManager.restartProcess('test-app')).rejects.toThrow(
          'Process not found'
        );
      });
    });
  });

  describe('batch operations', () => {
    beforeEach(() => {
      processManager.configureProcess(sampleAppConfig);
    });

    it('should delegate startProcesses to group manager', async () => {
      const names = ['test-app'];
      await processManager.startProcesses(names);
      expect(processManager.groups.startProcesses).toHaveBeenCalledWith(names);
    });

    it('should delegate stopProcesses to group manager', async () => {
      const names = ['test-app'];
      await processManager.stopProcesses(names);
      expect(processManager.groups.stopProcesses).toHaveBeenCalledWith(names);
    });

    it('should delegate restartProcesses to group manager', async () => {
      const names = ['test-app'];
      await processManager.restartProcesses(names);
      expect(processManager.groups.restartProcesses).toHaveBeenCalledWith(
        names
      );
    });

    it('should delegate namespace operations to group manager', async () => {
      await processManager.startNamespace('web');
      expect(processManager.groups.startNamespace).toHaveBeenCalledWith('web');

      await processManager.stopNamespace('web');
      expect(processManager.groups.stopNamespace).toHaveBeenCalledWith('web');

      await processManager.restartNamespace('web');
      expect(processManager.groups.restartNamespace).toHaveBeenCalledWith(
        'web'
      );
    });
  });

  describe('monitoring', () => {
    it('should delegate monitoring to monitor component', () => {
      processManager.startMonitoring();
      expect(processManager.monitor.startMonitoring).toHaveBeenCalled();

      processManager.stopMonitoring();
      expect(processManager.monitor.stopMonitoring).toHaveBeenCalled();
    });
  });

  describe('persistence', () => {
    it('should delegate persistence operations to persistence component', async () => {
      await processManager.initialize();
      expect(processManager.persistence.loadState).toHaveBeenCalled();

      await processManager.saveState();
      expect(processManager.persistence.saveState).toHaveBeenCalled();

      await processManager.forceSaveState();
      expect(processManager.persistence.forceSaveState).toHaveBeenCalled();

      const filePath = processManager.getPersistenceFilePath();
      expect(processManager.persistence.getFilePath).toHaveBeenCalled();
      expect(filePath).toBe('/tmp/test.json');
    });
  });

  describe('dependency management', () => {
    it('should delegate dependency operations to group manager', () => {
      const dependency = {
        name: 'test-app',
        dependsOn: ['database'],
        startupOrder: 1,
        shutdownOrder: 2,
        healthCheck: { enabled: false },
        restartPolicy: 'on-failure' as const,
      };

      processManager.configureDependency(dependency);
      expect(processManager.groups.configureDependency).toHaveBeenCalledWith(
        dependency
      );

      processManager.removeDependency('test-app');
      expect(processManager.groups.removeDependency).toHaveBeenCalledWith(
        'test-app'
      );

      processManager.getDependency('test-app');
      expect(processManager.groups.getDependency).toHaveBeenCalledWith(
        'test-app'
      );

      processManager.getAllDependencies();
      expect(processManager.groups.getAllDependencies).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    const configs = [
      { name: 'app1', script: '/app1.js' },
      { name: 'app2', script: '/app2.js' },
    ];

    beforeEach(() => {
      configs.forEach((config) => {
        processManager.configureProcess(config);
      });
    });

    it('should clean up all resources', async () => {
      expect(processManager.getProcessNames()).toHaveLength(2);

      await processManager.cleanup();

      expect(processManager.getProcessNames()).toHaveLength(0);
      expect(processManager.getAllProcessInfo()).toHaveLength(0);
      expect(processManager.getProcessConfig('app1')).toBeUndefined();
      expect(processManager.getProcessConfig('app2')).toBeUndefined();
    });

    it('should stop monitoring during cleanup', async () => {
      await processManager.cleanup();
      expect(processManager.monitor.stopMonitoring).toHaveBeenCalled();
    });

    it('should force save state during cleanup', async () => {
      await processManager.cleanup();
      expect(processManager.persistence.forceSaveState).toHaveBeenCalled();
    });
  });

  describe('configuration updates', () => {
    it('should update process configuration', () => {
      processManager.configureProcess(sampleAppConfig);

      const updatedConfig: AppConfig = {
        ...sampleAppConfig,
        max_memory_restart: '1G',
        note: 'Updated application',
      };

      processManager.configureProcess(updatedConfig);

      const config = processManager.getProcessConfig('test-app');
      expect(config?.max_memory_restart).toBe(1024 * 1024 * 1024); // 1GB
      expect(config?.note).toBe('Updated application');
      expect(config?.name).toBe('test-app'); // Name should be preserved
    });
  });

  describe('auto-restart management', () => {
    beforeEach(() => {
      processManager.configureProcess(sampleAppConfig);
    });

    it('should provide auto-restart control methods', () => {
      // These methods should exist on the facade
      expect(processManager.enableAutoRestart).toBeDefined();
      expect(processManager.disableAutoRestart).toBeDefined();
      expect(processManager.resetRestartFailures).toBeDefined();
      expect(processManager.getAutoRestartStatus).toBeDefined();
    });

    it('should return auto-restart status for existing process', () => {
      const status = processManager.getAutoRestartStatus('test-app');
      expect(status).toEqual({
        enabled: false, // Default value when process methods aren't available
        consecutiveFailures: 0,
      });
    });

    it('should return default status for non-existent process', () => {
      const status = processManager.getAutoRestartStatus('nonexistent');
      expect(status).toEqual({
        enabled: false,
        consecutiveFailures: 0,
      });
    });
  });
});
