/**
 * Named Pipe Client Implementation
 *
 * Concrete implementation of IPC client using Named Pipes.
 * Supports Windows systems.
 */

import * as net from 'net';
import { setTimeout, clearTimeout } from 'timers';
import { IPCClientBase } from './ipc-client-base.js';
import { MessageProtocol } from './message-protocol.js';
import type { IPCMessage, IPCClientConfig } from '../shared/ipc.js';
import { SimpleTimeout } from './simple-resource-manager.js';

/**
 * Named Pipe Client
 */
export class NamedPipeClient extends IPCClientBase {
  private socket: net.Socket | null = null;
  private readonly pipePath: string;
  private readonly protocol: MessageProtocol;
  private connectionTimeout: SimpleTimeout | null = null;
  private eventListeners: Set<{
    event: string;
    listener: (...args: any[]) => void;
  }> = new Set();

  constructor(config: IPCClientConfig = { path: '' }) {
    super(config);

    // Determine pipe path
    this.pipePath =
      config.namedPipePath || config.path || '\\\\.\\pipe\\masuidrive-procman';
    this.protocol = new MessageProtocol();
  }

  /**
   * Connect to the Named Pipe server
   */
  protected async connectToServer(): Promise<void> {
    // Create socket
    this.socket = new net.Socket();

    // Set up socket event handlers
    this.setupSocketHandlers();

    // Connect to server
    return new Promise<void>((resolve, reject) => {
      this.connectionTimeout = this.setTimeout(() => {
        this.socket?.destroy();
        reject(new Error(`Connection timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      const errorHandler = (error: Error): void => {
        if (this.connectionTimeout) {
          this.connectionTimeout.dispose();
          this.connectionTimeout = null;
        }
        reject(error);
      };

      const connectHandler = (): void => {
        if (this.connectionTimeout) {
          this.connectionTimeout.dispose();
          this.connectionTimeout = null;
        }
        // Remove the temporary error handler
        this.socket?.removeListener('error', errorHandler);
        resolve();
      };

      this.socket!.once('connect', connectHandler);
      this.socket!.once('error', errorHandler);
      this.socket!.connect(this.pipePath);
    });
  }

  /**
   * Disconnect from the Named Pipe server
   */
  protected async disconnectFromServer(): Promise<void> {
    if (!this.socket) {
      return;
    }

    return new Promise<void>((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }

      // Clean up connection timeout if still active
      if (this.connectionTimeout) {
        this.connectionTimeout.dispose();
        this.connectionTimeout = null;
      }

      // Remove tracked event listeners
      this.cleanupEventListeners();

      // Set a timeout for graceful close
      const timeout = setTimeout(() => {
        if (this.socket && !this.socket.destroyed) {
          this.socket.destroy();
        }
        this.socket = null;
        resolve();
      }, 1000); // 1 second timeout

      this.socket.once('close', () => {
        clearTimeout(timeout);
        this.socket = null;
        resolve();
      });

      // Try graceful close first
      if (!this.socket.destroyed) {
        this.socket.end();
      }
    });
  }

  /**
   * Write message to the socket
   */
  protected async writeMessage(message: IPCMessage): Promise<void> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('Socket is not connected');
    }

    const buffer = this.protocol.encode(message);

    return new Promise<void>((resolve, reject) => {
      this.socket!.write(buffer, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get the pipe path
   */
  getPipePath(): string {
    return this.pipePath;
  }

  /**
   * Check if client is currently connected
   */
  isSocketConnected(): boolean {
    return !!(
      this.socket &&
      !this.socket.destroyed &&
      this.socket.readyState === 'open'
    );
  }

  /**
   * Set up socket event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.socket) {
      return;
    }

    const dataHandler = (data: Buffer): void => {
      try {
        this.handleData(data);
      } catch (error) {
        this.emit(
          'error',
          error instanceof Error ? error : new Error(String(error))
        );
      }
    };

    const errorHandler = (error: Error): void => {
      this.handleConnectionError(error);
    };

    const closeHandler = (hadError: boolean): void => {
      // Only treat as error if it was an unexpected close
      if (hadError && this.isConnected()) {
        this.handleConnectionError(
          new Error('Socket connection closed unexpectedly')
        );
      } else {
        // Normal close, just update state
        this.setConnectionStatus('disconnected');
      }
    };

    const endHandler = (): void => {
      // Normal end, just update state
      this.setConnectionStatus('disconnected');
    };

    const connectHandler = (): void => {
      this.emit('socketConnected');
    };

    // Track event listeners for cleanup
    this.eventListeners.add({ event: 'data', listener: dataHandler });
    this.eventListeners.add({ event: 'error', listener: errorHandler });
    this.eventListeners.add({ event: 'close', listener: closeHandler });
    this.eventListeners.add({ event: 'end', listener: endHandler });
    this.eventListeners.add({ event: 'connect', listener: connectHandler });

    this.socket.on('data', dataHandler);
    this.socket.on('error', errorHandler);
    this.socket.on('close', closeHandler);
    this.socket.on('end', endHandler);
    this.socket.on('connect', connectHandler);
  }

  /**
   * Clean up event listeners
   */
  private cleanupEventListeners(): void {
    if (!this.socket) {
      return;
    }

    // Remove all tracked event listeners
    for (const { event, listener } of this.eventListeners) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.socket.removeListener(event, listener as any);
    }
    this.eventListeners.clear();
  }

  /**
   * Override dispose to clean up client-specific resources
   */
  protected async disposeCore(): Promise<void> {
    // Clean up connection timeout
    if (this.connectionTimeout) {
      await this.connectionTimeout.dispose();
      this.connectionTimeout = null;
    }

    // Clean up event listeners
    this.cleanupEventListeners();

    // Call parent dispose
    await super.disposeCore();
  }

  /**
   * Get client-specific resource stats
   */
  getClientStats(): {
    pipePath: string;
    isSocketConnected: boolean;
    hasConnectionTimeout: boolean;
    trackedEventListeners: number;
  } & ReturnType<typeof this.getResourceStats> {
    return {
      ...this.getResourceStats(),
      pipePath: this.pipePath,
      isSocketConnected: this.isSocketConnected(),
      hasConnectionTimeout: !!this.connectionTimeout,
      trackedEventListeners: this.eventListeners.size,
    };
  }
}
