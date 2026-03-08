/**
 * Task command implementation
 *
 * Manages background tasks: status, list, kill, log.
 * All subcommands support --json for machine-readable output.
 */

import chalk from 'chalk';
import { executeCommand } from '../utils/ipc-client.js';
import { handleCLIError } from '../utils/error-utils.js';
import type {
  TaskStatusResponseData,
  TaskListResponseData,
  TaskKillResponseData,
  TaskLogResponseData,
} from '../../shared/task.js';

export interface TaskCommandOptions {
  json?: boolean;
  waitLines?: number;
  waitMatch?: string;
  waitExit?: boolean;
  timeout?: string;
  signal?: string;
}

/**
 * Task status subcommand
 */
export async function executeStatus(
  taskId: string,
  options: TaskCommandOptions
): Promise<void> {
  try {
    const response = await executeCommand('task-status', { id: taskId });

    if (response.success) {
      const data = response.data as TaskStatusResponseData;
      if (options.json) {
        console.log(JSON.stringify(data.task));
      } else {
        const t = data.task;
        const statusColor =
          t.status === 'running'
            ? chalk.green
            : t.status === 'exited' && t.exit_code === 0
              ? chalk.blue
              : chalk.red;
        console.log(`${statusColor(t.status)}  ${t.id}  ${t.command}`);
        if (t.pid) console.log(chalk.gray(`  PID: ${t.pid}`));
        if (t.exit_code !== null)
          console.log(chalk.gray(`  Exit code: ${t.exit_code}`));
        if (t.duration_ms !== null)
          console.log(chalk.gray(`  Duration: ${t.duration_ms}ms`));
      }
    } else {
      if (options.json) {
        console.log(JSON.stringify({ error: response.error?.message }));
      } else {
        console.error(
          chalk.red('Error:'),
          response.error?.message || 'Task not found'
        );
      }
      process.exit(1);
    }
  } catch (error) {
    handleCLIError(error, 'Failed to get task status');
  }
}

/**
 * Task list subcommand
 */
export async function executeList(
  options: TaskCommandOptions
): Promise<void> {
  try {
    const response = await executeCommand('task-list', {});

    if (response.success) {
      const data = response.data as TaskListResponseData;
      if (options.json) {
        console.log(JSON.stringify(data.tasks));
      } else {
        if (data.tasks.length === 0) {
          console.log('No tasks');
          return;
        }
        for (const t of data.tasks) {
          const statusColor =
            t.status === 'running'
              ? chalk.green
              : t.status === 'exited' && t.exit_code === 0
                ? chalk.blue
                : chalk.red;
          const exit =
            t.exit_code !== null ? ` (exit: ${t.exit_code})` : '';
          const duration =
            t.duration_ms !== null ? ` ${t.duration_ms}ms` : '';
          console.log(
            `  ${statusColor(t.status.padEnd(7))}  ${t.id}  ${t.command}${exit}${duration}`
          );
        }
      }
    }
  } catch (error) {
    handleCLIError(error, 'Failed to list tasks');
  }
}

/**
 * Task kill subcommand
 */
export async function executeKill(
  taskId: string,
  options: TaskCommandOptions
): Promise<void> {
  try {
    const response = await executeCommand('task-kill', {
      id: taskId,
      signal: options.signal,
    });

    if (response.success) {
      const data = response.data as TaskKillResponseData;
      if (options.json) {
        console.log(JSON.stringify(data));
      } else {
        if (data.killed) {
          console.log(chalk.green('✓'), `Task ${taskId} killed`);
        } else {
          console.log(
            chalk.yellow('⚠'),
            `Task ${taskId} could not be killed (may have already exited)`
          );
        }
      }
    }
  } catch (error) {
    handleCLIError(error, 'Failed to kill task');
  }
}

/**
 * Parse timeout string (e.g. "30s", "5m", "1000") to milliseconds
 */
function parseTimeout(timeout: string): number {
  const match = timeout.match(/^(\d+)(s|m|ms)?$/);
  if (!match) {
    throw new Error(
      `Invalid timeout format: ${timeout}. Use: 30s, 5m, or 1000 (ms)`
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2] || 'ms';
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    default:
      return value;
  }
}

/**
 * Task log subcommand
 */
export async function executeLog(
  taskId: string,
  options: TaskCommandOptions
): Promise<void> {
  try {
    const hasWait =
      options.waitLines !== undefined ||
      options.waitMatch !== undefined ||
      options.waitExit;

    let wait;
    if (hasWait) {
      if (!options.timeout) {
        console.error(
          chalk.red('Error:'),
          '--timeout is required when using --wait-lines, --wait-match, or --wait-exit'
        );
        process.exit(1);
      }
      wait = {
        waitLines: options.waitLines,
        waitMatch: options.waitMatch,
        waitExit: options.waitExit,
        timeout: parseTimeout(options.timeout),
      };
    }

    const response = await executeCommand(
      'task-log',
      { id: taskId, wait },
      // Increase IPC timeout when waiting
      wait ? { timeout: wait.timeout + 5000 } : undefined
    );

    if (response.success) {
      const data = response.data as TaskLogResponseData;
      if (options.json) {
        console.log(JSON.stringify(data.log));
      } else {
        if (data.log.output) {
          console.log(data.log.output);
        }
        if (data.log.timed_out) {
          console.error(chalk.yellow('(timed out)'));
        }
        if (data.log.matched) {
          console.error(
            chalk.green(`Matched: "${data.log.matched}" at line ${data.log.matched_line}`)
          );
        }
      }
    } else {
      if (options.json) {
        console.log(JSON.stringify({ error: response.error?.message }));
      } else {
        console.error(
          chalk.red('Error:'),
          response.error?.message || 'Task not found'
        );
      }
      process.exit(1);
    }
  } catch (error) {
    handleCLIError(error, 'Failed to get task log');
  }
}
