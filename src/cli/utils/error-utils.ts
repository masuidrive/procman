/**
 * Error utilities for CLI commands
 */

import chalk from 'chalk';

/**
 * Handle CLI errors with proper type safety
 */
export function handleCLIError(
  error: unknown,
  defaultMessage = 'An error occurred'
): never {
  let errorMessage: string;

  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMessage = String(error.message);
  } else {
    errorMessage = defaultMessage;
  }

  console.error(chalk.red('Error:'), errorMessage);
  process.exit(1);
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === 'string') {
    return error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  } else {
    return 'Unknown error';
  }
}

/**
 * Type guard for Error objects
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}
