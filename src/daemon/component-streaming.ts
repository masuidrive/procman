/**
 * Component Streaming - log streaming session management
 */

import { EventEmitter } from 'events';
import { LogManager } from '../services/log-manager.js';
import { IPCServerBase } from './ipc-server-base.js';
import { IPCCommandHandler } from './ipc-command-handler.js';
import {
  LOG_STREAM_EVENTS,
  STREAM_CONFIG,
  STREAM_MESSAGE_TYPES,
} from '../shared/constants-streaming.js';

/**
 * Manages log streaming sessions between IPC clients and log manager.
 *
 * This class handles the lifecycle of streaming sessions:
 * - Starting new streams when clients request log tailing
 * - Routing log entries to the correct IPC connection
 * - Cleaning up streams on disconnect or explicit stop
 */
export class StreamingSessionManager {
  // Map to track active streaming sessions with connection info
  private streamingSessions: Map<
    string,
    { cleanup: () => void; connectionId: string; messageId: string }
  > = new Map();

  /**
   * Setup log streaming functionality by wiring command handler events
   * to log manager streams and IPC connections.
   */
  setupLogStreaming(
    commandHandler: IPCCommandHandler,
    ipcServer: IPCServerBase,
    logManager: LogManager,
    registerListener: <T extends EventEmitter>(
      emitter: T,
      event: string | symbol,
      listener: (...args: any[]) => void
    ) => void
  ): void {
    // Listen for log streaming start events from command handler
    registerListener(
      commandHandler,
      LOG_STREAM_EVENTS.START_LOG_STREAM,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (streamConfig: any) => {
        const { messageId, target, connectionId } = streamConfig;
        const sessionId = `${STREAM_CONFIG.SESSION_PREFIX}-${messageId}-${Date.now()}`;

        // Stop existing session if present
        this.stopLogStream(sessionId);

        // Get specific connection instead of all connections
        const connection = connectionId
          ? ipcServer.getConnection(connectionId)
          : null;

        if (!connection) {
          console.error(
            `Cannot start log streaming: connection ${connectionId} not found`
          );
          return;
        }

        // Start streaming via log manager
        const cleanup = logManager.startLogStream(target, (logEntry) => {
          // Send new log entries to the specific IPC client
          const streamMessage = {
            id: `${STREAM_CONFIG.SESSION_PREFIX}-${Date.now()}`,
            type: STREAM_MESSAGE_TYPES.LOG_STREAM,
            payload: {
              entry: logEntry,
              app: logEntry.app,
              namespace: logEntry.namespace || 'default',
            },
            timestamp: Date.now(),
            sessionId,
          };

          // Send message only to the specific connection
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (connection as any).send(JSON.stringify(streamMessage) + '\n');
          } catch (error) {
            console.error('Failed to send log stream message:', error);
            // Stop streaming for the errored connection
            this.stopLogStream(sessionId);
          }
        });

        // Save cleanup function and connection info
        this.streamingSessions.set(sessionId, {
          cleanup,
          connectionId: connectionId || '',
          messageId,
        });

        // Stop streaming when connection disconnects
        this.setupStreamCleanupOnDisconnect(sessionId, ipcServer);
      }
    );

    // Listen for stop-log-stream events
    registerListener(
      commandHandler,
      LOG_STREAM_EVENTS.STOP_LOG_STREAM,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config: any) => {
        const { sessionId } = config;
        this.stopLogStream(sessionId);
      }
    );
  }

  /**
   * Stop log streaming for a specific session
   */
  stopLogStream(sessionId: string): void {
    const sessionInfo = this.streamingSessions.get(sessionId);
    if (sessionInfo) {
      sessionInfo.cleanup();
      this.streamingSessions.delete(sessionId);
    }
  }

  /**
   * Setup cleanup when connection disconnects
   */
  private setupStreamCleanupOnDisconnect(
    sessionId: string,
    ipcServer: IPCServerBase
  ): void {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const disconnectHandler = () => {
      this.stopLogStream(sessionId);
    };

    // Execute only once
    // Note: IPCServerBase doesn't extend EventEmitter, so we can't use EventCleanupHelper for it
    // This is acceptable as IPCServerBase has its own cleanup mechanisms
    ipcServer.once('disconnect', disconnectHandler);
  }

  /**
   * Cleanup all streaming sessions
   */
  cleanupAllStreamingSessions(): void {
    for (const [, sessionInfo] of this.streamingSessions) {
      sessionInfo.cleanup();
    }
    this.streamingSessions.clear();
  }
}
