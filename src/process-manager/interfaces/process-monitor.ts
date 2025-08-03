/**
 * Process Monitoring Interface
 *
 * Handles monitoring of process health and resource usage:
 * - Memory and CPU monitoring
 * - Process health checks
 * - Performance statistics
 */

/**
 * Process resource statistics
 */
export interface ProcessStats {
  /** Memory usage in bytes */
  memory: number;
  /** CPU usage percentage */
  cpu: number;
  /** Timestamp when stats were collected */
  timestamp: number;
}

/**
 * Process health status
 */
export interface ProcessHealth {
  /** Whether the process is alive */
  isAlive: boolean;
  /** Last health check timestamp */
  lastCheck: number;
  /** Number of consecutive failed health checks */
  consecutiveFailures: number;
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  /** Interval for health checks in milliseconds */
  healthCheckInterval: number;
  /** Interval for memory checks in milliseconds */
  memoryCheckInterval: number;
  /** Maximum number of health check failures before marking as unhealthy */
  maxHealthCheckFailures: number;
}

/**
 * Interface for process monitoring
 */
export interface ProcessMonitor {
  /**
   * Start monitoring all processes
   * @param config Monitoring configuration
   */
  startMonitoring(config?: Partial<MonitoringConfig>): void;

  /**
   * Stop monitoring all processes
   */
  stopMonitoring(): void;

  /**
   * Start monitoring a specific process
   * @param name Process name
   */
  startProcessMonitoring(name: string): void;

  /**
   * Stop monitoring a specific process
   * @param name Process name
   */
  stopProcessMonitoring(name: string): void;

  /**
   * Get current resource statistics for a process
   * @param name Process name
   * @returns Current stats or undefined if not available
   */
  getProcessStats(name: string): Promise<ProcessStats | undefined>;

  /**
   * Get health status for a process
   * @param name Process name
   * @returns Health status or undefined if not monitored
   */
  getProcessHealth(name: string): ProcessHealth | undefined;

  /**
   * Check if a process is being monitored
   * @param name Process name
   * @returns True if process is being monitored
   */
  isProcessMonitored(name: string): boolean;

  /**
   * Check if monitoring is enabled globally
   * @returns True if monitoring is enabled
   */
  isMonitoringEnabled(): boolean;

  /**
   * Cleanup monitoring resources
   */
  cleanup(): void;
}

/**
 * Event types emitted by ProcessMonitor
 */
export interface ProcessMonitorEvents {
  /** Process exceeded memory limit */
  'process:memory-limit': { name: string; usage: number; limit: number };
  /** Process became unresponsive */
  'process:unhealthy': { name: string; consecutiveFailures: number };
  /** Process died unexpectedly */
  'process:died': { name: string };
  /** Process resource statistics updated */
  'process:stats': { name: string; stats: ProcessStats };
}
