/**
 * List command implementation
 *
 * This command lists all processes managed by the daemon.
 */

import chalk from 'chalk';
import { handleCLIError } from '../utils/error-utils.js';
import yaml from 'yaml';
import { executeCommand } from '../utils/ipc-client.js';
import type { ListResponseData } from '../../shared/ipc.js';

export interface ListCommandOptions {
  namespace?: string;
  format?: 'table' | 'yaml' | 'json';
}

export async function execute(
  args: string[],
  options: ListCommandOptions
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

    try {
      // Send list command to daemon
      const response = await executeCommand('list', {});

      if (response.success) {
        const data = response.data as ListResponseData;
        const processes = data?.processes || [];

        // Filter by namespace if specified
        let filteredProcesses = processes;
        if (options.namespace) {
          filteredProcesses = processes.filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (p: any) =>
              p.namespace === options.namespace ||
              p.name.startsWith(`${options.namespace}:`)
          );
        }

        // Format output based on option
        const format = options.format || 'table';

        if (format === 'json') {
          // JSON output
          console.log(JSON.stringify(filteredProcesses, null, 2));
        } else if (format === 'yaml') {
          // YAML output
          console.log(yaml.stringify(filteredProcesses));
        } else {
          // Table output (default)
          if (filteredProcesses.length === 0) {
            console.log(chalk.yellow('No processes found'));
          } else {
            console.log(chalk.bold('\nProcess List:'));
            console.log(chalk.gray('─'.repeat(60)));

            for (const proc of filteredProcesses) {
              const status =
                proc.status === 'online'
                  ? chalk.green('● online')
                  : proc.status === 'stopped'
                    ? chalk.red('○ stopped')
                    : chalk.yellow('◐ ' + proc.status);

              const name = chalk.bold(proc.name);
              const pid = proc.pid ? chalk.gray(`(PID: ${proc.pid})`) : '';
              const namespace = proc.namespace
                ? chalk.cyan(`[${proc.namespace}]`)
                : '';

              const ports =
                proc.ports && proc.ports.length > 0
                  ? chalk.magenta(
                      proc.ports.map((p: number) => `:${p}`).join(', ')
                    )
                  : '';

              console.log(`  ${status}  ${name} ${namespace} ${pid} ${ports}`);

              // Command info not available in ProcessInfo type
              if (proc.uptime && proc.status === 'online') {
                console.log(
                  chalk.gray(`         Uptime: ${formatUptime(proc.uptime)}`)
                );
              }
              if (proc.restarts > 0) {
                console.log(chalk.gray(`         Restarts: ${proc.restarts}`));
              }
            }

            console.log(chalk.gray('─'.repeat(60)));
            console.log(
              chalk.gray(`Total: ${filteredProcesses.length} process(es)`)
            );
          }
        }
      } else {
        console.error(
          chalk.red('Error:'),
          response.error?.message || 'Failed to list processes'
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
        // Provide a basic output format for backward compatibility
        console.log(chalk.yellow('No processes found (daemon not running)'));
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

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  } else {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  }
}
