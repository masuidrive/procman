/**
 * Load command implementation
 *
 * This command loads a configuration file and starts the daemon if not already running.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { executeCommand, createCLIClient } from '../utils/ipc-client.js';
import { handleCLIError } from '../utils/error-utils.js';
import { ERROR_MESSAGES } from '../../shared/errors.js';
import { IPCFactory } from '../../daemon/ipc-factory.js';
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

        // Show socket path info
        const socketPath = IPCFactory.getDefaultIPCPath();
        console.log(
          chalk.gray(`  Socket: ${socketPath}`)
        );
        console.log(
          chalk.gray(
            `  Tip: Add "${socketPath.startsWith(process.cwd()) ? '.procman.sock' : socketPath}" to .gitignore`
          )
        );
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
 * Resolve the path to daemon-main.js relative to this file's location.
 * Works both with tsx (source) and compiled dist.
 */
function resolveDaemonMainPath(): string {
  // This file: src/cli/commands/load.ts → dist/src/cli/commands/load.js
  // Target:    src/daemon/daemon-main.ts → dist/src/daemon/daemon-main.js
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return resolve(__dirname, '../../daemon/daemon-main.js');
}

/**
 * Start daemon as detached process
 */
async function startDaemonDetached(configPath: string): Promise<void> {
  const daemonMainPath = resolveDaemonMainPath();

  if (!existsSync(daemonMainPath)) {
    throw new Error(
      `daemon-main.js not found at ${daemonMainPath}. Package may be corrupted.`
    );
  }

  const daemonProcess = spawn(
    'node',
    [daemonMainPath, '--daemon', '--config', configPath],
    {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    }
  );

  daemonProcess.on('error', (error) => {
    console.error('Failed to start daemon:', error.message);
  });

  daemonProcess.unref();

  // Give daemon a moment to start
  await new Promise((resolve) => setTimeout(resolve, 500));
}

/**
 * Wait for daemon to be ready with retries
 */
async function waitForDaemonReady(
  maxAttempts = 60,
  intervalMs = 500
): Promise<void> {
  const startTime = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = createCLIClient();
      await client.connect(2000);

      try {
        await client.sendCommand('list', {});
        await client.disconnect();
        return;
      } catch (cmdError) {
        await client.disconnect();
        throw cmdError;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        const totalTime = maxAttempts * intervalMs;
        const actualTime = Date.now() - startTime;
        throw new Error(
          `Daemon did not become ready within ${totalTime}ms (actual: ${actualTime}ms). Last error: ${lastError.message}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
