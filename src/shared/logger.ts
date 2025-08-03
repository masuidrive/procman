/**
 * Structured Logging System using Winston
 *
 * This module provides a centralized logging system with structured JSON output,
 * log rotation, and configurable log levels for the procman system.
 */

import * as winston from 'winston';
import * as path from 'path';
import * as os from 'os';
import type { LogLevel } from './types';

// Log levels
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

// Check if running in test environment
const isTestEnvironment =
  process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

// Get log level from environment or default
const getLogLevel = (): LogLevel => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  // In test environment, suppress logs unless explicitly set
  return isTestEnvironment ? 'error' : 'info';
};

// Log directory
const getLogDirectory = (): string => {
  const homeDir = os.homedir();
  return path.join(homeDir, '.masuidrive-procman', 'logs');
};

/**
 * Create a logger instance for a specific module
 * @param moduleName The name of the module using the logger
 * @returns Winston logger instance
 */
export function createLogger(moduleName: string): winston.Logger {
  const logDir = getLogDirectory();

  // Define log format
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  // Console format for development
  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
    winston.format.printf(
      ({ timestamp, level, message, module, ...metadata }) => {
        let log = `${timestamp} [${module || moduleName}] ${level}: ${message}`;

        // Add metadata if present
        const metaKeys = Object.keys(metadata).filter((key) => key !== 'stack');
        if (metaKeys.length > 0) {
          const metaString = metaKeys
            .map((key) => `${key}=${JSON.stringify(metadata[key])}`)
            .join(' ');
          log += ` ${metaString}`;
        }

        // Add stack trace if present
        if (metadata.stack) {
          log += `\n${metadata.stack}`;
        }

        return log;
      }
    )
  );

  // Create transports array
  const transports: winston.transport[] = [];

  // Console transport (except in test environment)
  if (!isTestEnvironment) {
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
      })
    );
  }

  // File transports (only if not in test environment)
  if (!isTestEnvironment && process.env.LOG_TO_FILE !== 'false') {
    // Combined log file
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'procman.log'),
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      })
    );

    // Error log file
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'procman-error.log'),
        level: 'error',
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      })
    );
  }

  // Create logger instance
  const logger = winston.createLogger({
    level: getLogLevel(),
    levels: LOG_LEVELS,
    defaultMeta: { module: moduleName },
    transports,
  });

  return logger;
}

/**
 * Default logger for shared utilities
 */
export const logger = createLogger('shared');

/**
 * Log level type is exported from types.ts to avoid conflicts
 */

/**
 * Helper function to log process lifecycle events
 */
export function logProcessEvent(
  logger: winston.Logger,
  event: string,
  processName: string,
  metadata?: Record<string, unknown>
): void {
  logger.info(`Process ${event}`, {
    event,
    processName,
    timestamp: Date.now(),
    ...metadata,
  });
}

/**
 * Helper function to log process errors
 */
export function logProcessError(
  logger: winston.Logger,
  error: Error | unknown,
  processName: string,
  context?: string
): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  logger.error(`Process error${context ? ` in ${context}` : ''}`, {
    processName,
    error: errorObj.message,
    stack: errorObj.stack,
    context,
    timestamp: Date.now(),
  });
}

/**
 * Helper function to log performance metrics
 */
export function logPerformanceMetrics(
  logger: winston.Logger,
  processName: string,
  metrics: {
    memory?: number;
    cpu?: number;
    uptime?: number;
    restarts?: number;
  }
): void {
  logger.debug('Process performance metrics', {
    processName,
    metrics,
    timestamp: Date.now(),
  });
}
