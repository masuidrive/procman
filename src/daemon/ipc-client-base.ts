/**
 * IPC Client Base Implementation
 *
 * Abstract base class for IPC client implementations.
 * Provides common functionality for both Unix Domain Socket and Named Pipe clients.
 */

import { EventEmitter } from 'events';
import { setTimeout, clearTimeout } from 'timers';
import {
  SimpleDisposableBase,
  SimpleTimeout,
  SimpleInterval,
} from './simple-resource-manager';
import type {
  IPCMessage,
  IPCResponse,
  IPCLogStreamMessage,
  IPCClientConfig,
  IPCConnectionStatus,
  CommandType,
  IPCClientEvents,
  IPCCommandPayloadMap,
} from '../shared/ipc';
import {
  generateMessageId,
  createIPCCommand,
  isIPCResponse,
  isIPCLogStreamMessage,
} from '../shared/ipc';

/**
 * Pending request information
 */
interface PendingRequest {
  id: string;
  resolve: (response: IPCResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  timestamp: number;
}

/**
 * Abstract base class for IPC clients
 */
export abstract class IPCClientBase extends SimpleDisposableBase {
  protected config: Required<IPCClientConfig>;
  protected connectionStatus: IPCConnectionStatus = 'disconnected';
  protected clientInstance: EventEmitter | null = null;
  protected pendingRequests: Map<string, PendingRequest> = new Map();
  protected reconnectTimer: SimpleTimeout | null = null;
  protected heartbeatTimer: SimpleInterval | null = null;
  protected lastActivity = 0;
  protected lastPongReceived = 0;
  protected pendingPingId: string | null = null;
  private eventEmitter = new EventEmitter();

  constructor(config: IPCClientConfig = { path: '' }) {
    super();

    // Set default configuration
    this.config = {
      path: config.path,
      socketPath: config.socketPath || config.path || '',
      namedPipePath: config.namedPipePath || config.path || '',
      timeout: config.timeout || config.requestTimeout || 5000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || config.reconnectDelay || 1000,
      reconnectDelay: config.reconnectDelay || config.retryDelay || 1000,
      autoReconnect: config.autoReconnect ?? config.reconnect ?? true,
      reconnect: config.reconnect ?? config.autoReconnect ?? true,
      heartbeatInterval: config.heartbeatInterval || 30000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      requestTimeout: config.requestTimeout || config.timeout || 5000,
    };
  }

  /**
   * Connect to the IPC server
   */
  async connect(): Promise<void> {
    this.ensureNotDisposed();

    if (this.connectionStatus === 'connected') {
      return;
    }

    if (this.connectionStatus === 'connecting') {
      throw new Error('Connection already in progress');
    }

    this.setConnectionStatus('connecting');

    try {
      await this.connectToServer();
      this.setConnectionStatus('connected');
      this.lastActivity = Date.now();

      // Start heartbeat if enabled
      if (this.config.heartbeatInterval > 0) {
        this.startHeartbeat();
      }

      this.emit('connected');
    } catch (error) {
      this.setConnectionStatus('error');
      this.emit(
        'error',
        error instanceof Error ? error : new Error(String(error))
      );

      // Auto-reconnect if enabled
      if (this.config.autoReconnect) {
        this.scheduleReconnect();
      }

      throw error;
    }
  }

  /**
   * Disconnect from the IPC server
   */
  async disconnect(): Promise<void> {
    this.ensureNotDisposed();

    if (this.connectionStatus === 'disconnected') {
      return;
    }

    // Clear timers
    await this.clearReconnectTimer();
    await this.clearHeartbeatTimer();

    // Reject all pending requests
    const disconnectError = new Error('Client disconnected');
    const pendingRequestsArray = Array.from(this.pendingRequests.values());
    for (const request of pendingRequestsArray) {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      request.reject(disconnectError);
    }
    this.pendingRequests.clear();

    try {
      await this.disconnectFromServer();
    } finally {
      this.setConnectionStatus('disconnected');
      this.emit('disconnected');
    }
  }

  /**
   * Send a command and wait for response
   */
  async sendCommand<T extends CommandType>(
    type: T,
    payload: IPCCommandPayloadMap[T],
    timeout?: number
  ): Promise<IPCResponse> {
    this.ensureNotDisposed();

    if (this.connectionStatus !== 'connected') {
      throw new Error('Client is not connected');
    }

    const message = createIPCCommand(type, payload);
    return this.sendMessage(message, timeout);
  }

  /**
   * Send a message and wait for response
   */
  async sendMessage(
    message: IPCMessage,
    timeout?: number
  ): Promise<IPCResponse> {
    this.ensureNotDisposed();

    return new Promise<IPCResponse>((resolve, reject) => {
      const requestTimeout = timeout || this.config.timeout;

      // Simple timeout (PM2 style)
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error(`Request timeout after ${requestTimeout}ms`));
      }, requestTimeout);

      // Store pending request
      const pendingRequest: PendingRequest = {
        id: message.id,
        resolve,
        reject,
        timeout: timeoutHandle,
        timestamp: Date.now(),
      };

      this.pendingRequests.set(message.id, pendingRequest);

      // Send the message
      this.sendRawMessage(message).catch((error) => {
        this.pendingRequests.delete(message.id);
        clearTimeout(timeoutHandle);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  /**
   * Send a message without waiting for response
   */
  async sendRawMessage(message: IPCMessage): Promise<void> {
    this.ensureNotDisposed();

    if (this.connectionStatus !== 'connected') {
      throw new Error('Client is not connected');
    }

    try {
      await this.writeMessage(message);
      this.lastActivity = Date.now();
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.emit('error', errorObj);
      throw errorObj;
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): IPCConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  /**
   * Get number of pending requests
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Handle incoming data from server
   */
  protected handleData(data: Buffer): void {
    try {
      this.lastActivity = Date.now();

      // Parse messages from buffer (handle multiple messages)
      const messages = this.parseMessages(data);

      for (const messageData of messages) {
        this.processMessage(messageData);
      }
    } catch (error) {
      this.emit(
        'messageError',
        error instanceof Error ? error : new Error(String(error))
      );
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
  protected processMessage(messageData: unknown): void {
    try {
      // Validate message structure
      if (!isIPCResponse(messageData)) {
        this.emit('invalidMessage', messageData);
        return;
      }

      const message = messageData as IPCResponse;

      // Handle different message types
      if (isIPCLogStreamMessage(message)) {
        this.handleLogStreamMessage(message as IPCLogStreamMessage);
      } else {
        this.handleResponse(message);
      }
    } catch (error) {
      this.emit(
        'messageError',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Handle response message
   */
  protected handleResponse(message: IPCResponse): void {
    // Handle pong response for heartbeat monitoring (internal message type)
    if (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (message as any).type === 'pong' &&
      this.pendingPingId === message.requestId
    ) {
      this.lastPongReceived = Date.now();
      this.pendingPingId = null;
      return;
    }

    const pendingRequest = this.pendingRequests.get(message.requestId);

    if (!pendingRequest) {
      // No pending request found, might be an unsolicited message
      this.emit('unsolicitedMessage', message);
      return;
    }

    // Clear timeout and remove from pending requests
    if (pendingRequest.timeout) {
      clearTimeout(pendingRequest.timeout);
    }
    this.pendingRequests.delete(message.requestId);

    // Resolve the promise
    pendingRequest.resolve(message);
  }

  /**
   * Handle log stream message
   */
  protected handleLogStreamMessage(message: IPCLogStreamMessage): void {
    this.emit('logStream', message);
    this.emit('log-stream', message);
  }

  /**
   * Handle connection error
   */
  protected handleConnectionError(error: Error): void {
    this.setConnectionStatus('error');
    this.emit('error', error);

    // Auto-reconnect if enabled
    if (this.config.autoReconnect && this.connectionStatus !== 'disconnected') {
      this.scheduleReconnect();
    }
  }

  /**
   * Set connection status and emit event
   */
  protected setConnectionStatus(status: IPCConnectionStatus): void {
    if (this.connectionStatus !== status) {
      const oldStatus = this.connectionStatus;
      this.connectionStatus = status;
      this.emit('statusChange', status, oldStatus);
    }
  }

  /**
   * Schedule reconnection attempt
   */
  protected scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = this.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.config.autoReconnect && this.connectionStatus !== 'connected') {
        this.connect().catch(() => {
          // Reconnection failed, will try again
        });
      }
    }, this.config.retryDelay);
  }

  /**
   * Clear reconnect timer
   */
  protected async clearReconnectTimer(): Promise<void> {
    if (this.reconnectTimer) {
      this.reconnectTimer.dispose();
      this.reconnectTimer = null;
    }
  }

  /**
   * Start heartbeat mechanism
   */
  protected startHeartbeat(): void {
    if (this.heartbeatTimer) {
      return;
    }

    this.lastPongReceived = Date.now();

    this.heartbeatTimer = this.setInterval(() => {
      if (this.connectionStatus === 'connected') {
        // Check if previous pong was received
        const now = Date.now();
        if (
          this.pendingPingId !== null &&
          now - this.lastPongReceived > this.config.heartbeatInterval * 2
        ) {
          // No pong received within timeout - connection might be dead
          this.handleConnectionError(
            new Error('Heartbeat timeout - no pong received')
          );
          return;
        }

        // Send ping message for connection monitoring
        const pingMessage: IPCMessage = {
          id: generateMessageId(),
          type: 'ping',
          payload: { timestamp: now },
          timestamp: now,
        };

        this.pendingPingId = pingMessage.id;

        this.sendRawMessage(pingMessage).catch((error) => {
          this.handleConnectionError(error);
        });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Clear heartbeat timer
   */
  protected async clearHeartbeatTimer(): Promise<void> {
    if (this.heartbeatTimer) {
      this.heartbeatTimer.dispose();
      this.heartbeatTimer = null;
    }
    this.pendingPingId = null;
    this.lastPongReceived = 0;
  }

  /**
   * Implement disposal core for SimpleDisposableBase
   */
  protected disposeCore(): void {
    // Disconnect if still connected (non-blocking)
    if (this.connectionStatus !== 'disconnected') {
      try {
        this.disconnect().catch(() => {
          /* ignore */
        });
      } catch {
        // Ignore errors during disposal
      }
    }

    // Clear any remaining timers
    this.clearReconnectTimer().catch(() => {
      /* ignore */
    });
    this.clearHeartbeatTimer().catch(() => {
      /* ignore */
    });

    // Reject all pending requests
    const disposalError = new Error('Client has been disposed');
    const pendingRequestsArray = Array.from(this.pendingRequests.values());
    for (const request of pendingRequestsArray) {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      request.reject(disposalError);
    }
    this.pendingRequests.clear();

    // Clear event listeners
    this.eventEmitter.removeAllListeners();
  }

  /**
   * Get current resource usage statistics
   */
  getResourceStats(): {
    pendingRequests: number;
    timeouts: number;
    intervals: number;
    eventListeners: number;
    totalResources: number;
  } {
    const resourceCount = this.resources.getResourceCount();
    return {
      pendingRequests: this.pendingRequests.size,
      timeouts: resourceCount.timeouts,
      intervals: resourceCount.intervals,
      eventListeners: resourceCount.listeners,
      totalResources:
        resourceCount.timeouts +
        resourceCount.intervals +
        resourceCount.listeners,
    };
  }

  /**
   * TypedEventEmitter implementation methods
   */
  on<K extends keyof IPCClientEvents>(
    event: K,
    listener: IPCClientEvents[K]
  ): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.eventEmitter.on(event as string, listener as any);
    return this;
  }

  once<K extends keyof IPCClientEvents>(
    event: K,
    listener: IPCClientEvents[K]
  ): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.eventEmitter.once(event as string, listener as any);
    return this;
  }

  emit<K extends keyof IPCClientEvents>(
    event: K,
    ...args: Parameters<IPCClientEvents[K]>
  ): boolean {
    return this.eventEmitter.emit(event as string, ...args);
  }

  removeListener<K extends keyof IPCClientEvents>(
    event: K,
    listener: IPCClientEvents[K]
  ): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.eventEmitter.removeListener(event as string, listener as any);
    return this;
  }

  off<K extends keyof IPCClientEvents>(
    event: K,
    listener: IPCClientEvents[K]
  ): this {
    return this.removeListener(event, listener);
  }

  removeAllListeners<K extends keyof IPCClientEvents>(event?: K): this {
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

  listeners<K extends keyof IPCClientEvents>(
    event: K
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): ((...args: any[]) => void)[] {
    return this.eventEmitter.listeners(event as string) as ((
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...args: any[]
    ) => void)[];
  }

  listenerCount<K extends keyof IPCClientEvents>(event: K): number {
    return this.eventEmitter.listenerCount(event as string);
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract connectToServer(): Promise<void>;
  protected abstract disconnectFromServer(): Promise<void>;
  protected abstract writeMessage(message: IPCMessage): Promise<void>;
}
