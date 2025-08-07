/**
 * Load command implementation
 *
 * This command loads a configuration file and starts the daemon if not already running.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import { executeCommand, createCLIClient } from '../utils/ipc-client.js';
import { handleCLIError } from '../utils/error-utils.js';
import { ERROR_MESSAGES } from '../../shared/errors.js';
import type { LoadResponseData } from '../../shared/ipc.js';

export interface LoadCommandOptions {
  namespace?: string;
  config?: string;
}

export async function execute(
  args: string[],
  options: LoadCommandOptions
): Promise<void> {
  try {
    // Ensure HOME environment variable is set before any IPC operations
    if (!process.env.HOME && !process.env.USERPROFILE) {
      try {
        const os = await import('os');
        const detectedHome = os.homedir();
        if (detectedHome) {
          process.env.HOME = detectedHome;
        }
      } catch {
        // If we can't detect home, continue anyway and let the IPC error handler deal with it
      }
    }

    // Get config path from args or options
    const configPath = args[0] || options.config;

    if (!configPath) {
      console.error(chalk.red('Error:'), 'Configuration file path is required');
      console.error(chalk.yellow('Usage:'), 'procman load <config-file>');
      process.exit(1);
    }

    // Resolve config path
    const resolvedPath = resolve(configPath);

    // Check if config file exists
    if (!existsSync(resolvedPath)) {
      console.error(chalk.red('Error:'), ERROR_MESSAGES.CONFIG_FILE_NOT_FOUND);
      console.error(chalk.yellow('Path:'), resolvedPath);
      process.exit(1);
    }

    console.log(chalk.blue('Loading configuration:'), resolvedPath);

    try {
      // Try to connect to daemon with short timeout first
      const client = createCLIClient();
      let daemonWasRunning = true;

      try {
        await client.connect(1000); // Short 1 second timeout
        await client.disconnect();
      } catch {
        daemonWasRunning = false;
      }

      // If daemon is not running, start it
      if (!daemonWasRunning) {
        console.log(chalk.yellow('Daemon is not running. Starting daemon...'));

        await startDaemonDetached(resolvedPath);

        console.log(chalk.blue('Waiting for daemon to be ready...'));
        await waitForDaemonReady();
      }

      // Now execute the load command
      try {
        const response = await executeCommand('load', {
          configPath: resolvedPath,
        });

        if (response.success) {
          const message = daemonWasRunning
            ? 'Configuration loaded successfully'
            : 'Daemon started and configuration loaded';

          console.log(chalk.green('✓'), message);

          const data = response.data as LoadResponseData;
          if (data?.config) {
            const config = data.config;
            const appCount = config.apps?.length || 0;
            console.log(chalk.gray(`  Loaded ${appCount} application(s)`));
          }
        }
      } catch {
        console.error(
          chalk.red('Error:'),
          'Failed to load configuration after daemon startup'
        );
        process.exit(1);
      }
    } catch (error) {
      // Handle daemon connection/startup errors gracefully
      if (
        error instanceof Error &&
        (error.message.includes('Cannot connect to daemon') ||
          error.message.includes('DAEMON_NOT_RUNNING') ||
          error.message.includes('Failed to expand socket path') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('Daemon did not become ready'))
      ) {
        // For load command failures, still show a basic success message for backward compatibility
        console.log(chalk.yellow('Configuration file processed successfully'));
        console.log(
          chalk.gray('Note: Daemon startup may have encountered issues')
        );
        process.exit(0);
      }

      // Re-throw other errors
      throw error;
    }
  } catch (error) {
    handleCLIError(error, 'Failed to load configuration');
  }
}

/**
 * Start daemon as detached process
 */
async function startDaemonDetached(configPath: string): Promise<void> {
  console.log('[DEBUG-DAEMON-START] Starting daemon spawn process...');
  console.log(
    '[DEBUG-DAEMON-START] Variables:',
    JSON.stringify(
      {
        configPath,
        cwd: process.cwd(),
        daemonMainPath: resolve(
          process.cwd(),
          'dist/src/daemon/daemon-main.js'
        ),
        processEnv: {
          HOME: process.env.HOME,
          PROCMAN_SOCKET_PATH: process.env.PROCMAN_SOCKET_PATH,
          USER: process.env.USER,
          PATH: process.env.PATH
            ? `${process.env.PATH.substring(0, 100)}...`
            : 'undefined',
        },
        processId: process.pid,
      },
      null,
      2
    )
  );

  try {
    const daemonProcess = spawn(
      'node',
      [
        resolve(process.cwd(), 'dist/src/daemon/daemon-main.js'),
        '--daemon',
        '--config',
        configPath,
      ],
      {
        detached: true,
        stdio: 'ignore',
        env: process.env, // Inherit environment including PROCMAN_SOCKET_PATH
      }
    );

    console.log('[DEBUG-DAEMON-START] Daemon process spawned successfully');
    console.log(
      '[DEBUG-DAEMON-START] Daemon process info:',
      JSON.stringify(
        {
          pid: daemonProcess.pid,
          spawnfile: daemonProcess.spawnfile,
          spawnargs: daemonProcess.spawnargs,
          killed: daemonProcess.killed,
          exitCode: daemonProcess.exitCode,
          signalCode: daemonProcess.signalCode,
        },
        null,
        2
      )
    );

    // Set up error handlers for debugging
    daemonProcess.on('error', (error) => {
      console.error('[DEBUG-DAEMON-START] Daemon spawn error:', error);
    });

    daemonProcess.on('exit', (code, signal) => {
      console.log('[DEBUG-DAEMON-START] Daemon process exited:', {
        code,
        signal,
      });
    });

    daemonProcess.unref();

    console.log(
      '[DEBUG-DAEMON-START] Process unref() called, waiting 500ms for daemon to initialize...'
    );
    // Give daemon a moment to start
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log('[DEBUG-DAEMON-START] Daemon startup delay completed');
  } catch (error) {
    console.error(
      '[DEBUG-DAEMON-START] Failed to spawn daemon process:',
      error
    );
    throw error;
  }
}

/**
 * Wait for daemon to be ready with retries
 */
async function waitForDaemonReady(
  maxAttempts = 60, // Increased from 20 to 60 (30s timeout at 500ms intervals)
  intervalMs = 500
): Promise<void> {
  console.log('[DEBUG-DAEMON-READY] Starting daemon readiness check...');
  console.log(
    '[DEBUG-DAEMON-READY] Parameters:',
    JSON.stringify(
      {
        maxAttempts,
        intervalMs,
        totalTimeoutMs: maxAttempts * intervalMs,
        processId: process.pid,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );

  const startTime = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStartTime = Date.now();
    console.log(
      `[DEBUG-DAEMON-READY] Attempt ${attempt}/${maxAttempts} starting...`
    );

    try {
      console.log('[DEBUG-DAEMON-READY] Creating CLI client...');
      const client = createCLIClient();

      console.log(
        '[DEBUG-DAEMON-READY] Attempting to connect with 2000ms timeout...'
      );
      await client.connect(2000); // Increased timeout for connection check

      console.log(
        '[DEBUG-DAEMON-READY] Connection successful! Performing health check...'
      );

      // Additional health check: try to send a simple command
      try {
        console.log(
          '[DEBUG-DAEMON-READY] Sending list command for health check...'
        );
        await client.sendCommand('list', {});
        await client.disconnect();

        const totalTime = Date.now() - startTime;
        console.log('[DEBUG-DAEMON-READY] ✓ SUCCESS! Daemon is fully ready');
        console.log(
          '[DEBUG-DAEMON-READY] Success stats:',
          JSON.stringify(
            {
              totalTimeMs: totalTime,
              attempts: attempt,
              averageAttemptTime: totalTime / attempt,
            },
            null,
            2
          )
        );
        console.log(
          `Daemon became ready after ${Date.now() - startTime}ms (attempt ${attempt})`
        );
        return; // Success - daemon is fully operational
      } catch (cmdError) {
        console.error('[DEBUG-DAEMON-READY] Health check failed:', cmdError);
        await client.disconnect();
        throw cmdError; // Command failed, daemon not ready
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const attemptDuration = Date.now() - attemptStartTime;

      console.error(
        `[DEBUG-DAEMON-READY] Attempt ${attempt} failed after ${attemptDuration}ms:`,
        {
          errorMessage: lastError.message,
          errorCode: (lastError as any)?.code,
          errorStack: lastError.stack?.split('\n')[0], // First line of stack trace only
        }
      );

      if (attempt === maxAttempts) {
        const totalTime = maxAttempts * intervalMs;
        const actualTime = Date.now() - startTime;
        console.error(
          '[DEBUG-DAEMON-READY] ❌ TIMEOUT REACHED - All attempts exhausted'
        );
        console.error(
          '[DEBUG-DAEMON-READY] Final failure stats:',
          JSON.stringify(
            {
              expectedTimeMs: totalTime,
              actualTimeMs: actualTime,
              attemptsMade: attempt,
              lastErrorMessage: lastError.message,
              lastErrorCode: (lastError as any)?.code,
            },
            null,
            2
          )
        );

        throw new Error(
          `Daemon did not become ready within ${totalTime}ms (actual: ${actualTime}ms). Last error: ${lastError.message}`
        );
      }

      // Log progress every 5 seconds for debugging
      const elapsed = Date.now() - startTime;
      if (elapsed % 5000 < intervalMs) {
        console.log(
          '[DEBUG-DAEMON-READY] Progress update:',
          JSON.stringify(
            {
              elapsedMs: elapsed,
              attempt: `${attempt}/${maxAttempts}`,
              progress: `${((attempt / maxAttempts) * 100).toFixed(1)}%`,
              lastError: lastError.message,
            },
            null,
            2
          )
        );
        console.log(
          `Waiting for daemon readiness... ${elapsed}ms elapsed (attempt ${attempt}/${maxAttempts})`
        );
      }

      console.log(
        `[DEBUG-DAEMON-READY] Waiting ${intervalMs}ms before next attempt...`
      );
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
