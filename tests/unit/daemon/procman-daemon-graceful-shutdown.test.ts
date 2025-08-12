/**
 * Unit tests for ProcmanDaemon graceful shutdown functionality
 * Tests Phase 4 implementation: Graceful Shutdown and State Preservation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import {
  ProcmanDaemon,
  ShutdownReason,
} from '../../../src/daemon/procman-daemon.js';
import { DaemonState } from '../../../src/daemon/daemon-state-manager.js';
import { ProcessStatus } from '../../../src/shared/process.js';

// Mock external dependencies
vi.mock('../../../src/daemon/data-directory.js');
vi.mock('../../../src/daemon/pid-manager.js');
vi.mock('../../../src/daemon/daemon-state-manager.js');
vi.mock('../../../src/daemon/component-manager.js');
vi.mock('../../../src/daemon/signal-handler.js');
vi.mock('../../../src/utils/memory/memory-monitor.js');

describe('ProcmanDaemon Graceful Shutdown', () => {
  let daemon: ProcmanDaemon;
  let mockComponentManager: any;
  let mockProcessManager: any;
  let mockIPCServer: any;
  let mockStateManager: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock process.exit to prevent actual exit during tests
    const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Create mock IPC server
    mockIPCServer = {
      getConnections: vi.fn(() => []),
      broadcast: vi.fn(),
      stop: vi.fn(),
    };

    // Create mock process manager
    mockProcessManager = {
      getAllProcessInfo: vi.fn(() => []),
      stopProcesses: vi.fn(),
      monitor: {
        getProcessStats: vi.fn(() => ({ memory: 0, cpu: 0 })),
      },
    };

    // Create mock component manager
    mockComponentManager = {
      performHealthChecks: vi.fn(() => ({ healthy: true, details: {} })),
      initializeAll: vi.fn(),
      cleanupAll: vi.fn(),
      getComponent: vi.fn((name: string) => {
        if (name === 'ipcServer') return mockIPCServer;
        if (name === 'processManager') return mockProcessManager;
        return null;
      }),
      on: vi.fn(),
    };

    // Create mock state manager
    mockStateManager = {
      getCurrentState: vi.fn(() => DaemonState.STOPPED),
      canStart: vi.fn(() => true),
      canStop: vi.fn(() => true),
      transitionTo: vi.fn(),
      isRunning: vi.fn(() => false),
      isInError: vi.fn(() => false),
      on: vi.fn(),
    };

    // Create daemon instance
    daemon = new ProcmanDaemon();

    // Replace internal managers with mocks
    (daemon as any).componentManager = mockComponentManager;
    (daemon as any).stateManager = mockStateManager;
    (daemon as any).dataDirectory = {
      getDataDir: vi.fn(() => '/tmp/procman-test'),
      ensureDataDirectory: vi.fn(),
      validateDataDirectory: vi.fn(),
      resolveDataDir: vi.fn(() => '/tmp/procman-test'),
      getSocketPath: vi.fn(() => '/tmp/procman-test/procman.sock'),
    };
    (daemon as any).pidManager = {
      ensureNoDaemonRunning: vi.fn(),
      writePIDFile: vi.fn(),
      cleanup: vi.fn(),
    };
    (daemon as any).signalHandler = {
      setupHandlers: vi.fn(),
      cleanupHandlers: vi.fn(),
      on: vi.fn(),
    };
    (daemon as any).memoryMonitor = {
      start: vi.fn(),
      stop: vi.fn(),
      getCurrentMemoryUsage: vi.fn(() => ({
        rss: 50000000,
        heapUsed: 30000000,
        heapTotal: 40000000,
      })),
      getHealthInfo: vi.fn(() => ({
        status: 'healthy',
        currentMemory: {},
        thresholds: {},
      })),
      on: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('shutdown() method', () => {
    it('should execute graceful shutdown phases in correct order', async () => {
      const executionOrder: string[] = [];

      // Mock phase methods to track execution order
      const originalSaveShutdownState = (daemon as any).saveShutdownState;
      const originalDrainActiveConnections = (daemon as any)
        .drainActiveConnections;
      const originalStopManagedProcesses = (daemon as any).stopManagedProcesses;

      (daemon as any).saveShutdownState = vi.fn(async () => {
        executionOrder.push('saveShutdownState');
      });

      (daemon as any).drainActiveConnections = vi.fn(async () => {
        executionOrder.push('drainActiveConnections');
      });

      (daemon as any).stopManagedProcesses = vi.fn(async () => {
        executionOrder.push('stopManagedProcesses');
      });

      // Mock stop method
      daemon.stop = vi.fn(async () => {
        executionOrder.push('stop');
      });

      await daemon.shutdown('manual');

      // Verify execution order
      expect(executionOrder).toEqual([
        'saveShutdownState',
        'drainActiveConnections',
        'stopManagedProcesses',
        'stop',
      ]);
    });

    it('should prevent concurrent shutdowns', async () => {
      // Make shutdown take some time
      daemon.stop = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const shutdown1 = daemon.shutdown('manual');
      const shutdown2 = daemon.shutdown('signal');

      await Promise.all([shutdown1, shutdown2]);

      // Second shutdown should return immediately without doing work
      expect(daemon.stop).toHaveBeenCalledTimes(1);
    });

    it('should emit shutdown events', async () => {
      const shutdownStartedSpy = vi.fn();
      const shutdownCompletedSpy = vi.fn();

      daemon.on('shutdownStarted', shutdownStartedSpy);
      daemon.on('shutdownCompleted', shutdownCompletedSpy);

      daemon.stop = vi.fn();

      await daemon.shutdown('manual');

      expect(shutdownStartedSpy).toHaveBeenCalledWith('manual');
      expect(shutdownCompletedSpy).toHaveBeenCalledWith(
        'manual',
        expect.any(Number)
      );
    });

    it('should handle shutdown timeout and emit failure event', async () => {
      const shutdownFailedSpy = vi.fn();
      daemon.on('shutdownFailed', shutdownFailedSpy);

      // Make one phase timeout
      (daemon as any).saveShutdownState = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000)); // 10s timeout
      });

      await expect(daemon.shutdown('manual', 100)).rejects.toThrow(
        'Phase 2: State preservation timed out after 5000ms'
      );

      expect(shutdownFailedSpy).toHaveBeenCalledWith(
        'manual',
        expect.any(Error),
        expect.any(Number)
      );
    });

    it('should perform emergency cleanup on failure', async () => {
      const emergencyCleanupSpy = vi
        .spyOn(daemon as any, 'performEmergencyCleanup')
        .mockImplementation(() => Promise.resolve());

      // Make shutdown fail
      daemon.stop = vi.fn(async () => {
        throw new Error('Stop failed');
      });

      await expect(daemon.shutdown('error')).rejects.toThrow('Stop failed');

      expect(emergencyCleanupSpy).toHaveBeenCalled();
    });
  });

  describe('saveShutdownState()', () => {
    it('should save shutdown state to JSON file', async () => {
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      const mockMkdir = vi.fn().mockResolvedValue(undefined);

      // Mock the dynamic import of fs
      vi.doMock('fs', () => ({
        promises: {
          writeFile: mockWriteFile,
          mkdir: mockMkdir,
        },
      }));

      // Mock getAllProcessStatuses to return test data
      daemon.getAllProcessStatuses = vi.fn(async () => [
        {
          name: 'test-app',
          namespace: 'default',
          pid: 1234,
          status: 'online' as ProcessStatus,
          uptime: 3600,
          memory: 50000000,
          cpu: 0.1,
          restarts: 0,
        },
      ]);

      await (daemon as any).saveShutdownState('manual');

      // Check that mkdir was called
      expect(mockMkdir).toHaveBeenCalledWith('/tmp/procman-test', {
        recursive: true,
      });

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/tmp/procman-test/shutdown-state.json',
        expect.stringContaining('manual'),
        'utf-8'
      );

      const savedData = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(savedData).toMatchObject({
        reason: 'manual',
        processId: process.pid,
        activeConnections: 0,
        processes: expect.any(Array),
      });
    });

    it('should not fail shutdown if state saving fails', async () => {
      // Mock the dynamic import of fs to throw error
      vi.doMock('fs', () => ({
        promises: {
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn(() => Promise.reject(new Error('Disk full'))),
        },
      }));

      // Should not throw error
      await expect(
        (daemon as any).saveShutdownState('manual')
      ).resolves.toBeUndefined();
    });
  });

  describe('drainActiveConnections()', () => {
    it('should send shutdown notice to all connections', async () => {
      const mockConnections = [{ id: 'conn1' }, { id: 'conn2' }];

      mockIPCServer.getConnections.mockReturnValue(mockConnections);

      await (daemon as any).drainActiveConnections();

      expect(mockIPCServer.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ping', // Updated to use existing command type
          payload: {
            shutdownNotice: true,
            reason: 'graceful-shutdown',
            gracePeriodMs: 8000,
          },
          id: expect.stringContaining('shutdown-notice-'),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should wait for connections to close gracefully', async () => {
      const mockConnections = [{ id: 'conn1' }, { id: 'conn2' }];

      // Simulate connections closing after a delay
      let callCount = 0;
      mockIPCServer.getConnections.mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return mockConnections; // Still have connections
        }
        return []; // Connections closed
      });

      const start = Date.now();
      await (daemon as any).drainActiveConnections();
      const elapsed = Date.now() - start;

      // Should have waited for connections to close
      expect(elapsed).toBeGreaterThan(400); // At least 5 * 100ms polling
      expect(mockIPCServer.getConnections).toHaveBeenCalledTimes(7);
    });

    it('should timeout after 8 seconds if connections do not close', async () => {
      const mockConnections = [{ id: 'conn1' }];
      mockIPCServer.getConnections.mockReturnValue(mockConnections);

      const start = Date.now();
      await (daemon as any).drainActiveConnections();
      const elapsed = Date.now() - start;

      // Should timeout after ~8 seconds
      expect(elapsed).toBeGreaterThan(8000);
      expect(elapsed).toBeLessThan(8500);
    });

    it('should handle case with no IPC server', async () => {
      mockComponentManager.getComponent.mockReturnValue(null);

      // Should not throw
      await expect(
        (daemon as any).drainActiveConnections()
      ).resolves.toBeUndefined();
    });

    it('should handle case with no active connections', async () => {
      mockIPCServer.getConnections.mockReturnValue([]);

      await (daemon as any).drainActiveConnections();

      // Should not call broadcast if no connections
      expect(mockIPCServer.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('stopManagedProcesses()', () => {
    it('should stop all managed processes', async () => {
      const mockProcesses = [
        { name: 'app1', pid: 1234 },
        { name: 'app2', pid: 5678 },
      ];

      mockProcessManager.getAllProcessInfo.mockReturnValue(mockProcesses);

      await (daemon as any).stopManagedProcesses();

      expect(mockProcessManager.stopProcesses).toHaveBeenCalledWith([
        'app1',
        'app2',
      ]);
    });

    it('should handle case with no process manager', async () => {
      mockComponentManager.getComponent.mockImplementation((name: string) => {
        if (name === 'processManager') return null;
        return mockIPCServer;
      });

      // Should not throw
      await expect(
        (daemon as any).stopManagedProcesses()
      ).resolves.toBeUndefined();
    });

    it('should handle case with no managed processes', async () => {
      mockProcessManager.getAllProcessInfo.mockReturnValue([]);

      await (daemon as any).stopManagedProcesses();

      // Should not call stopProcesses if no processes
      expect(mockProcessManager.stopProcesses).not.toHaveBeenCalled();
    });
  });

  describe('executeWithTimeout()', () => {
    it('should execute function successfully within timeout', async () => {
      const testFn = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'success';
      });

      const result = await (daemon as any).executeWithTimeout(
        testFn,
        1000,
        'Test Phase'
      );

      expect(result).toBe('success');
      expect(testFn).toHaveBeenCalled();
    });

    it('should timeout and throw error', async () => {
      const testFn = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return 'success';
      });

      await expect(
        (daemon as any).executeWithTimeout(testFn, 100, 'Test Phase')
      ).rejects.toThrow('Test Phase timed out after 100ms');
    });
  });

  describe('getActiveConnectionCount()', () => {
    it('should return connection count from IPC server', () => {
      const mockConnections = [{ id: 'conn1' }, { id: 'conn2' }];
      mockIPCServer.getConnections.mockReturnValue(mockConnections);

      const count = (daemon as any).getActiveConnectionCount();

      expect(count).toBe(2);
    });

    it('should return 0 when no IPC server', () => {
      mockComponentManager.getComponent.mockReturnValue(null);

      const count = (daemon as any).getActiveConnectionCount();

      expect(count).toBe(0);
    });
  });

  describe('Shutdown reason types', () => {
    it('should accept all valid shutdown reasons', async () => {
      daemon.stop = vi.fn();

      const validReasons: ShutdownReason[] = [
        'manual',
        'signal',
        'memory',
        'error',
      ];

      for (const reason of validReasons) {
        await daemon.shutdown(reason);
      }

      expect(daemon.stop).toHaveBeenCalledTimes(4);
    });
  });
});
