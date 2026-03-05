/**
 * RestartManager - Encapsulates restart logic for managed processes
 */

import { ProcessStatus } from '../shared/process.js';
import { ProcessStatistics } from './process-statistics.js';
import {
  RESTART_BACKOFF_BASE_DELAY,
  RESTART_BACKOFF_MAX_DELAY,
  RESTART_BACKOFF_MULTIPLIER,
  RESTART_WINDOW_TIME,
  MAX_RESTART_COUNT,
} from '../shared/constants.js';

/**
 * Manages restart logic including backoff, failure tracking, and restart decisions
 */
export class RestartManager {
  private readonly processName: string;

  constructor(processName: string) {
    this.processName = processName;
  }

  /**
   * Record a restart
   * @param statistics The process statistics to update
   * @returns The new restart count
   */
  public recordRestart(statistics: ProcessStatistics): number {
    statistics.restarts++;
    statistics.lastRestart = Date.now();
    return statistics.restarts;
  }

  /**
   * Increment restart count (alias for recordRestart)
   * @param statistics The process statistics to update
   * @returns The new restart count
   */
  public incrementRestarts(statistics: ProcessStatistics): number {
    return this.recordRestart(statistics);
  }

  /**
   * Reset restart count
   * @param statistics The process statistics to update
   */
  public resetRestartCount(statistics: ProcessStatistics): void {
    statistics.restarts = 0;
    statistics.lastRestart = null;
  }

  /**
   * Get time since last restart
   * @param statistics The process statistics to read
   * @returns Time since last restart in milliseconds, or null if never restarted
   */
  public getTimeSinceLastRestart(statistics: ProcessStatistics): number | null {
    if (!statistics.lastRestart) {
      return null;
    }
    return Date.now() - statistics.lastRestart;
  }

  /**
   * Record a restart failure
   * @param statistics The process statistics to update
   */
  public recordRestartFailure(statistics: ProcessStatistics): void {
    const now = Date.now();

    // Reset failure window if enough time has passed
    if (
      statistics.firstFailureTime &&
      now - statistics.firstFailureTime > RESTART_WINDOW_TIME
    ) {
      this.resetRestartFailures(statistics);
    }

    // Initialize failure window if this is the first failure
    if (statistics.firstFailureTime === null) {
      statistics.firstFailureTime = now;
    }

    statistics.consecutiveFailures++;

    // Disable auto-restart if too many failures
    if (statistics.consecutiveFailures >= MAX_RESTART_COUNT) {
      statistics.autoRestartEnabled = false;
      console.warn(
        `Process '${this.processName}' auto-restart disabled after ${MAX_RESTART_COUNT} consecutive failures`
      );
    }

    // Calculate next restart delay with exponential backoff
    this.calculateNextRestartDelay(statistics);
  }

  /**
   * Record a successful restart (reset failure counters)
   * @param statistics The process statistics to update
   */
  public recordRestartSuccess(statistics: ProcessStatistics): void {
    this.resetRestartFailures(statistics);
  }

  /**
   * Reset restart failure counters
   * @param statistics The process statistics to update
   */
  public resetRestartFailures(statistics: ProcessStatistics): void {
    statistics.consecutiveFailures = 0;
    statistics.firstFailureTime = null;
    statistics.nextRestartDelay = RESTART_BACKOFF_BASE_DELAY;
  }

  /**
   * Get consecutive failure count
   * @param statistics The process statistics to read
   * @returns Number of consecutive failures
   */
  public getConsecutiveFailures(statistics: ProcessStatistics): number {
    return statistics.consecutiveFailures;
  }

  /**
   * Get next restart delay
   * @param statistics The process statistics to read
   * @returns Next restart delay in milliseconds
   */
  public getNextRestartDelay(statistics: ProcessStatistics): number {
    return statistics.nextRestartDelay;
  }

  /**
   * Calculate next restart delay using exponential backoff
   * @param statistics The process statistics to update
   */
  public calculateNextRestartDelay(statistics: ProcessStatistics): void {
    const baseDelay = RESTART_BACKOFF_BASE_DELAY;
    const multiplier = Math.pow(
      RESTART_BACKOFF_MULTIPLIER,
      statistics.consecutiveFailures - 1
    );
    const calculatedDelay = baseDelay * multiplier;

    statistics.nextRestartDelay = Math.min(
      calculatedDelay,
      RESTART_BACKOFF_MAX_DELAY
    );
  }

  /**
   * Check if restart should be attempted based on failure count
   * @param statistics The process statistics to read
   * @returns True if restart should be attempted
   */
  public shouldRestart(statistics: ProcessStatistics): boolean {
    return (
      statistics.autoRestartEnabled &&
      statistics.consecutiveFailures < MAX_RESTART_COUNT
    );
  }

  /**
   * Check if this is an unexpected exit (crash detection)
   * @param exitCode Process exit code
   * @param signal Process exit signal
   * @param status Current process status
   * @returns True if this is considered an unexpected exit
   */
  public isUnexpectedExit(
    exitCode: number | null,
    signal: string | null,
    status: ProcessStatus
  ): boolean {
    // Expected exits:
    // - Normal exit with code 0
    // - Graceful shutdown via SIGTERM
    // - Process was in stopping state (intentional shutdown)

    if (status === 'stopping') {
      return false; // Intentional shutdown
    }

    if (exitCode === 0) {
      return false; // Normal exit
    }

    if (signal === 'SIGTERM') {
      return false; // Graceful shutdown
    }

    // All other exits are considered unexpected
    return true;
  }
}
