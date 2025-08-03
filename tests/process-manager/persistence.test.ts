/**
 * ProcessManager Persistence Tests
 *
 * Tests for process state persistence functionality including
 * saving, loading, backup, and recovery mechanisms.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ProcessManager } from '../../src/process-manager/process-manager';
import { ManagedProcessInfo } from '../../src/process-manager/managed-process-info';
import { AppConfig } from '../../src/shared/config';
import { PROCESSES_FILE } from '../../src/shared/constants';

// Mock file system operations
vi.mock('fs', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (await vi.importActual('fs')) as any;
  return {
    ...actual,
    promises: {
      ...(actual.promises || {}),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      readFile: vi.fn(),
      rename: vi.fn(),
      copyFile: vi.fn(),
      access: vi.fn(),
    },
  };
});

// Mock os.homedir
vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

describe('ProcessManager Persistence', () => {
  let processManager: ProcessManager;
  let testConfig: AppConfig;
  let mockPersistencePath: string;

  beforeEach(() => {
    vi.clearAllMocks();

    processManager = new ProcessManager();
    mockPersistencePath = path.join(
      '/mock/home',
      '.masuidrive-procman',
      PROCESSES_FILE
    );

    testConfig = {
      name: 'test-process',
      script: '/usr/bin/node',
      args: 'test-script.js',
      namespace: 'test',
      cwd: '/test/dir',
      env: { NODE_ENV: 'test' },
      max_memory_restart: '100M',
    };
  });

  afterEach(async () => {
    await processManager.cleanup();
  });

  describe('State Persistence', () => {
    it('should save process state to JSON file', async () => {
      // Setup process
      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');
      await processManager.initialize();

      // Mock successful write
      const mockWriteFile = fs.writeFile as any;
      const mockRename = fs.rename as any;
      const mockMkdir = fs.mkdir as any;
      const mockAccess = fs.access as any;
      const mockCopyFile = fs.copyFile as any;

      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
      mockAccess.mockRejectedValue({ code: 'ENOENT' }); // No existing file
      mockCopyFile.mockResolvedValue(undefined);

      // Save state
      await processManager.saveState();

      // Verify file operations
      expect(mockMkdir).toHaveBeenCalledWith(
        path.dirname(mockPersistencePath),
        { recursive: true }
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        `${mockPersistencePath}.tmp`,
        expect.stringContaining('"test-process"'),
        'utf-8'
      );
      expect(mockRename).toHaveBeenCalledWith(
        `${mockPersistencePath}.tmp`,
        mockPersistencePath
      );
    });

    it('should create backup before saving', async () => {
      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');
      await processManager.initialize();

      const mockWriteFile = fs.writeFile as any;
      const mockRename = fs.rename as any;
      const mockMkdir = fs.mkdir as any;
      const mockAccess = fs.access as any;
      const mockCopyFile = fs.copyFile as any;

      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
      mockAccess.mockResolvedValue(undefined); // File exists
      mockCopyFile.mockResolvedValue(undefined);

      await processManager.saveState();

      expect(mockCopyFile).toHaveBeenCalledWith(
        mockPersistencePath,
        `${mockPersistencePath}.bak`
      );
    });

    it('should handle save errors gracefully', async () => {
      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');
      await processManager.initialize();

      const mockWriteFile = fs.writeFile as any;
      const mockMkdir = fs.mkdir as any;

      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockRejectedValue(new Error('Disk full'));

      await expect(processManager.saveState()).rejects.toThrow('Disk full');
    });
  });

  describe('State Loading', () => {
    it('should load persisted state on initialization', async () => {
      const mockReadFile = fs.readFile as any;

      const persistedData = [
        {
          name: 'test-process',
          status: 'stopped',
          pid: null,
          restartCount: 5,
          autoRestartEnabled: true,
          lastStartTime: Date.now() - 1000,
          stateHistory: [
            { timestamp: Date.now() - 2000, from: 'stopped', to: 'starting' },
            { timestamp: Date.now() - 1000, from: 'starting', to: 'online' },
          ],
          memoryHistory: [{ timestamp: Date.now() - 1000, usage: 50000000 }],
          cpuHistory: [{ timestamp: Date.now() - 1000, usage: 25.5 }],
          consecutiveRestarts: 0,
          lastRestartTime: Date.now() - 5000,
          lastCrashTime: null,
        },
      ];

      mockReadFile.mockResolvedValue(JSON.stringify(persistedData));

      // Setup process before loading
      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');

      await processManager.initialize();

      // Verify state was restored
      const processInfo = processManager.getProcessInfo('test-process');
      expect(processInfo).toBeDefined();
      expect(processInfo!.restarts).toBe(5);
      expect(processInfo!.status).toBe('stopped'); // Should be restored as stopped
    });

    it('should handle missing persistence file', async () => {
      const mockReadFile = fs.readFile as any;
      mockReadFile.mockRejectedValue({ code: 'ENOENT' });

      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');

      await expect(processManager.initialize()).resolves.not.toThrow();
    });

    it('should handle corrupted persistence file', async () => {
      const mockReadFile = fs.readFile as any;

      // First call (main file) - corrupted JSON
      // Second call (backup file) - valid JSON
      mockReadFile
        .mockRejectedValueOnce(new SyntaxError('Unexpected token'))
        .mockResolvedValueOnce(
          JSON.stringify([
            {
              name: 'test-process',
              status: 'stopped',
              pid: null,
              restartCount: 3,
              autoRestartEnabled: true,
              lastStartTime: null,
              stateHistory: [],
              memoryHistory: [],
              cpuHistory: [],
              consecutiveRestarts: 0,
              lastRestartTime: null,
              lastCrashTime: null,
            },
          ])
        );

      const mockCopyFile = fs.copyFile as any;
      mockCopyFile.mockResolvedValue(undefined);

      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');

      await processManager.initialize();

      // Should have loaded from backup
      expect(mockReadFile).toHaveBeenCalledTimes(2);
      expect(mockCopyFile).toHaveBeenCalledWith(
        `${mockPersistencePath}.bak`,
        mockPersistencePath
      );
    });

    it('should handle corrupted backup file', async () => {
      const mockReadFile = fs.readFile as any;

      // Both main and backup files are corrupted
      mockReadFile.mockRejectedValue(new SyntaxError('Unexpected token'));

      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');

      // Should not throw, just start with clean state
      await expect(processManager.initialize()).resolves.not.toThrow();
    });
  });

  describe('State History Management', () => {
    it('should track state changes in history', async () => {
      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');

      const managedProcess = processManager['processes'].get(
        'test-process'
      ) as ManagedProcessInfo;

      // Change status to trigger history recording
      managedProcess.setStatus('starting', false, 'Manual start');
      managedProcess.setStatus('online', false, 'Process started successfully');

      const stateHistory = managedProcess.getStateHistory();
      expect(stateHistory).toHaveLength(2);
      expect(stateHistory[0].from).toBe('stopped');
      expect(stateHistory[0].to).toBe('starting');
      expect(stateHistory[0].reason).toBe('Manual start');
      expect(stateHistory[1].from).toBe('starting');
      expect(stateHistory[1].to).toBe('online');
      expect(stateHistory[1].reason).toBe('Process started successfully');
    });

    it('should limit state history to maximum length', async () => {
      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');

      const managedProcess = processManager['processes'].get(
        'test-process'
      ) as ManagedProcessInfo;

      // Add many state changes (more than MAX_HISTORY_LENGTH)
      for (let i = 0; i < 150; i++) {
        managedProcess.setStatus('starting', false);
        managedProcess.setStatus('online', false);
        managedProcess.setStatus('stopped', false);
      }

      const stateHistory = managedProcess.getStateHistory();
      expect(stateHistory.length).toBeLessThanOrEqual(100); // MAX_HISTORY_LENGTH
    });

    it('should track memory and CPU usage history', async () => {
      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');

      const managedProcess = processManager['processes'].get(
        'test-process'
      ) as ManagedProcessInfo;

      // Update memory and CPU usage
      managedProcess.updateMemoryUsage(50000000); // 50MB
      managedProcess.updateCpuUsage(25.5);

      const memoryHistory = managedProcess.getMemoryHistory();
      const cpuHistory = managedProcess.getCpuHistory();

      expect(memoryHistory).toHaveLength(1);
      expect(memoryHistory[0].usage).toBe(50000000);
      expect(memoryHistory[0].timestamp).toBeTypeOf('number');

      expect(cpuHistory).toHaveLength(1);
      expect(cpuHistory[0].usage).toBe(25.5);
      expect(cpuHistory[0].timestamp).toBeTypeOf('number');
    });
  });

  describe('Debounced Save', () => {
    it('should debounce frequent save calls when triggered multiple times', async () => {
      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');
      await processManager.initialize();

      const mockWriteFile = fs.writeFile as any;
      const mockRename = fs.rename as any;
      const mockMkdir = fs.mkdir as any;
      const mockAccess = fs.access as any;

      // Clear previous calls from initialization
      mockWriteFile.mockClear();
      mockRename.mockClear();

      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
      mockAccess.mockRejectedValue({ code: 'ENOENT' });

      // Note: debounced save function is now internal to persistence component
      // Just call saveState multiple times to test debouncing behavior
      await processManager.saveState();
      await processManager.saveState();
      await processManager.saveState();

      // Wait for debounce timeout
      await new Promise((resolve) => globalThis.setTimeout(resolve, 400));

      // Should only save once due to debouncing
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('Force Save', () => {
    it('should force save immediately bypassing debounce', async () => {
      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');
      await processManager.initialize();

      const mockWriteFile = fs.writeFile as any;
      const mockRename = fs.rename as any;
      const mockMkdir = fs.mkdir as any;
      const mockAccess = fs.access as any;

      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
      mockAccess.mockRejectedValue({ code: 'ENOENT' });

      await processManager.forceSaveState();

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockRename).toHaveBeenCalledTimes(1);
    });
  });

  describe('Persistence File Path', () => {
    it('should return correct persistence file path', () => {
      const expectedPath = path.join(
        '/mock/home',
        '.masuidrive-procman',
        PROCESSES_FILE
      );
      expect(processManager.getPersistenceFilePath()).toBe(expectedPath);
    });
  });

  describe('Process State Restoration', () => {
    it('should restore transient states as stopped', async () => {
      const mockReadFile = fs.readFile as any;

      const persistedData = [
        {
          name: 'test-process',
          status: 'online', // Transient state that should be restored as stopped
          pid: 1234,
          restartCount: 2,
          autoRestartEnabled: true,
          lastStartTime: Date.now() - 1000,
          stateHistory: [],
          memoryHistory: [],
          cpuHistory: [],
          consecutiveRestarts: 0,
          lastRestartTime: null,
          lastCrashTime: null,
        },
      ];

      mockReadFile.mockResolvedValue(JSON.stringify(persistedData));

      processManager.configureProcess(testConfig);
      processManager.initializeProcess('test-process');

      await processManager.initialize();

      const processInfo = processManager.getProcessInfo('test-process');
      expect(processInfo!.status).toBe('stopped');
      expect(processInfo!.pid).toBeNull(); // PID should always be null after restart
    });
  });
});
