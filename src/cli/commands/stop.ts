/**
 * Stop command implementation
 *
 * This command stops one or more processes managed by the daemon.
 */

import chalk from 'chalk';
import { handleCLIError } from '../utils/error-utils.js';
import { executeCommand } from '../utils/ipc-client.js';
import type { StopResponseData } from '../../shared/ipc.js';

export interface StopCommandOptions {
  namespace?: string;
  all?: boolean;
  force?: boolean;
}

export async function execute(
  args: string[],
  options: StopCommandOptions
): Promise<void> {
  try {
    // Determine targets to stop
    const targets: string[] = [];

    if (options.all) {
      // Stop all processes
      console.log(chalk.blue('Stopping all processes...'));
    } else if (args.length > 0) {
      // Stop specific targets
      targets.push(...args);
      console.log(chalk.blue('Stopping:'), targets.join(', '));
    } else if (options.namespace) {
      // Stop all in namespace
      targets.push(`${options.namespace}:*`);
      console.log(chalk.blue('Stopping all in namespace:'), options.namespace);
    } else {
      console.error(chalk.red('Error:'), 'No targets specified');
      console.error(
        chalk.yellow('Usage:'),
        'procman stop <targets...> [--all] [--namespace <ns>] [--force]'
      );
      process.exit(1);
    }

    // Send stop command to daemon
    const response = await executeCommand('stop', {
      targets: options.all ? undefined : targets,
    });

    if (response.success) {
      console.log(chalk.green('✓'), 'Stop command sent successfully');

      // Display stopped processes
      const data = response.data as StopResponseData;
      if (data?.stopped && data.stopped.length > 0) {
        console.log(chalk.gray('\nStopped processes:'));
        for (const name of data.stopped) {
          console.log('  •', chalk.green(name));
        }
      }
      if (data?.alreadyStopped && data.alreadyStopped.length > 0) {
        console.log(chalk.gray('\nAlready stopped:'));
        for (const name of data.alreadyStopped) {
          console.log('  •', chalk.yellow(name));
        }
      }
      if (data?.failed && data.failed.length > 0) {
        console.log(chalk.gray('\nFailed to stop:'));
        for (const item of data.failed) {
          console.log('  •', chalk.red(item.name), '-', item.error);
        }
      }
    } else {
      console.error(
        chalk.red('Error:'),
        response.error?.message || 'Failed to stop processes'
      );
      process.exit(1);
    }
  } catch (error) {
    handleCLIError(error, 'Failed to execute command');
  }
}
