/**
 * Unit tests for ProcessLifecycleManagerImpl
 */

import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ProcessLifecycleManagerImpl } from '../../src/process-manager/process-lifecycle-manager';
import { ManagedProcessInfo } from '../../src/process-manager/managed-process-info';
import { ProcessConfig } from '../../src/process-manager/process-manager';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('ProcessLifecycleManagerImpl', () => {
  let lifecycleManager: ProcessLifecycleManagerImpl;
  let processes: Map<string, ManagedProcessInfo>;
  let childProcesses: Map<string, ChildProcess>;
  let mockChildProcess: ChildProcess;

  beforeEach(() => {
    processes = new Map();
    childProcesses = new Map();
    lifecycleManager = new ProcessLifecycleManagerImpl(processes, childProcesses);

    // Create a mock child process
    mockChildProcess = new EventEmitter() as ChildProcess;
    Object.defineProperty(mockChildProcess, 'pid', {
      value: 12345,
      writable: false,
      configurable: true
    });
    mockChildProcess.kill = vi.fn().mockReturnValue(true);
    mockChildProcess.stdin = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter() as any;
    mockChildProcess.stderr = new EventEmitter() as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
    processes.clear();
    childProcesses.clear();
  });

  describe('startProcess', () => {
    it('should start a process successfully', async () => {
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
      processes.set('test-process', managedProcess);

      // Mock spawn to return our mock child process
      const spawn = await import('child_process').then(m => m.spawn);
      vi.mocked(spawn).mockReturnValue(mockChildProcess);

      // Start the process
      const resultPromise = lifecycleManager.startProcess('test-process');

      // Simulate process started
      mockChildProcess.emit('spawn');

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(managedProcess.getStatus()).toBe('online');
      expect(managedProcess.getPid()).toBe(12345);
      expect(childProcesses.has('test-process')).toBe(true);
    });

    it('should fail if process not found', async () => {
      const result = await lifecycleManager.startProcess('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe(`Process 'non-existent' not found. Use initializeProcess() first.`);
    });

    it('should fail if process already running', async () => {
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
      managedProcess.setStatus('online');
      managedProcess.setPid(12345);
      processes.set('test-process', managedProcess);

      const result = await lifecycleManager.startProcess('test-process');

      expect(result.success).toBe(false);
      expect(result.error).toBe(`Process 'test-process' is already online`);
    });

    it('should handle spawn errors', async () => {
      const config: ProcessConfig = {
        name: 'test-process',
        script: 'invalid-command',
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

      // Mock spawn to return our mock child process
      const spawn = await import('child_process').then(m => m.spawn);
      vi.mocked(spawn).mockReturnValue(mockChildProcess);

      // Start the process
      const resultPromise = lifecycleManager.startProcess('test-process');

      // Simulate spawn error
      const error = new Error('spawn ENOENT');
      (error as any).code = 'ENOENT';
      
      process.nextTick(() => {
        mockChildProcess.emit('error', error);
      });

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('spawn ENOENT');
      expect(managedProcess.getStatus()).toBe('errored');
    });
  });

  describe('stopProcess', () => {
    it('should stop a running process', async () => {
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
      managedProcess.setStatus('online');
      managedProcess.setPid(12345);
      processes.set('test-process', managedProcess);
      childProcesses.set('test-process', mockChildProcess);

      const resultPromise = lifecycleManager.stopProcess('test-process');
      
      // Process should transition to stopping
      expect(managedProcess.getStatus()).toBe('stopping');
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
      
      // Simulate process exit
      mockChildProcess.emit('exit', 0, null);
      
      const result = await resultPromise;
      expect(result.success).toBe(true);
    });

    it('should fail if process not found', async () => {
      const result = await lifecycleManager.stopProcess('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe(`Process 'non-existent' not found`);
    });

    it('should handle already stopped process', async () => {
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
      managedProcess.setStatus('stopped');
      processes.set('test-process', managedProcess);

      const result = await lifecycleManager.stopProcess('test-process');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should force kill if SIGTERM fails', async () => {
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
      managedProcess.setStatus('online');
      managedProcess.setPid(12345);
      processes.set('test-process', managedProcess);
      childProcesses.set('test-process', mockChildProcess);

      // Mock kill to return false (failed)
      mockChildProcess.kill = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);

      vi.useFakeTimers();
      const resultPromise = lifecycleManager.stopProcess('test-process');
      
      // Process should first receive SIGTERM
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockChildProcess.kill).toHaveBeenCalledTimes(1);
      
      // Wait for timeout to trigger SIGKILL
      await vi.advanceTimersByTimeAsync(15000);
      
      // Now SIGKILL should have been sent
      expect(mockChildProcess.kill).toHaveBeenCalledTimes(2);
      expect(mockChildProcess.kill).toHaveBeenLastCalledWith('SIGKILL');
      
      // Simulate force kill success
      mockChildProcess.emit('exit', -1, 'SIGKILL');
      
      const result = await resultPromise;
      expect(result.success).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('restartProcess', () => {
    it('should restart a running process', async () => {
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
      childProcesses.set('test-process', mockChildProcess);

      // Mock spawn for restart
      const spawn = await import('child_process').then(m => m.spawn);
      const newMockProcess = new EventEmitter() as ChildProcess;
      Object.defineProperty(newMockProcess, 'pid', {
        value: 12346,
        writable: false,
        configurable: true
      });
      newMockProcess.kill = vi.fn().mockReturnValue(true);
      newMockProcess.stdin = new EventEmitter() as any;
      newMockProcess.stdout = new EventEmitter() as any;
      newMockProcess.stderr = new EventEmitter() as any;
      vi.mocked(spawn).mockReturnValue(newMockProcess);

      const resultPromise = lifecycleManager.restartProcess('test-process');

      // Simulate process exit quickly
      process.nextTick(() => {
        mockChildProcess.emit('exit', 0, null);
        
        // Simulate new process spawn after a tick
        process.nextTick(() => {
          newMockProcess.emit('spawn');
        });
      });

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(managedProcess.getStatus()).toBe('online');
      expect(managedProcess.getPid()).toBe(12346);
    });

    it('should start a stopped process on restart', async () => {
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
      managedProcess.setStatus('stopped');
      processes.set('test-process', managedProcess);

      // Mock spawn
      const spawn = await import('child_process').then(m => m.spawn);
      vi.mocked(spawn).mockReturnValue(mockChildProcess);

      const resultPromise = lifecycleManager.restartProcess('test-process');

      // Simulate process spawn
      mockChildProcess.emit('spawn');

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(managedProcess.getStatus()).toBe('online');
    });
  });

  describe('sendSignalToProcess', () => {
    it('should send SIGKILL to force kill a process', async () => {
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
      managedProcess.setStatus('online');
      managedProcess.setPid(12345);
      processes.set('test-process', managedProcess);
      childProcesses.set('test-process', mockChildProcess);

      const result = await lifecycleManager.sendSignalToProcess('test-process', 'SIGKILL');

      expect(result.success).toBe(true);
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('should send signal to process', async () => {
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
      managedProcess.setStatus('online');
      managedProcess.setPid(12345);
      processes.set('test-process', managedProcess);
      childProcesses.set('test-process', mockChildProcess);

      const result = await lifecycleManager.sendSignalToProcess('test-process', 'SIGUSR1');

      expect(result.success).toBe(true);
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGUSR1');
    });

    it('should fail if process not running', async () => {
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
      managedProcess.setStatus('stopped');
      processes.set('test-process', managedProcess);

      const result = await lifecycleManager.sendSignalToProcess('test-process', 'SIGUSR1');

      expect(result.success).toBe(false);
      expect(result.error).toBe(`Process 'test-process' is not running`);
    });
  });
});