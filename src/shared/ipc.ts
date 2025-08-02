/**
 * IPC Communication Type Definitions
 *
 * This module defines basic types for Inter-Process Communication (IPC)
 * between the procman daemon and client processes.
 */

import type { LogEntry, LogOptions } from './logs';
import type { ProcessInfo } from './process';
import type { ErrorCode } from './errors';
import type { ProcmanConfig } from './config';

// =============================================================================
// Command Payload Types
// =============================================================================

/**
 * Payload for 'load' command
 */
export interface LoadCommandPayload {
  /** Path to the configuration file */
  configPath: string;
}

/**
 * Payload for 'start' command
 */
export interface StartCommandPayload {
  /** Target applications or namespaces to start */
  targets?: string[];
}

/**
 * Payload for 'stop' command
 */
export interface StopCommandPayload {
  /** Target applications or namespaces to stop */
  targets?: string[];
}

/**
 * Payload for 'restart' command
 */
export interface RestartCommandPayload {
  /** Target applications or namespaces to restart */
  targets?: string[];
}

/**
 * Payload for 'list' command
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ListCommandPayload {
  // No additional payload needed
}

/**
 * Payload for 'log' command
 */
export interface LogCommandPayload {
  /** Target application or namespace */
  target: string;
  /** Log options */
  options?: LogOptions;
}

/**
 * Payload for 'clear-log' command
 */
export interface ClearLogCommandPayload {
  /** Target application or namespace */
  target: string;
}

/**
 * Payload for 'exit' command
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExitCommandPayload {
  // No additional payload needed
}

/**
 * Union type for all command payloads
 */
export type CommandPayload =
  | LoadCommandPayload
  | StartCommandPayload
  | StopCommandPayload
  | RestartCommandPayload
  | ListCommandPayload
  | LogCommandPayload
  | ClearLogCommandPayload
  | ExitCommandPayload;

// =============================================================================
// Basic IPC Message Interface
// =============================================================================

/**
 * Basic IPC message structure for communication between daemon and client
 */
export interface IPCMessage<T = CommandPayload> {
  /** Unique identifier for the message */
  id: string;
  /** Type of the message */
  type: CommandType;
  /** Message payload data */
  payload: T;
  /** Timestamp when the message was created */
  timestamp: number;
}

// =============================================================================
// Command Types
// =============================================================================

/**
 * Supported command types for IPC communication
 */
export type CommandType =
  | 'load'
  | 'start'
  | 'stop'
  | 'restart'
  | 'list'
  | 'log'
  | 'clear-log'
  | 'exit';

// =============================================================================
// Response Data Types
// =============================================================================

/**
 * Response data for 'load' command
 */
export interface LoadResponseData {
  /** Loaded configuration */
  config: ProcmanConfig;
  /** Number of apps loaded */
  appsCount: number;
}

/**
 * Response data for 'start' command
 */
export interface StartResponseData {
  /** Started processes */
  started: string[];
  /** Already running processes */
  alreadyRunning: string[];
  /** Failed processes */
  failed: Array<{ name: string; error: string }>;
}

/**
 * Response data for 'stop' command
 */
export interface StopResponseData {
  /** Stopped processes */
  stopped: string[];
  /** Already stopped processes */
  alreadyStopped: string[];
  /** Failed processes */
  failed: Array<{ name: string; error: string }>;
}

/**
 * Response data for 'restart' command
 */
export interface RestartResponseData {
  /** Restarted processes */
  restarted: string[];
  /** Failed processes */
  failed: Array<{ name: string; error: string }>;
}

/**
 * Response data for 'list' command
 */
export interface ListResponseData {
  /** Configuration file path */
  configFile: string;
  /** Daemon uptime in seconds */
  daemonUptime: number;
  /** Process information array */
  processes: ProcessInfo[];
}

/**
 * Response data for 'log' command
 */
export interface LogResponseData {
  /** Log entries */
  entries: LogEntry[];
  /** Total number of entries */
  total: number;
}

/**
 * Response data for 'clear-log' command
 */
export interface ClearLogResponseData {
  /** Cleared log files */
  cleared: string[];
}

/**
 * Response data for 'exit' command
 */
export interface ExitResponseData {
  /** Number of processes stopped */
  processCount: number;
}

/**
 * Union type for all response data types
 */
export type ResponseData =
  | LoadResponseData
  | StartResponseData
  | StopResponseData
  | RestartResponseData
  | ListResponseData
  | LogResponseData
  | ClearLogResponseData
  | ExitResponseData;

// =============================================================================
// Response Interface
// =============================================================================

/**
 * Basic response structure for IPC communication
 */
export interface IPCResponse<T = ResponseData> {
  /** Indicates if the operation was successful */
  success: boolean;
  /** Response data (type depends on the command) */
  data?: T;
  /** Error information if success is false */
  error?: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

// =============================================================================
// Log Streaming Interface
// =============================================================================

/**
 * Log streaming payload for real-time log updates
 */
export interface IPCLogStreamPayload {
  /** Log entry */
  entry: LogEntry;
  /** Application name */
  app: string;
  /** Namespace */
  namespace: string;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if an object is an IPCMessage
 * Note: This performs basic structural validation. Full payload validation should be done separately.
 */
export function isIPCMessage(obj: unknown): obj is IPCMessage {
  if (typeof obj !== 'object' || obj === null) return false;

  const msg = obj as Record<string, unknown>;

  return (
    typeof msg.id === 'string' &&
    typeof msg.type === 'string' &&
    isValidCommandType(msg.type) &&
    typeof msg.timestamp === 'number' &&
    'payload' in msg &&
    msg.payload !== undefined
  );
}

/**
 * Type guard to check if a string is a valid CommandType
 */
export function isValidCommandType(type: string): type is CommandType {
  const validCommands: CommandType[] = [
    'load',
    'start',
    'stop',
    'restart',
    'list',
    'log',
    'clear-log',
    'exit',
  ];
  return validCommands.includes(type as CommandType);
}
