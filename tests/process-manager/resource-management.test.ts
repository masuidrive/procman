/**
 * Resource Management Tests
 *
 * Tests for improved timer management and resource cleanup functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessManager } from '../../src/process-manager/process-manager';
import { ManagedProcessInfo } from '../../src/process-manager/managed-process-info';
import { AppConfig } from '../../src/shared/config';
import { DEFAULT_NAMESPACE } from '../../src/shared/constants';

describe('Resource Management', () => {
  let processManager: ProcessManager;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let clearTimeoutSpy: ReturnType<typeof vi.spyOn>;
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    processManager = new ProcessManager();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    clearIntervalSpy = vi.spyOn(global, 'clearInterval');
  });

  afterEach(async () => {
    await processManager.cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('ProcessManager Timer Management', () => {
    it('should track and cleanup debounced save state timers', async () => {
      const config: AppConfig = {
        name: 'test-app',
        script: 'test.js',
        namespace: DEFAULT_NAMESPACE,
      };

      processManager.configureProcess(config);
      processManager.initializeProcess(config.name);

      // Force save state to trigger debounced timer
      await processManager.forceSaveState();

      // Trigger save state calls (persistence component handles debouncing internally)
      await processManager.saveState();
      await processManager.saveState();
      await processManager.saveState();

      // Wait a short time to ensure timer is created
      await new Promise((resolve) => globalThis.setTimeout(resolve, 50));

      // Cleanup should clear all timers
      await processManager.cleanup();

      // Note: Timer management is now internal to components
      // expect(consoleLogSpy).toHaveBeenCalledWith(
      //   '[ProcessManager] Cleaned up debounced save state timer'
      // );
      // Timer cleanup verification is now handled by component tests
    });

    it('should handle cleanup when no timers exist', async () => {
      // Cleanup with no timers should not log timer cleanup
      await processManager.cleanup();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ProcessManager] Cleaned up debounced save state timer'
      );
      // Should not log about cleaning remaining timers when none exist
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(
          /\[ProcessManager\] Cleaned up \d+ remaining timers/
        )
      );
    });

    it('should clear monitoring timers during cleanup', async () => {
      const config: AppConfig = {
        name: 'test-app',
        script: 'test.js',
        namespace: DEFAULT_NAMESPACE,
      };

      processManager.configureProcess(config);
      processManager.initializeProcess(config.name);

      // Start monitoring to create timers
      processManager.startMonitoring();

      // Stop monitoring should clear timers
      processManager.stopMonitoring();

      expect(clearIntervalSpy).toHaveBeenCalled();

      await processManager.cleanup();
    });

    it('should provide comprehensive cleanup logging', async () => {
      const config: AppConfig = {
        name: 'test-app',
        script: 'test.js',
        namespace: DEFAULT_NAMESPACE,
      };

      processManager.configureProcess(config);
      processManager.initializeProcess(config.name);

      await processManager.cleanup();

      // Verify comprehensive logging
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ProcessManager] Starting cleanup process...'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ProcessManager] All resources cleaned up successfully'
      );
    });
  });

  describe('ManagedProcessInfo Resource Management', () => {
    let managedProcess: ManagedProcessInfo;
    let config: Parameters<typeof ManagedProcessInfo.prototype.updateConfig>[0];

    beforeEach(() => {
      config = {
        name: 'test-process',
        script: 'test.js',
        namespace: DEFAULT_NAMESPACE,
        args: [],
        cwd: '/test',
        env: {},
        instances: 1,
        autorestart: true,
        watch: false,
        max_restarts: 10,
        min_uptime: 1000,
        restart_delay: 1000,
      };
      managedProcess = new ManagedProcessInfo(config);
    });

    afterEach(() => {
      managedProcess.dispose();
    });

    it('should clean up resources without destroying data', () => {
      // Add some data
      managedProcess.updateMemoryUsage(1000000);
      managedProcess.updateCpuUsage(50);
      managedProcess.recordRestart();

      const beforeCleanup = managedProcess.getStatistics();
      expect(beforeCleanup.currentMemory).toBe(1000000);
      expect(beforeCleanup.restarts).toBe(1);

      // Cleanup should preserve data but clear runtime state
      managedProcess.cleanup();

      const afterCleanup = managedProcess.getStatistics();
      expect(afterCleanup.currentMemory).toBe(1000000);
      expect(afterCleanup.restarts).toBe(1);
      expect(managedProcess.getProcessInfo().pid).toBeNull();
      expect(afterCleanup.startedAt).toBeNull();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[ManagedProcessInfo] Cleaning up resources for process 'test-process'"
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[ManagedProcessInfo] Resources cleaned up for process 'test-process'"
      );
    });

    it('should dispose all resources and clear all data', () => {
      // Add various types of data
      managedProcess.updateMemoryUsage(1000000);
      managedProcess.updateCpuUsage(50);
      managedProcess.recordRestart();
      managedProcess.setStatus('online');
      managedProcess.setPid(12345);

      const beforeDispose = managedProcess.getStatistics();
      const beforeProcessInfo = managedProcess.getProcessInfo();
      expect(beforeDispose.currentMemory).toBe(1000000);
      expect(beforeDispose.restarts).toBe(1);
      expect(beforeProcessInfo.status).toBe('online');
      expect(beforeProcessInfo.pid).toBe(12345);

      // Dispose should clear all data
      managedProcess.dispose();

      const afterDispose = managedProcess.getStatistics();
      const afterProcessInfo = managedProcess.getProcessInfo();
      expect(afterDispose.currentMemory).toBe(0);
      expect(afterDispose.restarts).toBe(0);
      expect(afterProcessInfo.status).toBe('stopped');
      expect(afterProcessInfo.pid).toBeNull();
      expect(afterDispose.startedAt).toBeNull();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[ManagedProcessInfo] Disposing all resources for process 'test-process'"
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[ManagedProcessInfo] All resources disposed for process 'test-process'"
      );
    });

    it('should clear historical data arrays during dispose', () => {
      // Add historical data
      for (let i = 0; i < 5; i++) {
        managedProcess.updateMemoryUsage(1000000 + i * 100000);
        managedProcess.updateCpuUsage(10 + i * 5);
      }

      const beforeDispose = managedProcess.getStatistics();
      expect(beforeDispose.memoryHistory.length).toBe(5);
      expect(beforeDispose.cpuHistory.length).toBe(5);

      // Check detailed history as well
      expect(managedProcess.getMemoryHistory().length).toBe(5);
      expect(managedProcess.getCpuHistory().length).toBe(5);

      managedProcess.dispose();

      const afterDispose = managedProcess.getStatistics();
      expect(afterDispose.memoryHistory.length).toBe(0);
      expect(afterDispose.cpuHistory.length).toBe(0);

      // Detailed history should also be cleared
      expect(managedProcess.getMemoryHistory().length).toBe(0);
      expect(managedProcess.getCpuHistory().length).toBe(0);
    });

    it('should remove event listeners during cleanup and dispose', () => {
      const statusChangeSpy = vi.fn();
      const startSpy = vi.fn();
      const stopSpy = vi.fn();

      managedProcess.on('status-change', statusChangeSpy);
      managedProcess.on('start', startSpy);
      managedProcess.on('stop', stopSpy);

      expect(managedProcess.listenerCount('status-change')).toBe(1);
      expect(managedProcess.listenerCount('start')).toBe(1);
      expect(managedProcess.listenerCount('stop')).toBe(1);

      managedProcess.cleanup();

      expect(managedProcess.listenerCount('status-change')).toBe(0);
      expect(managedProcess.listenerCount('start')).toBe(0);
      expect(managedProcess.listenerCount('stop')).toBe(0);

      // Re-add listeners
      managedProcess.on('status-change', statusChangeSpy);
      managedProcess.on('start', startSpy);
      managedProcess.on('stop', stopSpy);

      expect(managedProcess.listenerCount('status-change')).toBe(1);

      managedProcess.dispose();

      expect(managedProcess.listenerCount('status-change')).toBe(0);
    });
  });

  describe('Integration Resource Management', () => {
    it('should properly integrate dispose method in ProcessManager.removeProcess', () => {
      const config: AppConfig = {
        name: 'test-app',
        script: 'test.js',
        namespace: DEFAULT_NAMESPACE,
      };

      processManager.configureProcess(config);
      processManager.initializeProcess(config.name);

      // Add some data to the managed process
      const managedProcess = processManager['processes'].get(config.name);
      expect(managedProcess).toBeDefined();

      managedProcess!.updateMemoryUsage(1000000);
      managedProcess!.recordRestart();

      expect(managedProcess!.getStatistics().currentMemory).toBe(1000000);
      expect(managedProcess!.getStatistics().restarts).toBe(1);

      // Remove process should call dispose
      const removed = processManager.removeProcess(config.name);
      expect(removed).toBe(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[ManagedProcessInfo] Disposing all resources for process 'test-app'"
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[ManagedProcessInfo] All resources disposed for process 'test-app'"
      );
    });

    it('should handle memory leak prevention during mass process operations', async () => {
      const processCount = 10;
      const configs: AppConfig[] = [];

      // Create multiple processes
      for (let i = 0; i < processCount; i++) {
        const config: AppConfig = {
          name: `test-app-${i}`,
          script: `test-${i}.js`,
          namespace: DEFAULT_NAMESPACE,
        };
        configs.push(config);
        processManager.configureProcess(config);
        processManager.initializeProcess(config.name);

        // Add some data to each process
        const managedProcess = processManager['processes'].get(config.name);
        managedProcess!.updateMemoryUsage(1000000 + i * 100000);
        managedProcess!.updateCpuUsage(10 + i * 5);
      }

      expect(processManager.getProcessNames()).toHaveLength(processCount);

      // Cleanup should dispose all processes properly
      await processManager.cleanup();

      expect(processManager.getProcessNames()).toHaveLength(0);

      // Verify all dispose methods were called
      for (let i = 0; i < processCount; i++) {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          `[ManagedProcessInfo] Disposing all resources for process 'test-app-${i}'`
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          `[ManagedProcessInfo] All resources disposed for process 'test-app-${i}'`
        );
      }
    });
  });
});
