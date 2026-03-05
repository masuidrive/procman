/**
 * ProcessMonitoringData - Encapsulates monitoring logic for managed processes
 */

import { MemorySample, CPUSample } from '../shared/process.js';
import { ProcessStatistics } from './process-statistics.js';
import { MAX_HISTORY_LENGTH } from '../shared/constants.js';

/**
 * Manages monitoring data including memory and CPU usage tracking
 */
export class ProcessMonitoringData {
  private memoryHistoryDetailed: MemorySample[] = [];
  private cpuHistoryDetailed: CPUSample[] = [];

  /**
   * Update memory usage
   * @param memoryUsage Memory usage in bytes
   * @param statistics The process statistics to update
   * @returns True if memory limit was exceeded (caller should emit event)
   */
  public updateMemoryUsage(
    memoryUsage: number,
    statistics: ProcessStatistics
  ): void {
    statistics.currentMemory = memoryUsage;
    const now = Date.now();

    // Add to simple history (keep for backward compatibility)
    statistics.memoryHistory.push(memoryUsage);
    if (statistics.memoryHistory.length > 10) {
      statistics.memoryHistory.shift();
    }

    // Add to detailed history with timestamp
    this.memoryHistoryDetailed.push({ timestamp: now, usage: memoryUsage });
    if (this.memoryHistoryDetailed.length > MAX_HISTORY_LENGTH) {
      this.memoryHistoryDetailed.shift();
    }
  }

  /**
   * Update CPU usage
   * @param cpuUsage CPU usage percentage
   * @param statistics The process statistics to update
   */
  public updateCpuUsage(cpuUsage: number, statistics: ProcessStatistics): void {
    statistics.currentCpu = cpuUsage;
    const now = Date.now();

    // Add to simple history (keep for backward compatibility)
    statistics.cpuHistory.push(cpuUsage);
    if (statistics.cpuHistory.length > 10) {
      statistics.cpuHistory.shift();
    }

    // Add to detailed history with timestamp
    this.cpuHistoryDetailed.push({ timestamp: now, usage: cpuUsage });
    if (this.cpuHistoryDetailed.length > MAX_HISTORY_LENGTH) {
      this.cpuHistoryDetailed.shift();
    }
  }

  /**
   * Get average memory usage from history
   * @param statistics The process statistics to read
   * @returns Average memory usage in bytes
   */
  public getAverageMemoryUsage(statistics: ProcessStatistics): number {
    if (statistics.memoryHistory.length === 0) {
      return 0;
    }
    const sum = statistics.memoryHistory.reduce((acc, val) => acc + val, 0);
    return sum / statistics.memoryHistory.length;
  }

  /**
   * Get average CPU usage from history
   * @param statistics The process statistics to read
   * @returns Average CPU usage percentage
   */
  public getAverageCpuUsage(statistics: ProcessStatistics): number {
    if (statistics.cpuHistory.length === 0) {
      return 0;
    }
    const sum = statistics.cpuHistory.reduce((acc, val) => acc + val, 0);
    return sum / statistics.cpuHistory.length;
  }

  /**
   * Get current memory usage
   * @param statistics The process statistics to read
   * @returns Current memory usage in bytes
   */
  public getMemoryUsage(statistics: ProcessStatistics): number {
    return statistics.currentMemory;
  }

  /**
   * Check if process has memory limit configured
   * @param maxMemoryRestart The max_memory_restart config value
   * @returns True if memory limit is configured
   */
  public hasMemoryLimit(maxMemoryRestart: number | undefined): boolean {
    return maxMemoryRestart !== undefined;
  }

  /**
   * Get memory limit in bytes
   * @param maxMemoryRestart The max_memory_restart config value
   * @returns Memory limit in bytes or undefined if not configured
   */
  public getMemoryLimit(
    maxMemoryRestart: number | undefined
  ): number | undefined {
    return maxMemoryRestart;
  }

  /**
   * Get memory usage history with timestamps
   * @returns Array of memory samples
   */
  public getMemoryHistory(): Readonly<MemorySample[]> {
    return [...this.memoryHistoryDetailed];
  }

  /**
   * Get CPU usage history with timestamps
   * @returns Array of CPU samples
   */
  public getCpuHistory(): Readonly<CPUSample[]> {
    return [...this.cpuHistoryDetailed];
  }

  /**
   * Set memory history (for persistence restore)
   * @param history Memory history to restore
   */
  public setMemoryHistory(history: MemorySample[]): void {
    this.memoryHistoryDetailed = history;
    if (this.memoryHistoryDetailed.length > MAX_HISTORY_LENGTH) {
      this.memoryHistoryDetailed =
        this.memoryHistoryDetailed.slice(-MAX_HISTORY_LENGTH);
    }
  }

  /**
   * Set CPU history (for persistence restore)
   * @param history CPU history to restore
   */
  public setCpuHistory(history: CPUSample[]): void {
    this.cpuHistoryDetailed = history;
    if (this.cpuHistoryDetailed.length > MAX_HISTORY_LENGTH) {
      this.cpuHistoryDetailed =
        this.cpuHistoryDetailed.slice(-MAX_HISTORY_LENGTH);
    }
  }

  /**
   * Clear all monitoring data
   */
  public clear(): void {
    this.memoryHistoryDetailed.length = 0;
    this.cpuHistoryDetailed.length = 0;
  }
}
