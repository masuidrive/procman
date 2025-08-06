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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error) {
    handleCLIError(error, 'Failed to execute command');
  }
}
