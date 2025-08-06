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
    handleCLIError(error, 'Failed to load configuration');
  }
}

/**
 * Start daemon as detached process
 */
async function startDaemonDetached(configPath: string): Promise<void> {
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

  daemonProcess.unref();

  // Give daemon a moment to start
  await new Promise((resolve) => setTimeout(resolve, 500));
}

/**
 * Wait for daemon to be ready with retries
 */
async function waitForDaemonReady(
  maxAttempts = 20,
  intervalMs = 500
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = createCLIClient();
      await client.connect(1000); // Short timeout for ready check
      await client.disconnect();
      return; // Success!
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(
          `Daemon did not become ready within ${maxAttempts * intervalMs}ms`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
