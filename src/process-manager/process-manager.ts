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
import { AppConfig } from '../shared/config.js';
import { ProcessInfo, ProcessStatus } from '../shared/process.js';
import { ProcessDependency } from './interfaces/process-group.js';
import {
  ProcessConfig,
  validateAppConfig,
  convertAppConfigToProcessConfig,
} from './process-config.js';
import {
  setupEventForwarding,
  setupInternalEventHandlers,
} from './process-event-forwarding.js';
import * as ProcessInfoQueries from './process-info-queries.js';
import * as BatchOps from './process-batch-operations.js';

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
    setupEventForwarding(
      this,
      this.processes,
      this.lifecycle,
      this.monitor,
      this.persistence,
      this.groups
    );

    // Setup internal event handlers
    setupInternalEventHandlers(this, this.processes, (name: string) =>
      this.restartProcess(name)
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

  public configureProcess(appConfig: AppConfig): void {
    validateAppConfig(appConfig);
    const processConfig = convertAppConfigToProcessConfig(appConfig);
    this.processConfigs.set(appConfig.name, processConfig);
    if (!this.processes.has(appConfig.name)) {
      this.initializeProcess(appConfig.name);
    }
  }

  public removeProcessConfig(name: string): void {
    this.processConfigs.delete(name);
  }

  public getProcessConfig(name: string): ProcessConfig | undefined {
    return this.processConfigs.get(name);
  }

  // ===== PROCESS INFO ACCESS (delegated to ProcessInfoQueries) =====

  public getProcessInfo(name: string): ProcessInfo | undefined {
    return ProcessInfoQueries.getProcessInfo(this.processes, name);
  }

  public getAllProcessInfo(): ProcessInfo[] {
    return ProcessInfoQueries.getAllProcessInfo(this.processes);
  }

  public getProcessesByNamespace(namespace: string): ProcessInfo[] {
    return ProcessInfoQueries.getProcessesByNamespace(
      this.processes,
      namespace
    );
  }

  public getProcessNamesByNamespace(namespace: string): string[] {
    return ProcessInfoQueries.getProcessNamesByNamespace(
      this.processes,
      namespace
    );
  }

  public getNamespaces(): string[] {
    return ProcessInfoQueries.getNamespaces(this.processes);
  }

  public getNamespaceStatus(namespace: string): {
    total: number;
    online: number;
    stopped: number;
    errored: number;
    starting: number;
    stopping: number;
  } {
    return ProcessInfoQueries.getNamespaceStatus(this.processes, namespace);
  }

  public getProcessNames(): string[] {
    return ProcessInfoQueries.getProcessNames(this.processes);
  }

  public hasProcess(name: string): boolean {
    return ProcessInfoQueries.hasProcess(this.processes, name);
  }

  // ===== PROCESS LIFECYCLE MANAGEMENT =====

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

  public removeProcess(name: string): boolean {
    const processInfo = this.processes.get(name);
    if (!processInfo) {
      return false;
    }
    processInfo.dispose();
    this.processes.delete(name);
    this.processConfigs.delete(name);
    return true;
  }

  public async startProcess(name: string): Promise<void> {
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

  public async stopProcess(name: string): Promise<void> {
    const result = await this.lifecycle.stopProcess(name);
    if (!result.success) {
      throw new Error(result.error || `Failed to stop process: ${name}`);
    }
  }

  public async restartProcess(name: string): Promise<void> {
    const result = await this.lifecycle.restartProcess(name);
    if (!result.success) {
      throw new Error(result.error || `Failed to restart process: ${name}`);
    }
  }

  // ===== BATCH OPERATIONS (delegated to BatchOps) =====

  public async startProcesses(
    names: string[]
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    return BatchOps.startProcesses(this.groups, names);
  }

  public async stopProcesses(
    names: string[]
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    return BatchOps.stopProcesses(this.groups, names);
  }

  public async restartProcesses(
    names: string[]
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    return BatchOps.restartProcesses(this.groups, names);
  }

  public async startNamespace(
    namespace: string
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    return BatchOps.startNamespace(this.groups, namespace);
  }

  public async stopNamespace(
    namespace: string
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    return BatchOps.stopNamespace(this.groups, namespace);
  }

  public async restartNamespace(
    namespace: string
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    return BatchOps.restartNamespace(this.groups, namespace);
  }

  // ===== MONITORING MANAGEMENT =====

  public startMonitoring(): void {
    this.monitor.startMonitoring({
      healthCheckInterval: this.healthCheckInterval,
      memoryCheckInterval: this.memoryCheckInterval,
    });
  }

  public stopMonitoring(): void {
    this.monitor.stopMonitoring();
  }

  // ===== AUTO-RESTART MANAGEMENT =====

  public enableAutoRestart(name: string): void {
    const processInfo = this.processes.get(name);
    if (processInfo) {
      processInfo.setAutoRestartEnabled(true);
    }
  }

  public disableAutoRestart(name: string): void {
    const processInfo = this.processes.get(name);
    if (processInfo) {
      processInfo.setAutoRestartEnabled(false);
    }
  }

  public resetRestartFailures(name: string): void {
    const processInfo = this.processes.get(name);
    if (processInfo) {
      processInfo.resetRestartFailures();
    }
  }

  public getAutoRestartStatus(name: string): {
    enabled: boolean;
    consecutiveFailures: number;
  } {
    const processInfo = this.processes.get(name);
    if (!processInfo) {
      return { enabled: false, consecutiveFailures: 0 };
    }
    return {
      enabled: processInfo.isAutoRestartEnabled(),
      consecutiveFailures: processInfo.getConsecutiveFailures(),
    };
  }

  // ===== DEPENDENCY MANAGEMENT (delegated to BatchOps) =====

  public configureDependency(dependency: ProcessDependency): void {
    BatchOps.configureDependency(this.groups, dependency);
  }

  public removeDependency(name: string): void {
    BatchOps.removeDependency(this.groups, name);
  }

  public getDependency(name: string): ProcessDependency | undefined {
    return BatchOps.getDependency(this.groups, name);
  }

  public getAllDependencies(): ProcessDependency[] {
    return BatchOps.getAllDependencies(this.groups);
  }

  public resolveDependencies(
    names: string[]
  ): ReturnType<typeof BatchOps.resolveDependencies> {
    return BatchOps.resolveDependencies(this.groups, names);
  }

  public async startProcessesWithDependencies(
    processNames: string[]
  ): Promise<{ name: string; success: boolean; error?: string }[]> {
    return this.startProcesses(processNames);
  }

  public startDependencyMonitoring(): void {
    // Placeholder for future implementation
  }

  public stopDependencyMonitoring(): void {
    // Placeholder for future implementation
  }

  // ===== PERSISTENCE MANAGEMENT =====

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    const persistedProcesses = await this.persistence.loadState();
    for (const persistedProcess of persistedProcesses) {
      const processInfo = this.processes.get(persistedProcess.name);
      if (processInfo) {
        processInfo.restoreState(persistedProcess);
      }
    }
    this.isInitialized = true;
  }

  public async saveState(): Promise<void> {
    const processData = Array.from(this.processes.values()).map((p) =>
      p.toJSON()
    );
    await this.persistence.saveState(processData);
  }

  public async forceSaveState(): Promise<void> {
    const processData = Array.from(this.processes.values()).map((p) =>
      p.toJSON()
    );
    await this.persistence.forceSaveState(processData);
  }

  public getPersistenceFilePath(): string {
    return this.persistence.getFilePath();
  }

  // ===== CLEANUP =====

  public async cleanup(): Promise<void> {
    this.stopMonitoring();
    await this.forceSaveState();

    const cleanupIfAvailable = (
      component: object
    ): Promise<void> | undefined => {
      if (
        'cleanup' in component &&
        typeof (component as { cleanup: () => Promise<void> }).cleanup ===
          'function'
      ) {
        return (component as { cleanup: () => Promise<void> }).cleanup();
      }
      return undefined;
    };
    const cleanupPromises = [
      this.lifecycle,
      this.monitor,
      this.persistence,
      this.groups,
    ]
      .map(cleanupIfAvailable)
      .filter(Boolean);
    await Promise.all(cleanupPromises);

    for (const processInfo of this.processes.values()) {
      processInfo.dispose();
    }
    this.processes.clear();
    this.processConfigs.clear();
    this.isInitialized = false;
  }
}

// Re-export types for backward compatibility
export { ProcessConfig } from './process-config.js';
export {
  validateAppConfig,
  convertAppConfigToProcessConfig,
} from './process-config.js';
export {
  ProcessInfo,
  ProcessStatus,
  AppConfig,
  ProcessDependency,
  ManagedProcessInfo,
};
