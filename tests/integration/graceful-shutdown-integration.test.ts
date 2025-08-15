/**
 * Integration tests for graceful shutdown functionality
 * Tests real daemon shutdown with all components
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import {
  ProcmanDaemon,
  ShutdownReason,
} from '../../src/daemon/procman-daemon.js';
import { DaemonState } from '../../src/daemon/daemon-state-manager.js';

describe('Graceful Shutdown Integration', () => {
  let daemon: ProcmanDaemon;
  let testDataDir: string;

  beforeEach(async () => {
    // Create temporary directory for test data
    testDataDir = path.join(
      process.cwd(),
      'test-tmp',
      `graceful-shutdown-${Date.now()}`
    );
    await fs.mkdir(testDataDir, { recursive: true });

    // Set environment for test
    process.env.PROCMAN_SOCKET_PATH = path.join(testDataDir, 'procman.sock');
    process.env.NODE_ENV = 'test';

    // Mock process.exit to prevent actual exit during tests
    vi.spyOn(process, 'exit').mockImplementation(
      (code?: string | number | null | undefined) => {
        // Record the call but don't throw error to prevent Unhandled Rejection
        return undefined as never;
      }
    );

    // Create daemon instance
    daemon = new ProcmanDaemon();
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    // Cleanup test daemon if still running
    try {
      if (daemon.isRunning()) {
        await daemon.stop();
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    // Clean up test directory
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('End-to-End Graceful Shutdown', () => {
    it('should perform complete graceful shutdown cycle', async () => {
      // Start daemon
      await daemon.start();
      expect(daemon.isRunning()).toBe(true);

      // Track shutdown events
      const shutdownEvents: string[] = [];
      daemon.on('shutdownStarted', (reason) =>
        shutdownEvents.push(`started:${reason}`)
      );
      daemon.on('shutdownCompleted', (reason, time) =>
        shutdownEvents.push(`completed:${reason}:${time}`)
      );
      daemon.on('newConnectionsRejected', () =>
        shutdownEvents.push('connectionsRejected')
      );

      // Perform graceful shutdown
      const startTime = Date.now();
      await daemon.shutdown('manual');
      const totalTime = Date.now() - startTime;

      // Verify daemon is stopped
      expect(daemon.isRunning()).toBe(false);
      expect(daemon.getState()).toBe(DaemonState.STOPPED);

      // Verify events were emitted
      expect(shutdownEvents).toContain('started:manual');
      expect(
        shutdownEvents.some((e) => e.startsWith('completed:manual:'))
      ).toBe(true);

      // Verify shutdown took reasonable time (should be fast with no connections/processes)
      expect(totalTime).toBeLessThan(5000); // Less than 5 seconds
    }, 15000);

    it('should save shutdown state to file', async () => {
      await daemon.start();

      await daemon.shutdown('signal');

      // Check if shutdown state file exists (saved in procman-data subdirectory)
      const statePath = path.join(
        testDataDir,
        'procman-data',
        'shutdown-state.json'
      );
      const stateExists = await fs
        .access(statePath)
        .then(() => true)
        .catch(() => false);
      expect(stateExists).toBe(true);

      // Read and verify shutdown state
      const stateContent = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(stateContent);

      expect(state).toMatchObject({
        reason: 'signal',
        processId: process.pid,
        activeConnections: 0, // No connections in test
        uptime: expect.any(Number),
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        timestamp: expect.any(String),
        memoryUsage: expect.objectContaining({
          rss: expect.any(Number),
          heapUsed: expect.any(Number),
          heapTotal: expect.any(Number),
        }),
        processes: expect.any(Array), // No processes configured in test
      });
    }, 15000);

    it('should handle shutdown timeout gracefully', async () => {
      await daemon.start();

      // Mock one of the cleanup methods to hang
      const componentManager = (daemon as any).componentManager;
      if (componentManager && componentManager.cleanupAll) {
        vi.spyOn(componentManager, 'cleanupAll').mockImplementation(
          async () => {
            // Hang for longer than timeout
            await new Promise((resolve) => setTimeout(resolve, 10000));
          }
        );
      }

      // Shutdown with short timeout
      const shutdownPromise = daemon.shutdown('manual', 1000);

      // Should timeout and throw error
      await expect(shutdownPromise).rejects.toThrow(/timed out after/);

      // Daemon should still be in some state (potentially error state)
      // The exact state depends on where the timeout occurred
    }, 15000);

    it('should prevent concurrent shutdowns', async () => {
      await daemon.start();

      // Start two shutdowns simultaneously
      const shutdown1Promise = daemon.shutdown('signal');
      const shutdown2Promise = daemon.shutdown('manual');

      // Both should complete without error
      await Promise.all([shutdown1Promise, shutdown2Promise]);

      expect(daemon.isRunning()).toBe(false);
    }, 15000);
  });

  describe('Shutdown State Persistence', () => {
    it('should persist comprehensive shutdown state', async () => {
      await daemon.start();

      // Load a test configuration to create processes
      const testConfig = [
        {
          name: 'test-app',
          script: 'echo "test"',
          instances: 1,
        },
      ];

      // Mock process manager to simulate having processes
      const processManager = daemon.getProcessManager();
      if (processManager) {
        vi.spyOn(daemon, 'getAllProcessStatuses').mockResolvedValue([
          {
            name: 'test-app',
            namespace: 'default',
            pid: 12345,
            status: 'online', // Use valid ProcessStatus
            uptime: 3600000, // 1 hour
            memory: 50000000, // 50MB
            cpu: 0.5,
            restarts: 0,
          },
        ]);
      }

      await daemon.shutdown('error');

      const statePath = path.join(
        testDataDir,
        'procman-data',
        'shutdown-state.json'
      );
      const stateContent = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(stateContent);

      // Verify all expected fields are present
      expect(state).toHaveProperty('timestamp');
      expect(state).toHaveProperty('reason', 'error');
      expect(state).toHaveProperty('processId');
      expect(state).toHaveProperty('memoryUsage');
      expect(state).toHaveProperty('processes');
      expect(state).toHaveProperty('activeConnections');
      expect(state).toHaveProperty('uptime');
      expect(state).toHaveProperty('version');
      expect(state).toHaveProperty('platform');
      expect(state).toHaveProperty('arch');

      // Verify timestamp is valid ISO string
      expect(new Date(state.timestamp).getTime()).toBeGreaterThan(0);

      // Verify memory usage structure
      expect(state.memoryUsage).toHaveProperty('rss');
      expect(state.memoryUsage).toHaveProperty('heapUsed');
      expect(state.memoryUsage).toHaveProperty('heapTotal');
    }, 15000);

    it('should handle state save failure gracefully', async () => {
      await daemon.start();

      // Make the data directory read-only to cause write failure
      const dataDir = path.dirname(
        path.join(testDataDir, 'shutdown-state.json')
      );
      try {
        await fs.chmod(dataDir, 0o444); // Read-only

        // Shutdown should still succeed even if state save fails
        await daemon.shutdown('manual');

        expect(daemon.isRunning()).toBe(false);
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(dataDir, 0o755);
      }
    }, 15000);
  });

  describe('Signal Handler Integration', () => {
    it('should use graceful shutdown for signal handling', async () => {
      await daemon.start();

      const shutdownEvents: string[] = [];
      daemon.on('shutdownStarted', (reason) =>
        shutdownEvents.push(`started:${reason}`)
      );

      // Get signal handler and trigger graceful shutdown
      const signalHandler = (daemon as any).signalHandler;

      // Simulate SIGTERM signal
      try {
        signalHandler.emit('gracefulShutdown', 'SIGTERM');

        // Give some time for shutdown to process
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        // Expected process.exit error
        expect((error as Error).message).toBe('process.exit called');
      }

      // Verify graceful shutdown was triggered with signal reason
      expect(shutdownEvents).toContain('started:signal');
    }, 10000);
  });
});
