/**
 * Run command implementation
 *
 * Executes a one-shot command as a background task managed by the daemon.
 * Designed for AI agent background task execution.
 */

import chalk from 'chalk';
import { executeCommand, createCLIClient } from '../utils/ipc-client.js';
import { handleCLIError } from '../utils/error-utils.js';
import { IPCFactory } from '../../daemon/ipc-factory.js';
import type { RunTaskResponseData } from '../../shared/task.js';

export interface RunCommandOptions {
  json?: boolean;
  name?: string;
}

export async function execute(
  args: string[],
  options: RunCommandOptions
): Promise<void> {
  try {
    const command = args.join(' ');

    if (!command) {
      console.error(chalk.red('Error:'), 'Command is required');
      console.error(chalk.yellow('Usage:'), 'procman run "<command>" [--json]');
      process.exit(1);
    }

    // Check if daemon is running
    let daemonRunning = true;
    try {
      const client = createCLIClient();
      await client.connect(1000);
      await client.disconnect();
    } catch {
      daemonRunning = false;
    }

    if (!daemonRunning) {
      const socketPath = IPCFactory.getDefaultIPCPath();
      if (options.json) {
        console.log(
          JSON.stringify({
            error: 'Daemon is not running. Start with: procman load <config>',
            socket: socketPath,
          })
        );
      } else {
        console.error(
          chalk.red('Error:'),
          'Daemon is not running. Start with: procman load <config>'
        );
        console.error(chalk.gray(`  Socket: ${socketPath}`));
      }
      process.exit(1);
    }

    const response = await executeCommand('run-task', {
      command,
      name: options.name,
      cwd: process.cwd(),
    });

    if (response.success) {
      const data = response.data as RunTaskResponseData;
      if (options.json) {
        console.log(JSON.stringify(data.task));
      } else {
        console.log(chalk.green('✓'), 'Task started');
        console.log(chalk.gray(`  ID: ${data.task.id}`));
        console.log(chalk.gray(`  PID: ${data.task.pid}`));
        console.log(chalk.gray(`  Command: ${data.task.command}`));
      }
    }
  } catch (error) {
    handleCLIError(error, 'Failed to run task');
  }
}
