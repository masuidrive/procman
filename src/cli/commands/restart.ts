/**
 * Restart command implementation
 *
 * This command restarts one or more processes managed by the daemon.
 */

import chalk from 'chalk';
import { handleCLIError } from '../utils/error-utils.js';
import { executeCommand } from '../utils/ipc-client.js';
import type { RestartResponseData } from '../../shared/ipc.js';

export interface RestartCommandOptions {
  namespace?: string;
  all?: boolean;
}

export async function execute(
  args: string[],
  options: RestartCommandOptions
): Promise<void> {
  try {
    // Determine targets to restart
    const targets: string[] = [];

    if (options.all) {
      // Restart all processes
      console.log(chalk.blue('Restarting all processes...'));
    } else if (args.length > 0) {
      // Restart specific targets
      targets.push(...args);
      console.log(chalk.blue('Restarting:'), targets.join(', '));
    } else if (options.namespace) {
      // Restart all in namespace
      targets.push(`${options.namespace}:*`);
      console.log(
        chalk.blue('Restarting all in namespace:'),
        options.namespace
      );
    } else {
      console.error(chalk.red('Error:'), 'No targets specified');
      console.error(
        chalk.yellow('Usage:'),
        'procman restart <targets...> [--all] [--namespace <ns>]'
      );
      process.exit(1);
    }

    // Send restart command to daemon
    const response = await executeCommand('restart', {
      targets: options.all ? undefined : targets,
    });

    if (response.success) {
      console.log(chalk.green('✓'), 'Restart command sent successfully');

      // Display restarted processes
      const data = response.data as RestartResponseData;
      if (data?.restarted && data.restarted.length > 0) {
        console.log(chalk.gray('\nRestarted processes:'));
        for (const name of data.restarted) {
          console.log('  •', chalk.green(name));
        }
      }
      if (data?.failed && data.failed.length > 0) {
        console.log(chalk.gray('\nFailed to restart:'));
        for (const item of data.failed) {
          console.log('  •', chalk.red(item.name), '-', item.error);
        }
      }
    } else {
      console.error(
        chalk.red('Error:'),
        response.error?.message || 'Failed to restart processes'
      );
      process.exit(1);
    }
  } catch (error) {
    handleCLIError(error, 'Failed to execute command');
  }
}
