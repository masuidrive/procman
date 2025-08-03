/**
 * Unit tests for ProcessPersistenceImpl
 */

import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ProcessPersistenceImpl } from '../../src/process-manager/process-persistence';
import { ManagedProcessInfo } from '../../src/process-manager/managed-process-info';
import { ProcessConfig } from '../../src/process-manager/process-manager';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock fs/promises
vi.mock('fs/promises');

describe('ProcessPersistenceImpl', () => {
  let persistence: ProcessPersistenceImpl;
  let processes: Map<string, ManagedProcessInfo>;
  let testFilePath: string;

  beforeEach(() => {
    processes = new Map();
    testFilePath = path.join(
      os.homedir(),
      '.masuidrive-procman',
      'processes.json'
    );
    persistence = new ProcessPersistenceImpl(processes);

    // Initialize persistence
    persistence.initialize({
      filePath: testFilePath,
      saveDelay: 300,
      enableBackup: true,
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    processes.clear();
    persistence.cleanup();
  });

  describe('saveState', () => {
    it('should save process state to file', async () => {
      const config: ProcessConfig = {
        name: 'test-process',
        script: 'node',
        args: ['--version'],
        namespace: 'test',
        cwd: process.cwd(),
        env: {},
        instances: 1,
        autorestart: true,
        watch: false,
        max_restarts: 10,
        min_uptime: 1000,
        restart_delay: 1000,
      };

      const managedProcess = new ManagedProcessInfo(config);
      managedProcess.setStatus('online');
      managedProcess.setPid(12345);
      processes.set('test-process', managedProcess);

      // Mock fs operations
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found')); // No backup exists

      // Get persisted process info
      const processArray = Array.from(processes.values()).map((p) =>
        p.toJSON()
      );
      await persistence.saveState(processArray);

      // Verify directory creation
      expect(fs.mkdir).toHaveBeenCalledWith(path.dirname(testFilePath), {
        recursive: true,
      });

      // Verify file write
      expect(fs.writeFile).toHaveBeenCalledWith(
        testFilePath,
        expect.any(String),
        'utf8'
      );

      // Verify saved data structure
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const savedData = JSON.parse(writeCall[1] as string);

      expect(savedData).toHaveProperty('version', '1.0');
      expect(savedData).toHaveProperty('timestamp');
      expect(savedData).toHaveProperty('processes');
      expect(savedData.processes).toHaveLength(1);
      expect(savedData.processes[0]).toMatchObject({
        name: 'test-process',
        status: 'online',
        pid: 12345,
      });
    });

    it('should handle save errors and emit error event', async () => {
      const config: ProcessConfig = {
        name: 'test-process',
        script: 'node',
        args: [],
        namespace: 'test',
        cwd: process.cwd(),
        env: {},
        instances: 1,
        autorestart: true,
        watch: false,
        max_restarts: 10,
        min_uptime: 1000,
        restart_delay: 1000,
      };

      const managedProcess = new ManagedProcessInfo(config);
      processes.set('test-process', managedProcess);

      // Mock fs operations to fail
      const saveError = new Error('Permission denied');
      vi.mocked(fs.mkdir).mockRejectedValue(saveError);

      const errorPromise = new Promise((resolve) => {
        persistence.on('save-error', (error) => {
          resolve(error);
        });
      });

      // Get persisted process info
      const processArray = Array.from(processes.values()).map((p) =>
        p.toJSON()
      );
      await persistence.saveState(processArray);

      const emittedError = await errorPromise;
      expect(emittedError).toBe(saveError);
    });

    it('should create backup before saving', async () => {
      const config: ProcessConfig = {
        name: 'test-process',
        script: 'node',
        args: [],
        namespace: 'test',
        cwd: process.cwd(),
        env: {},
        instances: 1,
        autorestart: true,
        watch: false,
        max_restarts: 10,
        min_uptime: 1000,
        restart_delay: 1000,
      };

      const managedProcess = new ManagedProcessInfo(config);
      processes.set('test-process', managedProcess);

      // Mock fs operations
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.access).mockResolvedValue(); // File exists
      vi.mocked(fs.copyFile).mockResolvedValue();

      // Get persisted process info
      const processArray = Array.from(processes.values()).map((p) =>
        p.toJSON()
      );
      await persistence.saveState(processArray);

      // Verify backup creation
      expect(fs.copyFile).toHaveBeenCalledWith(
        testFilePath,
        testFilePath + '.backup'
      );
    });
  });

  describe('loadState', () => {
    it('should load process state from file', async () => {
      const savedData = {
        version: '1.0',
        timestamp: Date.now(),
        processes: [
          {
            name: 'test-process',
            status: 'stopped',
            pid: null,
            restartCount: 5,
            autoRestartEnabled: true,
            lastStartTime: null,
            stateHistory: [],
            memoryHistory: [],
            cpuHistory: [],
            consecutiveRestarts: 0,
            lastRestartTime: null,
            lastCrashTime: null,
          },
        ],
      };

      // Mock fs operations
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify(savedData, null, 2)
      );

      // Create process config that matches
      const config: ProcessConfig = {
        name: 'test-process',
        script: 'node',
        args: [],
        namespace: 'test',
        cwd: process.cwd(),
        env: {},
        instances: 1,
        autorestart: true,
        watch: false,
        max_restarts: 10,
        min_uptime: 1000,
        restart_delay: 1000,
      };

      const managedProcess = new ManagedProcessInfo(config);
      processes.set('test-process', managedProcess);

      const loadedPromise = new Promise((resolve) => {
        persistence.on('loaded', (filePath, count) => {
          resolve({ filePath, count });
        });
      });

      await persistence.loadState();

      const result: any = await loadedPromise;
      expect(result.filePath).toBe(testFilePath);
      expect(result.count).toBe(1);

      // Verify process state was restored
      const processInfo = managedProcess.getProcessInfo();
      expect(processInfo.restarts).toBe(5);
    });

    it('should handle missing file gracefully', async () => {
      // Mock fs operations - file not found
      vi.mocked(fs.readFile).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      await expect(persistence.loadState()).resolves.toEqual([]);
    });

    it('should handle corrupted JSON', async () => {
      // Mock fs operations - invalid JSON
      vi.mocked(fs.readFile).mockResolvedValue('{ invalid json }');

      const errorPromise = new Promise((resolve) => {
        persistence.on('load-error', (error) => {
          resolve(error);
        });
      });

      await persistence.loadState();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(Error);
    });

    it('should restore from backup if main file is corrupted', async () => {
      const savedData = {
        version: '1.0',
        timestamp: Date.now(),
        processes: [],
      };

      // First read fails (corrupted), backup succeeds
      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error('Invalid JSON'))
        .mockResolvedValueOnce(JSON.stringify(savedData, null, 2));

      await persistence.loadState();

      // Should have tried to read backup
      expect(fs.readFile).toHaveBeenCalledWith(
        testFilePath + '.backup',
        'utf8'
      );
    });
  });

  describe('forceSaveState', () => {
    it('should save state immediately', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

      // Get persisted process info
      const processArray = Array.from(processes.values()).map((p) =>
        p.toJSON()
      );
      await persistence.forceSaveState(processArray);

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('getFilePath', () => {
    it('should return the configured file path', () => {
      expect(persistence.getFilePath()).toBe(testFilePath);
    });
  });

  describe('data serialization', () => {
    it('should properly serialize complex process state', async () => {
      const config: ProcessConfig = {
        name: 'complex-process',
        script: '/usr/bin/node',
        args: ['server.js', '--port', '3000'],
        namespace: 'web',
        cwd: '/app',
        env: { NODE_ENV: 'production', PORT: '3000' },
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: 1024 * 1024 * 500,
        max_restarts: 10,
        min_uptime: 1000,
        restart_delay: 1000,
        note: 'Main web server',
      };

      const managedProcess = new ManagedProcessInfo(config);

      // Simulate some runtime history
      managedProcess.setStatus('online');
      managedProcess.setPid(12345);
      managedProcess.updateMemoryUsage(1024 * 1024 * 100);
      managedProcess.updateCpuUsage(45.5);
      managedProcess.recordRestart();
      managedProcess.recordRestart();

      processes.set('complex-process', managedProcess);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

      // Get persisted process info
      const processArray = Array.from(processes.values()).map((p) =>
        p.toJSON()
      );
      await persistence.saveState(processArray);

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const savedData = JSON.parse(writeCall[1] as string);

      const savedProcess = savedData.processes[0];
      expect(savedProcess).toMatchObject({
        name: 'complex-process',
        status: 'online',
        pid: 12345,
        restartCount: 2,
        autoRestartEnabled: true,
      });

      // Check that arrays are properly serialized
      expect(Array.isArray(savedProcess.stateHistory)).toBe(true);
      expect(Array.isArray(savedProcess.memoryHistory)).toBe(true);
      expect(Array.isArray(savedProcess.cpuHistory)).toBe(true);
    });
  });
});

