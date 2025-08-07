/**
 * Exit command implementation
 *
 * This command shuts down the daemon and all managed processes.
 */

import chalk from 'chalk';
import { handleCLIError } from '../utils/error-utils.js';
import { executeCommand } from '../utils/ipc-client.js';
import type { ExitResponseData } from '../../shared/ipc.js';

export interface ExitCommandOptions {
  force?: boolean;
}

export async function execute(
  args: string[],
  options: ExitCommandOptions
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

    // Confirm shutdown
    if (!options.force) {
      console.log(
        chalk.yellow('Warning:'),
        'This will shut down the daemon and all managed processes.'
      );
    }

    console.log(chalk.blue('Shutting down daemon...'));

    try {
      // Send exit command to daemon
      const response = await executeCommand('exit', {});

      if (response.success) {
        console.log(chalk.green('✓'), 'Daemon shutdown initiated successfully');

        // Display shutdown info if available
        const data = response.data as ExitResponseData;
        if (data?.processCount !== undefined) {
          console.log(chalk.gray(`Stopped ${data.processCount} process(es)`));
        }
      } else {
        console.error(
          chalk.red('Error:'),
          response.error?.message || 'Failed to shut down daemon'
        );
        process.exit(1);
      }
    } catch (error) {
      // Handle daemon not running case gracefully for backward compatibility
      if (
        error instanceof Error &&
        (error.message.includes('Cannot connect to daemon') ||
          error.message.includes('DAEMON_NOT_RUNNING') ||
          error.message.includes('Failed to expand socket path') ||
          error.message.includes('ECONNREFUSED'))
      ) {
        // For exit command when daemon is already not running, that's success
        console.log(chalk.yellow('Daemon is not running (already stopped)'));
        // Exit successfully for backward compatibility
        process.exit(0);
      }

      // Re-throw other errors
      throw error;
    }
  } catch (error) {
    handleCLIError(error, 'Failed to execute command');
  }
}
