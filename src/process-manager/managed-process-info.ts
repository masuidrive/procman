/**
 * ManagedProcessInfo - Individual process information management
 *
 * This class manages the information and statistics for a single process,
 * including uptime tracking, restart counting, and state change recording.
 *
 * Restart logic is delegated to RestartManager.
 * Monitoring data is delegated to ProcessMonitoringData.
 */

import { EventEmitter } from 'events';
import {
  ProcessInfo,
  ProcessStatus,
  ProcessStateChange,
  MemorySample,
  CPUSample,
  PersistedManagedProcessInfo,
} from '../shared/process.js';
import { ProcessConfig } from './process-config.js';
import {
  RESTART_BACKOFF_BASE_DELAY,
  MAX_HISTORY_LENGTH,
} from '../shared/constants.js';

// Re-export types from extracted modules
export {
  ProcessStatistics,
  createDefaultStatistics,
} from './process-statistics.js';
export { ManagedProcessEvents } from './managed-process-events.js';
export { RestartManager } from './restart-manager.js';
export { ProcessMonitoringData } from './process-monitoring.js';

import {
  ProcessStatistics,
  createDefaultStatistics,
} from './process-statistics.js';
import { RestartManager } from './restart-manager.js';
import { ProcessMonitoringData } from './process-monitoring.js';

// =============================================================================
// ManagedProcessInfo Class
// =============================================================================

/**
 * Manages information and statistics for a single process
 */
export class ManagedProcessInfo extends EventEmitter {
  private readonly config: ProcessConfig;
  private status: ProcessStatus = 'stopped';
  private pid: number | null = null;
  private statistics: ProcessStatistics;

  // Composed managers
  private readonly restartManager: RestartManager;
  private readonly monitoringData: ProcessMonitoringData;

  // State history tracking
  private stateHistory: ProcessStateChange[] = [];
  private lastCrashTime: number | null = null;

  constructor(config: ProcessConfig) {
    super();
    this.config = { ...config }; // Create a copy to avoid external mutations

    // Initialize statistics
    this.statistics = createDefaultStatistics();

    // Initialize composed managers
    this.restartManager = new RestartManager(config.name);
    this.monitoringData = new ProcessMonitoringData();
  }

  // ---------------------------------------------------------------------------
  // Configuration Management
  // ---------------------------------------------------------------------------

  /**
   * Update process configuration
   * @param newConfig New configuration
   */
  public updateConfig(newConfig: ProcessConfig): void {
    // Preserve certain fields that shouldn't change during runtime
    const preservedFields = {
      name: this.config.name,
    };

    Object.assign(this.config, newConfig, preservedFields);
  }

  /**
   * Get process name
   * @returns Process name
   */
  public getName(): string {
    return this.config.name;
  }

  /**
   * Get process namespace
   * @returns Process namespace
   */
  public getNamespace(): string {
    return this.config.namespace || 'default';
  }

  /**
   * Get process configuration
   * @returns Process configuration (read-only copy)
   */
  public getConfig(): Readonly<ProcessConfig> {
    return { ...this.config };
  }

  // ---------------------------------------------------------------------------
  // Process Information
  // ---------------------------------------------------------------------------

  /**
   * Get current process information
   * @returns Process information
   */
  public getProcessInfo(): ProcessInfo {
    return {
      name: this.config.name,
      namespace: this.config.namespace,
      status: this.status,
      pid: this.pid,
      uptime: this.calculateUptime(),
      memory: this.statistics.currentMemory,
      cpu: this.statistics.currentCpu,
      restarts: this.statistics.restarts,
      note: this.config.note,
    };
  }

  /**
   * Get current process information (alias for getProcessInfo)
   * @returns Process information
   */
  public toProcessInfo(): ProcessInfo {
    return this.getProcessInfo();
  }

  /**
   * Get detailed process statistics
   * @returns Process statistics
   */
  public getStatistics(): Readonly<ProcessStatistics> {
    return { ...this.statistics };
  }

  // ---------------------------------------------------------------------------
  // Status Management
  // ---------------------------------------------------------------------------

  /**
   * Get current status
   * @returns Current process status
   */
  public getStatus(): ProcessStatus {
    return this.status;
  }

  /**
   * Set process status
   * @param newStatus New status
   * @param emitEvent Whether to emit status change event (default: true)
   * @param reason Optional reason for the status change
   */
  public setStatus(
    newStatus: ProcessStatus,
    emitEvent: boolean = true,
    reason?: string
  ): void {
    if (newStatus === this.status) {
      return; // No change
    }

    const oldStatus = this.status;
    this.status = newStatus;
    const now = Date.now();
    this.statistics.lastStatusChange = now;

    // Record state change in history
    this.addStateChange(oldStatus, newStatus, reason);

    // Handle status-specific logic
    switch (newStatus) {
      case 'starting':
        // Reset some statistics when starting
        this.statistics.currentMemory = 0;
        this.statistics.currentCpu = 0;
        break;

      case 'online':
        // Mark start time when process goes online
        if (!this.statistics.startedAt) {
          this.statistics.startedAt = now;
        }
        break;

      case 'stopped':
      case 'errored':
        // Clear runtime information when stopped
        this.pid = null;
        this.statistics.startedAt = null;
        // Record crash time if errored
        if (newStatus === 'errored') {
          this.lastCrashTime = now;
        }
        break;

      case 'max-memory':
        // This status indicates memory limit was exceeded
        this.lastCrashTime = now;
        break;
    }

    if (emitEvent) {
      this.emit('status-change', newStatus, oldStatus);
    }
  }

  /**
   * Get current PID
   * @returns Process ID or null if not running
   */
  public getPid(): number | null {
    return this.pid;
  }

  /**
   * Set process PID
   * @param pid Process ID
   */
  public setPid(pid: number | null): void {
    this.pid = pid;
  }

  // ---------------------------------------------------------------------------
  // Statistics and Monitoring (delegated to ProcessMonitoringData)
  // ---------------------------------------------------------------------------

  /**
   * Calculate process uptime in milliseconds
   * @returns Uptime in milliseconds
   */
  public calculateUptime(): number {
    if (!this.statistics.startedAt || this.status !== 'online') {
      return 0;
    }
    return Date.now() - this.statistics.startedAt;
  }

  /**
   * Update memory usage
   * @param memoryUsage Memory usage in bytes
   */
  public updateMemoryUsage(memoryUsage: number): void {
    this.monitoringData.updateMemoryUsage(memoryUsage, this.statistics);

    // Check memory limit if configured
    if (
      this.config.max_memory_restart &&
      memoryUsage > this.config.max_memory_restart
    ) {
      this.emit('memory-limit', memoryUsage, this.config.max_memory_restart);
    }
  }

  /**
   * Update CPU usage
   * @param cpuUsage CPU usage percentage
   */
  public updateCpuUsage(cpuUsage: number): void {
    this.monitoringData.updateCpuUsage(cpuUsage, this.statistics);
  }

  /**
   * Get average memory usage from history
   * @returns Average memory usage in bytes
   */
  public getAverageMemoryUsage(): number {
    return this.monitoringData.getAverageMemoryUsage(this.statistics);
  }

  /**
   * Get average CPU usage from history
   * @returns Average CPU usage percentage
   */
  public getAverageCpuUsage(): number {
    return this.monitoringData.getAverageCpuUsage(this.statistics);
  }

  /**
   * Get current memory usage
   * @returns Current memory usage in bytes
   */
  public getMemoryUsage(): number {
    return this.monitoringData.getMemoryUsage(this.statistics);
  }

  // ---------------------------------------------------------------------------
  // Restart Management (delegated to RestartManager)
  // ---------------------------------------------------------------------------

  /**
   * Record a restart
   */
  public recordRestart(): void {
    const count = this.restartManager.recordRestart(this.statistics);
    this.emit('restart', count);
  }

  /**
   * Increment restart count (alias for recordRestart)
   */
  public incrementRestarts(): void {
    this.recordRestart();
  }

  /**
   * Reset restart count
   */
  public resetRestartCount(): void {
    this.restartManager.resetRestartCount(this.statistics);
  }

  /**
   * Get time since last restart
   * @returns Time since last restart in milliseconds, or null if never restarted
   */
  public getTimeSinceLastRestart(): number | null {
    return this.restartManager.getTimeSinceLastRestart(this.statistics);
  }

  // ---------------------------------------------------------------------------
  // Event Helpers
  // ---------------------------------------------------------------------------

  /**
   * Emit start event
   * @param pid Process ID
   */
  public emitStart(pid: number): void {
    this.setPid(pid);
    this.emit('start', pid);
  }

  /**
   * Emit stop event
   * @param exitCode Exit code
   */
  public emitStop(exitCode: number | null): void {
    this.emit('stop', exitCode);
  }

  /**
   * Emit error event
   * @param error Error object
   */
  public emitError(error: Error): void {
    this.emit('error', error);
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Check if process should be monitored
   * @returns True if process is in a monitorable state
   */
  public isMonitorable(): boolean {
    return this.status === 'online' && this.pid !== null;
  }

  /**
   * Check if process is running
   * @returns True if process is running
   */
  public isRunning(): boolean {
    return this.status === 'online' && this.pid !== null;
  }

  /**
   * Check if process is stopped
   * @returns True if process is stopped
   */
  public isStopped(): boolean {
    return this.status === 'stopped';
  }

  /**
   * Check if process has memory limit configured
   * @returns True if memory limit is configured
   */
  public hasMemoryLimit(): boolean {
    return this.config.max_memory_restart !== undefined;
  }

  /**
   * Get memory limit in bytes
   * @returns Memory limit in bytes or undefined if not configured
   */
  public getMemoryLimit(): number | undefined {
    return this.config.max_memory_restart;
  }

  // ---------------------------------------------------------------------------
  // Auto-restart Control (delegated to RestartManager)
  // ---------------------------------------------------------------------------

  /**
   * Check if auto-restart is enabled
   * @returns True if auto-restart is enabled
   */
  public isAutoRestartEnabled(): boolean {
    return this.statistics.autoRestartEnabled;
  }

  /**
   * Enable or disable auto-restart
   * @param enabled Auto-restart enabled flag
   */
  public setAutoRestartEnabled(enabled: boolean): void {
    this.statistics.autoRestartEnabled = enabled;
    if (!enabled) {
      // Reset failure counters when disabling auto-restart
      this.resetRestartFailures();
    }
  }

  /**
   * Record a restart failure
   */
  public recordRestartFailure(): void {
    this.restartManager.recordRestartFailure(this.statistics);
  }

  /**
   * Record a successful restart (reset failure counters)
   */
  public recordRestartSuccess(): void {
    this.restartManager.recordRestartSuccess(this.statistics);
  }

  /**
   * Reset restart failure counters
   */
  public resetRestartFailures(): void {
    this.restartManager.resetRestartFailures(this.statistics);
  }

  /**
   * Get consecutive failure count
   * @returns Number of consecutive failures
   */
  public getConsecutiveFailures(): number {
    return this.restartManager.getConsecutiveFailures(this.statistics);
  }

  /**
   * Get next restart delay
   * @returns Next restart delay in milliseconds
   */
  public getNextRestartDelay(): number {
    return this.restartManager.getNextRestartDelay(this.statistics);
  }

  /**
   * Check if restart should be attempted based on failure count
   * @returns True if restart should be attempted
   */
  public shouldRestart(): boolean {
    return this.restartManager.shouldRestart(this.statistics);
  }

  /**
   * Check if this is an unexpected exit (crash detection)
   * @param exitCode Process exit code
   * @param signal Process exit signal
   * @returns True if this is considered an unexpected exit
   */
  public isUnexpectedExit(
    exitCode: number | null,
    signal: string | null
  ): boolean {
    return this.restartManager.isUnexpectedExit(exitCode, signal, this.status);
  }

  // ---------------------------------------------------------------------------
  // Resource Management and Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Clean up resources (non-destructive, maintains data for persistence)
   */
  public cleanup(): void {
    console.log(
      `[ManagedProcessInfo] Cleaning up resources for process '${this.config.name}'`
    );

    // Remove all event listeners to prevent memory leaks
    this.removeAllListeners();

    // Clear process runtime data but preserve historical data
    this.pid = null;
    this.statistics.startedAt = null;

    console.log(
      `[ManagedProcessInfo] Resources cleaned up for process '${this.config.name}'`
    );
  }

  /**
   * Dispose of all resources (destructive, clears all data)
   */
  public dispose(): void {
    console.log(
      `[ManagedProcessInfo] Disposing all resources for process '${this.config.name}'`
    );

    // First perform standard cleanup
    this.removeAllListeners();

    // Clear all runtime data
    this.pid = null;
    this.status = 'stopped';

    // Clear all statistics
    this.statistics = {
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

    // Clear all historical data for memory leak prevention
    this.stateHistory.length = 0;
    this.monitoringData.clear();

    // Clear crash tracking
    this.lastCrashTime = null;

    console.log(
      `[ManagedProcessInfo] All resources disposed for process '${this.config.name}'`
    );
  }

  // ---------------------------------------------------------------------------
  // State History Management
  // ---------------------------------------------------------------------------

  /**
   * Add a state change to history
   * @param from Previous status
   * @param to New status
   * @param reason Optional reason for change
   */
  private addStateChange(
    from: ProcessStatus,
    to: ProcessStatus,
    reason?: string
  ): void {
    const stateChange: ProcessStateChange = {
      timestamp: Date.now(),
      from,
      to,
      reason,
    };

    this.stateHistory.push(stateChange);

    // Keep only the most recent changes
    if (this.stateHistory.length > MAX_HISTORY_LENGTH) {
      this.stateHistory.shift();
    }
  }

  /**
   * Get state change history
   * @returns Array of state changes
   */
  public getStateHistory(): Readonly<ProcessStateChange[]> {
    return [...this.stateHistory];
  }

  /**
   * Get memory usage history with timestamps
   * @returns Array of memory samples
   */
  public getMemoryHistory(): Readonly<MemorySample[]> {
    return this.monitoringData.getMemoryHistory();
  }

  /**
   * Get CPU usage history with timestamps
   * @returns Array of CPU samples
   */
  public getCpuHistory(): Readonly<CPUSample[]> {
    return this.monitoringData.getCpuHistory();
  }

  /**
   * Get last crash time
   * @returns Last crash timestamp or null if never crashed
   */
  public getLastCrashTime(): number | null {
    return this.lastCrashTime;
  }

  // ---------------------------------------------------------------------------
  // Persistence Support
  // ---------------------------------------------------------------------------

  /**
   * Serialize process information for persistence
   * @returns Serializable process information
   */
  public toJSON(): PersistedManagedProcessInfo {
    return {
      name: this.config.name,
      status: this.status,
      pid: this.pid,
      restartCount: this.statistics.restarts,
      autoRestartEnabled: this.statistics.autoRestartEnabled,
      lastStartTime: this.statistics.startedAt,
      stateHistory: this.stateHistory,
      memoryHistory: this.monitoringData.getMemoryHistory() as MemorySample[],
      cpuHistory: this.monitoringData.getCpuHistory() as CPUSample[],
      consecutiveRestarts: this.statistics.consecutiveFailures,
      lastRestartTime: this.statistics.lastRestart,
      lastCrashTime: this.lastCrashTime,
    };
  }

  /**
   * Restore process state from persisted data
   * @param persistedState Previously saved state
   */
  public restoreState(
    persistedState: Omit<PersistedManagedProcessInfo, 'name'>
  ): void {
    // Restore status but ensure no transient states survive restart
    const restoredStatus = [
      'online',
      'starting',
      'stopping',
      'max-memory',
    ].includes(persistedState.status)
      ? 'stopped'
      : persistedState.status;

    if (this.status !== restoredStatus) {
      this.status = restoredStatus;
      this.addStateChange(
        this.status,
        restoredStatus,
        'State restored from persistence'
      );
    }

    // PID is always invalid after manager restart
    this.pid = null;

    // Restore statistics
    this.statistics.restarts = persistedState.restartCount || 0;
    this.statistics.autoRestartEnabled =
      persistedState.autoRestartEnabled !== false;
    this.statistics.startedAt = null; // Always null after restart since process isn't running
    this.statistics.lastRestart = persistedState.lastRestartTime || null;
    this.statistics.consecutiveFailures =
      persistedState.consecutiveRestarts || 0;

    // Restore history data
    this.stateHistory = persistedState.stateHistory || [];
    this.monitoringData.setMemoryHistory(persistedState.memoryHistory || []);
    this.monitoringData.setCpuHistory(persistedState.cpuHistory || []);
    this.lastCrashTime = persistedState.lastCrashTime || null;

    // Trim state history to max length if needed
    if (this.stateHistory.length > MAX_HISTORY_LENGTH) {
      this.stateHistory = this.stateHistory.slice(-MAX_HISTORY_LENGTH);
    }
  }
}

// =============================================================================
// Type Exports
// =============================================================================

// Note: EventEmitter type augmentation removed to avoid declaration merging conflicts
