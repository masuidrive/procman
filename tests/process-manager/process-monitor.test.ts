/**
 * Unit tests for ProcessMonitorImpl
 */

import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ProcessMonitorImpl } from '../../src/process-manager/process-monitor';
import { ManagedProcessInfo } from '../../src/process-manager/managed-process-info';
import { ProcessConfig } from '../../src/process-manager/process-manager';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import pidusage from 'pidusage';

// Define PidUsageStats type for tests
interface PidUsageStats {
  cpu: number;
  memory: number;
  pid: number;
  ctime: number;
  elapsed: number;
  timestamp: number;
}

// Mock pidusage
vi.mock('pidusage', () => ({
  default: vi.fn(),
}));

describe('ProcessMonitorImpl', () => {
  let monitor: ProcessMonitorImpl;
  let processes: Map<string, ManagedProcessInfo>;
  let childProcesses: Map<string, ChildProcess>;
  let mockChildProcess: ChildProcess;

  beforeEach(() => {
    processes = new Map();
    childProcesses = new Map();
    monitor = new ProcessMonitorImpl(processes, childProcesses);

    // Create a mock child process
    mockChildProcess = new EventEmitter() as ChildProcess;
    Object.defineProperty(mockChildProcess, 'pid', {
      value: 12345,
      writable: false,
      configurable: true,
    });
    mockChildProcess.kill = vi.fn().mockReturnValue(true);

    // Reset timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    monitor.stopMonitoring();
    vi.clearAllMocks();
    vi.useRealTimers();
    processes.clear();
    childProcesses.clear();
  });

  describe('startMonitoring', () => {
    it('should start monitoring and collect stats', async () => {
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

      // Mock pidusage response
      vi.mocked(pidusage).mockResolvedValue({
        cpu: 25.5,
        memory: 1024 * 1024 * 50, // 50MB
        pid: 12345,
        ctime: 0,
        elapsed: 1000,
        timestamp: Date.now(),
      } as any);

      // Spy on updateMemoryUsage and updateCpuUsage
      const memSpy = vi.spyOn(managedProcess, 'updateMemoryUsage');
      const cpuSpy = vi.spyOn(managedProcess, 'updateCpuUsage');

      monitor.startMonitoring({ healthCheckInterval: 5000 });

      // Fast-forward time to trigger monitoring
      await vi.advanceTimersByTimeAsync(5100);

      expect(memSpy).toHaveBeenCalledWith(1024 * 1024 * 50);
      expect(cpuSpy).toHaveBeenCalledWith(25.5);
    });

    it('should emit process:stats event', async () => {
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

      // Mock pidusage response
      vi.mocked(pidusage).mockResolvedValue({
        cpu: 25.5,
        memory: 1024 * 1024 * 50,
        pid: 12345,
        ctime: 0,
        elapsed: 1000,
        timestamp: Date.now(),
      } as any);

      const statsPromise = new Promise((resolve) => {
        monitor.on('process:stats', (data) => {
          resolve(data);
        });
      });

      monitor.startMonitoring({ healthCheckInterval: 5000 });

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(5100);

      const result: any = await statsPromise;
      expect(result.name).toBe('test-process');
      expect(result.stats.cpu).toBe(25.5);
      expect(result.stats.memory).toBe(1024 * 1024 * 50);
    });

    it('should detect and emit process:memory-limit', async () => {
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
        max_memory_restart: 1024 * 1024 * 100, // 100MB limit
        max_restarts: 10,
        min_uptime: 1000,
        restart_delay: 1000,
      };

      const managedProcess = new ManagedProcessInfo(config);
      managedProcess.setStatus('online');
      managedProcess.setPid(12345);
      processes.set('test-process', managedProcess);
      childProcesses.set('test-process', mockChildProcess);

      // Mock pidusage response - exceeding memory limit
      vi.mocked(pidusage).mockResolvedValue({
        cpu: 25.5,
        memory: 1024 * 1024 * 150, // 150MB - over limit
        pid: 12345,
        ctime: 0,
        elapsed: 1000,
        timestamp: Date.now(),
      } as any);

      const memoryLimitPromise = new Promise((resolve) => {
        monitor.on('process:memory-limit', (data) => {
          resolve(data);
        });
      });

      monitor.startMonitoring({ healthCheckInterval: 5000 });

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(5100);

      const result: any = await memoryLimitPromise;
      expect(result.name).toBe('test-process');
      expect(result.usage).toBe(1024 * 1024 * 150);
      expect(result.limit).toBe(1024 * 1024 * 100);
    });

    it('should handle pidusage errors gracefully', async () => {
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

      // Mock pidusage to reject
      vi.mocked(pidusage).mockRejectedValue(new Error('Process not found'));

      const errorSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      monitor.startMonitoring({ healthCheckInterval: 5000 });

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(5100);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ProcessMonitor] Failed to get stats for'),
        expect.any(Error)
      );

      errorSpy.mockRestore();
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring when called', async () => {
      monitor.startMonitoring({ healthCheckInterval: 5000 });

      // Verify monitoring is active
      expect(monitor.isMonitoringEnabled()).toBe(true);

      monitor.stopMonitoring();

      // Verify monitoring stopped
      expect(monitor.isMonitoringEnabled()).toBe(false);

      // Ensure no more monitoring happens
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

      const memSpy = vi.spyOn(managedProcess, 'updateMemoryUsage');

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(10000);

      expect(memSpy).not.toHaveBeenCalled();
    });
  });

  describe('getProcessStats', () => {
    it('should get stats for running process', async () => {
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

      // Mock pidusage response
      vi.mocked(pidusage).mockResolvedValue({
        cpu: 25.5,
        memory: 1024 * 1024 * 50,
        pid: 12345,
        ctime: 0,
        elapsed: 1000,
        timestamp: Date.now(),
      } as any);

      const stats = await monitor.getProcessStats('test-process');

      expect(stats).toBeDefined();
      expect(stats?.cpu).toBeCloseTo(25.5);
      expect(stats?.memory).toBe(1024 * 1024 * 50);
      expect(stats?.timestamp).toBeGreaterThan(0);
    });

    it('should return undefined for non-existent process', async () => {
      const stats = await monitor.getProcessStats('non-existent');
      expect(stats).toBeUndefined();
    });
  });

  describe('getProcessHealth', () => {
    it('should get process health for running process', () => {
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

      const health = monitor.getProcessHealth('test-process');

      expect(health).toBeDefined();
      expect(health?.isAlive).toBe(true);
      expect(health?.consecutiveFailures).toBe(0);
    });

    it('should report unhealthy for non-existent process', () => {
      const health = monitor.getProcessHealth('non-existent');
      expect(health).toBeUndefined();
    });

    it('should report unhealthy for stopped process', () => {
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

      const health = monitor.getProcessHealth('test-process');

      expect(health).toBeDefined();
      expect(health?.isAlive).toBe(false);
      expect(health?.consecutiveFailures).toBe(0);
    });
  });

  describe('process death detection', () => {
    it('should detect when process dies unexpectedly', async () => {
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

      // First check - process is alive
      vi.mocked(pidusage).mockResolvedValueOnce({
        cpu: 25.5,
        memory: 1024 * 1024 * 50,
        pid: 12345,
        ctime: 0,
        elapsed: 1000,
        timestamp: Date.now(),
      } as any);

      // Second check - process is dead (pidusage throws)
      vi.mocked(pidusage).mockRejectedValueOnce(new Error('Process not found'));

      const deathPromise = new Promise((resolve) => {
        monitor.on('process:died', (data) => {
          resolve(data);
        });
      });

      monitor.startMonitoring({ healthCheckInterval: 5000 });

      // First check
      await vi.advanceTimersByTimeAsync(5100);

      // Second check - process dies
      await vi.advanceTimersByTimeAsync(5100);

      const result: any = await deathPromise;
      expect(result.name).toBe('test-process');

      vi.useRealTimers();
    });
  });
});
