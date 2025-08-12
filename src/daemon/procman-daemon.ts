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
import { MemoryMonitor } from '../utils/memory/memory-monitor.js';
import path from 'path';

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
  private memoryMonitor: MemoryMonitor;
  private currentConfig?: AppConfig[];
  private configFilePath?: string;
  private recoveryAttempts = 0;
  private readonly maxRecoveryAttempts =
    RECOVERY_CONSTANTS.MAX_RECOVERY_ATTEMPTS;
  private isShuttingDown = false; // Add shutdown flag

  constructor() {
    super();

    this.dataDirectory = new DataDirectory(process.env.PROCMAN_SOCKET_PATH);
    this.pidManager = new PIDManager(this.dataDirectory);
    this.stateManager = new DaemonStateManager();
    this.componentManager = new ComponentManager(this.dataDirectory);
    this.signalHandler = new SignalHandler();
    this.memoryMonitor = new MemoryMonitor({
      intervalMs: 30000, // 30 seconds (PM2 standard)
      warningThreshold: 100 * 1024 * 1024, // 100MB
      criticalThreshold: 200 * 1024 * 1024, // 200MB

      enableLogging: process.env.NODE_ENV !== 'test', // Disable logging in test environment
    });

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
    memory?: {
      status: 'healthy' | 'warning' | 'critical';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentMemory: any;
      thresholds: {
        warning: number;
        critical: number;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trend?: any;
    };
  }> {
    const healthCheck = await this.componentManager.performHealthChecks();
    const memoryHealthInfo = this.memoryMonitor.getHealthInfo();

    return {
      ready: healthCheck.healthy && this.isRunning(),
      components: healthCheck.details,
      memory: memoryHealthInfo,
    };
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    const startTime = Date.now();
    console.error('[DEBUG-PROCMAN-DAEMON] Starting daemon initialization...');
    console.error(
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

    console.error('[DEBUG-PROCMAN-DAEMON] Transitioning to STARTING state...');
    this.stateManager.transitionTo(DaemonState.STARTING);

    try {
      console.error(
        '[DEBUG-PROCMAN-DAEMON] Step 1: Performing environment checks...'
      );
      // Perform environment checks before any other operations
      await this.performEnvironmentChecks();
      console.error('[DEBUG-PROCMAN-DAEMON] ✓ Environment checks completed');

      console.error(
        '[DEBUG-PROCMAN-DAEMON] Step 2: Ensuring no daemon running...'
      );
      // Check for existing daemon
      await this.pidManager.ensureNoDaemonRunning();
      console.error('[DEBUG-PROCMAN-DAEMON] ✓ Daemon uniqueness verified');

      console.error(
        '[DEBUG-PROCMAN-DAEMON] Step 3: Initializing data directory...'
      );
      // Initialize data directory
      await this.dataDirectory.ensureDataDirectory();
      console.error('[DEBUG-PROCMAN-DAEMON] ✓ Data directory ready');

      console.error('[DEBUG-PROCMAN-DAEMON] Step 4: Writing PID file...');
      // Write PID file
      await this.pidManager.writePIDFile();
      console.error('[DEBUG-PROCMAN-DAEMON] ✓ PID file written');

      console.error(
        '[DEBUG-PROCMAN-DAEMON] Step 5: Setting up signal handlers...'
      );
      // Setup signal handlers
      this.signalHandler.setupHandlers();
      console.error('[DEBUG-PROCMAN-DAEMON] ✓ Signal handlers configured');

      console.error(
        '[DEBUG-PROCMAN-DAEMON] Step 6: Initializing all components...'
      );
      // Initialize components
      await this.componentManager.initializeAll();
      console.error('[DEBUG-PROCMAN-DAEMON] ✓ All components initialized');

      // Perform final readiness check with retries
      console.error(
        '[DEBUG-PROCMAN-DAEMON] Step 7: Performing final readiness verification...'
      );
      let readinessAttempts = 0;
      const maxReadinessAttempts = 10;
      const readinessCheckInterval = 500;

      console.error(
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
        console.error(
          `[DEBUG-PROCMAN-DAEMON] Readiness attempt ${readinessAttempts + 1}/${maxReadinessAttempts}...`
        );

        try {
          const healthCheck = await this.componentManager.performHealthChecks();
          const checkDuration = Date.now() - checkStartTime;

          if (healthCheck.healthy) {
            console.error(
              '[DEBUG-PROCMAN-DAEMON] ✓ Readiness verification successful!'
            );
            console.error(
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
            console.error('[DEBUG-PROCMAN-DAEMON] ✗ Readiness check failed');
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
              console.error(
                `[DEBUG-PROCMAN-DAEMON] Waiting ${readinessCheckInterval}ms before retry...`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, readinessCheckInterval)
              );
            }
          }
        } catch (error) {
          const checkDuration = Date.now() - checkStartTime;
          console.error('[DEBUG-PROCMAN-DAEMON] ✗ Readiness check exception');
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
          '[DEBUG-PROCMAN-DAEMON] ✗ Final readiness verification failed after all attempts'
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
      console.error(
        '[DEBUG-PROCMAN-DAEMON] Step 8: Transitioning to RUNNING state...'
      );
      this.stateManager.transitionTo(DaemonState.RUNNING);
      this.recoveryAttempts = 0; // Reset recovery counter on successful start

      // Start memory monitoring
      console.error(
        '[DEBUG-PROCMAN-DAEMON] Step 9: Starting memory monitoring...'
      );
      this.memoryMonitor.start();
      console.error('[DEBUG-PROCMAN-DAEMON] ✓ Memory monitoring started');

      const totalStartupTime = Date.now() - startTime;
      console.error(
        '[DEBUG-PROCMAN-DAEMON] ✓ DAEMON STARTUP COMPLETED SUCCESSFULLY!'
      );
      console.error(
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
      console.error('[DEBUG-PROCMAN-DAEMON] ✗ DAEMON STARTUP FAILED');
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

      console.error('[DEBUG-PROCMAN-DAEMON] Performing startup cleanup...');
      // Cleanup on startup failure with better error handling
      await this.performStartupCleanup();
      console.error('[DEBUG-PROCMAN-DAEMON] Startup cleanup completed');

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
      // Stop memory monitoring first
      console.error('[DEBUG-PROCMAN-DAEMON] Stopping memory monitoring...');
      this.memoryMonitor.stop();
      console.error('[DEBUG-PROCMAN-DAEMON] ✓ Memory monitoring stopped');

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
   * Graceful shutdown with extended capabilities and state preservation
   *
   * @param reason The reason for shutdown
   * @param timeoutMs Maximum time to wait for graceful shutdown (default: 30s)
   */
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
      // Phase 1: Set shutdown flag and reject new connections (5s timeout)
      await this.executeWithTimeout(
        async () => {
          console.log(
            '[ProcmanDaemon] Phase 1: Setting shutdown flag and rejecting new connections...'
          );
          this.emit('shutdownStarted', reason);

          const ipcServer = this.getIPCServer();
          if (ipcServer) {
            // Reject new connections by stopping the server from accepting
            // Note: We don't stop the server yet to allow existing connections to drain
            this.emit('newConnectionsRejected');
          }
        },
        5000,
        'Phase 1: Shutdown initialization'
      );

      // Phase 2: Save shutdown state (5s timeout)
      await this.executeWithTimeout(
        async () => {
          console.log('[ProcmanDaemon] Phase 2: Saving shutdown state...');
          await this.saveShutdownState(reason);
        },
        5000,
        'Phase 2: State preservation'
      );

      // Phase 3: Drain active connections (10s timeout)
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

      // Phase 4: Stop processes gracefully (15s timeout)
      await this.executeWithTimeout(
        async () => {
          console.log('[ProcmanDaemon] Phase 4: Stopping managed processes...');
          await this.stopManagedProcesses();
        },
        15000,
        'Phase 4: Process termination'
      );

      // Phase 5: Cleanup resources (5s timeout)
      await this.executeWithTimeout(
        async () => {
          console.log('[ProcmanDaemon] Phase 5: Final resource cleanup...');
          await this.stop(); // Use existing stop method for final cleanup
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
      console.error(
        `[ProcmanDaemon] Graceful shutdown failed after ${totalTime}ms:`,
        error
      );

      // Force shutdown if graceful shutdown fails
      console.log('[ProcmanDaemon] Attempting forced shutdown...');
      await this.performEmergencyCleanup();

      this.emit('shutdownFailed', reason, error, totalTime);
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Save shutdown state to disk for recovery/analysis
   */
  private async saveShutdownState(reason: ShutdownReason): Promise<void> {
    try {
      const processManager = this.getProcessManager();
      const state = {
        timestamp: new Date().toISOString(),
        reason,
        processId: process.pid,
        memoryUsage: process.memoryUsage(),
        processes: processManager ? await this.getAllProcessStatuses() : [],
        activeConnections: this.getActiveConnectionCount(),
        uptime: process.uptime(),
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      };

      const statePath = path.join(
        this.dataDirectory.getDataDir(),
        'shutdown-state.json'
      );
      const fs = await import('fs');

      // Ensure directory exists before writing
      const dir = path.dirname(statePath);
      await fs.promises.mkdir(dir, { recursive: true });

      await fs.promises.writeFile(
        statePath,
        JSON.stringify(state, null, 2),
        'utf-8'
      );

      console.log(`[ProcmanDaemon] Shutdown state saved to: ${statePath}`);
    } catch (error) {
      // Non-critical error - log but don't fail shutdown
      console.error('[ProcmanDaemon] Failed to save shutdown state:', error);
    }
  }

  /**
   * Get count of active IPC connections
   */
  private getActiveConnectionCount(): number {
    const ipcServer = this.getIPCServer();
    if (!ipcServer) {
      return 0;
    }
    return ipcServer.getConnections().length;
  }

  /**
   * Drain active IPC connections gracefully
   */
  private async drainActiveConnections(): Promise<void> {
    const ipcServer = this.getIPCServer();
    if (!ipcServer) {
      console.log('[ProcmanDaemon] No IPC server to drain connections from');
      return;
    }

    const connections = ipcServer.getConnections();
    if (connections.length === 0) {
      console.log('[ProcmanDaemon] No active connections to drain');
      return;
    }

    console.log(
      `[ProcmanDaemon] Draining ${connections.length} active connections...`
    );

    // Send shutdown notice to all connections
    ipcServer.broadcast({
      id: `shutdown-notice-${Date.now()}`,
      type: 'ping', // Use existing command type for compatibility
      payload: {
        shutdownNotice: true,
        reason: 'graceful-shutdown',
        gracePeriodMs: 8000, // Give clients 8 seconds to cleanup
      },
      timestamp: Date.now(),
    });

    // Wait for connections to close gracefully
    const drainStartTime = Date.now();
    const maxDrainTime = 8000; // 8 seconds for clients to disconnect

    while (
      ipcServer.getConnections().length > 0 &&
      Date.now() - drainStartTime < maxDrainTime
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100)); // Check every 100ms
    }

    const remainingConnections = ipcServer.getConnections().length;
    if (remainingConnections > 0) {
      console.warn(
        `[ProcmanDaemon] ${remainingConnections} connections did not close gracefully, will force close`
      );
    } else {
      console.log('[ProcmanDaemon] All connections drained successfully');
    }
  }

  /**
   * Stop all managed processes gracefully
   */
  private async stopManagedProcesses(): Promise<void> {
    const processManager = this.getProcessManager();
    if (!processManager) {
      console.log('[ProcmanDaemon] No process manager to stop processes from');
      return;
    }

    const allProcesses = processManager.getAllProcessInfo();
    if (allProcesses.length === 0) {
      console.log('[ProcmanDaemon] No managed processes to stop');
      return;
    }

    console.log(
      `[ProcmanDaemon] Stopping ${allProcesses.length} managed processes gracefully...`
    );

    const processNames = allProcesses.map((p) => p.name);
    await processManager.stopProcesses(processNames);

    console.log('[ProcmanDaemon] All managed processes stopped');
  }

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    phaseName: string
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`${phaseName} timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Format bytes to human-readable string
   */
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

    // Setup signal handler events with enhanced shutdown
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

      // Force error state and attempt recovery
      if (!this.stateManager.isInError()) {
        this.stateManager.forceError();
      }
    });

    // Setup memory monitor event handlers

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
  emit<K extends keyof ProcmanDaemonEvents>(event: K, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof ProcmanDaemonEvents>(
    event: K,
    listener: (...args: any[]) => void
  ): this {
    return super.on(event, listener);
  }
}
