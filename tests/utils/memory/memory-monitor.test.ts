/**
 * Unit tests for MemoryMonitor class
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryMonitor } from '../../../src/utils/memory/memory-monitor.js';

describe('MemoryMonitor', () => {
  let monitor: MemoryMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (monitor) {
      monitor.destroy();
    }
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should create MemoryMonitor with default config', () => {
      monitor = new MemoryMonitor();
      expect(monitor).toBeDefined();
    });

    it('should create MemoryMonitor with custom config', () => {
      monitor = new MemoryMonitor({
        intervalMs: 10000,
        warningThreshold: 50 * 1024 * 1024, // 50MB
        criticalThreshold: 100 * 1024 * 1024, // 100MB
        enableLogging: false,
      });
      expect(monitor).toBeDefined();
    });
  });

  describe('memory usage tracking', () => {
    beforeEach(() => {
      monitor = new MemoryMonitor({
        intervalMs: 1000,
        enableLogging: false,
      });
    });

    it('should get current memory usage', () => {
      const usage = monitor.getCurrentMemoryUsage();

      expect(usage).toBeDefined();
      expect(usage.rss).toBeGreaterThan(0);
      expect(usage.heapTotal).toBeGreaterThan(0);
      expect(usage.heapUsed).toBeGreaterThan(0);
      expect(usage.timestamp).toBeGreaterThan(0);
    });

    it('should start and stop monitoring', async () => {
      const reportSpy = vi.fn();
      monitor.on('memoryReport', reportSpy);

      // Start monitoring
      monitor.start();

      // Advance time to trigger memory check
      await vi.advanceTimersByTimeAsync(1000);

      expect(reportSpy).toHaveBeenCalled();

      // Stop monitoring
      monitor.stop();
      reportSpy.mockClear();

      // Advance time - should not trigger more checks
      await vi.advanceTimersByTimeAsync(1000);
      expect(reportSpy).not.toHaveBeenCalled();
    });

    it('should not start monitoring twice', () => {
      // Temporarily set NODE_ENV to allow logging in test
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      monitor = new MemoryMonitor({ enableLogging: true });

      monitor.start();
      monitor.start(); // Should not start again

      // Should have at least one start message, but may have memory usage logs too
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Started monitoring')
      );

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should maintain memory history', async () => {
      monitor.start();

      // Trigger several memory checks
      await vi.advanceTimersByTimeAsync(3000);

      const history = monitor.getMemoryHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history.length).toBeLessThanOrEqual(10); // Default trendSamples
    });
  });

  describe('threshold management', () => {
    beforeEach(() => {
      monitor = new MemoryMonitor({
        intervalMs: 100,
        warningThreshold: 1024, // 1KB (very low for testing)
        criticalThreshold: 2048, // 2KB (very low for testing)
        enableLogging: false,
      });
    });

    it('should emit warning event when threshold exceeded', async () => {
      const warningSpy = vi.fn();

      // Mock current memory usage to ensure it exceeds threshold
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn(() => ({
        rss: 1500, // 2KB - above 1KB threshold
        heapTotal: 1500,
        heapUsed: 1000,
        external: 500,
        arrayBuffers: 200,
      })) as any;

      monitor.on('memoryWarning', warningSpy);
      monitor.start();

      // Wait for the first memory check to occur
      await vi.advanceTimersByTimeAsync(100);

      // Restore original function
      process.memoryUsage = originalMemoryUsage;

      expect(warningSpy).toHaveBeenCalled();
    });

    it('should emit critical event when threshold exceeded', async () => {
      const criticalSpy = vi.fn();
      monitor.on('memoryCritical', criticalSpy);

      monitor.start();
      await vi.advanceTimersByTimeAsync(100);

      // Since actual memory usage is much higher than 2KB, critical should be emitted
      expect(criticalSpy).toHaveBeenCalled();
    });

    it('should update thresholds', () => {
      // Temporarily set NODE_ENV to allow logging in test
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      monitor = new MemoryMonitor({ enableLogging: true });

      monitor.updateThresholds('50M', '100M');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Updated thresholds')
      );

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should update thresholds with numeric values', () => {
      monitor.updateThresholds(50 * 1024 * 1024, 100 * 1024 * 1024);

      const healthInfo = monitor.getHealthInfo();
      expect(healthInfo.thresholds.warning).toBe(50 * 1024 * 1024);
      expect(healthInfo.thresholds.critical).toBe(100 * 1024 * 1024);
    });
  });

  describe('trend analysis', () => {
    beforeEach(() => {
      monitor = new MemoryMonitor({
        intervalMs: 100,
        trendSamples: 5,
        enableLogging: false,
      });
    });

    it('should return null for insufficient data', () => {
      const trend = monitor.analyzeMemoryTrend();
      expect(trend).toBeNull();
    });

    it('should analyze memory trend with sufficient data', async () => {
      monitor.start();

      // Generate multiple measurements
      for (let i = 0; i < 6; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      const trend = monitor.analyzeMemoryTrend();
      expect(trend).toBeDefined();

      if (trend) {
        expect(trend.sampleCount).toBeGreaterThan(0);
        expect(trend.confidence).toBeGreaterThanOrEqual(0);
        expect(trend.confidence).toBeLessThanOrEqual(1);
        expect(typeof trend.isIncreasing).toBe('boolean');
        expect(typeof trend.increaseRate).toBe('number');
      }
    });

    it('should emit memory trend event', async () => {
      const trendSpy = vi.fn();
      monitor.on('memoryTrend', trendSpy);

      // Mock increasing memory usage
      const originalMemoryUsage = process.memoryUsage;
      let memoryCounter = 0;

      process.memoryUsage = vi.fn(() => {
        memoryCounter += 10000; // Simulate increasing memory
        return {
          rss: 50000000 + memoryCounter,
          heapTotal: 30000000,
          heapUsed: 20000000 + memoryCounter,
          external: 1000000,
          arrayBuffers: 500000,
        };
      }) as any;

      monitor.start();

      // Generate trend data
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      // Restore original function
      process.memoryUsage = originalMemoryUsage;

      // Should have detected increasing trend
      expect(trendSpy).toHaveBeenCalled();
    });
  });

  describe('health check integration', () => {
    beforeEach(() => {
      monitor = new MemoryMonitor({
        warningThreshold: 50 * 1024 * 1024, // 50MB
        criticalThreshold: 100 * 1024 * 1024, // 100MB
        enableLogging: false,
      });
    });

    it('should return health info', () => {
      const healthInfo = monitor.getHealthInfo();

      expect(healthInfo).toBeDefined();
      expect(healthInfo.status).toMatch(/^(healthy|warning|critical)$/);
      expect(healthInfo.currentMemory).toBeDefined();
      expect(healthInfo.thresholds).toBeDefined();
      expect(healthInfo.thresholds.warning).toBe(50 * 1024 * 1024);
      expect(healthInfo.thresholds.critical).toBe(100 * 1024 * 1024);
    });

    it('should determine correct health status based on memory usage', () => {
      const healthInfo = monitor.getHealthInfo();

      // Current memory usage should determine status
      if (healthInfo.currentMemory.rss >= 100 * 1024 * 1024) {
        expect(healthInfo.status).toBe('critical');
      } else if (healthInfo.currentMemory.rss >= 50 * 1024 * 1024) {
        expect(healthInfo.status).toBe('warning');
      } else {
        expect(healthInfo.status).toBe('healthy');
      }
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      monitor = new MemoryMonitor({
        intervalMs: 100,
        enableLogging: false,
      });
    });

    it('should handle errors during memory check', async () => {
      const errorSpy = vi.fn();
      monitor.on('error', errorSpy);

      // Mock process.memoryUsage to throw an error
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn(() => {
        throw new Error('Memory check failed');
      }) as any;

      monitor.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Memory check failed',
        })
      );

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources on destroy', () => {
      monitor = new MemoryMonitor();
      const removeListenersSpy = vi.spyOn(monitor, 'removeAllListeners');

      monitor.start();
      monitor.destroy();

      expect(removeListenersSpy).toHaveBeenCalled();
      expect(monitor.getMemoryHistory()).toHaveLength(0);
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      monitor = new MemoryMonitor({ enableLogging: false });
    });

    it('should format bytes correctly', () => {
      // We can't directly test the private method, but we can test it through logging
      // Temporarily set NODE_ENV to allow logging in test
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      monitor = new MemoryMonitor({ enableLogging: true });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      monitor.updateThresholds('1M', '2G');

      // Check that formatted values are used in log messages
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1.0MB'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2.0GB'));

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalNodeEnv;
    });
  });
});
