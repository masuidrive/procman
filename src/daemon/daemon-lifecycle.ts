/**
 * Daemon lifecycle management - startup, shutdown, restart, and recovery
 *
 * Contains the implementation of lifecycle methods for ProcmanDaemon.
 * These functions accept a daemon context object to access internal state.
 */

import { DaemonState } from './daemon-state-manager.js';
import type { DaemonContext } from './daemon-types.js';

const debugLog = process.env.DEBUG_PROCMAN
  ? (...args: unknown[]) => console.error(...args)
  : () => {};

/**
 * Recovery constants
 */
const RECOVERY_CONSTANTS = {
  MAX_RECOVERY_ATTEMPTS: 3,
  RECOVERY_DELAY_MS: 5000,
} as const;

export { RECOVERY_CONSTANTS };

/**
 * Start the daemon - performs environment checks, initializes components,
 * and transitions to RUNNING state.
 */
export async function performStart(ctx: DaemonContext): Promise<void> {
  const startTime = Date.now();
  debugLog('[DEBUG-PROCMAN-DAEMON] Starting daemon initialization...');
  debugLog(
    '[DEBUG-PROCMAN-DAEMON] Current state check:',
    JSON.stringify(
      {
        currentState: ctx.stateManager.getCurrentState(),
        canStart: ctx.stateManager.canStart(),
        processId: process.pid,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );

  if (!ctx.stateManager.canStart()) {
    throw new Error(
      `Cannot start daemon: current state is ${ctx.stateManager.getCurrentState()}`
    );
  }

  debugLog('[DEBUG-PROCMAN-DAEMON] Transitioning to STARTING state...');
  ctx.stateManager.transitionTo(DaemonState.STARTING);

  try {
    debugLog('[DEBUG-PROCMAN-DAEMON] Step 1: Performing environment checks...');
    await performEnvironmentChecks(ctx);
    debugLog('[DEBUG-PROCMAN-DAEMON] ✓ Environment checks completed');

    debugLog('[DEBUG-PROCMAN-DAEMON] Step 2: Ensuring no daemon running...');
    await ctx.pidManager.ensureNoDaemonRunning();
    debugLog('[DEBUG-PROCMAN-DAEMON] ✓ Daemon uniqueness verified');

    debugLog('[DEBUG-PROCMAN-DAEMON] Step 3: Initializing data directory...');
    await ctx.dataDirectory.ensureDataDirectory();
    debugLog('[DEBUG-PROCMAN-DAEMON] ✓ Data directory ready');

    debugLog('[DEBUG-PROCMAN-DAEMON] Step 4: Writing PID file...');
    await ctx.pidManager.writePIDFile();
    debugLog('[DEBUG-PROCMAN-DAEMON] ✓ PID file written');

    debugLog('[DEBUG-PROCMAN-DAEMON] Step 5: Setting up signal handlers...');
    ctx.signalHandler.setupHandlers();
    debugLog('[DEBUG-PROCMAN-DAEMON] ✓ Signal handlers configured');

    debugLog('[DEBUG-PROCMAN-DAEMON] Step 6: Initializing all components...');
    await ctx.componentManager.initializeAll();
    debugLog('[DEBUG-PROCMAN-DAEMON] ✓ All components initialized');

    // Perform final readiness check with retries
    debugLog(
      '[DEBUG-PROCMAN-DAEMON] Step 7: Performing final readiness verification...'
    );
    let readinessAttempts = 0;
    const maxReadinessAttempts = 10;
    const readinessCheckInterval = 500;

    debugLog(
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
      debugLog(
        `[DEBUG-PROCMAN-DAEMON] Readiness attempt ${readinessAttempts + 1}/${maxReadinessAttempts}...`
      );

      try {
        const healthCheck = await ctx.componentManager.performHealthChecks();
        const checkDuration = Date.now() - checkStartTime;

        if (healthCheck.healthy) {
          debugLog(
            '[DEBUG-PROCMAN-DAEMON] ✓ Readiness verification successful!'
          );
          debugLog(
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
          debugLog('[DEBUG-PROCMAN-DAEMON] ✗ Readiness check failed');
          debugLog(
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
            debugLog(
              `[DEBUG-PROCMAN-DAEMON] Waiting ${readinessCheckInterval}ms before retry...`
            );
            await new Promise((resolve) =>
              setTimeout(resolve, readinessCheckInterval)
            );
          }
        }
      } catch (error) {
        const checkDuration = Date.now() - checkStartTime;
        debugLog('[DEBUG-PROCMAN-DAEMON] ✗ Readiness check exception');
        debugLog(
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
      debugLog(
        '[DEBUG-PROCMAN-DAEMON] ✗ Final readiness verification failed after all attempts'
      );
      debugLog(
        '[DEBUG-PROCMAN-DAEMON] Readiness failure summary:',
        JSON.stringify(
          {
            totalAttempts: readinessAttempts,
            maxAttempts: maxReadinessAttempts,
            totalTimeSpentMs: readinessAttempts * readinessCheckInterval,
            currentState: ctx.stateManager.getCurrentState(),
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
    debugLog(
      '[DEBUG-PROCMAN-DAEMON] Step 8: Transitioning to RUNNING state...'
    );
    ctx.stateManager.transitionTo(DaemonState.RUNNING);
    ctx.recoveryAttempts = 0; // Reset recovery counter on successful start

    // Start memory monitoring
    debugLog('[DEBUG-PROCMAN-DAEMON] Step 9: Starting memory monitoring...');
    ctx.memoryMonitor.start();
    debugLog('[DEBUG-PROCMAN-DAEMON] ✓ Memory monitoring started');

    const totalStartupTime = Date.now() - startTime;
    debugLog('[DEBUG-PROCMAN-DAEMON] ✓ DAEMON STARTUP COMPLETED SUCCESSFULLY!');
    debugLog(
      '[DEBUG-PROCMAN-DAEMON] Final startup stats:',
      JSON.stringify(
        {
          totalStartupTimeMs: totalStartupTime,
          currentState: ctx.stateManager.getCurrentState(),
          processId: process.pid,
          readinessAttempts: readinessAttempts,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    console.log('Daemon started successfully and is ready to handle requests');
  } catch (error) {
    const totalStartupTime = Date.now() - startTime;
    debugLog('[DEBUG-PROCMAN-DAEMON] ✗ DAEMON STARTUP FAILED');
    debugLog(
      '[DEBUG-PROCMAN-DAEMON] Startup failure stats:',
      JSON.stringify(
        {
          totalStartupTimeMs: totalStartupTime,
          currentState: ctx.stateManager.getCurrentState(),
          processId: process.pid,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        null,
        2
      )
    );

    ctx.stateManager.forceError();

    debugLog('[DEBUG-PROCMAN-DAEMON] Performing startup cleanup...');
    await performStartupCleanup(ctx);
    debugLog('[DEBUG-PROCMAN-DAEMON] Startup cleanup completed');

    throw error;
  }
}

/**
 * Stop the daemon - cleans up components, signal handlers, and PID file.
 */
export async function performStop(ctx: DaemonContext): Promise<void> {
  if (!ctx.stateManager.canStop()) {
    throw new Error(
      `Cannot stop daemon: current state is ${ctx.stateManager.getCurrentState()}`
    );
  }

  ctx.stateManager.transitionTo(DaemonState.STOPPING);

  try {
    // Stop memory monitoring first
    debugLog('[DEBUG-PROCMAN-DAEMON] Stopping memory monitoring...');
    ctx.memoryMonitor.stop();
    debugLog('[DEBUG-PROCMAN-DAEMON] ✓ Memory monitoring stopped');

    // Stop components with proper error handling
    await ctx.componentManager.cleanupAll();

    // Remove signal handlers
    ctx.signalHandler.cleanupHandlers();

    // Clean up PID file
    await ctx.pidManager.cleanup();

    ctx.stateManager.transitionTo(DaemonState.STOPPED);
  } catch (error) {
    ctx.stateManager.forceError();

    // Still try to cleanup critical resources
    await performEmergencyCleanup(ctx);

    throw error;
  }
}

/**
 * Attempt error recovery
 */
export async function performAttemptRecovery(
  ctx: DaemonContext,
  emitFn: (event: string, ...args: unknown[]) => void,
  loadConfigFn: (path: string) => Promise<unknown>
): Promise<boolean> {
  if (!ctx.stateManager.isInError()) {
    return true; // Already recovered
  }

  if (ctx.recoveryAttempts >= RECOVERY_CONSTANTS.MAX_RECOVERY_ATTEMPTS) {
    emitFn('recoveryFailed', new Error('Maximum recovery attempts exceeded'));
    return false;
  }

  ctx.recoveryAttempts++;
  emitFn('recoveryStarted');

  try {
    ctx.stateManager.beginRecovery();

    // Perform recovery steps
    await performRecoverySteps(ctx, loadConfigFn);

    ctx.stateManager.completeRecovery();
    emitFn('recoveryCompleted');

    return true;
  } catch (error) {
    ctx.stateManager.failRecovery();
    emitFn('recoveryFailed', error as Error);

    // Wait before next attempt
    await new Promise((resolve) =>
      setTimeout(resolve, RECOVERY_CONSTANTS.RECOVERY_DELAY_MS)
    );

    return false;
  }
}

/**
 * Perform environment checks before daemon startup
 */
async function performEnvironmentChecks(ctx: DaemonContext): Promise<void> {
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
    const resolvedPath = ctx.dataDirectory.resolveDataDir();
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
    const socketPath = await ctx.dataDirectory.getSocketPath();
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
    await ctx.dataDirectory.validateDataDirectory();
    // If validation passes, directory already exists with correct permissions
  } catch {
    // Directory doesn't exist or has wrong permissions - that's OK, we'll create it later
    // But we should verify we have permission to create it
    const path = await import('path');
    const fs = await import('fs');
    const parentDir = path.dirname(ctx.dataDirectory.getDataDir());
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
 * Perform startup cleanup on failure
 */
export async function performStartupCleanup(ctx: DaemonContext): Promise<void> {
  const cleanupTasks: Promise<void>[] = [];

  // Cleanup PID file
  cleanupTasks.push(
    ctx.pidManager.cleanup().catch((error) => {
      debugLog('Failed to cleanup PID file during startup failure:', error);
    })
  );

  // Cleanup signal handlers
  try {
    ctx.signalHandler.cleanupHandlers();
  } catch (error) {
    debugLog(
      'Failed to cleanup signal handlers during startup failure:',
      error
    );
  }

  // Cleanup any partially initialized components
  cleanupTasks.push(
    ctx.componentManager.cleanupAll().catch((error) => {
      debugLog('Failed to cleanup components during startup failure:', error);
    })
  );

  // Wait for all cleanup tasks to complete
  await Promise.all(cleanupTasks);
}

/**
 * Perform emergency cleanup when normal stop fails
 */
export async function performEmergencyCleanup(
  ctx: DaemonContext
): Promise<void> {
  console.log('Performing emergency cleanup...');

  // Try to cleanup critical resources without throwing errors
  try {
    await ctx.pidManager.cleanup();
  } catch (error) {
    console.error('Emergency PID cleanup failed:', error);
  }

  try {
    ctx.signalHandler.cleanupHandlers();
  } catch (error) {
    console.error('Emergency signal handler cleanup failed:', error);
  }
}

/**
 * Perform recovery steps when in RECOVERING state
 */
async function performRecoverySteps(
  ctx: DaemonContext,
  loadConfigFn: (path: string) => Promise<unknown>
): Promise<void> {
  // Step 1: Try to reinitialize components
  try {
    await ctx.componentManager.cleanupAll();
  } catch (error) {
    console.log('Component cleanup during recovery failed (expected):', error);
  }

  // Step 2: Reinitialize components
  await ctx.componentManager.initializeAll();

  // Step 3: Reapply current configuration if available
  if (ctx.configFilePath) {
    try {
      await loadConfigFn(ctx.configFilePath);
    } catch (error) {
      console.error('Failed to reload configuration during recovery:', error);
      throw error;
    }
  }
}
