/**
 * IPC Communication Infrastructure - Main Export
 *
 * This module provides the complete IPC communication infrastructure
 * for procman, including servers, clients, and message protocols.
 */

// Base classes
export { IPCServerBase, MessageHandler } from './ipc-server-base.js';
export { IPCClientBase } from './ipc-client-base.js';

// Platform-specific implementations
export { UnixSocketServer } from './unix-socket-server.js';
export { UnixSocketClient } from './unix-socket-client.js';
export { NamedPipeServer } from './named-pipe-server.js';
export { NamedPipeClient } from './named-pipe-client.js';

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
} from './message-protocol.js';

// Factory and utilities
export {
  IPCFactory,
  createIPCServer,
  createIPCClient,
  getDefaultIPCPath,
  isIPCSupported,
  getCurrentPlatform,
  Platform,
} from './ipc-factory.js';

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
} from '../shared/ipc.js';

// Main daemon classes
export { ProcmanDaemon, DaemonState } from './procman-daemon.js';
export { DataDirectory } from './data-directory.js';
export { PIDManager } from './pid-manager.js';
export { startDaemon, isDaemonRunning } from './daemon-main.js';
