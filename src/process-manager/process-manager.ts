/**
 * ProcessManager - Main process management facade
 *
 * This class provides a unified interface for process management,
 * delegating operations to specialized components while maintaining
 * backward compatibility with the existing API.
 *
 * ARCHITECTURE:
 * - Uses composition pattern with specialized components
 * - Maintains existing public interface for backward compatibility
 * - Delegates operations to appropriate components
 * - Acts as a facade for the underlying system
 */

import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { ProcessLifecycleManagerImpl } from './process-lifecycle-manager.js';
import { ProcessMonitorImpl } from './process-monitor.js';
import { ProcessPersistenceImpl } from './process-persistence.js';
import { ProcessGroupManagerImpl } from './process-group-manager.js';
import { ManagedProcessInfo } from './managed-process-info.js';
import {
  ProcessLifecycleManager,
  ProcessMonitor,
  ProcessPersistence,
  ProcessGroupManager,
  MainProcessManager,
} from './interfaces';
import { AppConfig, parseMemorySize } from '../shared/config.js';
import { ProcessInfo, ProcessStatus } from '../shared/process.js';
import { ProcessDependency } from './interfaces/process-group.js';

/**
 * Process configuration interface
 */
export interface ProcessConfig {
  /** Process name */
  name: string;
  /** Script path to execute */
  script: string;
  /** Namespace for grouping */
  namespace: string;
  /** Command line arguments */
  args: string[];
  /** Working directory */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Number of instances to start */
  instances: number;
  /** Enable automatic restart */
  autorestart: boolean;
  /** Enable file watching */
  watch: boolean;
  /** Memory limit in bytes for auto-restart */
  max_memory_restart?: number;
  /** Maximum number of restarts */
  max_restarts: number;
  /** Minimum uptime before considering restart */
  min_uptime: number;
  /** Delay between restarts */
  restart_delay: number;
  /** Optional note or description */
  note?: string;
}

/**
 * Type definition for batch operation results
 */

/**
 * ProcessManager - Main facade class for process management
 *
 * This class coordinates all process management operations by delegating
 * to specialized components while maintaining the existing public API.
 */
export class ProcessManager extends EventEmitter implements MainProcessManager {
  // Core components
  public readonly lifecycle: ProcessLifecycleManager;
  public readonly monitor: ProcessMonitor;
  public readonly persistence: ProcessPersistence;
  public readonly groups: ProcessGroupManager;

  // Process management state
  private readonly processes = new Map<string, ManagedProcessInfo>();
  private readonly processConfigs = new Map<string, ProcessConfig>();
  private readonly childProcesses = new Map<string, ChildProcess>();
  private isInitialized = false;

  constructor(
    private healthCheckInterval = 5000,
    private memoryCheckInterval = 30000,

    persistenceFilePath?: string
  ) {
    super();

    // Initialize components with shared state
    this.lifecycle = new ProcessLifecycleManagerImpl(
      this.processes,
      this.childProcesses
    );
    this.monitor = new ProcessMonitorImpl(this.processes, this.childProcesses);
    this.persistence = new ProcessPersistenceImpl(this.processes);

    // Initialize persistence with default config
    // Enhanced HOME detection: process.env.HOME || os.homedir()
    const homeDir = process.env.HOME || os.homedir();
    if (!homeDir && !persistenceFilePath) {
      throw new Error(
        'Unable to determine home directory for persistence path'
      );
    }
    const defaultPersistencePath =
      persistenceFilePath ||
      path.join(homeDir!, '.masuidrive-procman', 'processes.json');
    this.persistence.initialize({
      filePath: defaultPersistencePath,
      saveDelay: 1000,
      enableBackup: true,
    });

    this.groups = new ProcessGroupManagerImpl(this.processes, {
      startProcess: (name: string) => this.lifecycle.startProcess(name),
      stopProcess: (name: string) => this.lifecycle.stopProcess(name),
      restartProcess: (name: string) => this.lifecycle.restartProcess(name),
    });

    // Forward events from components
    this.setupEventForwarding();

    // Setup internal event handlers
    this.setupInternalEventHandlers();
  }

  /**
   * Set up event forwarding from components to maintain compatibility
   */
  private setupEventForwarding(): void {
    // Cast components to EventEmitter for event forwarding
    const lifecycleEmitter = this.lifecycle as unknown as EventEmitter;
    const monitorEmitter = this.monitor as unknown as EventEmitter;
    const persistenceEmitter = this.persistence as unknown as EventEmitter;
    const groupsEmitter = this.groups as unknown as EventEmitter;

    // Forward lifecycle events
    lifecycleEmitter.on('process:started', (name: string) => {
      const processInfo = this.processes.get(name)?.getProcessInfo();
      if (processInfo) {
        this.emit('process:started', name, processInfo);
      }
    });
    lifecycleEmitter.on('process:stopped', (name: string) => {
      const processInfo = this.processes.get(name)?.getProcessInfo();
      if (processInfo) {
        this.emit('process:stopped', name, processInfo);
      }
    });
    lifecycleEmitter.on(
      'process:exit',
      (name: string, code: number | null, signal: string | null) => {
        this.emit('process:exit', name, code, signal);
      }
    );
    lifecycleEmitter.on('process:error', (name: string, error: Error) => {
      this.emit('process:error', name, error);
    });
    lifecycleEmitter.on('process:restart', (name: string) => {
      this.emit('process:restart', name);
    });
    lifecycleEmitter.on('process:restarted', (name: string) => {
      this.emit('process:restarted', name);
    });

    // Forward monitor events
    monitorEmitter.on(
      'process:memory-limit',
      (data: { name: string; usage: number; limit: number }) => {
        this.emit('process:memory-limit', data.name, data.usage, data.limit);
      }
    );
    monitorEmitter.on(
      'process:unhealthy',
      (data: { name: string; consecutiveFailures: number }) => {
        this.emit('process:unhealthy', data.name, data.consecutiveFailures);
      }
    );
    monitorEmitter.on('process:died', (data: { name: string }) => {
      this.emit('process:died', data.name);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monitorEmitter.on('process:stats', (data: { name: string; stats: any }) => {
      this.emit('process:stats', data.name, data.stats);
    });

    // Forward persistence events
    persistenceEmitter.on('persistence:saved', (filePath: string) => {
      this.emit('persistence:saved', filePath);
    });
    persistenceEmitter.on('persistence:save-error', (error: Error) => {
      this.emit('persistence:save-error', error);
    });
    persistenceEmitter.on(
      'persistence:loaded',
      (filePath: string, processCount: number) => {
        this.emit('persistence:loaded', filePath, processCount);
      }
    );
    persistenceEmitter.on('persistence:load-error', (error: Error) => {
      this.emit('persistence:load-error', error);
    });

    // Forward group events
    groupsEmitter.on(
      'namespace:operation-start',
      (namespace: string, operation: string) => {
        this.emit('namespace:operation-start', namespace, operation);
      }
    );
    groupsEmitter.on(
      'namespace:operation-complete',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (namespace: string, operation: string, results: any) => {
        this.emit(
          'namespace:operation-complete',
          namespace,
          operation,
          results
        );
      }
    );
    groupsEmitter.on(
      'batch:operation-start',
      (processNames: string[], operation: string) => {
        this.emit('batch:operation-start', processNames, operation);
      }
    );
    groupsEmitter.on(
      'batch:operation-complete',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (operation: string, results: any) => {
        this.emit('batch:operation-complete', operation, results);
      }
    );
  }

  /**
   * Set up internal event handlers for process management
   */
  private setupInternalEventHandlers(): void {
    // Handle memory limit exceeded - trigger restart
    this.on(
      'process:memory-limit',
      async (name: string, usage: number, limit: number) => {
        console.log(
          `Process '${name}' exceeded memory limit: ${Math.round(usage / 1024 / 1024)}MB > ${Math.round(limit / 1024 / 1024)}MB`
        );

        const managedProcess = this.processes.get(name);
        if (managedProcess && managedProcess.isAutoRestartEnabled()) {
          console.log(`Auto-restarting process '${name}' due to memory limit`);
          try {
            await this.restartProcess(name);
          } catch (error) {
            console.error(
              `Failed to restart process '${name}' after memory limit:`,
              error
            );
          }
        }
      }
    );
  }

  /**
   * Static factory method to create ProcessManager with default components
   */
  static create(
    healthCheckInterval = 5000,
    memoryCheckInterval = 30000,
    persistenceFilePath?: string
  ): ProcessManager {
    return new ProcessManager(
      healthCheckInterval,
      memoryCheckInterval,
      persistenceFilePath
    );
  }

  // ===== CONFIGURATION MANAGEMENT =====

  /**
   * Configure a process from app configuration
   */
  public configureProcess(appConfig: AppConfig): void {
    // t_wada boundary principle: validate inputs at boundaries
    if (appConfig == null) {
      throw new Error('App configuration cannot be null or undefined');
    }

    if (typeof appConfig !== 'object') {
      throw new Error('App configuration must be an object');
    }

    if (!appConfig.name || typeof appConfig.name !== 'string') {
      throw new Error('App configuration must have a valid name');
    }

    // Validate process name contains only safe characters
    const namePattern = /^[a-zA-Z0-9_-]+$/;
    if (!namePattern.test(appConfig.name.trim())) {
      throw new Error(
        `Invalid process name: "${appConfig.name}". Name must contain only alphanumeric characters, hyphens, and underscores`
      );
    }

    const processConfig = this.convertAppConfigToProcessConfig(appConfig);
    this.processConfigs.set(appConfig.name, processConfig);

    // Initialize process info if not exists
    if (!this.processes.has(appConfig.name)) {
      this.initializeProcess(appConfig.name);
    }
  }

  /**
   * Remove process configuration
   */
  public removeProcessConfig(name: string): void {
    this.processConfigs.delete(name);
  }

  /**
   * Get process configuration
   */
  public getProcessConfig(name: string): ProcessConfig | undefined {
    return this.processConfigs.get(name);
  }

  // ===== PROCESS INFO ACCESS =====

  /**
   * Get process information
   */
  public getProcessInfo(name: string): ProcessInfo | undefined {
    const processInfo = this.processes.get(name);
    return processInfo?.getProcessInfo();
  }

  /**
   * Get all process information
   */
  public getAllProcessInfo(): ProcessInfo[] {
    return Array.from(this.processes.values()).map((p) => p.getProcessInfo());
  }

  /**
   * Get processes by namespace
   */
  public getProcessesByNamespace(namespace: string): ProcessInfo[] {
    return Array.from(this.processes.values())
      .filter((p) => p.getProcessInfo().namespace === namespace)
      .map((p) => p.getProcessInfo());
  }

  /**
   * Get process names by namespace
   */
  public getProcessNamesByNamespace(namespace: string): string[] {
    return Array.from(this.processes.values())
      .filter((p) => p.getProcessInfo().namespace === namespace)
      .map((p) => p.getProcessInfo().name);
  }

  /**
   * Get all namespaces
   */
  public getNamespaces(): string[] {
    const namespaces = new Set<string>();
    for (const processInfo of this.processes.values()) {
      namespaces.add(processInfo.getProcessInfo().namespace || 'default');
    }
    return Array.from(namespaces).sort();
  }

  /**
   * Get namespace status
   */
  public getNamespaceStatus(namespace: string): {
    total: number;
    online: number;
    stopped: number;
    errored: number;
    starting: number;
    stopping: number;
  } {
    const processes = this.getProcessesByNamespace(namespace);
    const status = {
      total: processes.length,
      online: 0,
      stopped: 0,
      errored: 0,
      starting: 0,
      stopping: 0,
    };

    for (const process of processes) {
      switch (process.status) {
        case 'online':
          status.online++;
          break;
        case 'stopped':
          status.stopped++;
          break;
        case 'errored':
          status.errored++;
          break;
        case 'starting':
          status.starting++;
          break;
        case 'stopping':
          status.stopping++;
          break;
      }
    }

    return status;
  }

  /**
   * Get all process names
   */
  public getProcessNames(): string[] {
    return Array.from(this.processes.keys()).sort();
  }

  /**
   * Check if process exists
   */
  public hasProcess(name: string): boolean {
    return this.processes.has(name);
  }

  // ===== PROCESS LIFECYCLE MANAGEMENT =====

  /**
   * Initialize a process (create ManagedProcessInfo)
   */
  public initializeProcess(name: string): boolean {
    if (this.processes.has(name)) {
      return false;
    }

    const config = this.processConfigs.get(name);
    if (!config) {
      return false;
    }

    const processInfo = new ManagedProcessInfo(config);
    this.processes.set(name, processInfo);

    // Forward ManagedProcessInfo events
    processInfo.on('start', () => {
      this.emit('process:started', name, processInfo.getProcessInfo());
    });
    processInfo.on('stop', () => {
      this.emit('process:stopped', name, processInfo.getProcessInfo());
    });
    processInfo.on('error', (error: Error) => {
      this.emit('process:error', name, error);
    });

    return true;
  }

  /**
   * Remove a process
   */
  public removeProcess(name: string): boolean {
    const processInfo = this.processes.get(name);
    if (!processInfo) {
      return false;
    }

    // Clean up and remove
    processInfo.dispose();
    this.processes.delete(name);
    this.processConfigs.delete(name);

    return true;
  }

  /**
   * Start a process
   */
  public async startProcess(name: string): Promise<void> {
    // t_wada boundary principle: validate inputs at boundaries
    if (name == null) {
      throw new Error('Process name cannot be null or undefined');
    }

    if (typeof name !== 'string') {
      throw new Error('Process name must be a string');
    }

    if (name.trim() === '') {
      throw new Error('Process name cannot be empty');
    }

    const result = await this.lifecycle.startProcess(name);
    if (!result.success) {
      throw new Error(result.error || `Failed to start process: ${name}`);
    }
  }

  /**
   * Stop a process
   */
  public async stopProcess(name: string): Promise<void> {
    const result = await this.lifecycle.stopProcess(name);
    if (!result.success) {
      throw new Error(result.error || `Failed to stop process: ${name}`);
    }
  }

  /**
   * Restart a process
   */
  public async restartProcess(name: string): Promise<void> {
    const result = await this.lifecycle.restartProcess(name);
    if (!result.success) {
      throw new Error(result.error || `Failed to restart process: ${name}`);
    }
  }

  // ===== BATCH OPERATIONS =====

  /**
   * Start multiple processes
   */
  public async startProcesses(
    names: string[]
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    const result = await this.groups.startProcesses(names);
    return result.results;
  }

  /**
   * Stop multiple processes
   */
  public async stopProcesses(
    names: string[]
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    const result = await this.groups.stopProcesses(names);
    return result.results;
  }

  /**
   * Restart multiple processes
   */
  public async restartProcesses(
    names: string[]
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    const result = await this.groups.restartProcesses(names);
    return result.results;
  }

  /**
   * Start all processes in a namespace
   */
  public async startNamespace(
    namespace: string
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    const result = await this.groups.startNamespace(namespace);
    return result.results;
  }

  /**
   * Stop all processes in a namespace
   */
  public async stopNamespace(
    namespace: string
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    const result = await this.groups.stopNamespace(namespace);
    return result.results;
  }

  /**
   * Restart all processes in a namespace
   */
  public async restartNamespace(
    namespace: string
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    const result = await this.groups.restartNamespace(namespace);
    return result.results;
  }

  // ===== MONITORING MANAGEMENT =====

  /**
   * Start monitoring all processes
   */
  public startMonitoring(): void {
    this.monitor.startMonitoring({
      healthCheckInterval: this.healthCheckInterval,
      memoryCheckInterval: this.memoryCheckInterval,
    });
  }

  /**
   * Stop monitoring all processes
   */
  public stopMonitoring(): void {
    this.monitor.stopMonitoring();
  }

  // ===== AUTO-RESTART MANAGEMENT =====

  /**
   * Enable auto-restart for a process
   */
  public enableAutoRestart(name: string): void {
    const processInfo = this.processes.get(name);
    if (processInfo && 'enableAutoRestart' in processInfo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (processInfo as any).enableAutoRestart();
    }
  }

  /**
   * Disable auto-restart for a process
   */
  public disableAutoRestart(name: string): void {
    const processInfo = this.processes.get(name);
    if (processInfo && 'disableAutoRestart' in processInfo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (processInfo as any).disableAutoRestart();
    }
  }

  /**
   * Reset restart failures for a process
   */
  public resetRestartFailures(name: string): void {
    const processInfo = this.processes.get(name);
    if (processInfo && 'resetRestartFailures' in processInfo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (processInfo as any).resetRestartFailures();
    }
  }

  /**
   * Get auto-restart status for a process
   */
  public getAutoRestartStatus(name: string): {
    enabled: boolean;
    consecutiveFailures: number;
    lastFailureTime?: Date;
    nextRestartDelay?: number;
  } {
    const processInfo = this.processes.get(name);
    if (!processInfo || !('getAutoRestartStatus' in processInfo)) {
      return {
        enabled: false,
        consecutiveFailures: 0,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (processInfo as any).getAutoRestartStatus();
  }

  // ===== DEPENDENCY MANAGEMENT =====

  /**
   * Configure a process dependency
   */
  public configureDependency(dependency: ProcessDependency): void {
    this.groups.configureDependency(dependency);
  }

  /**
   * Remove a process dependency
   */
  public removeDependency(name: string): void {
    this.groups.removeDependency(name);
  }

  /**
   * Get process dependency
   */
  public getDependency(name: string): ProcessDependency | undefined {
    return this.groups.getDependency(name);
  }

  /**
   * Get all dependencies
   */
  public getAllDependencies(): ProcessDependency[] {
    return this.groups.getAllDependencies();
  }

  /**
   * Resolve dependencies for a set of processes
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public resolveDependencies(names: string[]): any {
    return this.groups.resolveDependencies(names);
  }

  /**
   * Start processes with dependencies
   */
  public async startProcessesWithDependencies(
    processNames: string[]
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    // This is a placeholder for future implementation
    // For now, just start processes in order
    return this.startProcesses(processNames);
  }

  /**
   * Start dependency monitoring
   */
  public startDependencyMonitoring(): void {
    // Placeholder for future implementation
  }

  /**
   * Stop dependency monitoring
   */
  public stopDependencyMonitoring(): void {
    // Placeholder for future implementation
  }

  // ===== PERSISTENCE MANAGEMENT =====

  /**
   * Initialize the process manager
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Load persisted state
    const persistedProcesses = await this.persistence.loadState();

    // Restore process states
    for (const persistedProcess of persistedProcesses) {
      // Check if we have a configuration for this process
      const processInfo = this.processes.get(persistedProcess.name);
      if (processInfo) {
        // Restore the state
        processInfo.restoreState(persistedProcess);
      }
    }

    this.isInitialized = true;
  }

  /**
   * Save current state
   */
  public async saveState(): Promise<void> {
    const processData = Array.from(this.processes.values()).map((p) =>
      p.toJSON()
    );
    await this.persistence.saveState(processData);
  }

  /**
   * Force save state immediately
   */
  public async forceSaveState(): Promise<void> {
    const processData = Array.from(this.processes.values()).map((p) =>
      p.toJSON()
    );
    await this.persistence.forceSaveState(processData);
  }

  /**
   * Get persistence file path
   */
  public getPersistenceFilePath(): string {
    return this.persistence.getFilePath();
  }

  // ===== CLEANUP =====

  /**
   * Clean up all resources
   */
  public async cleanup(): Promise<void> {
    // Stop monitoring
    this.stopMonitoring();

    // Save final state
    await this.forceSaveState();

    // Cleanup components
    const cleanupPromises = [];

    if ('cleanup' in this.lifecycle) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cleanupPromises.push((this.lifecycle as any).cleanup());
    }
    if ('cleanup' in this.monitor) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cleanupPromises.push((this.monitor as any).cleanup());
    }
    if ('cleanup' in this.persistence) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cleanupPromises.push((this.persistence as any).cleanup());
    }
    if ('cleanup' in this.groups) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cleanupPromises.push((this.groups as any).cleanup());
    }

    await Promise.all(cleanupPromises);

    // Clean up processes
    for (const processInfo of this.processes.values()) {
      processInfo.dispose();
    }
    this.processes.clear();
    this.processConfigs.clear();

    this.isInitialized = false;
  }

  // ===== HELPER METHODS =====

  /**
   * Convert AppConfig to ProcessConfig
   */
  private convertAppConfigToProcessConfig(appConfig: AppConfig): ProcessConfig {
    // Parse memory limit if specified
    let max_memory_restart: number | undefined;
    if (appConfig.max_memory_restart) {
      const result = parseMemorySize(appConfig.max_memory_restart);
      if (result.success && result.value) {
        max_memory_restart = result.value;
      }
    }

    const processConfig: ProcessConfig = {
      name: appConfig.name,
      script: appConfig.script,
      cwd: appConfig.cwd || process.cwd(),
      args: appConfig.args
        ? appConfig.args.split(' ').filter((arg) => arg.length > 0)
        : [],
      namespace: appConfig.namespace || 'default',
      instances: 1, // AppConfig doesn't have instances
      autorestart: true, // Default to true for auto-restart
      watch: false, // AppConfig doesn't have watch
      max_memory_restart,
      max_restarts: 10, // Default max restarts
      min_uptime: 1000, // Default min uptime
      restart_delay: 1000, // Default restart delay
      note: appConfig.note,
      env: {},
    };

    // Process environment variables (remove undefined values)
    if (appConfig.env) {
      for (const [key, value] of Object.entries(appConfig.env)) {
        if (value !== undefined) {
          processConfig.env![key] = value;
        }
      }
    }

    return processConfig;
  }
}

// Re-export types for backward compatibility
export {
  ProcessInfo,
  ProcessStatus,
  AppConfig,
  ProcessDependency,
  ManagedProcessInfo,
};
