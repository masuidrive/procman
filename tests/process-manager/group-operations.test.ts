/**
 * Test cases for Phase 5: Group Operations and Concurrent Process Management
 */

import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ProcessManager } from '../../src/process-manager/process-manager';
import { AppConfig } from '../../src/shared/config';

describe('ProcessManager - Group Operations (Phase 5)', () => {
  let processManager: ProcessManager;

  beforeEach(() => {
    processManager = new ProcessManager(100, 200); // Faster intervals for testing

    // Mock the groups component's processLifecycle to avoid actual process spawning
    // Cast to access the private property for testing
    const groupManager = processManager.groups as any;
    groupManager.processLifecycle = {
      startProcess: vi.fn().mockImplementation(async (name: string) => {
        const processes = (processManager as any).processes as Map<string, any>;
        const processInfo = processes.get(name);
        if (!processInfo) {
          return { success: false, error: `Process not found: ${name}` };
        }
        // Simulate successful start
        processInfo.setStatus('online');
        processInfo.setPid(Math.floor(Math.random() * 10000) + 1000);
        return { success: true };
      }),
      stopProcess: vi.fn().mockImplementation(async (name: string) => {
        const processes = (processManager as any).processes as Map<string, any>;
        const processInfo = processes.get(name);
        if (!processInfo) {
          return { success: false, error: `Process not found: ${name}` };
        }
        // Simulate successful stop
        processInfo.setStatus('stopped');
        processInfo.setPid(null);
        return { success: true };
      }),
      restartProcess: vi.fn().mockImplementation(async (name: string) => {
        const processes = (processManager as any).processes as Map<string, any>;
        const processInfo = processes.get(name);
        if (!processInfo) {
          return { success: false, error: `Process not found: ${name}` };
        }
        // Simulate successful restart
        processInfo.setStatus('online');
        processInfo.setPid(Math.floor(Math.random() * 10000) + 1000);
        processInfo.incrementRestarts();
        return { success: true };
      }),
    };
  });

  afterEach(async () => {
    await processManager.cleanup();
  });

  // ---------------------------------------------------------------------------
  // Process Group Management Tests
  // ---------------------------------------------------------------------------

  describe('Process Group Management', () => {
    beforeEach(() => {
      // Configure test processes in different namespaces
      const webConfig: AppConfig = {
        name: 'web-server',
        script: 'node',
        args: 'tests/fixtures/test-process.js',
        namespace: 'web',
        cwd: process.cwd(),
        env: {},
      };

      const dbConfig: AppConfig = {
        name: 'database',
        script: 'node',
        args: 'tests/fixtures/test-process.js',
        namespace: 'backend',
        cwd: process.cwd(),
        env: {},
      };

      const apiConfig: AppConfig = {
        name: 'api-server',
        script: 'node',
        args: 'tests/fixtures/test-process.js',
        namespace: 'backend',
        cwd: process.cwd(),
        env: {},
      };

      processManager.configureProcess(webConfig);
      processManager.configureProcess(dbConfig);
      processManager.configureProcess(apiConfig);

      processManager.initializeProcess('web-server');
      processManager.initializeProcess('database');
      processManager.initializeProcess('api-server');
    });

    it('should get process names by namespace', () => {
      const webProcesses = processManager.getProcessNamesByNamespace('web');
      const backendProcesses =
        processManager.getProcessNamesByNamespace('backend');
      const nonExistentProcesses =
        processManager.getProcessNamesByNamespace('nonexistent');

      expect(webProcesses).toEqual(['web-server']);
      expect(backendProcesses).toHaveLength(2);
      expect(backendProcesses).toContain('database');
      expect(backendProcesses).toContain('api-server');
      expect(nonExistentProcesses).toEqual([]);
    });

    it('should get all unique namespaces', () => {
      const namespaces = processManager.getNamespaces();

      expect(namespaces).toHaveLength(2);
      expect(namespaces).toContain('web');
      expect(namespaces).toContain('backend');
      expect(namespaces).toEqual(['backend', 'web']); // Should be sorted
    });

    it('should get namespace status summary', () => {
      const webStatus = processManager.getNamespaceStatus('web');
      const backendStatus = processManager.getNamespaceStatus('backend');
      const emptyStatus = processManager.getNamespaceStatus('nonexistent');

      expect(webStatus).toEqual({
        total: 1,
        online: 0,
        stopped: 1,
        errored: 0,
        starting: 0,
        stopping: 0,
      });

      expect(backendStatus).toEqual({
        total: 2,
        online: 0,
        stopped: 2,
        errored: 0,
        starting: 0,
        stopping: 0,
      });

      expect(emptyStatus).toEqual({
        total: 0,
        online: 0,
        stopped: 0,
        errored: 0,
        starting: 0,
        stopping: 0,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrent Process Management Tests
  // ---------------------------------------------------------------------------

  describe('Concurrent Process Management', () => {
    beforeEach(() => {
      // Configure test processes
      const configs: AppConfig[] = [
        {
          name: 'process-1',
          script: 'node',
          args: '--version',
          namespace: 'test',
          cwd: process.cwd(),
          env: {},
        },
        {
          name: 'process-2',
          script: 'node',
          args: '--version',
          namespace: 'test',
          cwd: process.cwd(),
          env: {},
        },
        {
          name: 'process-3',
          script: 'node',
          args: '--version',
          namespace: 'test',
          cwd: process.cwd(),
          env: {},
        },
      ];

      configs.forEach((config) => {
        processManager.configureProcess(config);
        processManager.initializeProcess(config.name);
      });
    });

    it('should start multiple processes concurrently', async () => {
      const results = await processManager.startProcesses([
        'process-1',
        'process-2',
        'process-3',
      ]);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      // Verify all processes are online
      const process1 = processManager.getProcessInfo('process-1');
      const process2 = processManager.getProcessInfo('process-2');
      const process3 = processManager.getProcessInfo('process-3');

      expect(process1?.status).toBe('online');
      expect(process2?.status).toBe('online');
      expect(process3?.status).toBe('online');
    });

    it('should handle empty process list', async () => {
      const results = await processManager.startProcesses([]);
      expect(results).toEqual([]);
    });

    it('should handle mixed success/failure in concurrent start', async () => {
      // Try to start a mix of valid and invalid processes
      const results = await processManager.startProcesses([
        'process-1',
        'nonexistent',
        'process-2',
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('process-1');
      expect(results[0].success).toBe(true);
      expect(results[1].name).toBe('nonexistent');
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeDefined();
      expect(results[2].name).toBe('process-2');
      expect(results[2].success).toBe(true);
    });

    it('should stop multiple processes concurrently', async () => {
      // Start processes first
      await processManager.startProcesses([
        'process-1',
        'process-2',
        'process-3',
      ]);

      // Wait a bit for processes to fully start
      await new Promise((resolve) => globalThis.setTimeout(resolve, 500));

      // Then stop them
      const results = await processManager.stopProcesses([
        'process-1',
        'process-2',
        'process-3',
      ]);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      // Verify all processes are stopped
      const process1 = processManager.getProcessInfo('process-1');
      const process2 = processManager.getProcessInfo('process-2');
      const process3 = processManager.getProcessInfo('process-3');

      expect(process1?.status).toBe('stopped');
      expect(process2?.status).toBe('stopped');
      expect(process3?.status).toBe('stopped');
    });

    it('should restart multiple processes concurrently', async () => {
      // Start processes first
      await processManager.startProcesses(['process-1', 'process-2']);

      // Then restart them
      const results = await processManager.restartProcesses([
        'process-1',
        'process-2',
      ]);

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      // Verify all processes are online with restart count > 0
      const process1 = processManager.getProcessInfo('process-1');
      const process2 = processManager.getProcessInfo('process-2');

      expect(process1?.status).toBe('online');
      expect(process2?.status).toBe('online');
      expect(process1?.restarts).toBeGreaterThan(0);
      expect(process2?.restarts).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Namespace Operations Tests
  // ---------------------------------------------------------------------------

  describe('Namespace Operations', () => {
    beforeEach(() => {
      // Configure processes in multiple namespaces
      const configs: AppConfig[] = [
        {
          name: 'web-1',
          script: 'node',
          args: '--version',
          namespace: 'web',
          cwd: process.cwd(),
          env: {},
        },
        {
          name: 'web-2',
          script: 'node',
          args: '--version',
          namespace: 'web',
          cwd: process.cwd(),
          env: {},
        },
        {
          name: 'api-1',
          script: 'node',
          args: '--version',
          namespace: 'api',
          cwd: process.cwd(),
          env: {},
        },
      ];

      configs.forEach((config) => {
        processManager.configureProcess(config);
        processManager.initializeProcess(config.name);
      });
    });

    it('should start all processes in a namespace', async () => {
      const results = await processManager.startNamespace('web');

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.name).toMatch(/^web-/);
      });

      // Verify namespace status
      const webStatus = processManager.getNamespaceStatus('web');
      expect(webStatus.online).toBe(2);
      expect(webStatus.stopped).toBe(0);
    });

    it('should stop all processes in a namespace', async () => {
      // Start namespace first
      await processManager.startNamespace('web');

      // Wait a bit for processes to fully start
      await new Promise((resolve) => globalThis.setTimeout(resolve, 500));

      // Then stop it
      const results = await processManager.stopNamespace('web');

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.name).toMatch(/^web-/);
      });

      // Verify namespace status
      const webStatus = processManager.getNamespaceStatus('web');
      expect(webStatus.online).toBe(0);
      expect(webStatus.stopped).toBe(2);
    });

    it('should restart all processes in a namespace', async () => {
      // Start namespace first
      await processManager.startNamespace('web');

      // Then restart it
      const results = await processManager.restartNamespace('web');

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.name).toMatch(/^web-/);
      });

      // Verify all processes are online with restart count > 0
      const webProcesses = processManager.getProcessesByNamespace('web');
      webProcesses.forEach((process) => {
        expect(process.status).toBe('online');
        expect(process.restarts).toBeGreaterThan(0);
      });
    });

    it('should handle empty namespace operations', async () => {
      const startResults = await processManager.startNamespace('nonexistent');
      const stopResults = await processManager.stopNamespace('nonexistent');
      const restartResults =
        await processManager.restartNamespace('nonexistent');

      expect(startResults).toEqual([]);
      expect(stopResults).toEqual([]);
      expect(restartResults).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Performance and Concurrency Tests
  // ---------------------------------------------------------------------------

  describe('Performance and Concurrency', () => {
    it('should handle large number of concurrent operations', async () => {
      // Configure 10 test processes
      const configs: AppConfig[] = [];
      for (let i = 0; i < 10; i++) {
        configs.push({
          name: `test-process-${i}`,
          script: 'node',
          args: '--version',
          namespace: 'performance',
          cwd: process.cwd(),
          env: {},
        });
      }

      configs.forEach((config) => {
        processManager.configureProcess(config);
        processManager.initializeProcess(config.name);
      });

      const processNames = configs.map((c) => c.name);

      // Start all processes
      const startTime = Date.now();
      const startResults = await processManager.startProcesses(processNames);
      const startDuration = Date.now() - startTime;

      expect(startResults).toHaveLength(10);
      startResults.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // Should complete in reasonable time (concurrent, not sequential)
      expect(startDuration).toBeLessThan(5000); // 5 seconds max

      // Stop all processes
      const stopResults = await processManager.stopProcesses(processNames);
      expect(stopResults).toHaveLength(10);
      stopResults.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    it('should prevent deadlocks in concurrent operations', async () => {
      // Configure processes
      const configs: AppConfig[] = [
        {
          name: 'deadlock-test-1',
          script: 'node',
          args: '--version',
          namespace: 'deadlock',
          cwd: process.cwd(),
          env: {},
        },
        {
          name: 'deadlock-test-2',
          script: 'node',
          args: '--version',
          namespace: 'deadlock',
          cwd: process.cwd(),
          env: {},
        },
      ];

      configs.forEach((config) => {
        processManager.configureProcess(config);
        processManager.initializeProcess(config.name);
      });

      // Run multiple concurrent operations simultaneously
      const operations = [
        processManager.startProcesses(['deadlock-test-1', 'deadlock-test-2']),
        processManager.startNamespace('deadlock'),
        processManager.getNamespaceStatus('deadlock'),
      ];

      // This should not deadlock and should complete
      const results = await Promise.allSettled(operations);

      expect(results).toHaveLength(3);
      // At least some operations should succeed (they may conflict but shouldn't deadlock)
      const successfulOperations = results.filter(
        (result) => result.status === 'fulfilled'
      );
      expect(successfulOperations.length).toBeGreaterThan(0);
    });
  });
});
