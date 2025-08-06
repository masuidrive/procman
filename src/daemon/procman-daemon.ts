/**
 * Main daemon class for procman
 *
 * Orchestrates daemon components using specialized managers.
 * Follows Single Responsibility Principle by delegating to:
 * - DaemonStateManager: State management and transitions
 * - ComponentManager: Component lifecycle management
 * - SignalHandler: Process signal handling
 * - DataDirectory & PIDManager: File system management
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
}

/**
 * Recovery constants
 */
const RECOVERY_CONSTANTS = {
  MAX_RECOVERY_ATTEMPTS: 3,
  RECOVERY_DELAY_MS: 5000,
} as const;

/**
 * Main daemon class that coordinates all procman components
 */
export class ProcmanDaemon extends EventEmitter {
  private dataDirectory: DataDirectory;
  private pidManager: PIDManager;
  private stateManager: DaemonStateManager;
  private componentManager: ComponentManager;
  private signalHandler: SignalHandler;
  private currentConfig?: AppConfig[];
  private configFilePath?: string;
  private recoveryAttempts = 0;
  private readonly maxRecoveryAttempts =
    RECOVERY_CONSTANTS.MAX_RECOVERY_ATTEMPTS;

  constructor() {
    super();

    this.dataDirectory = new DataDirectory();
    this.pidManager = new PIDManager(this.dataDirectory);
    this.stateManager = new DaemonStateManager();
    this.componentManager = new ComponentManager(this.dataDirectory);
    this.signalHandler = new SignalHandler();

    this.setupEventListeners();
  }

  /**
   * Get current daemon state
   */
  getState(): DaemonState {
    return this.stateManager.getCurrentState();
  }

  /**
   * Check if daemon is currently running
   */
  isRunning(): boolean {
    return this.stateManager.isRunning();
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    if (!this.stateManager.canStart()) {
      throw new Error(
        `Cannot start daemon: current state is ${this.getState()}`
      );
    }

    this.stateManager.transitionTo(DaemonState.STARTING);

    try {
      // Check for existing daemon
      await this.pidManager.ensureNoDaemonRunning();

      // Initialize data directory
      await this.dataDirectory.ensureDataDirectory();

      // Write PID file
      await this.pidManager.writePIDFile();

      // Setup signal handlers
      this.signalHandler.setupHandlers();

      // Initialize components
      await this.componentManager.initializeAll();

      this.stateManager.transitionTo(DaemonState.RUNNING);
      this.recoveryAttempts = 0; // Reset recovery counter on successful start
    } catch (error) {
      this.stateManager.forceError();

      // Cleanup on startup failure with better error handling
      await this.performStartupCleanup();

      throw error;
    }
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    if (!this.stateManager.canStop()) {
      throw new Error(
        `Cannot stop daemon: current state is ${this.getState()}`
      );
    }

    this.stateManager.transitionTo(DaemonState.STOPPING);

    try {
      // Stop components with proper error handling
      await this.componentManager.cleanupAll();

      // Remove signal handlers
      this.signalHandler.cleanupHandlers();

      // Clean up PID file
      await this.pidManager.cleanup();

      this.stateManager.transitionTo(DaemonState.STOPPED);
    } catch (error) {
      this.stateManager.forceError();

      // Still try to cleanup critical resources
      await this.performEmergencyCleanup();

      throw error;
    }
  }

  /**
   * Restart the daemon
   */
  async restart(): Promise<void> {
    if (this.isRunning()) {
      await this.stop();
    }
    await this.start();
  }

  /**
   * Attempt error recovery
   */
  async attemptRecovery(): Promise<boolean> {
    if (!this.stateManager.isInError()) {
      return true; // Already recovered
    }

    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      this.emit(
        'recoveryFailed',
        new Error('Maximum recovery attempts exceeded')
      );
      return false;
    }

    this.recoveryAttempts++;
    this.emit('recoveryStarted');

    try {
      this.stateManager.beginRecovery();

      // Perform recovery steps
      await this.performRecoverySteps();

      this.stateManager.completeRecovery();
      this.emit('recoveryCompleted');

      return true;
    } catch (error) {
      this.stateManager.failRecovery();
      this.emit('recoveryFailed', error as Error);

      // Wait before next attempt
      await new Promise((resolve) =>
        setTimeout(resolve, RECOVERY_CONSTANTS.RECOVERY_DELAY_MS)
      );

      return false;
    }
  }

  /**
   * Load configuration and apply it
   */
  async loadConfig(configFilePath: string): Promise<AppConfig[]> {
    const configLoader =
      this.componentManager.getComponent<ConfigLoader>('configLoader');
    const processManager =
      this.componentManager.getComponent<ProcessManager>('processManager');
    const logManager =
      this.componentManager.getComponent<LogManager>('logManager');

    if (!configLoader) {
      throw new Error('ConfigLoader not initialized');
    }
    if (!processManager) {
      throw new Error('ProcessManager not initialized');
    }

    this.configFilePath = configFilePath;
    const config = await configLoader.load(configFilePath);
    this.currentConfig = config.apps;

    // Stop all existing processes
    const allProcesses = processManager.getAllProcessInfo();
    if (allProcesses.length > 0) {
      const processNames = allProcesses.map((p) => p.name);
      await processManager.stopProcesses(processNames);
    }

    // Configure new processes
    for (const app of config.apps) {
      processManager.configureProcess(app);

      // Setup log manager for this app if log files are configured
      if (logManager && (app.log_file || app.out_file || app.error_file)) {
        logManager.setupAppLogs(app.name, {
          logFile: app.log_file,
          outFile: app.out_file,
          errorFile: app.error_file,
          namespace: app.namespace,
        });
      }
    }

    return config.apps;
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig[] | undefined {
    return this.currentConfig;
  }

  /**
   * Get component instances (for backward compatibility)
   */
  getConfigLoader(): ConfigLoader | undefined {
    return this.componentManager.getComponent<ConfigLoader>('configLoader');
  }

  getProcessManager(): ProcessManager | undefined {
    return this.componentManager.getComponent<ProcessManager>('processManager');
  }

  getLogManager(): LogManager | undefined {
    return this.componentManager.getComponent<LogManager>('logManager');
  }

  getIPCServer(): IPCServerBase | undefined {
    return this.componentManager.getComponent<IPCServerBase>('ipcServer');
  }

  /**
   * Get all process statuses (moved from old implementation)
   */
  async getAllProcessStatuses() {
    const processManager = this.getProcessManager();
    if (!processManager) {
      return [];
    }

    const processInfos = processManager.getAllProcessInfo();

    const statusPromises = processInfos.map(async (info) => {
      // Get process stats from monitor
      const stats = await processManager.monitor.getProcessStats(info.name);

      return {
        name: info.name,
        namespace: info.namespace || 'default',
        pid: info.pid,
        status: info.status,
        uptime: info.uptime,
        memory: stats?.memory || 0,
        cpu: stats?.cpu || 0,
        restarts: info.restarts,
      };
    });

    return Promise.all(statusPromises);
  }

  /**
   * Setup event listeners for internal managers
   */
  private setupEventListeners(): void {
    // Forward state manager events
    this.stateManager.on('stateChange', (event) => {
      this.emit('stateChange', event.to);
    });

    this.stateManager.on('enterError', () => {
      // Attempt automatic recovery
      setTimeout(() => {
        this.attemptRecovery().catch((error) => {
          console.error('Automatic recovery failed:', error);
        });
      }, 1000);
    });

    // Forward component manager events
    this.componentManager.on('componentStarted', (componentName) => {
      this.emit('componentStarted', componentName);
    });

    this.componentManager.on('componentStopped', (componentName) => {
      this.emit('componentStopped', componentName);
    });

    this.componentManager.on('componentError', (componentName, error) => {
      console.error(`Component ${componentName} error:`, error);
      this.emit('error', error);

      // Trigger error state if not already in error
      if (!this.stateManager.isInError()) {
        this.stateManager.forceError();
      }
    });

    // Setup signal handler events
    this.signalHandler.on('gracefulShutdown', async (signal) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    });

    this.signalHandler.on('uncaughtException', async (error) => {
      console.error('Uncaught exception in daemon:', error);
      this.emit('error', error);

      // Force error state and attempt recovery
      if (!this.stateManager.isInError()) {
        this.stateManager.forceError();
      }
    });
  }

  /**
   * Perform startup cleanup on failure
   */
  private async performStartupCleanup(): Promise<void> {
    const cleanupTasks: Promise<void>[] = [];

    // Cleanup PID file
    cleanupTasks.push(
      this.pidManager.cleanup().catch((error) => {
        console.error(
          'Failed to cleanup PID file during startup failure:',
          error
        );
      })
    );

    // Cleanup signal handlers
    try {
      this.signalHandler.cleanupHandlers();
    } catch (error) {
      console.error(
        'Failed to cleanup signal handlers during startup failure:',
        error
      );
    }

    // Cleanup any partially initialized components
    cleanupTasks.push(
      this.componentManager.cleanupAll().catch((error) => {
        console.error(
          'Failed to cleanup components during startup failure:',
          error
        );
      })
    );

    // Wait for all cleanup tasks to complete
    await Promise.all(cleanupTasks);
  }

  /**
   * Perform emergency cleanup when normal stop fails
   */
  private async performEmergencyCleanup(): Promise<void> {
    console.log('Performing emergency cleanup...');

    // Try to cleanup critical resources without throwing errors
    try {
      await this.pidManager.cleanup();
    } catch (error) {
      console.error('Emergency PID cleanup failed:', error);
    }

    try {
      this.signalHandler.cleanupHandlers();
    } catch (error) {
      console.error('Emergency signal handler cleanup failed:', error);
    }
  }

  /**
   * Perform recovery steps when in RECOVERING state
   */
  private async performRecoverySteps(): Promise<void> {
    // Step 1: Try to reinitialize components
    try {
      await this.componentManager.cleanupAll();
    } catch (error) {
      console.log(
        'Component cleanup during recovery failed (expected):',
        error
      );
    }

    // Step 2: Reinitialize components
    await this.componentManager.initializeAll();

    // Step 3: Reapply current configuration if available
    if (this.configFilePath) {
      try {
        await this.loadConfig(this.configFilePath);
      } catch (error) {
        console.error('Failed to reload configuration during recovery:', error);
        throw error;
      }
    }
  }

  /**
   * Override EventEmitter methods for type safety
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit<K extends keyof ProcmanDaemonEvents>(event: K, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof ProcmanDaemonEvents>(
    event: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void
  ): this {
    return super.on(event, listener);
  }
}
