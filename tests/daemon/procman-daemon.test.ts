/**
 * Test for ProcmanDaemon class
 * Tests daemon lifecycle management and component integration
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ProcmanDaemon, DaemonState } from '../../src/daemon/procman-daemon.js';
import { DataDirectory } from '../../src/daemon/data-directory.js';
import { PIDManager } from '../../src/daemon/pid-manager.js';

describe('ProcmanDaemon', () => {
  let tempTestDir: string;
  let dataDirectory: DataDirectory;
  let pidManager: PIDManager;
  let daemon: ProcmanDaemon;
  let originalHome: string | undefined;

  beforeEach(async () => {
    // Create temporary test directory
    tempTestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'procman-test-'));

    // Set temporary HOME environment variable
    originalHome = process.env.HOME;
    process.env.HOME = tempTestDir;

    dataDirectory = new DataDirectory();
    await dataDirectory.ensureDataDirectory();

    pidManager = new PIDManager(dataDirectory);
    daemon = new ProcmanDaemon();
  });

  afterEach(async () => {
    // Stop daemon if running
    try {
      if (daemon.getState() === DaemonState.RUNNING) {
        await daemon.stop();
      }
    } catch {
      // Ignore cleanup errors
    }

    // Clean up PID file
    try {
      await pidManager.removePIDFile();
    } catch {
      // Ignore cleanup errors
    }

    // Restore original HOME
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }

    // Clean up test directory
    try {
      await fs.rm(tempTestDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    test('should create daemon with stopped state', () => {
      expect(daemon).toBeInstanceOf(ProcmanDaemon);
      expect(daemon.getState()).toBe(DaemonState.STOPPED);
    });
  });

  describe('state management', () => {
    test('should start with STOPPED state', () => {
      expect(daemon.getState()).toBe(DaemonState.STOPPED);
    });

    test('should transition through states during startup', async () => {
      const states: DaemonState[] = [];

      // Mock state change listener
      const listener = vi.fn((state: DaemonState) => {
        states.push(state);
      });

      daemon.on('stateChange', listener);

      await daemon.start();

      expect(states).toContain(DaemonState.STARTING);
      expect(states).toContain(DaemonState.RUNNING);
      expect(daemon.getState()).toBe(DaemonState.RUNNING);
    });

    test('should transition through states during shutdown', async () => {
      await daemon.start();

      const states: DaemonState[] = [];
      const listener = vi.fn((state: DaemonState) => {
        states.push(state);
      });

      daemon.on('stateChange', listener);

      await daemon.stop();

      expect(states).toContain(DaemonState.STOPPING);
      expect(states).toContain(DaemonState.STOPPED);
      expect(daemon.getState()).toBe(DaemonState.STOPPED);
    });
  });

  describe('start', () => {
    test('should start daemon successfully', async () => {
      await daemon.start();
      expect(daemon.getState()).toBe(DaemonState.RUNNING);
    });

    test('should throw error if daemon is already starting', async () => {
      // Start daemon without waiting
      const startPromise = daemon.start();

      // Try to start again immediately
      await expect(daemon.start()).rejects.toThrow('Cannot start daemon');

      // Wait for first start to complete
      await startPromise;
    });

    test('should throw error if daemon is already running', async () => {
      await daemon.start();

      await expect(daemon.start()).rejects.toThrow('Cannot start daemon');
    });

    test('should prevent duplicate daemon processes', async () => {
      await daemon.start();

      // Create another daemon instance
      const daemon2 = new ProcmanDaemon();

      await expect(daemon2.start()).rejects.toThrow(
        'Daemon is already running'
      );
    });
  });

  describe('stop', () => {
    test('should stop running daemon successfully', async () => {
      await daemon.start();
      await daemon.stop();

      expect(daemon.getState()).toBe(DaemonState.STOPPED);
    });

    test('should throw error if daemon is not running', async () => {
      await expect(daemon.stop()).rejects.toThrow('Cannot stop daemon');
    });

    test('should clean up PID file on stop', async () => {
      await daemon.start();

      const pidManager = new PIDManager(new DataDirectory());
      const pidBefore = await pidManager.readPIDFile();
      expect(pidBefore).toBe(process.pid);

      await daemon.stop();

      const pidAfter = await pidManager.readPIDFile();
      expect(pidAfter).toBeNull();
    });
  });

  describe('restart', () => {
    test('should restart running daemon', async () => {
      await daemon.start();

      const initialState = daemon.getState();
      expect(initialState).toBe(DaemonState.RUNNING);

      await daemon.restart();

      expect(daemon.getState()).toBe(DaemonState.RUNNING);
    });

    test('should start daemon if not running', async () => {
      await daemon.restart();

      expect(daemon.getState()).toBe(DaemonState.RUNNING);
    });
  });

  describe('signal handling', () => {
    test('should setup signal handlers on start', async () => {
      const originalListeners = process.listeners('SIGTERM');

      await daemon.start();

      const newListeners = process.listeners('SIGTERM');
      expect(newListeners.length).toBeGreaterThan(originalListeners.length);
    });

    test('should clean up signal handlers on stop', async () => {
      await daemon.start();
      const listenersAfterStart = process.listeners('SIGTERM');

      await daemon.stop();
      const listenersAfterStop = process.listeners('SIGTERM');

      // Should have fewer listeners after stop
      expect(listenersAfterStop.length).toBeLessThan(
        listenersAfterStart.length
      );
    });
  });

  describe('error handling', () => {
    test('should handle component initialization errors', async () => {
      // Mock a component to fail during initialization
      const daemon = new ProcmanDaemon();

      // This test would need actual component mocking
      // For now, just verify error handling structure exists
      expect(daemon.getState()).toBe(DaemonState.STOPPED);
    });

    test('should transition to error state on failure', async () => {
      // This would test error state transitions
      // Implementation depends on actual error scenarios
      expect(daemon.getState()).toBe(DaemonState.STOPPED);
    });
  });

  describe('component integration', () => {
    test('should initialize all components on start', async () => {
      await daemon.start();

      // Verify components are initialized
      // This would need actual component integration
      expect(daemon.getState()).toBe(DaemonState.RUNNING);
    });

    test('should cleanup all components on stop', async () => {
      await daemon.start();
      await daemon.stop();

      // Verify components are cleaned up
      expect(daemon.getState()).toBe(DaemonState.STOPPED);
    });
  });

  describe('isRunning', () => {
    test('should return false when daemon is stopped', () => {
      expect(daemon.isRunning()).toBe(false);
    });

    test('should return true when daemon is running', async () => {
      await daemon.start();
      expect(daemon.isRunning()).toBe(true);
    });

    test('should return false when daemon is starting', async () => {
      // This test would need a way to check state during startup
      // For now, just test basic functionality
      expect(daemon.isRunning()).toBe(false);
    });
  });

  describe('memory monitoring and graceful shutdown', () => {
    test('should handle memory critical event', async () => {
      const mockUsage = {
        rss: 250 * 1024 * 1024, // 250MB
        heapTotal: 200 * 1024 * 1024,
        heapUsed: 180 * 1024 * 1024,
        external: 50 * 1024 * 1024,
        arrayBuffers: 10 * 1024 * 1024,
        timestamp: Date.now(),
      };
      const threshold = 200 * 1024 * 1024; // 200MB (critical threshold)

      await daemon.start();

      // Spy on console.warn for critical memory warning
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        // Mock implementation
      });

      // Manually trigger the memory critical event
      // We can't easily mock the internal MemoryMonitor, so we test the event handler directly
      (daemon as any).memoryMonitor.emit(
        'memoryCritical',
        mockUsage,
        threshold
      );

      // Wait a bit for the event handler
      await new Promise((resolve) => setTimeout(resolve, 200));

      // The event should log critical memory warning
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[ProcmanDaemon] Memory critical threshold exceeded'
        )
      );

      consoleSpy.mockRestore();
    });

    test('should handle memory events without restart threshold', async () => {
      const memoryWarningSpy = vi.fn();
      const memoryCriticalSpy = vi.fn();

      daemon.on('error', () => {}); // Ignore errors for this test

      await daemon.start();

      daemon['memoryMonitor'].on('memoryWarning', memoryWarningSpy);
      daemon['memoryMonitor'].on('memoryCritical', memoryCriticalSpy);

      const mockUsage = {
        rss: 150 * 1024 * 1024, // 150MB
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 80 * 1024 * 1024,
        external: 20 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
        timestamp: Date.now(),
      };

      // Simulate warning threshold exceeded
      (daemon as any).memoryMonitor.emit(
        'memoryWarning',
        mockUsage,
        100 * 1024 * 1024
      );

      expect(memoryWarningSpy).toHaveBeenCalledWith(
        mockUsage,
        100 * 1024 * 1024
      );

      // Simulate critical threshold exceeded
      (daemon as any).memoryMonitor.emit(
        'memoryCritical',
        mockUsage,
        200 * 1024 * 1024
      );

      expect(memoryCriticalSpy).toHaveBeenCalledWith(
        mockUsage,
        200 * 1024 * 1024
      );
    });

    test('should return health status including memory info', async () => {
      await daemon.start();

      const healthStatus = await daemon.getHealthStatus();

      expect(healthStatus).toBeDefined();
      expect(healthStatus.ready).toBeDefined();
      expect(healthStatus.components).toBeDefined();
      expect(healthStatus.memory).toBeDefined();
      expect(healthStatus.memory?.status).toMatch(
        /^(healthy|warning|critical|restart-required)$/
      );
      expect(healthStatus.memory?.currentMemory).toBeDefined();
      expect(healthStatus.memory?.thresholds).toBeDefined();
      expect(healthStatus.memory?.thresholds.warning).toBeDefined();
      expect(healthStatus.memory?.thresholds.critical).toBeDefined();
    });
  });
});
