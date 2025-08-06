/**
 * Start command implementation
 *
 * This command starts one or more processes managed by the daemon.
 */

import chalk from 'chalk';
import { executeCommand } from '../utils/ipc-client.js';
import { handleCLIError } from '../utils/error-utils.js';
import type { StartResponseData } from '../../shared/ipc.js';

export interface StartCommandOptions {
  namespace?: string;
  all?: boolean;
}

export async function execute(
  args: string[],
  options: StartCommandOptions
): Promise<void> {
  try {
    // Determine targets to start
    const targets: string[] = [];

    if (options.all) {
      // Start all processes
      console.log(chalk.blue('Starting all processes...'));
    } else if (args.length > 0) {
      // Start specific targets
      targets.push(...args);
      console.log(chalk.blue('Starting:'), targets.join(', '));
    } else if (options.namespace) {
      // Start all in namespace
      targets.push(`${options.namespace}:*`);
      console.log(chalk.blue('Starting all in namespace:'), options.namespace);
    } else {
      console.error(chalk.red('Error:'), 'No targets specified');
      console.error(
        chalk.yellow('Usage:'),
        'procman start <targets...> [--all] [--namespace <ns>]'
      );
      process.exit(1);
    }

    // Send start command to daemon
    const response = await executeCommand('start', {
      targets: options.all ? undefined : targets,
    });

    if (response.success) {
      console.log(chalk.green('✓'), 'Start command sent successfully');

      // Display started processes
      const data = response.data as StartResponseData;
      if (data?.started && data.started.length > 0) {
        console.log(chalk.gray('\nStarted processes:'));
        for (const name of data.started) {
          console.log('  •', chalk.green(name));
        }
      }
      if (data?.alreadyRunning && data.alreadyRunning.length > 0) {
        console.log(chalk.gray('\nAlready running:'));
        for (const name of data.alreadyRunning) {
          console.log('  •', chalk.yellow(name));
        }
      }
      if (data?.failed && data.failed.length > 0) {
        console.log(chalk.gray('\nFailed to start:'));
        for (const item of data.failed) {
          console.log('  •', chalk.red(item.name), '-', item.error);
        }
      }
    } else {
      console.error(
        chalk.red('Error:'),
        response.error?.message || 'Failed to start processes'
      );
      process.exit(1);
    }
  } catch (error) {
    handleCLIError(error, 'Failed to execute command');
  }
}
