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

    this.dataDirectory = new DataDirectory(process.env.PROCMAN_SOCKET_PATH);
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
   * Check if daemon is ready to handle requests
   * Performs comprehensive health checks on all components
   */
  async isReady(): Promise<boolean> {
    if (!this.isRunning()) {
      return false;
    }

    try {
      const healthCheck = await this.componentManager.performHealthChecks();
      return healthCheck.healthy;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Get detailed health status of all components
   */
  async getHealthStatus(): Promise<{
    ready: boolean;
    components: Record<
      string,
      { status: 'healthy' | 'unhealthy' | 'unknown'; message: string }
    >;
  }> {
    const healthCheck = await this.componentManager.performHealthChecks();
    return {
      ready: healthCheck.healthy && this.isRunning(),
      components: healthCheck.details,
    };
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    const startTime = Date.now();
    console.log('[DEBUG-PROCMAN-DAEMON] Starting daemon initialization...');
    console.log(
      '[DEBUG-PROCMAN-DAEMON] Current state check:',
      JSON.stringify(
        {
          currentState: this.getState(),
          canStart: this.stateManager.canStart(),
          processId: process.pid,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    if (!this.stateManager.canStart()) {
      throw new Error(
        `Cannot start daemon: current state is ${this.getState()}`
      );
    }

    console.log('[DEBUG-PROCMAN-DAEMON] Transitioning to STARTING state...');
    this.stateManager.transitionTo(DaemonState.STARTING);

    try {
      console.log(
        '[DEBUG-PROCMAN-DAEMON] Step 1: Performing environment checks...'
      );
      // Perform environment checks before any other operations
      await this.performEnvironmentChecks();
      console.log('[DEBUG-PROCMAN-DAEMON] ✓ Environment checks completed');

      console.log(
        '[DEBUG-PROCMAN-DAEMON] Step 2: Ensuring no daemon running...'
      );
      // Check for existing daemon
      await this.pidManager.ensureNoDaemonRunning();
      console.log('[DEBUG-PROCMAN-DAEMON] ✓ Daemon uniqueness verified');

      console.log(
        '[DEBUG-PROCMAN-DAEMON] Step 3: Initializing data directory...'
      );
      // Initialize data directory
      await this.dataDirectory.ensureDataDirectory();
      console.log('[DEBUG-PROCMAN-DAEMON] ✓ Data directory ready');

      console.log('[DEBUG-PROCMAN-DAEMON] Step 4: Writing PID file...');
      // Write PID file
      await this.pidManager.writePIDFile();
      console.log('[DEBUG-PROCMAN-DAEMON] ✓ PID file written');

      console.log(
        '[DEBUG-PROCMAN-DAEMON] Step 5: Setting up signal handlers...'
      );
      // Setup signal handlers
      this.signalHandler.setupHandlers();
      console.log('[DEBUG-PROCMAN-DAEMON] ✓ Signal handlers configured');

      console.log(
        '[DEBUG-PROCMAN-DAEMON] Step 6: Initializing all components...'
      );
      // Initialize components
      await this.componentManager.initializeAll();
      console.log('[DEBUG-PROCMAN-DAEMON] ✓ All components initialized');

      // Perform final readiness check with retries
      console.log(
        '[DEBUG-PROCMAN-DAEMON] Step 7: Performing final readiness verification...'
      );
      let readinessAttempts = 0;
      const maxReadinessAttempts = 10;
      const readinessCheckInterval = 500;

      console.log(
        '[DEBUG-PROCMAN-DAEMON] Readiness check parameters:',
        JSON.stringify(
          {
            maxAttempts: maxReadinessAttempts,
            intervalMs: readinessCheckInterval,
            totalMaxTimeMs: maxReadinessAttempts * readinessCheckInterval,
          },
          null,
          2
        )
      );

      while (readinessAttempts < maxReadinessAttempts) {
        const checkStartTime = Date.now();
        console.log(
          `[DEBUG-PROCMAN-DAEMON] Readiness attempt ${readinessAttempts + 1}/${maxReadinessAttempts}...`
        );

        try {
          const healthCheck = await this.componentManager.performHealthChecks();
          const checkDuration = Date.now() - checkStartTime;

          if (healthCheck.healthy) {
            console.log(
              '[DEBUG-PROCMAN-DAEMON] ✓ Readiness verification successful!'
            );
            console.log(
              '[DEBUG-PROCMAN-DAEMON] Readiness success stats:',
              JSON.stringify(
                {
                  attempts: readinessAttempts + 1,
                  checkDurationMs: checkDuration,
                  healthCheckDetails: healthCheck.details,
                },
                null,
                2
              )
            );
            console.log(
              `Daemon readiness verified after ${readinessAttempts + 1} attempts`
            );
            break;
          } else {
            console.error('[DEBUG-PROCMAN-DAEMON] ❌ Readiness check failed');
            console.error(
              '[DEBUG-PROCMAN-DAEMON] Health check failure details:',
              JSON.stringify(
                {
                  attempt: readinessAttempts + 1,
                  maxAttempts: maxReadinessAttempts,
                  checkDurationMs: checkDuration,
                  healthCheckDetails: healthCheck.details,
                },
                null,
                2
              )
            );
            console.log(
              `Readiness check ${readinessAttempts + 1}/${maxReadinessAttempts} failed:`,
              healthCheck.details
            );
            readinessAttempts++;
            if (readinessAttempts < maxReadinessAttempts) {
              console.log(
                `[DEBUG-PROCMAN-DAEMON] Waiting ${readinessCheckInterval}ms before retry...`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, readinessCheckInterval)
              );
            }
          }
        } catch (error) {
          const checkDuration = Date.now() - checkStartTime;
          console.error('[DEBUG-PROCMAN-DAEMON] ❌ Readiness check exception');
          console.error(
            '[DEBUG-PROCMAN-DAEMON] Exception details:',
            JSON.stringify(
              {
                attempt: readinessAttempts + 1,
                checkDurationMs: checkDuration,
                errorMessage:
                  error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
              },
              null,
              2
            )
          );
          console.log(
            `Readiness check ${readinessAttempts + 1}/${maxReadinessAttempts} failed with error:`,
            error
          );
          readinessAttempts++;
          if (readinessAttempts < maxReadinessAttempts) {
            await new Promise((resolve) =>
              setTimeout(resolve, readinessCheckInterval)
            );
          }
        }
      }

      if (readinessAttempts >= maxReadinessAttempts) {
        console.error(
          '[DEBUG-PROCMAN-DAEMON] ❌ Final readiness verification failed after all attempts'
        );
        console.error(
          '[DEBUG-PROCMAN-DAEMON] Readiness failure summary:',
          JSON.stringify(
            {
              totalAttempts: readinessAttempts,
              maxAttempts: maxReadinessAttempts,
              totalTimeSpentMs: readinessAttempts * readinessCheckInterval,
              currentState: this.getState(),
            },
            null,
            2
          )
        );
        throw new Error(
          'Daemon components initialized but failed final readiness verification'
        );
      }

      // All checks passed - transition to running state
      console.log(
        '[DEBUG-PROCMAN-DAEMON] Step 8: Transitioning to RUNNING state...'
      );
      this.stateManager.transitionTo(DaemonState.RUNNING);
      this.recoveryAttempts = 0; // Reset recovery counter on successful start

      const totalStartupTime = Date.now() - startTime;
      console.log(
        '[DEBUG-PROCMAN-DAEMON] ✓ DAEMON STARTUP COMPLETED SUCCESSFULLY!'
      );
      console.log(
        '[DEBUG-PROCMAN-DAEMON] Final startup stats:',
        JSON.stringify(
          {
            totalStartupTimeMs: totalStartupTime,
            currentState: this.getState(),
            processId: process.pid,
            readinessAttempts: readinessAttempts,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );

      console.log(
        'Daemon started successfully and is ready to handle requests'
      );
    } catch (error) {
      const totalStartupTime = Date.now() - startTime;
      console.error('[DEBUG-PROCMAN-DAEMON] ❌ DAEMON STARTUP FAILED');
      console.error(
        '[DEBUG-PROCMAN-DAEMON] Startup failure stats:',
        JSON.stringify(
          {
            totalStartupTimeMs: totalStartupTime,
            currentState: this.getState(),
            processId: process.pid,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
          null,
          2
        )
      );

      this.stateManager.forceError();

      console.log('[DEBUG-PROCMAN-DAEMON] Performing startup cleanup...');
      // Cleanup on startup failure with better error handling
      await this.performStartupCleanup();
      console.log('[DEBUG-PROCMAN-DAEMON] Startup cleanup completed');

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
   * Perform environment checks before daemon startup
   */
  private async performEnvironmentChecks(): Promise<void> {
    // Check 1: Verify HOME environment variable is set
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      // Try to detect home directory using os.homedir()
      try {
        const os = await import('os');
        const detectedHome = os.homedir();
        if (!detectedHome) {
          throw new Error(
            'HOME environment variable is not set and could not detect home directory'
          );
        }
        // Set HOME for this process and child processes
        process.env.HOME = detectedHome;
        console.log(
          `HOME environment variable was missing, set to: ${detectedHome}`
        );
      } catch (error) {
        throw new Error(
          `Failed to determine home directory: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Check 2: Verify data directory path can be resolved
    try {
      const resolvedPath = this.dataDirectory.resolveDataDir();
      if (!resolvedPath || resolvedPath.includes('~')) {
        throw new Error(
          `Failed to expand socket path: ${resolvedPath}. HOME environment variable may not be set.`
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to resolve data directory path: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Check 3: Verify socket path can be resolved
    try {
      const socketPath = await this.dataDirectory.getSocketPath();
      if (!socketPath) {
        throw new Error('Failed to resolve socket path');
      }

      // On Unix systems, verify the path doesn't contain unresolved ~ characters
      if (process.platform !== 'win32' && socketPath.includes('~')) {
        throw new Error(`Socket path contains unresolved tilde: ${socketPath}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to resolve socket path: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Check 4: Verify we can create the data directory (dry run check)
    try {
      await this.dataDirectory.validateDataDirectory();
      // If validation passes, directory already exists with correct permissions
    } catch {
      // Directory doesn't exist or has wrong permissions - that's OK, we'll create it later
      // But we should verify we have permission to create it
      const path = await import('path');
      const fs = await import('fs');
      const parentDir = path.dirname(this.dataDirectory.getDataDir());
      try {
        await fs.promises.access(parentDir, fs.constants.W_OK);
      } catch (accessError) {
        throw new Error(
          `Cannot write to parent directory ${parentDir}: ${accessError instanceof Error ? accessError.message : 'Permission denied'}`
        );
      }
    }

    // Check 5: Verify basic Node.js runtime environment
    if (!process.pid) {
      throw new Error('Invalid process environment: PID not available');
    }

    // Check 6: Verify required modules can be loaded
    try {
      await import('fs');
      await import('path');
      await import('os');
    } catch (error) {
      throw new Error(
        `Failed to load required Node.js modules: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    console.log('Environment checks passed successfully');
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
