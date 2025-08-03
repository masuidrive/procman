/**
 * Unit tests for ProcessGroupManagerImpl
 */

import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ProcessGroupManagerImpl } from '../../src/process-manager/process-group-manager';
import { ManagedProcessInfo } from '../../src/process-manager/managed-process-info';
import { ProcessConfig } from '../../src/process-manager/process-manager';
import { ProcessDependency } from '../../src/process-manager/interfaces/process-group';

describe('ProcessGroupManagerImpl', () => {
  let groupManager: ProcessGroupManagerImpl;
  let processes: Map<string, ManagedProcessInfo>;
  let mockLifecycle: {
    startProcess: ReturnType<typeof vi.fn>;
    stopProcess: ReturnType<typeof vi.fn>;
    restartProcess: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    processes = new Map();
    mockLifecycle = {
      startProcess: vi.fn().mockResolvedValue({ success: true }),
      stopProcess: vi.fn().mockResolvedValue({ success: true }),
      restartProcess: vi.fn().mockResolvedValue({ success: true }),
    };

    groupManager = new ProcessGroupManagerImpl(processes, mockLifecycle);
  });

  afterEach(() => {
    vi.clearAllMocks();
    processes.clear();
  });

  // Helper function to create test processes
  function createTestProcess(
    name: string,
    namespace: string = 'default'
  ): ManagedProcessInfo {
    const config: ProcessConfig = {
      name,
      script: 'node',
      args: [],
      namespace,
      cwd: process.cwd(),
      env: {},
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: 1000,
      restart_delay: 1000,
    };
    return new ManagedProcessInfo(config);
  }

  describe('getNamespaces', () => {
    it('should return all unique namespaces sorted', () => {
      processes.set('web-1', createTestProcess('web-1', 'web'));
      processes.set('web-2', createTestProcess('web-2', 'web'));
      processes.set('api-1', createTestProcess('api-1', 'api'));
      processes.set('db-1', createTestProcess('db-1', 'database'));
      processes.set('default-1', createTestProcess('default-1'));

      const namespaces = groupManager.getNamespaces();

      expect(namespaces).toEqual(['api', 'database', 'default', 'web']);
    });

    it('should return empty array when no processes', () => {
      const namespaces = groupManager.getNamespaces();
      expect(namespaces).toEqual([]);
    });
  });

  describe('getNamespaceStatus', () => {
    it('should return correct status summary', () => {
      const web1 = createTestProcess('web-1', 'web');
      web1.setStatus('online');
      processes.set('web-1', web1);

      const web2 = createTestProcess('web-2', 'web');
      web2.setStatus('stopped');
      processes.set('web-2', web2);

      const web3 = createTestProcess('web-3', 'web');
      web3.setStatus('errored');
      processes.set('web-3', web3);

      const status = groupManager.getNamespaceStatus('web');

      expect(status).toEqual({
        namespace: 'web',
        total: 3,
        online: 1,
        stopped: 1,
        errored: 1,
        other: 0,
      });
    });

    it('should return zeros for non-existent namespace', () => {
      const status = groupManager.getNamespaceStatus('non-existent');

      expect(status).toEqual({
        namespace: 'non-existent',
        total: 0,
        online: 0,
        stopped: 0,
        errored: 0,
        other: 0,
      });
    });
  });

  describe('getProcessesByNamespace', () => {
    it('should return all processes in namespace', () => {
      processes.set('web-1', createTestProcess('web-1', 'web'));
      processes.set('web-2', createTestProcess('web-2', 'web'));
      processes.set('api-1', createTestProcess('api-1', 'api'));

      const webProcesses = groupManager.getProcessesByNamespace('web');

      expect(webProcesses).toHaveLength(2);
      expect(webProcesses.map((p) => p.name)).toEqual(['web-1', 'web-2']);
    });

    it('should return empty array for non-existent namespace', () => {
      const processes = groupManager.getProcessesByNamespace('non-existent');
      expect(processes).toEqual([]);
    });
  });

  describe('getProcessNamesByNamespace', () => {
    it('should return process names in namespace', () => {
      processes.set('web-1', createTestProcess('web-1', 'web'));
      processes.set('web-2', createTestProcess('web-2', 'web'));
      processes.set('api-1', createTestProcess('api-1', 'api'));

      const names = groupManager.getProcessNamesByNamespace('web');

      expect(names).toEqual(['web-1', 'web-2']);
    });
  });

  describe('startNamespace', () => {
    it('should start all processes in namespace', async () => {
      processes.set('web-1', createTestProcess('web-1', 'web'));
      processes.set('web-2', createTestProcess('web-2', 'web'));
      processes.set('api-1', createTestProcess('api-1', 'api'));

      const startPromise = new Promise((resolve) => {
        groupManager.on('namespace:operation-complete', (data) => {
          resolve(data);
        });
      });

      const result = await groupManager.startNamespace('web');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);

      expect(mockLifecycle.startProcess).toHaveBeenCalledTimes(2);
      expect(mockLifecycle.startProcess).toHaveBeenCalledWith('web-1');
      expect(mockLifecycle.startProcess).toHaveBeenCalledWith('web-2');

      const eventData: any = await startPromise;
      expect(eventData.namespace).toBe('web');
      expect(eventData.operation).toBe('start');
    });

    it('should handle mixed success/failure', async () => {
      processes.set('web-1', createTestProcess('web-1', 'web'));
      processes.set('web-2', createTestProcess('web-2', 'web'));

      mockLifecycle.startProcess
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Failed to start' });

      const result = await groupManager.startNamespace('web');

      expect(result.success).toBe(false);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.results[1].error).toBe('Failed to start');
    });

    it('should return empty result for non-existent namespace', async () => {
      const result = await groupManager.startNamespace('non-existent');

      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
    });
  });

  describe('stopNamespace', () => {
    it('should stop all processes in namespace', async () => {
      processes.set('web-1', createTestProcess('web-1', 'web'));
      processes.set('web-2', createTestProcess('web-2', 'web'));

      const result = await groupManager.stopNamespace('web');

      expect(result.success).toBe(true);
      expect(mockLifecycle.stopProcess).toHaveBeenCalledTimes(2);
    });
  });

  describe('restartNamespace', () => {
    it('should restart all processes in namespace', async () => {
      processes.set('web-1', createTestProcess('web-1', 'web'));
      processes.set('web-2', createTestProcess('web-2', 'web'));

      const result = await groupManager.restartNamespace('web');

      expect(result.success).toBe(true);
      expect(mockLifecycle.restartProcess).toHaveBeenCalledTimes(2);
    });
  });

  describe('startProcesses', () => {
    it('should start multiple processes by name', async () => {
      processes.set('proc-1', createTestProcess('proc-1'));
      processes.set('proc-2', createTestProcess('proc-2'));
      processes.set('proc-3', createTestProcess('proc-3'));

      const eventPromise = new Promise((resolve) => {
        groupManager.on('batch:operation-complete', (data) => {
          resolve(data);
        });
      });

      const result = await groupManager.startProcesses(['proc-1', 'proc-3']);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(mockLifecycle.startProcess).toHaveBeenCalledTimes(2);
      expect(mockLifecycle.startProcess).toHaveBeenCalledWith('proc-1');
      expect(mockLifecycle.startProcess).toHaveBeenCalledWith('proc-3');

      const eventData: any = await eventPromise;
      expect(eventData.operation).toBe('start');
    });

    it('should handle promise rejections gracefully', async () => {
      processes.set('proc-1', createTestProcess('proc-1'));

      mockLifecycle.startProcess.mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await groupManager.startProcesses(['proc-1']);

      expect(result.success).toBe(false);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Network error');
    });

    it('should handle empty process list', async () => {
      const result = await groupManager.startProcesses([]);

      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
      expect(mockLifecycle.startProcess).not.toHaveBeenCalled();
    });
  });

  describe('stopProcesses', () => {
    it('should stop multiple processes', async () => {
      processes.set('proc-1', createTestProcess('proc-1'));
      processes.set('proc-2', createTestProcess('proc-2'));

      const result = await groupManager.stopProcesses(['proc-1', 'proc-2']);

      expect(result.success).toBe(true);
      expect(mockLifecycle.stopProcess).toHaveBeenCalledTimes(2);
    });
  });

  describe('restartProcesses', () => {
    it('should restart multiple processes', async () => {
      processes.set('proc-1', createTestProcess('proc-1'));
      processes.set('proc-2', createTestProcess('proc-2'));

      const result = await groupManager.restartProcesses(['proc-1', 'proc-2']);

      expect(result.success).toBe(true);
      expect(mockLifecycle.restartProcess).toHaveBeenCalledTimes(2);
    });
  });

  describe('dependency management', () => {
    it('should configure process dependency', () => {
      const dependency: ProcessDependency = {
        name: 'api-server',
        dependsOn: ['database', 'cache'],
        waitTimeout: 1000,
      };

      const configuredPromise = new Promise((resolve) => {
        groupManager.on('dependency:configured', (data) => {
          resolve(data);
        });
      });

      groupManager.configureDependency(dependency);

      expect(groupManager.getDependency('api-server')).toEqual(dependency);
    });

    it('should remove process dependency', () => {
      const dependency: ProcessDependency = {
        name: 'api-server',
        dependsOn: ['database'],
        waitTimeout: 1000,
      };

      groupManager.configureDependency(dependency);
      expect(groupManager.getDependency('api-server')).toBeDefined();

      const removedPromise = new Promise((resolve) => {
        groupManager.on('dependency:removed', (data) => {
          resolve(data);
        });
      });

      groupManager.removeDependency('api-server');

      expect(groupManager.getDependency('api-server')).toBeUndefined();
    });

    it('should get all dependencies', () => {
      const dep1: ProcessDependency = {
        name: 'api',
        dependsOn: ['db'],
        waitTimeout: 1000,
      };

      const dep2: ProcessDependency = {
        name: 'web',
        dependsOn: ['api'],
        waitTimeout: 2000,
      };

      groupManager.configureDependency(dep1);
      groupManager.configureDependency(dep2);

      const allDeps = groupManager.getAllDependencies();

      expect(allDeps).toHaveLength(2);
      expect(allDeps).toContainEqual(dep1);
      expect(allDeps).toContainEqual(dep2);
    });

    it('should resolve dependencies (simplified)', () => {
      // Current implementation just returns all as independent
      const result = groupManager.resolveDependencies(['api', 'db', 'web']);

      expect(result.independent).toEqual(['api', 'db', 'web']);
      expect(result.dependent).toEqual([]);
      expect(result.circular).toEqual([]);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent namespace operations', async () => {
      // Create processes in different namespaces
      processes.set('web-1', createTestProcess('web-1', 'web'));
      processes.set('web-2', createTestProcess('web-2', 'web'));
      processes.set('api-1', createTestProcess('api-1', 'api'));
      processes.set('api-2', createTestProcess('api-2', 'api'));

      // Start both namespaces concurrently
      const [webResult, apiResult] = await Promise.all([
        groupManager.startNamespace('web'),
        groupManager.startNamespace('api'),
      ]);

      expect(webResult.success).toBe(true);
      expect(apiResult.success).toBe(true);
      expect(mockLifecycle.startProcess).toHaveBeenCalledTimes(4);
    });
  });
});
