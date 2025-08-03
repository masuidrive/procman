/**
 * Tests for auto-restart functionality in ProcessManager and ManagedProcessInfo
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessManager } from '../../src/process-manager/process-manager';
import { ManagedProcessInfo } from '../../src/process-manager/managed-process-info';
import { AppConfig } from '../../src/shared/config';
import {
  RESTART_BACKOFF_BASE_DELAY,
  RESTART_BACKOFF_MULTIPLIER,
  RESTART_BACKOFF_MAX_DELAY,
  MAX_RESTART_COUNT,
  RESTART_WINDOW_TIME,
} from '../../src/shared/constants';

describe('ManagedProcessInfo Auto-restart Control', () => {
  let processInfo: ManagedProcessInfo;

  beforeEach(() => {
    const config = {
      name: 'test-process',
      script: 'node',
      namespace: 'test',
      args: ['--version'],
      cwd: process.cwd(),
      env: {},
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: 100 * 1024 * 1024, // 100MB
      max_restarts: 10,
      min_uptime: 1000,
      restart_delay: 1000,
    };
    processInfo = new ManagedProcessInfo(config);
  });

  afterEach(() => {
    processInfo.cleanup();
    vi.unstubAllGlobals();
  });

  describe('Auto-restart Enablement', () => {
    it('should start with auto-restart enabled by default', () => {
      expect(processInfo.isAutoRestartEnabled()).toBe(true);
    });

    it('should allow disabling auto-restart', () => {
      processInfo.setAutoRestartEnabled(false);
      expect(processInfo.isAutoRestartEnabled()).toBe(false);
    });

    it('should allow enabling auto-restart', () => {
      processInfo.setAutoRestartEnabled(false);
      processInfo.setAutoRestartEnabled(true);
      expect(processInfo.isAutoRestartEnabled()).toBe(true);
    });

    it('should reset failure counters when disabling auto-restart', () => {
      processInfo.recordRestartFailure();
      expect(processInfo.getConsecutiveFailures()).toBe(1);

      processInfo.setAutoRestartEnabled(false);
      expect(processInfo.getConsecutiveFailures()).toBe(0);
    });
  });

  describe('Failure Tracking', () => {
    it('should track consecutive failures', () => {
      expect(processInfo.getConsecutiveFailures()).toBe(0);

      processInfo.recordRestartFailure();
      expect(processInfo.getConsecutiveFailures()).toBe(1);

      processInfo.recordRestartFailure();
      expect(processInfo.getConsecutiveFailures()).toBe(2);
    });

    it('should reset failure count on successful restart', () => {
      processInfo.recordRestartFailure();
      processInfo.recordRestartFailure();
      expect(processInfo.getConsecutiveFailures()).toBe(2);

      processInfo.recordRestartSuccess();
      expect(processInfo.getConsecutiveFailures()).toBe(0);
    });

    it('should disable auto-restart after max failures', () => {
      expect(processInfo.isAutoRestartEnabled()).toBe(true);

      // Record max failures
      for (let i = 0; i < MAX_RESTART_COUNT; i++) {
        processInfo.recordRestartFailure();
      }

      expect(processInfo.isAutoRestartEnabled()).toBe(false);
      expect(processInfo.getConsecutiveFailures()).toBe(MAX_RESTART_COUNT);
    });

    it('should reset failure window after timeout', () => {
      // Mock Date.now to control time
      let currentTime = 1000000;
      const mockNow = vi.fn(() => currentTime);
      vi.stubGlobal('Date', {
        ...Date,
        now: mockNow,
      });

      processInfo.recordRestartFailure();
      expect(processInfo.getConsecutiveFailures()).toBe(1);

      // Advance time beyond window
      currentTime += RESTART_WINDOW_TIME + 1000;

      processInfo.recordRestartFailure();
      expect(processInfo.getConsecutiveFailures()).toBe(1); // Should reset

      // Restore original Date
      vi.unstubAllGlobals();
    });
  });

  describe('Backoff Strategy', () => {
    it('should start with base delay', () => {
      expect(processInfo.getNextRestartDelay()).toBe(
        RESTART_BACKOFF_BASE_DELAY
      );
    });

    it('should increase delay with exponential backoff', () => {
      processInfo.recordRestartFailure();
      expect(processInfo.getNextRestartDelay()).toBe(
        RESTART_BACKOFF_BASE_DELAY
      );

      processInfo.recordRestartFailure();
      expect(processInfo.getNextRestartDelay()).toBe(
        RESTART_BACKOFF_BASE_DELAY * RESTART_BACKOFF_MULTIPLIER
      );

      processInfo.recordRestartFailure();
      expect(processInfo.getNextRestartDelay()).toBe(
        RESTART_BACKOFF_BASE_DELAY * Math.pow(RESTART_BACKOFF_MULTIPLIER, 2)
      );
    });

    it('should cap delay at maximum', () => {
      // Record enough failures to exceed max delay
      for (let i = 0; i < 20; i++) {
        processInfo.recordRestartFailure();
      }

      expect(processInfo.getNextRestartDelay()).toBe(RESTART_BACKOFF_MAX_DELAY);
    });

    it('should reset delay on successful restart', () => {
      processInfo.recordRestartFailure();
      processInfo.recordRestartFailure();
      expect(processInfo.getNextRestartDelay()).toBeGreaterThan(
        RESTART_BACKOFF_BASE_DELAY
      );

      processInfo.recordRestartSuccess();
      expect(processInfo.getNextRestartDelay()).toBe(
        RESTART_BACKOFF_BASE_DELAY
      );
    });
  });

  describe('Restart Decision Logic', () => {
    it('should allow restart when enabled and below failure limit', () => {
      expect(processInfo.shouldRestart()).toBe(true);
    });

    it('should deny restart when disabled', () => {
      processInfo.setAutoRestartEnabled(false);
      expect(processInfo.shouldRestart()).toBe(false);
    });

    it('should deny restart when at failure limit', () => {
      for (let i = 0; i < MAX_RESTART_COUNT; i++) {
        processInfo.recordRestartFailure();
      }
      expect(processInfo.shouldRestart()).toBe(false);
    });
  });

  describe('Unexpected Exit Detection', () => {
    it('should detect crash (non-zero exit code)', () => {
      processInfo.setStatus('online');
      expect(processInfo.isUnexpectedExit(1, null)).toBe(true);
    });

    it('should not detect normal exit (code 0)', () => {
      processInfo.setStatus('online');
      expect(processInfo.isUnexpectedExit(0, null)).toBe(false);
    });

    it('should not detect graceful shutdown (SIGTERM)', () => {
      processInfo.setStatus('online');
      expect(processInfo.isUnexpectedExit(null, 'SIGTERM')).toBe(false);
    });

    it('should not detect intentional shutdown (stopping state)', () => {
      processInfo.setStatus('stopping');
      expect(processInfo.isUnexpectedExit(1, null)).toBe(false);
    });

    it('should detect signal termination', () => {
      processInfo.setStatus('online');
      expect(processInfo.isUnexpectedExit(null, 'SIGKILL')).toBe(true);
    });
  });

  describe('Memory Limit Integration', () => {
    it('should emit memory-limit event when limit exceeded', () => {
      const memoryLimit = 100 * 1024 * 1024; // 100MB
      let eventEmitted = false;
      let emittedUsage: number | undefined;
      let emittedLimit: number | undefined;

      processInfo.on('memory-limit', (usage, limit) => {
        eventEmitted = true;
        emittedUsage = usage;
        emittedLimit = limit;
      });

      processInfo.updateMemoryUsage(150 * 1024 * 1024); // 150MB

      expect(eventEmitted).toBe(true);
      expect(emittedUsage).toBe(150 * 1024 * 1024);
      expect(emittedLimit).toBe(memoryLimit);
    });

    it('should not emit memory-limit event when below limit', () => {
      let eventEmitted = false;

      processInfo.on('memory-limit', () => {
        eventEmitted = true;
      });

      processInfo.updateMemoryUsage(50 * 1024 * 1024); // 50MB
      expect(eventEmitted).toBe(false);
    });

    it('should not emit memory-limit event when no limit configured', () => {
      const configNoLimit = {
        name: 'test-process-no-limit',
        script: 'node',
        namespace: 'test',
        args: ['--version'],
        cwd: process.cwd(),
        env: {},
        instances: 1,
        autorestart: true,
        watch: false,
        max_restarts: 10,
        min_uptime: 1000,
        restart_delay: 1000,
        // No max_memory_restart configured
      };
      const processNoLimit = new ManagedProcessInfo(configNoLimit);

      let eventEmitted = false;
      processNoLimit.on('memory-limit', () => {
        eventEmitted = true;
      });

      processNoLimit.updateMemoryUsage(500 * 1024 * 1024); // 500MB
      expect(eventEmitted).toBe(false);

      processNoLimit.cleanup();
    });
  });
});

describe('ProcessManager Auto-restart Integration', () => {
  let processManager: ProcessManager;

  beforeEach(() => {
    processManager = new ProcessManager();
  });

  afterEach(async () => {
    await processManager.cleanup();
    vi.unstubAllGlobals();
  });

  describe('Auto-restart Management API', () => {
    beforeEach(() => {
      const config: AppConfig = {
        name: 'test-process',
        script: 'node',
        args: '--version',
        namespace: 'test',
        max_memory_restart: '100MB',
      };
      processManager.configureProcess(config);
      processManager.initializeProcess('test-process');
    });

    it('should enable auto-restart for a process', () => {
      processManager.enableAutoRestart('test-process');
      const status = processManager.getAutoRestartStatus('test-process');
      expect(status.enabled).toBe(true);
    });

    it('should disable auto-restart for a process', () => {
      processManager.disableAutoRestart('test-process');
      const status = processManager.getAutoRestartStatus('test-process');
      expect(status.enabled).toBe(false);
    });

    it('should reset restart failures for a process', () => {
      const managedProcess = processManager['processes'].get('test-process');
      managedProcess?.recordRestartFailure();

      let status = processManager.getAutoRestartStatus('test-process');
      expect(status.consecutiveFailures).toBe(1);

      processManager.resetRestartFailures('test-process');
      status = processManager.getAutoRestartStatus('test-process');
      expect(status.consecutiveFailures).toBe(0);
      expect(status.enabled).toBe(true);
    });

    it('should throw error for non-existent process', () => {
      expect(() => {
        processManager.enableAutoRestart('non-existent');
      }).toThrow("Process 'non-existent' not found");

      expect(() => {
        processManager.disableAutoRestart('non-existent');
      }).toThrow("Process 'non-existent' not found");

      expect(() => {
        processManager.resetRestartFailures('non-existent');
      }).toThrow("Process 'non-existent' not found");

      expect(() => {
        processManager.getAutoRestartStatus('non-existent');
      }).toThrow("Process 'non-existent' not found");
    });

    it('should return correct auto-restart status', () => {
      const managedProcess = processManager['processes'].get('test-process');
      managedProcess?.recordRestartFailure();
      managedProcess?.recordRestartFailure();

      const status = processManager.getAutoRestartStatus('test-process');
      expect(status).toEqual({
        enabled: true,
        consecutiveFailures: 2,
        nextRestartDelay:
          RESTART_BACKOFF_BASE_DELAY * RESTART_BACKOFF_MULTIPLIER,
      });
    });
  });
});
