/**
 * IPC Communication Infrastructure - Main Export
 *
 * This module provides the complete IPC communication infrastructure
 * for procman, including servers, clients, and message protocols.
 */

// Base classes
export { IPCServerBase, MessageHandler } from './ipc-server-base';
export { IPCClientBase } from './ipc-client-base';

// Platform-specific implementations
export { UnixSocketServer } from './unix-socket-server';
export { UnixSocketClient } from './unix-socket-client';
export { NamedPipeServer } from './named-pipe-server';
export { NamedPipeClient } from './named-pipe-client';

// Message protocol
export {
  MessageBuffer,
  MessageSerializer,
  MessageDeserializer,
  MessageProtocol,
  createMessageProtocol,
  validateMessageSize,
  estimateMessageSize,
  MESSAGE_DELIMITER,
  MAX_MESSAGE_SIZE,
} from './message-protocol';

// Factory and utilities
export {
  IPCFactory,
  createIPCServer,
  createIPCClient,
  getDefaultIPCPath,
  isIPCSupported,
  getCurrentPlatform,
  Platform,
} from './ipc-factory';

// Re-export shared types for convenience
export type {
  IPCMessage,
  IPCCommandMessage,
  IPCResponse,
  IPCSuccessResponse,
  IPCErrorResponse,
  IPCLogStreamMessage,
  IPCServerConfig,
  IPCClientConfig,
  IPCConnectionStatus,
  IPCConnection,
  CommandType,
} from '../shared/ipc';
