/**
 * MemoryMonitor - PM2-compatible memory monitoring for daemon processes
 *
 * This class provides simple, reliable memory monitoring capabilities:
 * - 30-second interval memory checking (configurable)
 * - Memory threshold management with PM2-compatible units (K/M/G)
 * - Memory trend analysis to detect increasing patterns
 * - Structured logging for memory metrics
 * - Event-based notifications for threshold violations
 */

import { EventEmitter } from 'events';
import { parseMemorySize } from '../../shared/config.js';
/**
 * Helper function to parse memory size with proper error handling
 */
function parseMemorySizeToBytes(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }

  const result = parseMemorySize(value);
  if (result.success && result.value !== undefined) {
    return result.value;
  }

  throw new Error(
    `Failed to parse memory size: ${result.error || 'Unknown error'}`
  );
}

/**
 * Memory usage information
 */
export interface MemoryUsage {
  /** Resident Set Size (RSS) in bytes */
  rss: number;
  /** Heap total in bytes */
  heapTotal: number;
  /** Heap used in bytes */
  heapUsed: number;
  /** External memory in bytes */
  external: number;
  /** Array buffers in bytes */
  arrayBuffers: number;
  /** Timestamp when measurement was taken */
  timestamp: number;
}

/**
 * Memory monitoring configuration
 */
export interface MemoryMonitorConfig {
  /** Monitoring interval in milliseconds (default: 30000) */
  intervalMs: number;
  /** Memory threshold in bytes for warnings */
  warningThreshold: number;
  /** Memory threshold in bytes for critical alerts */
  criticalThreshold: number;
  /** Number of samples to keep for trend analysis (default: 10) */
  trendSamples: number;
  /** Enable structured logging */
  enableLogging: boolean;
}

/**
 * Memory trend analysis result
 */
export interface MemoryTrend {
  /** Whether memory is increasing */
  isIncreasing: boolean;
  /** Rate of increase in bytes per second */
  increaseRate: number;
  /** Number of samples used for analysis */
  sampleCount: number;
  /** Confidence level (0-1) */
  confidence: number;
}

/**
 * Memory monitor events
 */
export interface MemoryMonitorEvents {
  memoryWarning: (usage: MemoryUsage, threshold: number) => void;
  memoryCritical: (usage: MemoryUsage, threshold: number) => void;

  memoryTrend: (trend: MemoryTrend, usage: MemoryUsage) => void;
  memoryReport: (usage: MemoryUsage) => void;
  error: (error: Error) => void;
}

/**
 * MemoryMonitor class for daemon process memory monitoring
 */
export class MemoryMonitor extends EventEmitter {
  private config: MemoryMonitorConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private monitoringInterval: any | null = null;
  private memoryHistory: MemoryUsage[] = [];
  private isMonitoring = false;

  constructor(config: Partial<MemoryMonitorConfig> = {}) {
    super();

    this.config = {
      intervalMs: 30000, // 30 seconds default (PM2 standard)
      warningThreshold:
        typeof config.warningThreshold === 'string'
          ? parseMemorySizeToBytes(config.warningThreshold)
          : config.warningThreshold || parseMemorySizeToBytes('100M'),
      criticalThreshold:
        typeof config.criticalThreshold === 'string'
          ? parseMemorySizeToBytes(config.criticalThreshold)
          : config.criticalThreshold || parseMemorySizeToBytes('200M'),

      trendSamples: 10,
      enableLogging: true,
      ...config,
    };
  }

  /**
   * Start memory monitoring
   */
  start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.memoryHistory = [];

    // Take initial measurement
    this.performMemoryCheck();

    // Start periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.performMemoryCheck();
    }, this.config.intervalMs);

    if (this.config.enableLogging && process.env.NODE_ENV !== 'test') {
      console.log(
        `[MemoryMonitor] Started monitoring with ${this.config.intervalMs}ms interval`
      );
    }
  }

  /**
   * Stop memory monitoring
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.config.enableLogging && process.env.NODE_ENV !== 'test') {
      console.log('[MemoryMonitor] Stopped monitoring');
    }
  }

  /**
   * Get current memory usage
   */
  getCurrentMemoryUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
      ...usage,
      timestamp: Date.now(),
    };
  }

  /**
   * Get memory usage history
   */
  getMemoryHistory(): MemoryUsage[] {
    return [...this.memoryHistory];
  }

  /**
   * Analyze memory trend
   */
  analyzeMemoryTrend(): MemoryTrend | null {
    if (this.memoryHistory.length < 3) {
      return null;
    }

    const samples = this.memoryHistory.slice(-this.config.trendSamples);
    const firstSample = samples[0];
    const lastSample = samples[samples.length - 1];

    const timeDiff = lastSample.timestamp - firstSample.timestamp;
    const memoryDiff = lastSample.rss - firstSample.rss;

    if (timeDiff <= 0) {
      return null;
    }

    const increaseRate = (memoryDiff / timeDiff) * 1000; // bytes per second
    const isIncreasing = increaseRate > 1024; // More than 1KB/s increase

    // Simple confidence calculation based on sample consistency
    let increaseCount = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].rss > samples[i - 1].rss) {
        increaseCount++;
      }
    }
    const confidence = increaseCount / (samples.length - 1);

    return {
      isIncreasing,
      increaseRate,
      sampleCount: samples.length,
      confidence,
    };
  }

  /**
   * Update memory threshold configuration
   */
  updateThresholds(
    warningThreshold: string | number,
    criticalThreshold?: string | number
  ): void {
    this.config.warningThreshold =
      typeof warningThreshold === 'string'
        ? parseMemorySizeToBytes(warningThreshold)
        : warningThreshold;

    if (criticalThreshold !== undefined) {
      this.config.criticalThreshold =
        typeof criticalThreshold === 'string'
          ? parseMemorySizeToBytes(criticalThreshold)
          : criticalThreshold;
    }

    if (this.config.enableLogging && process.env.NODE_ENV !== 'test') {
      console.log(
        `[MemoryMonitor] Updated thresholds: warning=${this.formatBytes(this.config.warningThreshold)}, critical=${this.formatBytes(this.config.criticalThreshold)}`
      );
    }
  }

  /**
   * Get health check information
   */
  getHealthInfo(): {
    status: 'healthy' | 'warning' | 'critical';
    currentMemory: MemoryUsage;
    thresholds: {
      warning: number;
      critical: number;
    };
    trend?: MemoryTrend;
  } {
    const currentMemory = this.getCurrentMemoryUsage();
    const trend = this.analyzeMemoryTrend();

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (currentMemory.rss >= this.config.criticalThreshold) {
      status = 'critical';
    } else if (currentMemory.rss >= this.config.warningThreshold) {
      status = 'warning';
    }

    return {
      status,
      currentMemory,
      thresholds: {
        warning: this.config.warningThreshold,
        critical: this.config.criticalThreshold,
      },
      trend: trend || undefined,
    };
  }

  /**
   * Perform memory check and emit events
   */
  private performMemoryCheck(): void {
    try {
      const usage = this.getCurrentMemoryUsage();

      // Add to history
      this.memoryHistory.push(usage);

      // Keep only the required number of samples
      if (this.memoryHistory.length > this.config.trendSamples * 2) {
        this.memoryHistory = this.memoryHistory.slice(
          -this.config.trendSamples
        );
      }

      // Check thresholds
      if (usage.rss >= this.config.criticalThreshold) {
        this.emit('memoryCritical', usage, this.config.criticalThreshold);
        if (this.config.enableLogging && process.env.NODE_ENV !== 'test') {
          console.warn(
            `[MemoryMonitor] CRITICAL: Memory usage ${this.formatBytes(usage.rss)} exceeds critical threshold ${this.formatBytes(this.config.criticalThreshold)}`
          );
        }
      } else if (usage.rss >= this.config.warningThreshold) {
        this.emit('memoryWarning', usage, this.config.warningThreshold);
        if (this.config.enableLogging && process.env.NODE_ENV !== 'test') {
          console.warn(
            `[MemoryMonitor] WARNING: Memory usage ${this.formatBytes(usage.rss)} exceeds warning threshold ${this.formatBytes(this.config.warningThreshold)}`
          );
        }
      }

      // Analyze trend
      const trend = this.analyzeMemoryTrend();
      if (trend && trend.isIncreasing && trend.confidence > 0.7) {
        this.emit('memoryTrend', trend, usage);
        if (this.config.enableLogging && process.env.NODE_ENV !== 'test') {
          console.log(
            `[MemoryMonitor] Memory trend: increasing at ${this.formatBytes(trend.increaseRate)}/s (confidence: ${(trend.confidence * 100).toFixed(1)}%)`
          );
        }
      }

      // Emit regular report
      this.emit('memoryReport', usage);

      if (this.config.enableLogging && process.env.NODE_ENV !== 'test') {
        console.log(
          `[MemoryMonitor] Memory usage: RSS=${this.formatBytes(usage.rss)}, Heap=${this.formatBytes(usage.heapUsed)}/${this.formatBytes(usage.heapTotal)}`
        );
      }
    } catch (error) {
      this.emit('error', error);
      if (this.config.enableLogging && process.env.NODE_ENV !== 'test') {
        console.error('[MemoryMonitor] Error during memory check:', error);
      }
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = Number(bytes);
    let unitIndex = 0;

    if (!isFinite(size) || size < 0) {
      return '0B';
    }

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)}${units[unitIndex]}`;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.memoryHistory = [];
  }
}

export default MemoryMonitor;
