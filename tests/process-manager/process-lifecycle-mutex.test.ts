/**
 * Unit tests for ProcessLifecycleManager mutex functionality
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

describe('ProcessLifecycleManager - Mutex functionality', () => {
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

  it('should prevent concurrent start operations on same process', async () => {
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

    // Track operation order
    const operationLog: string[] = [];
    
    // Override setStatus to log operations
    const originalSetStatus = managedProcess.setStatus.bind(managedProcess);
    managedProcess.setStatus = function(status: any, ...args: any[]) {
      operationLog.push(`setStatus:${status}`);
      return originalSetStatus(status, ...args);
    };

    // Start two concurrent operations
    const promise1 = lifecycleManager.startProcess('test-process').then((result) => {
      operationLog.push('operation1:complete');
      return result;
    });

    const promise2 = lifecycleManager.startProcess('test-process').then((result) => {
      operationLog.push('operation2:complete');
      return result;
    });

    // Simulate first process spawn
    process.nextTick(() => {
      mockChildProcess.emit('spawn');
    });

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // First operation should succeed
    expect(result1.success).toBe(true);
    
    // Second operation should fail because process is already running
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('already online');

    // Verify operations didn't interleave
    expect(operationLog).toContain('setStatus:starting');
    expect(operationLog).toContain('setStatus:online');
    expect(operationLog.indexOf('operation1:complete')).toBeLessThan(
      operationLog.indexOf('operation2:complete')
    );
  });

  it('should prevent concurrent stop/start operations on same process', async () => {
    vi.useFakeTimers();
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

    // Track status changes
    const statusChanges: string[] = [];
    managedProcess.on('status-change', (newStatus) => {
      statusChanges.push(newStatus);
    });

    // Start concurrent stop and start operations
    const stopPromise = lifecycleManager.stopProcess('test-process');
    const startPromise = lifecycleManager.startProcess('test-process');

    // Simulate process exit for stop
    setTimeout(() => {
      mockChildProcess.emit('exit', 0, null);
      
      // After stop completes, start should proceed
      setTimeout(() => {
        newMockProcess.emit('spawn');
      }, 10);
    }, 10);

    vi.runAllTimers();

    const [stopResult, startResult] = await Promise.all([stopPromise, startPromise]);

    vi.useRealTimers();

    // Stop should succeed
    expect(stopResult.success).toBe(true);
    
    // Start should succeed after stop completes
    expect(startResult.success).toBe(true);

    // Verify proper sequencing
    expect(statusChanges).toContain('stopping');
    expect(statusChanges).toContain('stopped');
    expect(statusChanges).toContain('starting');
  });

  it('should allow concurrent operations on different processes', async () => {
    // Create two different processes
    const configs = ['process1', 'process2'].map(name => ({
      name,
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
    }));

    configs.forEach(config => {
      const managedProcess = new ManagedProcessInfo(config);
      processes.set(config.name, managedProcess);
    });

    // Mock spawn
    const spawn = await import('child_process').then(m => m.spawn);
    const mockProcesses = new Map<string, ChildProcess>();
    
    vi.mocked(spawn).mockImplementation((command, args, options) => {
      const mock = new EventEmitter() as ChildProcess;
      Object.defineProperty(mock, 'pid', {
        value: Math.floor(Math.random() * 10000) + 1000,
        writable: false,
        configurable: true
      });
      mock.kill = vi.fn().mockReturnValue(true);
      mock.stdin = new EventEmitter() as any;
      mock.stdout = new EventEmitter() as any;
      mock.stderr = new EventEmitter() as any;
      
      // Store for later reference
      mockProcesses.set(mock.pid!.toString(), mock);
      
      // Emit spawn after a delay
      setTimeout(() => mock.emit('spawn'), 10);
      
      return mock;
    });

    // Start both processes concurrently
    const startTime = Date.now();
    const [result1, result2] = await Promise.all([
      lifecycleManager.startProcess('process1'),
      lifecycleManager.startProcess('process2'),
    ]);
    const duration = Date.now() - startTime;

    // Both should succeed
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    // Should complete quickly (concurrently, not sequentially)
    expect(duration).toBeLessThan(100);
  });

  it('should track locked processes correctly', () => {
    const lockedProcesses = lifecycleManager.getLockedProcesses();
    expect(lockedProcesses).toEqual([]);
  });

  it('should handle restart with mutex correctly', async () => {
    vi.useFakeTimers();
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

    // Track operations
    const operations: string[] = [];
    
    // Start restart and stop concurrently
    const restartPromise = lifecycleManager.restartProcess('test-process').then((result) => {
      operations.push('restart:complete');
      return result;
    });
    
    const stopPromise = lifecycleManager.stopProcess('test-process').then((result) => {
      operations.push('stop:complete');
      return result;
    });

    // Simulate process exit
    setTimeout(() => {
      operations.push('exit:emitted');
      mockChildProcess.emit('exit', 0, null);
      
      // Simulate new process spawn after delay
      setTimeout(() => {
        operations.push('spawn:emitted');
        newMockProcess.emit('spawn');
      }, 150);
    }, 10);

    vi.runAllTimers();

    const [restartResult, stopResult] = await Promise.all([restartPromise, stopPromise]);

    vi.useRealTimers();

    // Restart should complete successfully
    expect(restartResult.success).toBe(true);
    
    // Stop should see the process as already stopped
    expect(stopResult.success).toBe(true);
    expect(stopResult.metadata?.wasAlreadyStopped).toBe(true);

    // Verify restart completed before stop attempted
    expect(operations.indexOf('restart:complete')).toBeLessThan(
      operations.indexOf('stop:complete')
    );
  });
});