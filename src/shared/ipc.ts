/**
 * IPC Communication Type Definitions
 *
 * This module defines types and interfaces for Inter-Process Communication (IPC)
 * between the procman daemon and client processes.
 */

import type { LogEntry, LogOptions } from './logs';
import type { ProcessInfo } from './process';
import type { ProcmanConfig } from './config';
import type { ErrorCode } from './errors';

// =============================================================================
// Basic IPC Message Interface
// =============================================================================

/**
 * Basic IPC message structure for communication between daemon and client
 */
export interface IPCMessage {
  /** Unique identifier for the message */
  id: string;
  /** Type of the message */
  type: string;
  /** Message payload data */
  payload: any;
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
// Command Message Interfaces
// =============================================================================

/**
 * Base interface for all command messages
 */
export interface IPCCommandMessage extends IPCMessage {
  type: CommandType;
  payload: IPCCommandPayload;
}

/**
 * Union type for all command payloads
 */
export type IPCCommandPayload =
  | LoadCommandPayload
  | StartCommandPayload
  | StopCommandPayload
  | RestartCommandPayload
  | ListCommandPayload
  | LogCommandPayload
  | ClearLogCommandPayload
  | ExitCommandPayload;

/**
 * Load command payload
 */
export interface LoadCommandPayload {
  configPath: string;
  namespace?: string;
  force?: boolean;
}

/**
 * Start command payload
 */
export interface StartCommandPayload {
  name?: string;
  namespace?: string;
  all?: boolean;
}

/**
 * Stop command payload
 */
export interface StopCommandPayload {
  name?: string;
  namespace?: string;
  all?: boolean;
  force?: boolean;
}

/**
 * Restart command payload
 */
export interface RestartCommandPayload {
  name?: string;
  namespace?: string;
  all?: boolean;
  force?: boolean;
}

/**
 * List command payload
 */
export interface ListCommandPayload {
  namespace?: string;
  format?: 'table' | 'json' | 'minimal';
}

/**
 * Log command payload
 */
export interface LogCommandPayload {
  name?: string;
  namespace?: string;
  options?: LogOptions;
}

/**
 * Clear log command payload
 */
export interface ClearLogCommandPayload {
  name?: string;
  namespace?: string;
  all?: boolean;
}

/**
 * Exit command payload
 */
export interface ExitCommandPayload {
  force?: boolean;
}

// =============================================================================
// Response Message Interfaces
// =============================================================================

/**
 * Base interface for all response messages
 */
export interface IPCResponse extends IPCMessage {
  type: 'response' | 'error' | 'log-stream';
  requestId: string;
}

/**
 * Success response message
 */
export interface IPCSuccessResponse extends IPCResponse {
  type: 'response';
  payload: IPCResponsePayload;
}

/**
 * Union type for all response payloads
 */
export type IPCResponsePayload =
  | LoadResponsePayload
  | StartResponsePayload
  | StopResponsePayload
  | RestartResponsePayload
  | ListResponsePayload
  | LogResponsePayload
  | ClearLogResponsePayload
  | ExitResponsePayload;

/**
 * Load response payload
 */
export interface LoadResponsePayload {
  success: boolean;
  loadedApps: string[];
  config: ProcmanConfig;
  warnings?: string[];
}

/**
 * Start response payload
 */
export interface StartResponsePayload {
  success: boolean;
  startedProcesses: ProcessInfo[];
  failedProcesses?: Array<{
    name: string;
    error: string;
  }>;
}

/**
 * Stop response payload
 */
export interface StopResponsePayload {
  success: boolean;
  stoppedProcesses: ProcessInfo[];
  failedProcesses?: Array<{
    name: string;
    error: string;
  }>;
}

/**
 * Restart response payload
 */
export interface RestartResponsePayload {
  success: boolean;
  restartedProcesses: ProcessInfo[];
  failedProcesses?: Array<{
    name: string;
    error: string;
  }>;
}

/**
 * List response payload
 */
export interface ListResponsePayload {
  processes: ProcessInfo[];
  totalCount: number;
  namespace?: string;
}

/**
 * Log response payload
 */
export interface LogResponsePayload {
  logs: LogEntry[];
  totalLines: number;
  hasMore: boolean;
  app?: string;
  namespace?: string;
}

/**
 * Clear log response payload
 */
export interface ClearLogResponsePayload {
  success: boolean;
  clearedApps: string[];
  failedApps?: Array<{
    name: string;
    error: string;
  }>;
}

/**
 * Exit response payload
 */
export interface ExitResponsePayload {
  success: boolean;
  message: string;
}

// =============================================================================
// Error Response Interfaces
// =============================================================================

/**
 * Error response message
 */
export interface IPCErrorResponse extends IPCResponse {
  type: 'error';
  payload: IPCErrorPayload;
}

/**
 * Error response payload
 */
export interface IPCErrorPayload {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
  stack?: string;
}

// =============================================================================
// Log Streaming Interfaces
// =============================================================================

/**
 * Log streaming message
 */
export interface IPCLogStreamMessage extends IPCResponse {
  type: 'log-stream';
  payload: IPCLogStreamPayload;
}

/**
 * Log streaming payload
 */
export interface IPCLogStreamPayload {
  entry: LogEntry;
  app: string;
  namespace: string;
  streamId: string;
}

/**
 * IPC Log stream configuration
 */
export interface IPCLogStreamConfig {
  app?: string;
  namespace?: string;
  follow: boolean;
  lines?: number;
  filter?: {
    level?: Array<'info' | 'warn' | 'error'>;
    type?: Array<'stdout' | 'stderr'>;
    since?: number;
    until?: number;
  };
}

/**
 * Log stream control message
 */
export interface LogStreamControl {
  action: 'start' | 'stop' | 'pause' | 'resume';
  streamId: string;
  config?: IPCLogStreamConfig;
}

// =============================================================================
// IPC Connection Management
// =============================================================================

/**
 * IPC connection status
 */
export type IPCConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/**
 * IPC connection configuration
 */
export interface IPCConnectionConfig {
  socketPath?: string;
  namedPipePath?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * IPC client configuration
 */
export interface IPCClientConfig extends IPCConnectionConfig {
  autoReconnect?: boolean;
  heartbeatInterval?: number;
}

/**
 * IPC server configuration
 */
export interface IPCServerConfig extends IPCConnectionConfig {
  maxConnections?: number;
  allowAnonymous?: boolean;
}

// =============================================================================
// Type Guards and Utilities
// =============================================================================

/**
 * Type guard to check if an object is an IPCMessage
 */
export function isIPCMessage(obj: any): obj is IPCMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.timestamp === 'number' &&
    'payload' in obj
  );
}

/**
 * Type guard to check if an object is an IPCCommandMessage
 */
export function isIPCCommandMessage(obj: any): obj is IPCCommandMessage {
  const VALID_COMMANDS: CommandType[] = [
    'load',
    'start',
    'stop',
    'restart',
    'list',
    'log',
    'clear-log',
    'exit',
  ];

  return isIPCMessage(obj) && VALID_COMMANDS.includes(obj.type as CommandType);
}

/**
 * Type guard to check if an object is an IPCResponse
 */
export function isIPCResponse(obj: any): obj is IPCResponse {
  return (
    isIPCMessage(obj) &&
    (obj.type === 'response' ||
      obj.type === 'error' ||
      obj.type === 'log-stream') &&
    typeof (obj as any).requestId === 'string'
  );
}

/**
 * Type guard to check if an object is an IPCSuccessResponse
 */
export function isIPCSuccessResponse(obj: any): obj is IPCSuccessResponse {
  return isIPCResponse(obj) && obj.type === 'response';
}

/**
 * Type guard to check if an object is an IPCErrorResponse
 */
export function isIPCErrorResponse(obj: any): obj is IPCErrorResponse {
  return isIPCResponse(obj) && obj.type === 'error';
}

/**
 * Type guard to check if an object is an IPCLogStreamMessage
 */
export function isIPCLogStreamMessage(obj: any): obj is IPCLogStreamMessage {
  return isIPCResponse(obj) && obj.type === 'log-stream';
}

/**
 * Type guard to check if a string is a valid CommandType
 */
export function isValidCommandType(type: string): type is CommandType {
  const VALID_COMMANDS: CommandType[] = [
    'load',
    'start',
    'stop',
    'restart',
    'list',
    'log',
    'clear-log',
    'exit',
  ];

  return VALID_COMMANDS.includes(type as CommandType);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Create a basic IPC message
 */
export function createIPCMessage(
  type: string,
  payload: any,
  id?: string
): IPCMessage {
  return {
    id: id || generateMessageId(),
    type,
    payload,
    timestamp: Date.now(),
  };
}

/**
 * Create an IPC command message
 */
export function createIPCCommand<T extends CommandType>(
  type: T,
  payload: IPCCommandPayload,
  id?: string
): IPCCommandMessage {
  return {
    id: id || generateMessageId(),
    type,
    payload,
    timestamp: Date.now(),
  };
}

/**
 * Create an IPC success response
 */
export function createIPCSuccessResponse(
  requestId: string,
  payload: IPCResponsePayload,
  id?: string
): IPCSuccessResponse {
  return {
    id: id || generateMessageId(),
    type: 'response',
    requestId,
    payload,
    timestamp: Date.now(),
  };
}

/**
 * Create an IPC error response
 */
export function createIPCErrorResponse(
  requestId: string,
  code: ErrorCode,
  message: string,
  details?: Record<string, any>,
  id?: string
): IPCErrorResponse {
  return {
    id: id || generateMessageId(),
    type: 'error',
    requestId,
    payload: {
      code,
      message,
      details,
    },
    timestamp: Date.now(),
  };
}

/**
 * Create an IPC log stream message
 */
export function createIPCLogStreamMessage(
  requestId: string,
  entry: LogEntry,
  app: string,
  namespace: string,
  streamId: string,
  id?: string
): IPCLogStreamMessage {
  return {
    id: id || generateMessageId(),
    type: 'log-stream',
    requestId,
    payload: {
      entry,
      app,
      namespace,
      streamId,
    },
    timestamp: Date.now(),
  };
}

// =============================================================================
// Constants
// =============================================================================

/**
 * IPC related constants
 */
export const IPC_CONSTANTS = Object.freeze({
  // Message types
  MESSAGE_TYPES: {
    COMMAND: 'command',
    RESPONSE: 'response',
    ERROR: 'error',
    LOG_STREAM: 'log-stream',
  } as const,

  // Command types
  COMMANDS: {
    LOAD: 'load' as const,
    START: 'start' as const,
    STOP: 'stop' as const,
    RESTART: 'restart' as const,
    LIST: 'list' as const,
    LOG: 'log' as const,
    CLEAR_LOG: 'clear-log' as const,
    EXIT: 'exit' as const,
  } as const,

  // Connection status
  CONNECTION_STATUS: {
    DISCONNECTED: 'disconnected' as const,
    CONNECTING: 'connecting' as const,
    CONNECTED: 'connected' as const,
    ERROR: 'error' as const,
  } as const,

  // Log stream actions
  LOG_STREAM_ACTIONS: {
    START: 'start' as const,
    STOP: 'stop' as const,
    PAUSE: 'pause' as const,
    RESUME: 'resume' as const,
  } as const,

  // Default values
  DEFAULTS: {
    CONNECTION_TIMEOUT: 5000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    HEARTBEAT_INTERVAL: 30000,
    MAX_CONNECTIONS: 100,
    LOG_STREAM_BUFFER_SIZE: 1000,
  } as const,
});

/**
 * All supported command types as a readonly array
 */
export const SUPPORTED_COMMANDS: readonly CommandType[] = [
  'load',
  'start',
  'stop',
  'restart',
  'list',
  'log',
  'clear-log',
  'exit',
] as const;

/**
 * All supported connection statuses as a readonly array
 */
export const SUPPORTED_CONNECTION_STATUSES: readonly IPCConnectionStatus[] = [
  'disconnected',
  'connecting',
  'connected',
  'error',
] as const;
