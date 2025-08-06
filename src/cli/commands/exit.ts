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
    // Confirm shutdown
    if (!options.force) {
      console.log(
        chalk.yellow('Warning:'),
        'This will shut down the daemon and all managed processes.'
      );
    }

    console.log(chalk.blue('Shutting down daemon...'));

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
    handleCLIError(error, 'Failed to execute command');
  }
}
