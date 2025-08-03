/**
 * Unit tests for ManagedProcessInfo class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManagedProcessInfo } from '../../src/process-manager/managed-process-info';
import { ProcessConfig } from '../../src/process-manager/process-manager';

describe('ManagedProcessInfo', () => {
  let config: ProcessConfig;
  let processInfo: ManagedProcessInfo;

  beforeEach(() => {
    config = {
      name: 'test-process',
      script: '/path/to/script.js',
      namespace: 'default',
      args: ['--arg1', 'value1'],
      cwd: '/working/directory',
      env: { NODE_ENV: 'test' },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: 512 * 1024 * 1024, // 512MB
      max_restarts: 10,
      min_uptime: 1000,
      restart_delay: 1000,
      note: 'Test process',
    };
    processInfo = new ManagedProcessInfo(config);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(processInfo.getName()).toBe('test-process');
      expect(processInfo.getConfig()).toEqual(config);
      expect(processInfo.getStatus()).toBe('stopped');
      expect(processInfo.getPid()).toBeNull();
    });

    it('should initialize statistics correctly', () => {
      const stats = processInfo.getStatistics();
      expect(stats.startedAt).toBeNull();
      expect(stats.restarts).toBe(0);
      expect(stats.lastRestart).toBeNull();
      expect(stats.memoryHistory).toEqual([]);
      expect(stats.cpuHistory).toEqual([]);
      expect(stats.currentMemory).toBe(0);
      expect(stats.currentCpu).toBe(0);
    });
  });

  describe('getProcessInfo', () => {
    it('should return correct ProcessInfo structure', () => {
      const info = processInfo.getProcessInfo();
      expect(info).toEqual({
        name: 'test-process',
        namespace: 'default',
        status: 'stopped',
        pid: null,
        uptime: 0,
        memory: 0,
        cpu: 0,
        restarts: 0,
        note: 'Test process',
      });
    });
  });

  describe('status management', () => {
    it('should set status correctly', () => {
      const statusChangeSpy = vi.fn();
      processInfo.on('status-change', statusChangeSpy);

      processInfo.setStatus('starting');
      expect(processInfo.getStatus()).toBe('starting');
      expect(statusChangeSpy).toHaveBeenCalledWith('starting', 'stopped');

      processInfo.setStatus('online');
      expect(processInfo.getStatus()).toBe('online');
      expect(statusChangeSpy).toHaveBeenCalledWith('online', 'starting');
    });

    it('should not emit event if status unchanged', () => {
      const statusChangeSpy = vi.fn();
      processInfo.on('status-change', statusChangeSpy);

      processInfo.setStatus('stopped');
      expect(statusChangeSpy).not.toHaveBeenCalled();
    });

    it('should set startedAt when going online', () => {
      const beforeTime = Date.now();
      processInfo.setStatus('online');
      const afterTime = Date.now();

      const stats = processInfo.getStatistics();
      expect(stats.startedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(stats.startedAt).toBeLessThanOrEqual(afterTime);
    });

    it('should clear startedAt and pid when stopped', () => {
      processInfo.setStatus('online');
      processInfo.setPid(1234);

      processInfo.setStatus('stopped');

      expect(processInfo.getPid()).toBeNull();
      expect(processInfo.getStatistics().startedAt).toBeNull();
    });
  });

  describe('uptime calculation', () => {
    it('should return 0 for stopped process', () => {
      expect(processInfo.calculateUptime()).toBe(0);
    });

    it('should calculate uptime correctly for online process', () => {
      const startTime = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(startTime);

      processInfo.setStatus('online');

      vi.spyOn(Date, 'now').mockReturnValue(startTime + 5000);
      expect(processInfo.calculateUptime()).toBe(5000);

      vi.restoreAllMocks();
    });
  });

  describe('memory monitoring', () => {
    it('should update memory usage and maintain history', () => {
      processInfo.updateMemoryUsage(100 * 1024 * 1024); // 100MB
      processInfo.updateMemoryUsage(200 * 1024 * 1024); // 200MB
      processInfo.updateMemoryUsage(150 * 1024 * 1024); // 150MB

      const stats = processInfo.getStatistics();
      expect(stats.currentMemory).toBe(150 * 1024 * 1024);
      expect(stats.memoryHistory).toEqual([
        100 * 1024 * 1024,
        200 * 1024 * 1024,
        150 * 1024 * 1024,
      ]);
    });

    it('should limit memory history to 10 entries', () => {
      for (let i = 1; i <= 12; i++) {
        processInfo.updateMemoryUsage(i * 1024 * 1024);
      }

      const stats = processInfo.getStatistics();
      expect(stats.memoryHistory).toHaveLength(10);
      expect(stats.memoryHistory[0]).toBe(3 * 1024 * 1024); // First two should be removed
      expect(stats.memoryHistory[9]).toBe(12 * 1024 * 1024);
    });

    it('should emit memory-limit event when exceeded', () => {
      const memoryLimitSpy = vi.fn();
      processInfo.on('memory-limit', memoryLimitSpy);

      const memoryUsage = 600 * 1024 * 1024; // 600MB (exceeds 512MB limit)
      processInfo.updateMemoryUsage(memoryUsage);

      expect(memoryLimitSpy).toHaveBeenCalledWith(
        memoryUsage,
        512 * 1024 * 1024
      );
    });

    it('should calculate average memory usage correctly', () => {
      processInfo.updateMemoryUsage(100 * 1024 * 1024);
      processInfo.updateMemoryUsage(200 * 1024 * 1024);
      processInfo.updateMemoryUsage(300 * 1024 * 1024);

      expect(processInfo.getAverageMemoryUsage()).toBe(200 * 1024 * 1024);
    });
  });

  describe('CPU monitoring', () => {
    it('should update CPU usage and maintain history', () => {
      processInfo.updateCpuUsage(10.5);
      processInfo.updateCpuUsage(25.3);
      processInfo.updateCpuUsage(15.8);

      const stats = processInfo.getStatistics();
      expect(stats.currentCpu).toBe(15.8);
      expect(stats.cpuHistory).toEqual([10.5, 25.3, 15.8]);
    });

    it('should limit CPU history to 10 entries', () => {
      for (let i = 1; i <= 12; i++) {
        processInfo.updateCpuUsage(i * 5);
      }

      const stats = processInfo.getStatistics();
      expect(stats.cpuHistory).toHaveLength(10);
      expect(stats.cpuHistory[0]).toBe(15); // First two should be removed
      expect(stats.cpuHistory[9]).toBe(60);
    });

    it('should calculate average CPU usage correctly', () => {
      processInfo.updateCpuUsage(10);
      processInfo.updateCpuUsage(20);
      processInfo.updateCpuUsage(30);

      expect(processInfo.getAverageCpuUsage()).toBe(20);
    });
  });

  describe('restart management', () => {
    it('should record restarts correctly', () => {
      const restartSpy = vi.fn();
      processInfo.on('restart', restartSpy);

      const beforeTime = Date.now();
      processInfo.recordRestart();
      const afterTime = Date.now();

      const stats = processInfo.getStatistics();
      expect(stats.restarts).toBe(1);
      expect(stats.lastRestart).toBeGreaterThanOrEqual(beforeTime);
      expect(stats.lastRestart).toBeLessThanOrEqual(afterTime);
      expect(restartSpy).toHaveBeenCalledWith(1);

      processInfo.recordRestart();
      expect(processInfo.getStatistics().restarts).toBe(2);
      expect(restartSpy).toHaveBeenCalledWith(2);
    });

    it('should reset restart count', () => {
      processInfo.recordRestart();
      processInfo.recordRestart();
      expect(processInfo.getStatistics().restarts).toBe(2);

      processInfo.resetRestartCount();
      const stats = processInfo.getStatistics();
      expect(stats.restarts).toBe(0);
      expect(stats.lastRestart).toBeNull();
    });

    it('should calculate time since last restart', () => {
      expect(processInfo.getTimeSinceLastRestart()).toBeNull();

      const restartTime = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(restartTime);
      processInfo.recordRestart();

      vi.spyOn(Date, 'now').mockReturnValue(restartTime + 10000);
      expect(processInfo.getTimeSinceLastRestart()).toBe(10000);

      vi.restoreAllMocks();
    });
  });

  describe('event handling', () => {
    it('should emit start event and set PID', () => {
      const startSpy = vi.fn();
      processInfo.on('start', startSpy);

      processInfo.emitStart(1234);
      expect(processInfo.getPid()).toBe(1234);
      expect(startSpy).toHaveBeenCalledWith(1234);
    });

    it('should emit stop event', () => {
      const stopSpy = vi.fn();
      processInfo.on('stop', stopSpy);

      processInfo.emitStop(0);
      expect(stopSpy).toHaveBeenCalledWith(0);
    });

    it('should emit error event', () => {
      const errorSpy = vi.fn();
      processInfo.on('error', errorSpy);

      const error = new Error('Test error');
      processInfo.emitError(error);
      expect(errorSpy).toHaveBeenCalledWith(error);
    });
  });

  describe('utility methods', () => {
    it('should check monitorable state correctly', () => {
      expect(processInfo.isMonitorable()).toBe(false);

      processInfo.setStatus('online');
      expect(processInfo.isMonitorable()).toBe(false); // No PID

      processInfo.setPid(1234);
      expect(processInfo.isMonitorable()).toBe(true);

      processInfo.setStatus('stopped');
      expect(processInfo.isMonitorable()).toBe(false);
    });

    it('should check running state correctly', () => {
      expect(processInfo.isRunning()).toBe(false);

      processInfo.setStatus('online');
      processInfo.setPid(1234);
      expect(processInfo.isRunning()).toBe(true);

      processInfo.setStatus('stopped');
      expect(processInfo.isRunning()).toBe(false);
    });

    it('should check stopped state correctly', () => {
      expect(processInfo.isStopped()).toBe(true);

      processInfo.setStatus('starting');
      expect(processInfo.isStopped()).toBe(false);

      processInfo.setStatus('stopped');
      expect(processInfo.isStopped()).toBe(true);
    });

    it('should check memory limit configuration', () => {
      expect(processInfo.hasMemoryLimit()).toBe(true);
      expect(processInfo.getMemoryLimit()).toBe(512 * 1024 * 1024);

      const configWithoutLimit = { ...config };
      delete configWithoutLimit.max_memory_restart;
      const processWithoutLimit = new ManagedProcessInfo(configWithoutLimit);

      expect(processWithoutLimit.hasMemoryLimit()).toBe(false);
      expect(processWithoutLimit.getMemoryLimit()).toBeUndefined();
    });
  });

  describe('configuration updates', () => {
    it('should update configuration while preserving name', () => {
      const newConfig: ProcessConfig = {
        ...config,
        name: 'different-name', // This should be preserved as original
        script: '/new/path/script.js',
        max_memory_restart: 1024 * 1024 * 1024, // 1GB
      };

      processInfo.updateConfig(newConfig);
      const updatedConfig = processInfo.getConfig();

      expect(updatedConfig.name).toBe('test-process'); // Original name preserved
      expect(updatedConfig.script).toBe('/new/path/script.js');
      expect(updatedConfig.max_memory_restart).toBe(1024 * 1024 * 1024);
    });
  });

  describe('cleanup', () => {
    it('should clean up resources properly', () => {
      processInfo.setStatus('online');
      processInfo.setPid(1234);

      const listenerSpy = vi.fn();
      processInfo.on('status-change', listenerSpy);

      processInfo.cleanup();

      expect(processInfo.getPid()).toBeNull();
      expect(processInfo.getStatistics().startedAt).toBeNull();

      // Verify listeners are removed
      processInfo.setStatus('starting');
      expect(listenerSpy).not.toHaveBeenCalled();
    });
  });
});
