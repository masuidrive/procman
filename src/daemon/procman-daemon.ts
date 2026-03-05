/**
 * Main daemon class for procman
 *
 * Orchestrates daemon components using specialized managers.
 * Follows Single Responsibility Principle by delegating to:
 * - DaemonStateManager: State management and transitions
 * - ComponentManager: Component lifecycle management
 * - SignalHandler: Process signal handling
 * - DataDirectory & PIDManager: File system management
 *
 * Implementation is split across:
 * - daemon-lifecycle.ts: Startup, stop, restart, recovery logic
 * - shutdown-orchestrator.ts: Graceful shutdown phases and connection draining
 * - daemon-queries.ts: Query/status methods and component accessors
 * - daemon-types.ts: Shared DaemonContext interface
 */

import { EventEmitter } from 'events';
import { DataDirectory } from './data-directory.js';
import { PIDManager } from './pid-manager.js';
import { DaemonStateManager, DaemonState } from './daemon-state-manager.js';
import { ComponentManager } from './component-manager.js';
import { SignalHandler } from './signal-handler.js';
import { ConfigLoader } from '../config/config-loader.js';
import { ProcessManager } from '../process-manager/process-manager.js';
import { LogManager } from '../services/log-manager.js';
import { IPCServerBase } from './ipc-server-base.js';
import { AppConfig } from '../shared/config.js';
import { MemoryMonitor } from '../utils/memory/memory-monitor.js';
import type { DaemonContext } from './daemon-types.js';

// Lifecycle functions
import {
  performStart,
  performStop,
  performAttemptRecovery,
  performEmergencyCleanup as _performEmergencyCleanup,
} from './daemon-lifecycle.js';

// Shutdown orchestration helpers
import {
  saveShutdownState as _saveShutdownState,
  getActiveConnectionCount as _getActiveConnectionCount,
  drainActiveConnections as _drainActiveConnections,
  stopManagedProcesses as _stopManagedProcesses,
  executeWithTimeout as _executeWithTimeout,
} from './shutdown-orchestrator.js';

// Query functions
import {
  queryIsReady,
  queryHealthStatus,
  queryLoadConfig,
  queryAllProcessStatuses,
  getConfigLoader as _getConfigLoader,
  getProcessManager as _getProcessManager,
  getLogManager as _getLogManager,
  getIPCServer as _getIPCServer,
} from './daemon-queries.js';

/**
 * Shutdown reason types for graceful shutdown
 */
export type ShutdownReason = 'signal' | 'memory' | 'manual' | 'error';

// Re-export DaemonState for backward compatibility
export { DaemonState };

/**
 * Events emitted by ProcmanDaemon
 */
export interface ProcmanDaemonEvents {
  stateChange: (state: DaemonState) => void;
  error: (error: Error) => void;
  componentStarted: (componentName: string) => void;
  componentStopped: (componentName: string) => void;
  recoveryStarted: () => void;
  recoveryCompleted: () => void;
  recoveryFailed: (error: Error) => void;

  shutdownStarted: (reason: ShutdownReason) => void;
  shutdownCompleted: (reason: ShutdownReason, totalTime: number) => void;
  shutdownFailed: (
    reason: ShutdownReason,
    error: Error,
    totalTime: number
  ) => void;
  newConnectionsRejected: () => void;
}

const debugLog = process.env.DEBUG_PROCMAN
  ? (...args: unknown[]) => console.error(...args)
  : () => {};

/**
 * Main daemon class that coordinates all procman components
 */
export class ProcmanDaemon extends EventEmitter {
  private dataDirectory: DataDirectory;
  private pidManager: PIDManager;
  private stateManager: DaemonStateManager;
  private componentManager: ComponentManager;
  private signalHandler: SignalHandler;
  private memoryMonitor: MemoryMonitor;
  private currentConfig?: AppConfig[];
  private configFilePath?: string;
  private recoveryAttempts = 0;
  private isShuttingDown = false;

  constructor() {
    super();

    this.dataDirectory = new DataDirectory(process.env.PROCMAN_SOCKET_PATH);
    this.pidManager = new PIDManager(this.dataDirectory);
    this.stateManager = new DaemonStateManager();
    this.componentManager = new ComponentManager(this.dataDirectory);
    this.signalHandler = new SignalHandler();
    this.memoryMonitor = new MemoryMonitor({
      intervalMs: 30000,
      warningThreshold: 100 * 1024 * 1024,
      criticalThreshold: 200 * 1024 * 1024,
      enableLogging: process.env.NODE_ENV !== 'test',
    });

    this.setupEventListeners();
  }

  /** Build the DaemonContext for delegation to sub-modules */
  private getContext(): DaemonContext {
    // Use a proxy-like object so mutable fields stay in sync with the class
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const daemon = this;
    return {
      dataDirectory: this.dataDirectory,
      pidManager: this.pidManager,
      stateManager: this.stateManager,
      componentManager: this.componentManager,
      signalHandler: this.signalHandler,
      memoryMonitor: this.memoryMonitor,
      get currentConfig() {
        return daemon.currentConfig;
      },
      set currentConfig(v) {
        daemon.currentConfig = v;
      },
      get configFilePath() {
        return daemon.configFilePath;
      },
      set configFilePath(v) {
        daemon.configFilePath = v;
      },
      get recoveryAttempts() {
        return daemon.recoveryAttempts;
      },
      set recoveryAttempts(v) {
        daemon.recoveryAttempts = v;
      },
      get isShuttingDown() {
        return daemon.isShuttingDown;
      },
      set isShuttingDown(v) {
        daemon.isShuttingDown = v;
      },
    };
  }

  // ── State queries ──────────────────────────────────────────────────

  getState(): DaemonState {
    return this.stateManager.getCurrentState();
  }

  isRunning(): boolean {
    return this.stateManager.isRunning();
  }

  async isReady(): Promise<boolean> {
    return queryIsReady(this.getContext());
  }

  async getHealthStatus() {
    return queryHealthStatus(this.getContext());
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  async start(): Promise<void> {
    return performStart(this.getContext());
  }

  async stop(): Promise<void> {
    return performStop(this.getContext());
  }

  async restart(): Promise<void> {
    if (this.isRunning()) {
      await this.stop();
    }
    await this.start();
  }

  async attemptRecovery(): Promise<boolean> {
    const emitFn = (event: string, ...args: unknown[]) =>
      super.emit(event, ...args);
    return performAttemptRecovery(
      this.getContext(),
      emitFn,
      this.loadConfig.bind(this)
    );
  }

  // ── Graceful shutdown ──────────────────────────────────────────────

  async shutdown(
    reason: ShutdownReason = 'manual',
    timeoutMs: number = 30000
  ): Promise<void> {
    if (this.isShuttingDown) {
      console.log('[ProcmanDaemon] Shutdown already in progress, waiting...');
      return;
    }

    this.isShuttingDown = true;
    const shutdownStart = Date.now();

    console.log(
      `[ProcmanDaemon] Beginning graceful shutdown (reason: ${reason}, timeout: ${timeoutMs}ms)`
    );

    try {
      await this.executeWithTimeout(
        async () => {
          console.log(
            '[ProcmanDaemon] Phase 1: Setting shutdown flag and rejecting new connections...'
          );
          this.emit('shutdownStarted', reason);
          const ipcServer = this.getIPCServer();
          if (ipcServer) {
            this.emit('newConnectionsRejected');
          }
        },
        5000,
        'Phase 1: Shutdown initialization'
      );

      await this.executeWithTimeout(
        async () => {
          console.log('[ProcmanDaemon] Phase 2: Saving shutdown state...');
          await this.saveShutdownState(reason);
        },
        5000,
        'Phase 2: State preservation'
      );

      await this.executeWithTimeout(
        async () => {
          console.log(
            '[ProcmanDaemon] Phase 3: Draining active connections...'
          );
          await this.drainActiveConnections();
        },
        10000,
        'Phase 3: Connection draining'
      );

      await this.executeWithTimeout(
        async () => {
          console.log('[ProcmanDaemon] Phase 4: Stopping managed processes...');
          await this.stopManagedProcesses();
        },
        15000,
        'Phase 4: Process termination'
      );

      await this.executeWithTimeout(
        async () => {
          console.log('[ProcmanDaemon] Phase 5: Final resource cleanup...');
          await this.stop();
        },
        5000,
        'Phase 5: Resource cleanup'
      );

      const totalTime = Date.now() - shutdownStart;
      console.log(
        `[ProcmanDaemon] Graceful shutdown completed successfully in ${totalTime}ms`
      );
      this.emit('shutdownCompleted', reason, totalTime);
    } catch (error) {
      const totalTime = Date.now() - shutdownStart;
      debugLog(
        `[ProcmanDaemon] Graceful shutdown failed after ${totalTime}ms:`,
        error
      );

      console.log('[ProcmanDaemon] Attempting forced shutdown...');
      await this.performEmergencyCleanup();

      this.emit(
        'shutdownFailed',
        reason,
        error instanceof Error ? error : new Error(String(error)),
        totalTime
      );
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  /** Save shutdown state to disk (delegates to shutdown-orchestrator) */
  private async saveShutdownState(reason: ShutdownReason): Promise<void> {
    return _saveShutdownState(
      this.dataDirectory,
      reason,
      this.getProcessManager(),
      this.getAllProcessStatuses.bind(this),
      this.getActiveConnectionCount()
    );
  }

  /** Get count of active IPC connections */
  private getActiveConnectionCount(): number {
    return _getActiveConnectionCount(this.getIPCServer());
  }

  /** Drain active IPC connections gracefully */
  private async drainActiveConnections(): Promise<void> {
    return _drainActiveConnections(this.getIPCServer());
  }

  /** Stop all managed processes gracefully */
  private async stopManagedProcesses(): Promise<void> {
    return _stopManagedProcesses(this.getProcessManager());
  }

  /** Perform emergency cleanup when normal stop fails */
  private async performEmergencyCleanup(): Promise<void> {
    return _performEmergencyCleanup(this.getContext());
  }

  /** Execute a function with timeout */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    phaseName: string
  ): Promise<T> {
    return _executeWithTimeout(fn, timeoutMs, phaseName);
  }

  // ── Configuration ──────────────────────────────────────────────────

  async loadConfig(configFilePath: string): Promise<AppConfig[]> {
    return queryLoadConfig(this.getContext(), configFilePath);
  }

  getConfig(): AppConfig[] | undefined {
    return this.currentConfig;
  }

  // ── Component accessors ────────────────────────────────────────────

  getConfigLoader(): ConfigLoader | undefined {
    return _getConfigLoader(this.getContext());
  }

  getProcessManager(): ProcessManager | undefined {
    return _getProcessManager(this.getContext());
  }

  getLogManager(): LogManager | undefined {
    return _getLogManager(this.getContext());
  }

  getIPCServer(): IPCServerBase | undefined {
    return _getIPCServer(this.getContext());
  }

  async getAllProcessStatuses() {
    return queryAllProcessStatuses(this.getContext());
  }

  // ── Event wiring ───────────────────────────────────────────────────

  private setupEventListeners(): void {
    this.stateManager.on('stateChange', (event) => {
      this.emit('stateChange', event.to);
    });

    this.stateManager.on('enterError', () => {
      setTimeout(() => {
        this.attemptRecovery().catch((error) => {
          console.error('Automatic recovery failed:', error);
        });
      }, 1000);
    });

    this.componentManager.on('componentStarted', (componentName) => {
      this.emit('componentStarted', componentName);
    });

    this.componentManager.on('componentStopped', (componentName) => {
      this.emit('componentStopped', componentName);
    });

    this.componentManager.on('componentError', (componentName, error) => {
      console.error(`Component ${componentName} error:`, error);
      this.emit('error', error);
      if (!this.stateManager.isInError()) {
        this.stateManager.forceError();
      }
    });

    this.signalHandler.on('gracefulShutdown', async (signal) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      try {
        await this.shutdown('signal');
        process.exit(0);
      } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    });

    this.signalHandler.on('uncaughtException', async (error) => {
      console.error('Uncaught exception in daemon:', error);
      this.emit('error', error);
      if (!this.stateManager.isInError()) {
        this.stateManager.forceError();
      }
    });

    this.memoryMonitor.on('memoryCritical', (usage, threshold) => {
      console.warn(
        `[ProcmanDaemon] Memory critical threshold exceeded: ${this.formatBytes(usage.rss)} > ${this.formatBytes(threshold)}`
      );
    });

    this.memoryMonitor.on('memoryWarning', (usage, threshold) => {
      console.warn(
        `[ProcmanDaemon] Memory warning threshold exceeded: ${this.formatBytes(usage.rss)} > ${this.formatBytes(threshold)}`
      );
    });

    this.memoryMonitor.on('error', (error) => {
      console.error('[ProcmanDaemon] Memory monitor error:', error);
      this.emit('error', error);
    });
  }

  // ── Utilities ──────────────────────────────────────────────────────

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

  // ── Type-safe EventEmitter overrides ───────────────────────────────

  emit<K extends keyof ProcmanDaemonEvents>(
    event: K,
    ...args: Parameters<ProcmanDaemonEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof ProcmanDaemonEvents>(
    event: K,
    listener: ProcmanDaemonEvents[K]
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
}
