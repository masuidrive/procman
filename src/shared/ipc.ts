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

/**
 * Command message sent from client to server
 */
export interface IPCCommandMessage extends IPCMessage {
  /** Request ID for tracking responses */
  requestId: string;
}

/**
 * Connection status for IPC
 */
export type IPCConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'error';

/**
 * IPC connection interface
 */
export interface IPCConnection {
  /** Unique connection ID */
  id: string;
  /** Connection status */
  status: IPCConnectionStatus;
  /** Timestamp when connected */
  connectedAt?: number;
  /** Last activity timestamp */
  lastActivity?: number;
  /** Send method */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send?: (data: any) => void | Promise<void>;
  /** Close method */
  close?: () => void | Promise<void>;
  /** Event handler methods */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on?: (event: string, handler: (...args: any[]) => void) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off?: (event: string, handler: (...args: any[]) => void) => void;
}

/**
 * Server configuration for IPC
 */
export interface IPCServerConfig {
  /** Socket/pipe path */
  path: string;
  /** Unix socket path (alias for path) */
  socketPath?: string;
  /** Named pipe path (alias for path on Windows) */
  namedPipePath?: string;
  /** Cleanup stale socket on start */
  cleanupOnStart?: boolean;
  /** Maximum concurrent connections */
  maxConnections?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
}

/**
 * Client configuration for IPC
 */
export interface IPCClientConfig {
  /** Socket/pipe path */
  path: string;
  /** Unix socket path (alias for path) */
  socketPath?: string;
  /** Named pipe path (alias for path on Windows) */
  namedPipePath?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  retryAttempts?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Auto reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect on disconnect (alias for autoReconnect) */
  reconnect?: boolean;
  /** Reconnect delay in milliseconds */
  reconnectDelay?: number;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
  /** Request timeout in milliseconds (alias for timeout) */
  requestTimeout?: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
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
  | 'exit'
  | 'ping';

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
  /** Message ID */
  id: string;
  /** Request ID to match with the original request */
  requestId: string;
  /** Response type */
  type: string;
  /** Timestamp */
  timestamp: number;
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

/**
 * Success response type
 */
export interface IPCSuccessResponse<T = ResponseData> extends IPCResponse<T> {
  success: true;
  data: T;
  error?: never;
}

/**
 * Error response type
 */
export interface IPCErrorResponse extends IPCResponse {
  success: false;
  data?: never;
  error: {
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

/**
 * Log streaming message for real-time log updates
 */
export interface IPCLogStreamMessage {
  /** Message ID */
  id: string;
  /** Message type - always 'log-stream' */
  type: 'log-stream';
  /** Log payload */
  payload: IPCLogStreamPayload;
  /** Timestamp */
  timestamp: number;
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * Server event types
 */
export interface IPCServerEvents {
  listening: () => void;
  connection: (connection: IPCConnection) => void;
  disconnect: (connectionId: string) => void;
  message: (message: IPCCommandMessage, connectionId: string) => void;
  error: (error: Error) => void;
  // Additional events for backward compatibility
  connectionCloseError: (error: Error, connectionId: string) => void;
  stopped: () => void;
  connectionError: (error: Error, connectionId: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageError: (error: Error, message: any, connectionId: string) => void;
  disconnection: (connectionId: string) => void;
  close: () => void;
}

/**
 * Client event types
 */
export interface IPCClientEvents {
  connected: () => void;
  disconnected: () => void;
  response: (response: IPCResponse) => void;
  'log-stream': (message: IPCLogStreamMessage) => void;
  error: (error: Error) => void;
  // Additional events for backward compatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageError: (error: Error, message?: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invalidMessage: (message: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsolicitedMessage: (message: any) => void;
  logStream: (message: IPCLogStreamMessage) => void;
  statusChange: (
    status: IPCConnectionStatus,
    oldStatus?: IPCConnectionStatus
  ) => void;
  socketConnected: () => void;
}

/**
 * Typed event emitter interface
 */
export interface TypedEventEmitter<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends Record<string, (...args: any[]) => void>,
> {
  on<K extends keyof T>(event: K, listener: T[K]): this;
  off<K extends keyof T>(event: K, listener: T[K]): this;
  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): boolean;
}

/**
 * Command payload map for type safety
 */
export interface IPCCommandPayloadMap {
  load: LoadCommandPayload;
  start: StartCommandPayload;
  stop: StopCommandPayload;
  restart: RestartCommandPayload;
  list: ListCommandPayload;
  log: LogCommandPayload;
  'clear-log': ClearLogCommandPayload;
  exit: ExitCommandPayload;
  ping: { timestamp: number };
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
    'ping',
  ];
  return validCommands.includes(type as CommandType);
}

/**
 * Type guard for IPCResponse
 */
export function isIPCResponse(obj: unknown): obj is IPCResponse {
  if (typeof obj !== 'object' || obj === null) return false;

  const resp = obj as Record<string, unknown>;
  return typeof resp.success === 'boolean';
}

/**
 * Type guard for IPCLogStreamMessage
 */
export function isIPCLogStreamMessage(
  obj: unknown
): obj is IPCLogStreamMessage {
  if (typeof obj !== 'object' || obj === null) return false;

  const msg = obj as Record<string, unknown>;
  return (
    typeof msg.id === 'string' &&
    msg.type === 'log-stream' &&
    typeof msg.payload === 'object' &&
    msg.payload !== null &&
    typeof msg.timestamp === 'number'
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create an IPC command message
 */
export function createIPCCommand<T extends CommandType>(
  type: T,
  payload: IPCCommandPayloadMap[T]
): IPCCommandMessage {
  return {
    id: generateMessageId(),
    requestId: generateMessageId(),
    type,
    payload,
    timestamp: Date.now(),
  };
}
