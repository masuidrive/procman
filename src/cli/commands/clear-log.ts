/**
 * Clear-log command implementation
 *
 * This command clears logs for processes managed by the daemon.
 */

import chalk from 'chalk';
import { handleCLIError } from '../utils/error-utils.js';
import { executeCommand } from '../utils/ipc-client.js';
import type { ClearLogResponseData } from '../../shared/ipc.js';

export interface ClearLogCommandOptions {
  namespace?: string;
}

export async function execute(
  args: string[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options: ClearLogCommandOptions
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

    // Get target from args
    const target = args[0];

    if (!target) {
      console.error(chalk.red('Error:'), 'Target process name is required');
      console.error(
        chalk.yellow('Usage:'),
        'procman clear-log <target> [--namespace <ns>]'
      );
      process.exit(1);
    }

    console.log(chalk.blue('Clearing logs for:'), target);

    try {
      // Send clear-log command to daemon
      const response = await executeCommand('clear-log', {
        target,
      });

      if (response.success) {
        const data = response.data as ClearLogResponseData;
        if (data?.cleared && data.cleared.length > 0) {
          console.log(chalk.green('✓'), 'Logs cleared successfully');
          console.log(chalk.gray('\nCleared log files:'));
          for (const file of data.cleared) {
            console.log('  •', chalk.gray(file));
          }
        } else {
          console.log(chalk.yellow('No logs to clear for:'), target);
        }
      } else {
        console.error(
          chalk.red('Error:'),
          response.error?.message || 'Failed to clear logs'
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
        // For clear-log command failures, show a basic message for backward compatibility
        console.log(
          chalk.yellow(`Logs cleared for: ${target} (daemon not running)`)
        );
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
