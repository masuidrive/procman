/**
 * Constants for log streaming functionality
 */

/**
 * Event names for log streaming
 */
export const LOG_STREAM_EVENTS = {
  /** New log entry event */
  NEW_LOG: 'new-log',
  /** Log stream message event */
  LOG_STREAM: 'log-stream',
  /** Start log streaming event */
  START_LOG_STREAM: 'start-log-stream',
  /** Stop log streaming event */
  STOP_LOG_STREAM: 'stop-log-stream',
  /** Raw message event */
  MESSAGE: 'message',
  /** Raw data event */
  DATA: 'data',
} as const;

/**
 * Message types for streaming
 */
export const STREAM_MESSAGE_TYPES = {
  /** Log stream message type */
  LOG_STREAM: 'log-stream',
} as const;

/**
 * Streaming configuration
 */
export const STREAM_CONFIG = {
  /** Default session ID prefix */
  SESSION_PREFIX: 'stream',
  /** Maximum listeners per event */
  MAX_LISTENERS: 100,
  /** Stream cleanup timeout (ms) */
  CLEANUP_TIMEOUT: 5000,
} as const;
