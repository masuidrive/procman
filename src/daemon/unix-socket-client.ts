/**
 * Unix Domain Socket Client Implementation
 *
 * Concrete implementation of IPC client using Unix Domain Sockets.
 * Supports Unix-like systems (Linux, macOS).
 */

import * as net from 'net';
import * as fs from 'fs/promises';
import * as path from 'path';
import { setTimeout, clearTimeout } from 'timers';
import { IPCClientBase } from './ipc-client-base';
import { MessageProtocol } from './message-protocol';
import type { IPCMessage, IPCClientConfig } from '../shared/ipc';
import { SimpleTimeout } from './simple-resource-manager';

/**
 * Unix Domain Socket Client
 */
export class UnixSocketClient extends IPCClientBase {
  private socket: net.Socket | null = null;
  private readonly socketPath: string;
  private readonly protocol: MessageProtocol;
  private connectionTimeout: SimpleTimeout | null = null;
  private eventListeners: Set<{
    event: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void;
  }> = new Set();

  constructor(config: IPCClientConfig = { path: '' }) {
    super(config);

    // Determine socket path
    this.socketPath =
      config.socketPath ||
      config.path ||
      this.expandPath('~/.masuidrive-procman/procman.sock');
    this.protocol = new MessageProtocol();
  }

  /**
   * Connect to the Unix socket server
   */
  protected async connectToServer(): Promise<void> {
    // Check if socket file exists
    if (!(await this.socketExists())) {
      throw new Error(`Socket file does not exist: ${this.socketPath}`);
    }

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
      this.socket!.connect(this.socketPath);
    });
  }

  /**
   * Disconnect from the Unix socket server
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
   * Get the socket path
   */
  getSocketPath(): string {
    return this.socketPath;
  }

  /**
   * Check if socket file exists
   */
  async socketExists(): Promise<boolean> {
    try {
      await fs.access(this.socketPath);
      return true;
    } catch {
      return false;
    }
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
    socketPath: string;
    isSocketConnected: boolean;
    hasConnectionTimeout: boolean;
    trackedEventListeners: number;
  } & ReturnType<typeof this.getResourceStats> {
    return {
      ...this.getResourceStats(),
      socketPath: this.socketPath,
      isSocketConnected: this.isSocketConnected(),
      hasConnectionTimeout: !!this.connectionTimeout,
      trackedEventListeners: this.eventListeners.size,
    };
  }

  /**
   * Expand tilde in file paths
   */
  private expandPath(filePath: string): string {
    if (filePath.startsWith('~/')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      return path.join(homeDir, filePath.slice(2));
    }
    return filePath;
  }
}
