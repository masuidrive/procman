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
import type { EventEmitter } from 'events';

// =============================================================================
// Event Type Definitions
// =============================================================================

/**
 * Base interface for typed event emitters
 */
export interface TypedEventEmitter<TEvents extends Record<string, any[]>> {
  on<K extends keyof TEvents>(
    event: K,
    listener: (...args: TEvents[K]) => void
  ): this;
  once<K extends keyof TEvents>(
    event: K,
    listener: (...args: TEvents[K]) => void
  ): this;
  emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): boolean;
  removeListener<K extends keyof TEvents>(
    event: K,
    listener: (...args: TEvents[K]) => void
  ): this;
  removeAllListeners<K extends keyof TEvents>(event?: K): this;
  setMaxListeners(n: number): this;
  getMaxListeners(): number;
  listeners<K extends keyof TEvents>(event: K): Function[];
  listenerCount<K extends keyof TEvents>(event: K): number;
}

/**
 * IPC Client event types
 */
export interface IPCClientEvents extends Record<string, any[]> {
  connected: [];
  disconnected: [];
  error: [Error];
  statusChange: [IPCConnectionStatus, IPCConnectionStatus];
  messageError: [Error];
  invalidMessage: [any];
  unsolicitedMessage: [IPCResponse];
  logStream: [IPCLogStreamPayload];
  socketConnected: [];
}

/**
 * IPC Server event types
 */
export interface IPCServerEvents extends Record<string, any[]> {
  listening: [];
  stopped: [];
  error: [Error];
  connection: [IPCConnection];
  disconnection: [IPCConnection];
  messageError: [IPCConnection, Error];
  connectionError: [IPCConnection, Error];
  connectionCloseError: [IPCConnection, Error];
  close: [];
}

/**
 * IPC Connection event types
 */
export interface IPCConnectionEvents extends Record<string, any[]> {
  close: [];
  error: [Error];
  data: [Buffer];
  timeout: [];
}

// =============================================================================
// Basic IPC Message Interface
// =============================================================================

/**
 * Basic IPC message structure for communication between daemon and client
 */
export interface IPCMessage<TPayload = unknown> {
  /** Unique identifier for the message */
  id: string;
  /** Type of the message */
  type: string;
  /** Message payload data */
  payload: TPayload;
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
export interface IPCCommandMessage<T extends CommandType = CommandType>
  extends IPCMessage<IPCCommandPayloadMap[T]> {
  type: T;
  payload: IPCCommandPayloadMap[T];
}

/**
 * Mapping of command types to their specific payload types
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
export interface IPCResponse<TPayload = unknown> extends IPCMessage<TPayload> {
  type: 'response' | 'error' | 'log-stream';
  requestId: string;
}

/**
 * Mapping of response types to their specific payload types
 */
export interface IPCResponsePayloadMap {
  load: LoadResponsePayload;
  start: StartResponsePayload;
  stop: StopResponsePayload;
  restart: RestartResponsePayload;
  list: ListResponsePayload;
  log: LogResponsePayload;
  'clear-log': ClearLogResponsePayload;
  exit: ExitResponsePayload;
}

/**
 * Success response message
 */
export interface IPCSuccessResponse<T extends CommandType = CommandType>
  extends IPCResponse<IPCResponsePayloadMap[T]> {
  type: 'response';
  payload: IPCResponsePayloadMap[T];
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
export interface IPCErrorResponse extends IPCResponse<IPCErrorPayload> {
  type: 'error';
  payload: IPCErrorPayload;
}

/**
 * Error response payload
 */
export interface IPCErrorPayload {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
  timestamp?: number;
  originalError?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Structured error for IPC operations
 */
export class IPCError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: number;
  public readonly originalError?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    originalError?: Error
  ) {
    super(message);
    this.name = 'IPCError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
    this.originalError = originalError;

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, IPCError.prototype);
  }

  /**
   * Convert to IPC error payload
   */
  toPayload(): IPCErrorPayload {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
      timestamp: this.timestamp,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : undefined,
    };
  }

  /**
   * Create from unknown error
   */
  static fromUnknown(
    error: unknown,
    code: ErrorCode = 'UNKNOWN_ERROR',
    context?: string
  ): IPCError {
    if (error instanceof IPCError) {
      return error;
    }

    if (error instanceof Error) {
      const message = context ? `${context}: ${error.message}` : error.message;
      return new IPCError(code, message, undefined, error);
    }

    const message = context
      ? `${context}: ${String(error)}`
      : `Unknown error: ${String(error)}`;
    return new IPCError(code, message, { originalValue: error });
  }
}

/**
 * Type guard to check if error is an IPCError
 */
export function isIPCError(error: unknown): error is IPCError {
  return error instanceof IPCError;
}

// =============================================================================
// Log Streaming Interfaces
// =============================================================================

/**
 * Log streaming message
 */
export interface IPCLogStreamMessage extends IPCResponse<IPCLogStreamPayload> {
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
 * Enhanced IPC Connection interface with proper event typing
 */
export interface IPCConnection {
  /** Unique connection identifier */
  id: string;
  /** Connection status */
  status: IPCConnectionStatus;
  /** Connection timestamp */
  connectedAt: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Send message to this connection */
  send(message: IPCMessage): Promise<void>;
  /** Close the connection */
  close(): Promise<void>;
  /** Check if connection is alive */
  isAlive(): boolean;
  /** Event emitter methods for connection events */
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
  emit(event: string | symbol, ...args: any[]): boolean;
  removeListener(
    event: string | symbol,
    listener: (...args: any[]) => void
  ): this;
  removeAllListeners(event?: string | symbol): this;
  listeners(event: string | symbol): Function[];
  listenerCount(event: string | symbol): number;
}

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
export function isIPCMessage(obj: unknown): obj is IPCMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as any).id === 'string' &&
    typeof (obj as any).type === 'string' &&
    typeof (obj as any).timestamp === 'number' &&
    'payload' in obj
  );
}

/**
 * Type guard to check if an object is an IPCCommandMessage
 */
export function isIPCCommandMessage(obj: unknown): obj is IPCCommandMessage {
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
 * Type guard to check if an object is a specific command message
 */
export function isSpecificCommandMessage<T extends CommandType>(
  obj: unknown,
  commandType: T
): obj is IPCCommandMessage<T> {
  return isIPCCommandMessage(obj) && obj.type === commandType;
}

/**
 * Type guard to check if an object is an IPCResponse
 */
export function isIPCResponse(obj: unknown): obj is IPCResponse {
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
export function isIPCSuccessResponse(obj: unknown): obj is IPCSuccessResponse {
  return isIPCResponse(obj) && obj.type === 'response';
}

/**
 * Type guard to check if an object is a specific success response
 */
export function isSpecificSuccessResponse<T extends CommandType>(
  obj: unknown,
  commandType: T
): obj is IPCSuccessResponse<T> {
  return isIPCSuccessResponse(obj);
}

/**
 * Type guard to check if an object is an IPCErrorResponse
 */
export function isIPCErrorResponse(obj: unknown): obj is IPCErrorResponse {
  return isIPCResponse(obj) && obj.type === 'error';
}

/**
 * Type guard to check if an object is an IPCLogStreamMessage
 */
export function isIPCLogStreamMessage(
  obj: unknown
): obj is IPCLogStreamMessage {
  return isIPCResponse(obj) && obj.type === 'log-stream';
}

/**
 * Type guard to check if a string is a valid CommandType
 */
export function isValidCommandType(type: string): type is CommandType {
  return SUPPORTED_COMMANDS.includes(type as CommandType);
}

/**
 * Comprehensive payload validation functions
 */
export const PayloadValidators = {
  /**
   * Validate load command payload
   */
  isLoadCommandPayload(payload: unknown): payload is LoadCommandPayload {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as any).configPath === 'string' &&
      (typeof (payload as any).namespace === 'undefined' ||
        typeof (payload as any).namespace === 'string') &&
      (typeof (payload as any).force === 'undefined' ||
        typeof (payload as any).force === 'boolean')
    );
  },

  /**
   * Validate start command payload
   */
  isStartCommandPayload(payload: unknown): payload is StartCommandPayload {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      (typeof (payload as any).name === 'undefined' ||
        typeof (payload as any).name === 'string') &&
      (typeof (payload as any).namespace === 'undefined' ||
        typeof (payload as any).namespace === 'string') &&
      (typeof (payload as any).all === 'undefined' ||
        typeof (payload as any).all === 'boolean')
    );
  },

  /**
   * Validate stop command payload
   */
  isStopCommandPayload(payload: unknown): payload is StopCommandPayload {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      (typeof (payload as any).name === 'undefined' ||
        typeof (payload as any).name === 'string') &&
      (typeof (payload as any).namespace === 'undefined' ||
        typeof (payload as any).namespace === 'string') &&
      (typeof (payload as any).all === 'undefined' ||
        typeof (payload as any).all === 'boolean') &&
      (typeof (payload as any).force === 'undefined' ||
        typeof (payload as any).force === 'boolean')
    );
  },

  /**
   * Validate command payload based on type
   */
  isValidCommandPayload<T extends CommandType>(
    type: T,
    payload: unknown
  ): payload is IPCCommandPayloadMap[T] {
    switch (type) {
      case 'load':
        return this.isLoadCommandPayload(payload);
      case 'start':
        return this.isStartCommandPayload(payload);
      case 'stop':
        return this.isStopCommandPayload(payload);
      case 'restart':
        return this.isStopCommandPayload(payload); // Same as stop
      case 'list':
      case 'log':
      case 'clear-log':
      case 'exit':
        return typeof payload === 'object' && payload !== null;
      default:
        return false;
    }
  },

  /**
   * Validate error payload
   */
  isIPCErrorPayload(payload: unknown): payload is IPCErrorPayload {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as any).code === 'string' &&
      typeof (payload as any).message === 'string' &&
      (typeof (payload as any).details === 'undefined' ||
        (typeof (payload as any).details === 'object' &&
          (payload as any).details !== null)) &&
      (typeof (payload as any).stack === 'undefined' ||
        typeof (payload as any).stack === 'string')
    );
  },

  /**
   * Validate log stream payload
   */
  isIPCLogStreamPayload(payload: unknown): payload is IPCLogStreamPayload {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as any).entry === 'object' &&
      (payload as any).entry !== null &&
      typeof (payload as any).app === 'string' &&
      typeof (payload as any).namespace === 'string' &&
      typeof (payload as any).streamId === 'string'
    );
  },
};

/**
 * Runtime validation for IPC messages with detailed error reporting
 */
export function validateIPCMessage(obj: unknown): {
  isValid: boolean;
  message?: IPCMessage;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof obj !== 'object' || obj === null) {
    errors.push('Message must be an object');
    return { isValid: false, errors };
  }

  const msg = obj as any;

  if (typeof msg.id !== 'string') {
    errors.push('Message id must be a string');
  }

  if (typeof msg.type !== 'string') {
    errors.push('Message type must be a string');
  }

  if (typeof msg.timestamp !== 'number') {
    errors.push('Message timestamp must be a number');
  }

  if (!('payload' in msg)) {
    errors.push('Message must have a payload property');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    message: msg as IPCMessage,
    errors: [],
  };
}

/**
 * Runtime validation for command messages
 */
export function validateCommandMessage<T extends CommandType>(
  obj: unknown,
  expectedType?: T
): {
  isValid: boolean;
  message?: IPCCommandMessage<T>;
  errors: string[];
} {
  const baseValidation = validateIPCMessage(obj);
  if (!baseValidation.isValid || !baseValidation.message) {
    return { isValid: false, errors: baseValidation.errors };
  }

  const errors: string[] = [];
  const msg = baseValidation.message;

  if (!isValidCommandType(msg.type)) {
    errors.push(`Invalid command type: ${msg.type}`);
  }

  if (expectedType && msg.type !== expectedType) {
    errors.push(`Expected command type ${expectedType}, got ${msg.type}`);
  }

  if (
    msg.type &&
    !PayloadValidators.isValidCommandPayload(
      msg.type as CommandType,
      msg.payload
    )
  ) {
    errors.push(`Invalid payload for command type: ${msg.type}`);
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    message: msg as IPCCommandMessage<T>,
    errors: [],
  };
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
export function createIPCMessage<TPayload = unknown>(
  type: string,
  payload: TPayload,
  id?: string
): IPCMessage<TPayload> {
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
  payload: IPCCommandPayloadMap[T],
  id?: string
): IPCCommandMessage<T> {
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
export function createIPCSuccessResponse<T extends CommandType>(
  requestId: string,
  payload: IPCResponsePayloadMap[T],
  id?: string
): IPCSuccessResponse<T> {
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
  error: IPCError | ErrorCode,
  message?: string,
  details?: Record<string, unknown>,
  id?: string
): IPCErrorResponse {
  const payload: IPCErrorPayload =
    error instanceof IPCError
      ? error.toPayload()
      : {
          code: error,
          message: message || 'Unknown error',
          details,
          timestamp: Date.now(),
        };

  return {
    id: id || generateMessageId(),
    type: 'error',
    requestId,
    payload,
    timestamp: Date.now(),
  };
}

/**
 * Create an IPC error response from unknown error
 */
export function createIPCErrorFromUnknown(
  requestId: string,
  error: unknown,
  code: ErrorCode = 'UNKNOWN_ERROR',
  context?: string,
  id?: string
): IPCErrorResponse {
  const ipcError = IPCError.fromUnknown(error, code, context);
  return createIPCErrorResponse(requestId, ipcError, undefined, undefined, id);
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
