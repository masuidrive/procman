/**
 * IPC Server Base Implementation
 *
 * Abstract base class for IPC server implementations.
 * Provides common functionality for both Unix Domain Socket and Named Pipe servers.
 */

import { EventEmitter } from 'events';
import { setTimeout } from 'timers';
import { SimpleDisposableBase } from './simple-resource-manager.js';
import type {
  IPCMessage,
  IPCCommandMessage,
  IPCResponse,
  IPCServerConfig,
  IPCConnection,
  IPCServerEvents,
  CommandType,
} from '../shared/ipc.js';
import type { ErrorCode } from '../shared/errors.js';
import { generateMessageId } from '../shared/ipc.js';

/**
 * Message handler function type
 */
export type MessageHandler = (
  message: IPCCommandMessage,
  connection: IPCConnection
) => Promise<IPCResponse | void>;

/**
 * Mapped type for command-specific handlers
 */
export type CommandHandlerMap = {
  [K in CommandType]: MessageHandler;
};

/**
 * Type-safe message handler registry
 */
export interface MessageHandlerRegistry {
  register(commandType: CommandType, handler: MessageHandler): void;
  unregister(commandType: CommandType): void;
  get(commandType: CommandType): MessageHandler | undefined;
  has(commandType: CommandType): boolean;
  clear(): void;
}

/**
 * Abstract base class for IPC servers
 */
export abstract class IPCServerBase extends SimpleDisposableBase {
  protected config: Required<IPCServerConfig>;
  protected connections: Map<string, IPCConnection> = new Map();
  protected messageHandlers: Map<string, MessageHandler> = new Map();
  protected isListening = false;
  protected serverInstance: EventEmitter | null = null;
  private eventEmitter = new EventEmitter();

  constructor(config: IPCServerConfig = { path: '' }) {
    super();

    // Set default configuration
    this.config = {
      path: config.path,
      socketPath: config.socketPath || config.path || '',
      namedPipePath: config.namedPipePath || config.path || '',
      cleanupOnStart: config.cleanupOnStart ?? true,
      maxConnections: config.maxConnections || 100,
      connectionTimeout: config.connectionTimeout || 30000,
    };
  }

  /**
   * Start the IPC server
   */
  async start(): Promise<void> {
    this.ensureNotDisposed();

    if (this.isListening) {
      throw new Error('Server is already listening');
    }

    try {
      await this.startServer();
      this.isListening = true;
      this.emit('listening');
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.emit('error', errorObj);
      throw errorObj;
    }
  }

  /**
   * Stop the IPC server
   */
  async stop(): Promise<void> {
    this.ensureNotDisposed();

    if (!this.isListening) {
      return;
    }

    try {
      // Close all connections with timeout protection
      const closePromises = Array.from(this.connections.values()).map(
        async (connection) => {
          try {
            await Promise.race([
              connection.close ? connection.close() : Promise.resolve(),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error('Connection close timeout')),
                  5000
                )
              ),
            ]);
          } catch (error) {
            // Log error but continue with other connections
            this.emit(
              'connectionCloseError',
              error instanceof Error ? error : new Error(String(error)),
              connection.id
            );
          }
        }
      );

      await Promise.all(closePromises);
      this.connections.clear();

      // Stop the server
      await this.stopServer();
      this.isListening = false;
      this.emit('stopped');
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.emit('error', errorObj);
      throw errorObj;
    }
  }

  /**
   * Register a message handler for a specific command type
   */
  registerHandler(commandType: CommandType, handler: MessageHandler): void {
    this.messageHandlers.set(commandType, handler);
  }

  /**
   * Unregister a message handler
   */
  unregisterHandler(commandType: CommandType): void {
    this.messageHandlers.delete(commandType);
  }

  /**
   * Get a message handler for a specific command type
   */
  getHandler(commandType: CommandType): MessageHandler | undefined {
    return this.messageHandlers.get(commandType);
  }

  /**
   * Check if a handler is registered for a command type
   */
  hasHandler(commandType: CommandType): boolean {
    return this.messageHandlers.has(commandType);
  }

  /**
   * Clear all message handlers
   */
  clearHandlers(): void {
    this.messageHandlers.clear();
  }

  /**
   * Get all active connections
   */
  getConnections(): IPCConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection by ID
   */
  getConnection(id: string): IPCConnection | undefined {
    return this.connections.get(id);
  }

  /**
   * Check if server is listening
   */
  isServerListening(): boolean {
    return this.isListening;
  }

  /**
   * Broadcast message to all connections
   */
  async broadcast(message: IPCMessage): Promise<void> {
    this.ensureNotDisposed();

    const sendPromises = Array.from(this.connections.values()).map(
      async (connection) => {
        try {
          await Promise.race([
            connection.send
              ? connection.send(message)
              : Promise.reject(new Error('send method not available')),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Broadcast timeout')), 5000)
            ),
          ]);
        } catch (error) {
          this.emit(
            'connectionError',
            error instanceof Error ? error : new Error(String(error)),
            connection.id
          );
        }
      }
    );
    await Promise.all(sendPromises);
  }

  /**
   * Handle incoming message from a connection
   */
  public async handleMessage(
    data: Buffer,
    connection: IPCConnection
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messages: any[] = [];
    try {
      // Update last activity
      connection.lastActivity = Date.now();

      // Parse messages from buffer (handle multiple messages)
      messages = this.parseMessages(data);

      for (const messageData of messages) {
        await this.processMessage(messageData, connection);
      }
    } catch (error) {
      this.emit(
        'messageError',
        error instanceof Error ? error : new Error(String(error)),
        messages, // The message data that caused the error
        connection.id
      );

      // Send error response if possible
      try {
        const errorResponse: IPCResponse = {
          id: generateMessageId(),
          type: 'error',
          requestId: 'unknown',
          timestamp: Date.now(),
          success: false,
          error: {
            code: 'MESSAGE_PARSE_ERROR' as ErrorCode,
            message: 'Failed to parse message',
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
        };
        if (connection.send) {
          await connection.send(errorResponse);
        }
      } catch (sendError) {
        this.emit(
          'connectionError',
          sendError instanceof Error ? sendError : new Error(String(sendError)),
          connection.id
        );
      }
    }
  }

  /**
   * Parse multiple JSON messages from buffer
   * Addresses the PoC issue with consecutive message parsing
   */
  protected parseMessages(data: Buffer): unknown[] {
    const messages: unknown[] = [];
    const text = data.toString('utf8');

    // Split by newlines and filter out empty lines
    const lines = text.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line.trim());
        messages.push(parsed);
      } catch {
        // Try to handle concatenated JSON objects without newlines
        // This addresses the PoC parsing issue
        this.handleConcatenatedJSON(line.trim(), messages);
      }
    }

    return messages;
  }

  /**
   * Handle concatenated JSON objects in a single line
   * Uses simplified regex approach consistent with message-protocol.ts
   */
  private handleConcatenatedJSON(text: string, messages: unknown[]): void {
    // Simple approach: match JSON objects with balanced braces
    const jsonRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    const matches = text.match(jsonRegex) || [];

    for (const match of matches) {
      try {
        const parsed = JSON.parse(match.trim());
        messages.push(parsed);
      } catch (error) {
        console.warn(
          `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
          {
            method: 'parseBuffer',
            input: match.trim().slice(0, 100), // First 100 chars for debugging
          }
        );
      }
    }
  }

  /**
   * Process a single parsed message
   */
  protected async processMessage(
    messageData: unknown,
    connection: IPCConnection
  ): Promise<void> {
    try {
      // Validate message structure
      if (!this.isValidIPCMessage(messageData)) {
        throw new Error('Invalid IPC message structure');
      }

      // Handle ping message specially for heartbeat monitoring (internal message)
      if (messageData.type === 'ping') {
        const pongResponse: IPCResponse = {
          id: generateMessageId(),
          type: 'response', // Use existing response type for internal pong
          requestId: messageData.id,
          timestamp: Date.now(),
          success: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { timestamp: Date.now() } as any,
        };
        if (connection.send) {
          await connection.send(pongResponse);
        }
        return;
      }

      const message = messageData as IPCCommandMessage;
      const handler = this.messageHandlers.get(message.type);

      if (!handler) {
        throw new Error(
          `No handler registered for command type: ${message.type}`
        );
      }

      // Execute handler
      const response = await handler(message, connection);

      // Send response if handler returned one
      if (response) {
        if (connection.send) {
          await connection.send(response);
        }
      }
    } catch (error) {
      // Send error response
      const errorResponse: IPCResponse = {
        id: generateMessageId(),
        type: 'error',
        requestId:
          messageData &&
          typeof messageData === 'object' &&
          'id' in messageData &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          typeof (messageData as any).id === 'string'
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (messageData as any).id
            : 'unknown',
        success: false,
        error: {
          code: 'COMMAND_EXECUTION_ERROR' as ErrorCode,
          message: error instanceof Error ? error.message : String(error),
          details: { originalMessage: messageData },
        },
        timestamp: Date.now(),
      };

      try {
        if (connection.send) {
          await connection.send(errorResponse);
        }
      } catch (sendError) {
        this.emit(
          'connectionError',
          sendError instanceof Error ? sendError : new Error(String(sendError)),
          connection.id
        );
      }
    }
  }

  /**
   * Validate IPC message structure
   */
  protected isValidIPCMessage(obj: unknown): obj is IPCMessage {
    // t_wada boundary principle: gracefully handle null/undefined payloads
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = obj as any;

    // Validate required fields
    if (
      typeof message.id !== 'string' ||
      typeof message.type !== 'string' ||
      typeof message.timestamp !== 'number'
    ) {
      return false;
    }

    // Accept messages with null/undefined/missing payload for boundary testing
    return true;
  }

  /**
   * Handle new connection
   */
  public handleConnection(connection: IPCConnection): void {
    // Check connection limit
    if (this.connections.size >= this.config.maxConnections) {
      // Send connection limit error before closing
      if (connection.send) {
        const errorResponse: IPCResponse = {
          id: generateMessageId(),
          type: 'error',
          requestId: 'connection-limit',
          timestamp: Date.now(),
          success: false,
          error: {
            code: 'CONNECTION_LIMIT_EXCEEDED' as ErrorCode,
            message: `Connection limit exceeded (max: ${this.config.maxConnections})`,
            details: { maxConnections: this.config.maxConnections },
          },
        };

        try {
          connection.send(errorResponse);
        } catch {
          // Ignore send errors
        }
      }

      // Close connection immediately
      if (connection.close) {
        const closePromise = connection.close();
        if (closePromise && typeof closePromise.catch === 'function') {
          closePromise.catch(() => {});
        }
      }

      // Force destroy the underlying socket if available
      if ('destroy' in connection && typeof connection.destroy === 'function') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (connection as any).destroy();
        } catch {
          // Ignore destroy errors
        }
      }

      // Ensure we don't add this connection to the map
      return;
    }

    // Add to connections map
    this.connections.set(connection.id, connection);
    this.emit('connection', connection);

    // Set up connection event handlers
    this.setupConnectionHandlers(connection);
  }

  /**
   * Set up event handlers for a connection
   */
  protected setupConnectionHandlers(connection: IPCConnection): void {
    // Remove connection when it closes
    const cleanup = (): void => {
      this.connections.delete(connection.id);
      this.emit('disconnection', connection.id);
    };

    // Track event listeners for proper cleanup
    if (typeof connection.on === 'function') {
      this.addEventListener(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        connection as any as EventEmitter,
        'close',
        cleanup
      );

      this.addEventListener(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        connection as any as EventEmitter,
        'error',
        (error: Error) => {
          this.emit('connectionError', error, connection.id);
          cleanup();
        }
      );
    }
  }

  /**
   * Set up connection events for socket-based connections
   * Common logic for Unix Socket and Named Pipe connections
   */
  protected setupConnectionEvents(connection: IPCConnection): void {
    // Set up connection data handler
    if (connection.on) {
      connection.on('data', (data: Buffer) => {
        this.handleMessage(data, connection);
      });

      // Clean up connection when it's disposed
      connection.on('close', () => {
        // Connection cleanup is handled in base class
      });
    }

    // Handle the new connection
    this.handleConnection(connection);
  }

  /**
   * Set up common server events for net.Server instances
   * Common logic for Unix Socket and Named Pipe servers
   */
  protected setupCommonServerEvents(server: EventEmitter): void {
    server.on('error', (error: Error) => {
      this.emit('error', error);
    });

    server.on('listening', () => {
      this.emit('listening');
    });

    server.on('close', () => {
      this.emit('close');
    });
  }

  /**
   * Implement disposal core for DisposableBase
   */
  protected disposeCore(): void {
    // Stop the server if still running (non-blocking)
    if (this.isListening) {
      try {
        this.stop().catch(() => {
          /* ignore */
        });
      } catch {
        // Ignore errors during disposal
      }
    }

    // Force close any remaining connections (non-blocking)
    const connectionsArray = Array.from(this.connections.values());
    for (const connection of connectionsArray) {
      try {
        if (connection.close) {
          const closePromise = connection.close();
          if (closePromise && typeof closePromise.catch === 'function') {
            closePromise.catch(() => {
              /* ignore */
            });
          }
        }
      } catch {
        // Ignore errors during disposal
      }
    }
    this.connections.clear();

    // Clear message handlers
    this.messageHandlers.clear();

    // Clear event listeners
    this.eventEmitter.removeAllListeners();
  }

  /**
   * Get current resource usage statistics
   */
  getResourceStats(): {
    activeConnections: number;
    messageHandlers: number;
    eventListeners: number;
    totalResources: number;
    isListening: boolean;
  } {
    const resourceCount = this.resources.getResourceCount();
    return {
      activeConnections: this.connections.size,
      messageHandlers: this.messageHandlers.size,
      eventListeners: resourceCount.listeners,
      totalResources:
        resourceCount.timeouts +
        resourceCount.intervals +
        resourceCount.listeners,
      isListening: this.isListening,
    };
  }

  /**
   * TypedEventEmitter implementation methods
   */
  on<K extends keyof IPCServerEvents>(
    event: K,
    listener: IPCServerEvents[K]
  ): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.eventEmitter.on(event as string, listener as any);
    return this;
  }

  once<K extends keyof IPCServerEvents>(
    event: K,
    listener: IPCServerEvents[K]
  ): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.eventEmitter.once(event as string, listener as any);
    return this;
  }

  emit<K extends keyof IPCServerEvents>(
    event: K,
    ...args: Parameters<IPCServerEvents[K]>
  ): boolean {
    return this.eventEmitter.emit(event as string, ...args);
  }

  removeListener<K extends keyof IPCServerEvents>(
    event: K,
    listener: IPCServerEvents[K]
  ): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.eventEmitter.removeListener(event as string, listener as any);
    return this;
  }

  off<K extends keyof IPCServerEvents>(
    event: K,
    listener: IPCServerEvents[K]
  ): this {
    return this.removeListener(event, listener);
  }

  removeAllListeners<K extends keyof IPCServerEvents>(event?: K): this {
    this.eventEmitter.removeAllListeners(event as string);
    return this;
  }

  setMaxListeners(n: number): this {
    this.eventEmitter.setMaxListeners(n);
    return this;
  }

  getMaxListeners(): number {
    return this.eventEmitter.getMaxListeners();
  }

  listeners<K extends keyof IPCServerEvents>(
    event: K
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): ((...args: any[]) => void)[] {
    return this.eventEmitter.listeners(event as string) as ((
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...args: any[]
    ) => void)[];
  }

  listenerCount<K extends keyof IPCServerEvents>(event: K): number {
    return this.eventEmitter.listenerCount(event as string);
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract startServer(): Promise<void>;
  protected abstract stopServer(): Promise<void>;
}
