/**
 * Log Management Type Definitions
 *
 * This module defines basic types for log management in the procman system.
 */

// =============================================================================
// Log Entry Interface
// =============================================================================

/**
 * Basic log entry structure
 */
export interface LogEntry {
  /** Timestamp when the log was created */
  timestamp: number;
  /** Log level */
  level: 'info' | 'warn' | 'error';
  /** Log message */
  message: string;
  /** Application name */
  app: string;
  /** Namespace */
  namespace: string;
  /** Log type (stdout or stderr) */
  type: 'stdout' | 'stderr';
}

// =============================================================================
// Log Options Interface
// =============================================================================

/**
 * Options for log retrieval and display
 */
export interface LogOptions {
  /** Number of lines to retrieve */
  lines?: number;
  /** Use human-readable format */
  human?: boolean;
  /** Enable streaming mode */
  stream?: boolean;
  /** Enable follow mode (for streaming) */
  follow?: boolean;
  /** Filter by log level */
  level?: Array<'info' | 'warn' | 'error'>;
  /** Filter by log type */
  type?: Array<'stdout' | 'stderr'>;
  /** Show logs since timestamp */
  since?: number;
  /** Show logs until timestamp */
  until?: number;
}

// =============================================================================
// Log Format Type
// =============================================================================

/**
 * Supported log output formats
 */
export type LogFormat = 'basic' | 'json' | 'csv' | 'pretty' | 'raw' | 'compact';

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if an object is a LogEntry
 * Note: This performs complete validation of all required fields.
 */
export function isLogEntry(obj: unknown): obj is LogEntry {
  if (typeof obj !== 'object' || obj === null) return false;

  const entry = obj as Record<string, unknown>;

  return (
    typeof entry.timestamp === 'number' &&
    (entry.level === 'info' ||
      entry.level === 'warn' ||
      entry.level === 'error') &&
    typeof entry.message === 'string' &&
    typeof entry.app === 'string' &&
    typeof entry.namespace === 'string' &&
    (entry.type === 'stdout' || entry.type === 'stderr')
  );
}
