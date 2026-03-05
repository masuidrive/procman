/**
 * ProcessStatistics - Interface for tracking process performance and behavior
 */

import { RESTART_BACKOFF_BASE_DELAY } from '../shared/constants.js';

/**
 * Process statistics for tracking performance and behavior
 */
export interface ProcessStatistics {
  /** Start time timestamp */
  startedAt: number | null;
  /** Last status change timestamp */
  lastStatusChange: number;
  /** Total restart count */
  restarts: number;
  /** Last restart timestamp */
  lastRestart: number | null;
  /** Memory usage history (last 10 measurements) - DEPRECATED: use memoryHistory instead */
  memoryHistory: number[];
  /** CPU usage history (last 10 measurements) - DEPRECATED: use cpuHistory instead */
  cpuHistory: number[];
  /** Current memory usage in bytes */
  currentMemory: number;
  /** Current CPU usage percentage */
  currentCpu: number;
  /** Consecutive failure count for restart control */
  consecutiveFailures: number;
  /** Timestamp of first failure in current window */
  firstFailureTime: number | null;
  /** Flag to indicate auto-restart is enabled */
  autoRestartEnabled: boolean;
  /** Next restart delay in milliseconds */
  nextRestartDelay: number;
}

/**
 * Create default ProcessStatistics
 */
export function createDefaultStatistics(): ProcessStatistics {
  return {
    startedAt: null,
    lastStatusChange: Date.now(),
    restarts: 0,
    lastRestart: null,
    memoryHistory: [],
    cpuHistory: [],
    currentMemory: 0,
    currentCpu: 0,
    consecutiveFailures: 0,
    firstFailureTime: null,
    autoRestartEnabled: true,
    nextRestartDelay: RESTART_BACKOFF_BASE_DELAY,
  };
}
