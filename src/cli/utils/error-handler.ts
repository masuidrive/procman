/**
 * Error handler utilities for CLI
 *
 * Provides enhanced error handling with verbose debugging support
 */

import chalk from 'chalk';
import {
  ProcmanError,
  ErrorCode,
  ERROR_MESSAGES,
} from '../../shared/errors.js';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Global verbose flag
 */
let verboseMode = false;

/**
 * Set verbose mode
 */
export function setVerboseMode(enabled: boolean): void {
  verboseMode = enabled;
}

/**
 * Get verbose mode status
 */
export function isVerboseMode(): boolean {
  return verboseMode;
}

/**
 * Format error message with appropriate styling
 */
export function formatError(error: Error | ProcmanError | unknown): string {
  if (error instanceof ProcmanError) {
    const message = ERROR_MESSAGES[error.code] || error.message;
    return `${chalk.red('Error:')} [${error.code}] ${message}`;
  } else if (error instanceof Error) {
    return `${chalk.red('Error:')} ${error.message}`;
  } else {
    return `${chalk.red('Error:')} ${String(error)}`;
  }
}

/**
 * Get helpful suggestions based on error code
 */
export function getErrorSuggestion(
  error: Error | ProcmanError | unknown
): string | null {
  if (!(error instanceof ProcmanError)) {
    if (error instanceof Error) {
      // Check for common Node.js errors
      if (error.message.includes('ENOENT')) {
        return 'File or directory not found. Check the path and try again.';
      } else if (
        error.message.includes('EACCES') ||
        error.message.includes('EPERM')
      ) {
        return 'Permission denied. Try running with appropriate permissions or check file ownership.';
      } else if (error.message.includes('EADDRINUSE')) {
        return 'Port or socket already in use. Check if another instance is running.';
      } else if (error.message.includes('ECONNREFUSED')) {
        return 'Connection refused. Make sure the daemon is running: procman load <config>';
      }
    }
    return null;
  }

  switch (error.code) {
    case 'DAEMON_NOT_RUNNING' as ErrorCode:
      return `The daemon is not running. Start it with: ${chalk.cyan('procman load <config-file>')}`;

    case 'DAEMON_ALREADY_RUNNING' as ErrorCode:
      return `A daemon is already running. Stop it first with: ${chalk.cyan('procman exit')}`;

    case 'CONFIG_NOT_FOUND' as ErrorCode:
      return 'Configuration file not found. Check the file path and ensure it exists.';

    case 'CONFIG_INVALID' as ErrorCode:
      return 'Invalid configuration format. Check the configuration syntax and required fields.';

    case 'PROCESS_NOT_FOUND' as ErrorCode:
      return `Process not found. List available processes with: ${chalk.cyan('procman list')}`;

    case 'PROCESS_ALREADY_RUNNING' as ErrorCode:
      return 'Process is already running. No action needed.';

    case 'PROCESS_NOT_RUNNING' as ErrorCode:
      return 'Process is not running. Start it first before attempting this operation.';

    case 'PERMISSION_DENIED' as ErrorCode:
      if (os.platform() === 'win32') {
        return 'Permission denied. Check Named Pipe permissions in Windows.';
      } else {
        return `Permission denied. Check socket permissions at ${chalk.yellow('/tmp/.procman.sock')}`;
      }

    case 'IPC_CONNECTION_FAILED' as ErrorCode:
      return 'Failed to connect to daemon. Ensure the daemon is running and accessible.';

    case 'IPC_TIMEOUT' as ErrorCode:
      return 'Connection timed out. The daemon might be overloaded or not responding.';

    case 'MEMORY_LIMIT_EXCEEDED' as ErrorCode:
      return 'Process exceeded memory limit. Increase max_memory_restart in config or optimize the application.';

    case 'VALIDATION_ERROR' as ErrorCode:
      return 'Invalid input. Check command syntax and required parameters.';

    default:
      return null;
  }
}

/**
 * Display verbose debug information
 */
export function displayDebugInfo(context: string, data: unknown): void {
  if (!verboseMode) return;

  console.log(chalk.gray('\n--- Debug Information ---'));
  console.log(chalk.gray(`Context: ${context}`));
  console.log(chalk.gray(`Timestamp: ${new Date().toISOString()}`));

  if (data instanceof Error) {
    console.log(chalk.gray('Error Type:'), data.constructor.name);
    console.log(chalk.gray('Message:'), data.message);
    if (data.stack) {
      console.log(chalk.gray('Stack Trace:'));
      const stackLines = data.stack.split('\n').slice(1, 6); // Show first 5 stack frames
      for (const line of stackLines) {
        console.log(chalk.gray(line));
      }
    }
  } else if (typeof data === 'object' && data !== null) {
    console.log(chalk.gray('Data:'), JSON.stringify(data, null, 2));
  } else {
    console.log(chalk.gray('Data:'), data);
  }

  // System information
  console.log(chalk.gray('\n--- System Information ---'));
  console.log(chalk.gray('Platform:'), os.platform());
  console.log(chalk.gray('Node Version:'), process.version);
  console.log(chalk.gray('Working Directory:'), process.cwd());

  // Check daemon status
  const socketPath =
    os.platform() === 'win32' ? '\\\\.\\pipe\\procman' : '/tmp/.procman.sock';

  if (os.platform() !== 'win32') {
    try {
      const stats = fs.statSync(socketPath);
      console.log(chalk.gray('Socket Exists:'), 'Yes');
      console.log(chalk.gray('Socket Mode:'), stats.mode.toString(8));
    } catch {
      console.log(chalk.gray('Socket Exists:'), 'No');
    }
  }

  console.log(chalk.gray('-------------------------\n'));
}

/**
 * Handle CLI error and exit
 */
export function handleCLIError(
  error: Error | ProcmanError | unknown,
  context?: string,
  exitCode = 1
): void {
  // Display main error
  console.error(formatError(error));

  // Display suggestion if available
  const suggestion = getErrorSuggestion(error);
  if (suggestion) {
    console.log(chalk.yellow('\n💡 Suggestion:'), suggestion);
  }

  // Display debug information in verbose mode
  if (verboseMode && context) {
    displayDebugInfo(context, error);
  } else if (verboseMode) {
    displayDebugInfo('Unknown Context', error);
  }

  // Suggest using verbose mode if not enabled
  if (!verboseMode) {
    console.log(
      chalk.gray('\nFor more details, run the command with'),
      chalk.cyan('--verbose')
    );
  }

  process.exit(exitCode);
}

/**
 * Check daemon connectivity and provide helpful message
 */
export async function checkDaemonConnectivity(): Promise<boolean> {
  const socketPath =
    os.platform() === 'win32' ? '\\\\.\\pipe\\procman' : '/tmp/.procman.sock';

  if (os.platform() !== 'win32') {
    try {
      fs.accessSync(socketPath, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch (error) {
      if (verboseMode) {
        displayDebugInfo('Daemon Connectivity Check', error);
      }
      return false;
    }
  }

  // For Windows, we'll assume it's accessible if we can't check
  return true;
}

/**
 * Wrap async function with error handling
 */
export function wrapWithErrorHandler<T extends Array<unknown>>(
  fn: (...args: T) => Promise<void>,
  context: string
): (...args: T) => Promise<void> {
  return async (...args: T): Promise<void> => {
    try {
      await fn(...args);
    } catch (error) {
      handleCLIError(error, context);
    }
  };
}
