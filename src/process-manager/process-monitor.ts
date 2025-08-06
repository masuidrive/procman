/**
 * ProcessMonitor - Handles process monitoring and health checks
 *
 * This class is responsible for:
 * - Memory and CPU usage monitoring
 * - Process health checks and statistics
 * - Resource monitoring with configurable intervals
 * - Health status tracking
 */

import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import {
  ProcessMonitor as IProcessMonitor,
  ProcessStats,
  ProcessHealth,
  MonitoringConfig,
} from './interfaces/process-monitor.js';
import { ManagedProcessInfo } from './managed-process-info.js';
import {
  DEFAULT_MONITOR_INTERVAL,
  DEFAULT_MEMORY_CHECK_INTERVAL,
} from '../shared/constants.js';

// Node.js global types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TimeoutId = any;
declare const setInterval: (
  callback: (...args: unknown[]) => void,
  ms: number
) => TimeoutId;
declare const clearInterval: (id: TimeoutId) => void;

/**
 * Type definition for pidusage library
 */
interface PidUsageStats {
  cpu: number;
  memory: number;
  pid: number;
  ctime: number;
  elapsed: number;
  timestamp: number;
}

interface PidUsageFunction {
  (pid: number): Promise<PidUsageStats>;
}

// Lazy load pidusage
let pidusage: PidUsageFunction | null = null;
const getPidusage = async (): Promise<PidUsageFunction> => {
  if (!pidusage) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pidusage = (await import('pidusage')).default as any as PidUsageFunction;
  }
  return pidusage;
};

/**
 * ProcessMonitor implementation
 */
export class ProcessMonitorImpl
  extends EventEmitter
  implements IProcessMonitor
{
  private readonly processes: Map<string, ManagedProcessInfo>;
  private readonly childProcesses: Map<string, ChildProcess>;
  private readonly monitoringTimers: Map<string, TimeoutId>;
  private readonly healthStatus: Map<string, ProcessHealth>;

  private memoryCheckTimer: TimeoutId | null = null;
  private isMonitoringEnabledFlag = false;
  private config: MonitoringConfig;

  constructor(
    processes: Map<string, ManagedProcessInfo>,
    childProcesses: Map<string, ChildProcess>
  ) {
    super();
    this.processes = processes;
    this.childProcesses = childProcesses;
    this.monitoringTimers = new Map();
    this.healthStatus = new Map();

    // Default configuration
    this.config = {
      healthCheckInterval: DEFAULT_MONITOR_INTERVAL,
      memoryCheckInterval: DEFAULT_MEMORY_CHECK_INTERVAL,
      maxHealthCheckFailures: 3,
    };
  }

  /**
   * Start monitoring all processes
   */
  public startMonitoring(config?: Partial<MonitoringConfig>): void {
    if (this.isMonitoringEnabledFlag) {
      return; // Already monitoring
    }

    // Update configuration
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.isMonitoringEnabledFlag = true;

    // Start individual process monitoring for all existing processes
    for (const [name, managedProcess] of Array.from(this.processes)) {
      if (managedProcess.isMonitorable()) {
        this.startProcessMonitoring(name);
      }
    }

    // Start global memory check timer
    this.startMemoryMonitoring();
  }

  /**
   * Stop monitoring all processes
   */
  public stopMonitoring(): void {
    if (!this.isMonitoringEnabledFlag) {
      return; // Already stopped
    }

    this.isMonitoringEnabledFlag = false;

    // Stop all individual process monitoring
    for (const [name] of Array.from(this.monitoringTimers)) {
      this.stopProcessMonitoring(name);
    }

    // Stop global memory check timer
    this.stopMemoryMonitoring();

    // Clear health status
    this.healthStatus.clear();
  }

  /**
   * Start monitoring a specific process
   */
  public startProcessMonitoring(name: string): void {
    // Stop existing monitoring if any
    this.stopProcessMonitoring(name);

    const managedProcess = this.processes.get(name);
    if (!managedProcess || !managedProcess.isMonitorable()) {
      return;
    }

    // Initialize health status
    this.healthStatus.set(name, {
      isAlive: true,
      lastCheck: Date.now(),
      consecutiveFailures: 0,
    });

    // Start periodic monitoring
    const timer = setInterval(async () => {
      await this.monitorProcess(name);
    }, this.config.healthCheckInterval);

    this.monitoringTimers.set(name, timer);
  }

  /**
   * Stop monitoring a specific process
   */
  public stopProcessMonitoring(name: string): void {
    const timer = this.monitoringTimers.get(name);
    if (timer) {
      clearInterval(timer);
      this.monitoringTimers.delete(name);
    }

    // Remove health status
    this.healthStatus.delete(name);
  }

  /**
   * Get current resource statistics for a process
   */
  public async getProcessStats(
    name: string
  ): Promise<ProcessStats | undefined> {
    const childProcess = this.childProcesses.get(name);
    if (!childProcess) {
      return undefined;
    }

    try {
      const stats = await this.getProcessStatsInternal(childProcess);
      return {
        memory: stats.memory,
        cpu: stats.cpu,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`Error getting stats for process '${name}':`, error);
      return undefined;
    }
  }

  /**
   * Get health status for a process
   */
  public getProcessHealth(name: string): ProcessHealth | undefined {
    return this.healthStatus.get(name);
  }

  /**
   * Check if a process is being monitored
   */
  public isProcessMonitored(name: string): boolean {
    return this.monitoringTimers.has(name);
  }

  /**
   * Check if monitoring is enabled globally
   */
  public isMonitoringEnabled(): boolean {
    return this.isMonitoringEnabledFlag;
  }

  /**
   * Cleanup monitoring resources
   */
  public cleanup(): void {
    this.stopMonitoring();
  }

  /**
   * Monitor a specific process (internal method)
   */
  private async monitorProcess(name: string): Promise<void> {
    const managedProcess = this.processes.get(name);
    const childProcess = this.childProcesses.get(name);

    if (!managedProcess || !childProcess) {
      // Process not found, stop monitoring
      this.stopProcessMonitoring(name);
      return;
    }

    try {
      // Check if process is still alive
      const isAlive = await this.checkProcessAlive(childProcess);
      const health = this.healthStatus.get(name);

      if (!isAlive) {
        // Process is dead
        if (health) {
          health.isAlive = false;
          health.consecutiveFailures++;
          health.lastCheck = Date.now();

          if (
            health.consecutiveFailures >= this.config.maxHealthCheckFailures
          ) {
            this.emit('process:unhealthy', {
              name,
              consecutiveFailures: health.consecutiveFailures,
            });
          }
        }

        this.emit('process:died', { name });
        this.stopProcessMonitoring(name);
        return;
      }

      // Update health status
      if (health) {
        health.isAlive = true;
        health.consecutiveFailures = 0;
        health.lastCheck = Date.now();
      }

      // Update CPU usage
      const cpuUsage = await this.getCpuUsage(childProcess);
      managedProcess.updateCpuUsage(cpuUsage);

      // Emit stats event
      this.emit('process:stats', {
        name,
        stats: {
          memory: managedProcess.getMemoryUsage(),
          cpu: cpuUsage,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      // Log monitoring error but don't stop the process
      console.error(`Error monitoring process '${name}':`, error);

      // Update failure count
      const health = this.healthStatus.get(name);
      if (health) {
        health.consecutiveFailures++;
        health.lastCheck = Date.now();

        if (health.consecutiveFailures >= this.config.maxHealthCheckFailures) {
          this.emit('process:unhealthy', {
            name,
            consecutiveFailures: health.consecutiveFailures,
          });
        }
      }

      managedProcess.emitError(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Start global memory monitoring
   */
  private startMemoryMonitoring(): void {
    this.stopMemoryMonitoring(); // Stop existing timer if any

    this.memoryCheckTimer = setInterval(async () => {
      await this.checkAllProcessesMemory();
    }, this.config.memoryCheckInterval);
  }

  /**
   * Stop global memory monitoring
   */
  private stopMemoryMonitoring(): void {
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
    }
  }

  /**
   * Check all processes memory usage
   */
  private async checkAllProcessesMemory(): Promise<void> {
    for (const [name, managedProcess] of Array.from(this.processes)) {
      if (!managedProcess.isMonitorable()) {
        continue;
      }

      const childProcess = this.childProcesses.get(name);
      if (!childProcess) {
        continue;
      }

      try {
        // Get memory usage for the process
        const memoryUsage = await this.getMemoryUsage(childProcess);
        managedProcess.updateMemoryUsage(memoryUsage);

        // Check memory limit
        const config = managedProcess.getConfig();
        if (
          config.max_memory_restart &&
          memoryUsage > config.max_memory_restart
        ) {
          this.emit('process:memory-limit', {
            name,
            usage: memoryUsage,
            limit: config.max_memory_restart,
          });
        }
      } catch (error) {
        // Log memory check error but continue with other processes
        console.error(`Error checking memory for process '${name}':`, error);
      }
    }
  }

  /**
   * Check if process is alive
   */
  private async checkProcessAlive(
    childProcess: ChildProcess
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      try {
        // Use kill with signal 0 to check if process exists
        // This doesn't actually send a signal, just checks if process exists
        const result = childProcess.kill(0);
        resolve(result);
      } catch {
        // If kill throws an error, process is likely dead
        resolve(false);
      }
    });
  }

  /**
   * Get CPU usage for a process using pidusage library
   */
  private async getCpuUsage(childProcess: ChildProcess): Promise<number> {
    try {
      const pid = childProcess.pid;
      if (!pid) {
        return 0;
      }

      const pidUsageFunc = await getPidusage();
      const stats = await pidUsageFunc(pid);
      return stats.cpu; // pidusage returns CPU usage as percentage
    } catch {
      // Process might have ended or permission denied
      return 0;
    }
  }

  /**
   * Get memory usage for a process using pidusage library
   */
  private async getMemoryUsage(childProcess: ChildProcess): Promise<number> {
    try {
      const pid = childProcess.pid;
      if (!pid) {
        return 0;
      }

      const pidUsageFunc = await getPidusage();
      const stats = await pidUsageFunc(pid);
      return stats.memory; // pidusage returns memory in bytes
    } catch {
      // Process might have ended or permission denied
      return 0;
    }
  }

  /**
   * Get both memory and CPU usage efficiently in a single call
   */
  private async getProcessStatsInternal(
    childProcess: ChildProcess
  ): Promise<{ memory: number; cpu: number }> {
    try {
      const pid = childProcess.pid;
      if (!pid) {
        return { memory: 0, cpu: 0 };
      }

      const pidUsageFunc = await getPidusage();
      const stats = await pidUsageFunc(pid);
      return {
        memory: stats.memory, // Memory in bytes
        cpu: stats.cpu, // CPU usage as percentage
      };
    } catch {
      // Process might have ended or permission denied
      return { memory: 0, cpu: 0 };
    }
  }
}
