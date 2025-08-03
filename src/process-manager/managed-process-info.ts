/**
 * ManagedProcessInfo - Individual process information management
 *
 * This class manages the information and statistics for a single process,
 * including uptime tracking, restart counting, and state change recording.
 */

import { EventEmitter } from 'events';
import {
  ProcessInfo,
  ProcessStatus,
  ProcessStateChange,
  MemorySample,
  CPUSample,
  PersistedManagedProcessInfo,
} from '../shared/process';
import { ProcessConfig } from './process-manager';
import {
  RESTART_BACKOFF_BASE_DELAY,
  RESTART_BACKOFF_MAX_DELAY,
  RESTART_BACKOFF_MULTIPLIER,
  RESTART_WINDOW_TIME,
  MAX_RESTART_COUNT,
  MAX_HISTORY_LENGTH,
} from '../shared/constants';

// =============================================================================
// Process Statistics Interface
// =============================================================================

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

// =============================================================================
// Process Events Interface
// =============================================================================

/**
 * Events emitted by ManagedProcessInfo
 */
export interface ManagedProcessEvents {
  /** Process status changed */
  'status-change': (newStatus: ProcessStatus, oldStatus: ProcessStatus) => void;
  /** Process started */
  start: (pid: number) => void;
  /** Process stopped */
  stop: (exitCode: number | null) => void;
  /** Process restarted */
  restart: (restartCount: number) => void;
  /** Process memory limit exceeded */
  'memory-limit': (memoryUsage: number, limit: number) => void;
  /** Process error occurred */
  error: (error: Error) => void;
}

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

  // New properties for detailed history tracking
  private stateHistory: ProcessStateChange[] = [];
  private memoryHistoryDetailed: MemorySample[] = [];
  private cpuHistoryDetailed: CPUSample[] = [];
  private lastCrashTime: number | null = null;

  constructor(config: ProcessConfig) {
    super();
    this.config = { ...config }; // Create a copy to avoid external mutations

    // Initialize statistics
    const now = Date.now();
    this.statistics = {
      startedAt: null,
      lastStatusChange: now,
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
  // Statistics and Monitoring
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
    this.statistics.currentMemory = memoryUsage;
    const now = Date.now();

    // Add to simple history (keep for backward compatibility)
    this.statistics.memoryHistory.push(memoryUsage);
    if (this.statistics.memoryHistory.length > 10) {
      this.statistics.memoryHistory.shift();
    }

    // Add to detailed history with timestamp
    this.memoryHistoryDetailed.push({ timestamp: now, usage: memoryUsage });
    if (this.memoryHistoryDetailed.length > MAX_HISTORY_LENGTH) {
      this.memoryHistoryDetailed.shift();
    }

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
    this.statistics.currentCpu = cpuUsage;
    const now = Date.now();

    // Add to simple history (keep for backward compatibility)
    this.statistics.cpuHistory.push(cpuUsage);
    if (this.statistics.cpuHistory.length > 10) {
      this.statistics.cpuHistory.shift();
    }

    // Add to detailed history with timestamp
    this.cpuHistoryDetailed.push({ timestamp: now, usage: cpuUsage });
    if (this.cpuHistoryDetailed.length > MAX_HISTORY_LENGTH) {
      this.cpuHistoryDetailed.shift();
    }
  }

  /**
   * Get average memory usage from history
   * @returns Average memory usage in bytes
   */
  public getAverageMemoryUsage(): number {
    if (this.statistics.memoryHistory.length === 0) {
      return 0;
    }
    const sum = this.statistics.memoryHistory.reduce(
      (acc, val) => acc + val,
      0
    );
    return sum / this.statistics.memoryHistory.length;
  }

  /**
   * Get average CPU usage from history
   * @returns Average CPU usage percentage
   */
  public getAverageCpuUsage(): number {
    if (this.statistics.cpuHistory.length === 0) {
      return 0;
    }
    const sum = this.statistics.cpuHistory.reduce((acc, val) => acc + val, 0);
    return sum / this.statistics.cpuHistory.length;
  }

  /**
   * Get current memory usage
   * @returns Current memory usage in bytes
   */
  public getMemoryUsage(): number {
    return this.statistics.currentMemory;
  }

  // ---------------------------------------------------------------------------
  // Restart Management
  // ---------------------------------------------------------------------------

  /**
   * Record a restart
   */
  public recordRestart(): void {
    this.statistics.restarts++;
    this.statistics.lastRestart = Date.now();
    this.emit('restart', this.statistics.restarts);
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
    this.statistics.restarts = 0;
    this.statistics.lastRestart = null;
  }

  /**
   * Get time since last restart
   * @returns Time since last restart in milliseconds, or null if never restarted
   */
  public getTimeSinceLastRestart(): number | null {
    if (!this.statistics.lastRestart) {
      return null;
    }
    return Date.now() - this.statistics.lastRestart;
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
  // Auto-restart Control
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
    const now = Date.now();

    // Reset failure window if enough time has passed
    if (
      this.statistics.firstFailureTime &&
      now - this.statistics.firstFailureTime > RESTART_WINDOW_TIME
    ) {
      this.resetRestartFailures();
    }

    // Initialize failure window if this is the first failure
    if (this.statistics.firstFailureTime === null) {
      this.statistics.firstFailureTime = now;
    }

    this.statistics.consecutiveFailures++;

    // Disable auto-restart if too many failures
    if (this.statistics.consecutiveFailures >= MAX_RESTART_COUNT) {
      this.statistics.autoRestartEnabled = false;
      console.warn(
        `Process '${this.config.name}' auto-restart disabled after ${MAX_RESTART_COUNT} consecutive failures`
      );
    }

    // Calculate next restart delay with exponential backoff
    this.calculateNextRestartDelay();
  }

  /**
   * Record a successful restart (reset failure counters)
   */
  public recordRestartSuccess(): void {
    this.resetRestartFailures();
  }

  /**
   * Reset restart failure counters
   */
  public resetRestartFailures(): void {
    this.statistics.consecutiveFailures = 0;
    this.statistics.firstFailureTime = null;
    this.statistics.nextRestartDelay = RESTART_BACKOFF_BASE_DELAY;
  }

  /**
   * Get consecutive failure count
   * @returns Number of consecutive failures
   */
  public getConsecutiveFailures(): number {
    return this.statistics.consecutiveFailures;
  }

  /**
   * Get next restart delay
   * @returns Next restart delay in milliseconds
   */
  public getNextRestartDelay(): number {
    return this.statistics.nextRestartDelay;
  }

  /**
   * Calculate next restart delay using exponential backoff
   */
  private calculateNextRestartDelay(): void {
    const baseDelay = RESTART_BACKOFF_BASE_DELAY;
    const multiplier = Math.pow(
      RESTART_BACKOFF_MULTIPLIER,
      this.statistics.consecutiveFailures - 1
    );
    const calculatedDelay = baseDelay * multiplier;

    this.statistics.nextRestartDelay = Math.min(
      calculatedDelay,
      RESTART_BACKOFF_MAX_DELAY
    );
  }

  /**
   * Check if restart should be attempted based on failure count
   * @returns True if restart should be attempted
   */
  public shouldRestart(): boolean {
    return (
      this.statistics.autoRestartEnabled &&
      this.statistics.consecutiveFailures < MAX_RESTART_COUNT
    );
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
    // Expected exits:
    // - Normal exit with code 0
    // - Graceful shutdown via SIGTERM
    // - Process was in stopping state (intentional shutdown)

    if (this.status === 'stopping') {
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
    this.memoryHistoryDetailed.length = 0;
    this.cpuHistoryDetailed.length = 0;

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
      memoryHistory: this.memoryHistoryDetailed,
      cpuHistory: this.cpuHistoryDetailed,
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
    this.memoryHistoryDetailed = persistedState.memoryHistory || [];
    this.cpuHistoryDetailed = persistedState.cpuHistory || [];
    this.lastCrashTime = persistedState.lastCrashTime || null;

    // Trim history to max length if needed
    if (this.stateHistory.length > MAX_HISTORY_LENGTH) {
      this.stateHistory = this.stateHistory.slice(-MAX_HISTORY_LENGTH);
    }
    if (this.memoryHistoryDetailed.length > MAX_HISTORY_LENGTH) {
      this.memoryHistoryDetailed =
        this.memoryHistoryDetailed.slice(-MAX_HISTORY_LENGTH);
    }
    if (this.cpuHistoryDetailed.length > MAX_HISTORY_LENGTH) {
      this.cpuHistoryDetailed =
        this.cpuHistoryDetailed.slice(-MAX_HISTORY_LENGTH);
    }
  }
}

// =============================================================================
// Type Exports
// =============================================================================

// Note: EventEmitter type augmentation removed to avoid declaration merging conflicts
