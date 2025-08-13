/**
 * Unix Domain Socket Client Implementation
 *
 * Concrete implementation of IPC client using Unix Domain Sockets.
 * Supports Unix-like systems (Linux, macOS).
 */

import * as net from 'net';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { setTimeout, clearTimeout } from 'timers';
import { IPCClientBase } from './ipc-client-base.js';
import { MessageProtocol } from './message-protocol.js';
import type { IPCMessage, IPCClientConfig } from '../shared/ipc.js';
import { SimpleTimeout } from './simple-resource-manager.js';

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
    listener: (...args: any[]) => void;
  }> = new Set();

  constructor(config: IPCClientConfig = { path: '' }) {
    super(config);

    // Determine socket path - priority: env var > config.socketPath > config.path > default
    this.socketPath =
      process.env.PROCMAN_SOCKET_PATH ||
      config.socketPath ||
      config.path ||
      this.expandPath('~/.masuidrive-procman/procman.sock');

    // Validate the expanded path
    if (this.socketPath.includes('~')) {
      throw new Error(
        `Failed to expand socket path: ${this.socketPath}. HOME environment variable may not be set.`
      );
    }

    this.protocol = new MessageProtocol();
  }

  /**
   * Connect to the Unix socket server
   */
  protected async connectToServer(): Promise<void> {
    const connectStartTime = Date.now();

    // Debug logging only when DEBUG_IPC environment variable is set
    const debug = (message: string, data?: any): void => {
      if (process.env.DEBUG_IPC) {
        console.error(
          `[DEBUG-UNIX-CLIENT] ${message}`,
          data ? JSON.stringify(data, null, 2) : ''
        );
      }
    };

    debug('Starting Unix socket client connection...');
    debug('Connection parameters:', {
      socketPath: this.socketPath,
      timeout: this.config.timeout,
      processId: process.pid,
      timestamp: new Date().toISOString(),
    });

    // Check if socket file exists
    debug('Checking if socket file exists...');
    const socketFileExists = await this.socketExists();
    debug('Socket file existence check:', {
      socketPath: this.socketPath,
      exists: socketFileExists,
      checkDurationMs: Date.now() - connectStartTime,
    });

    if (!socketFileExists) {
      debug('❌ Socket file does not exist');
      throw new Error(`Socket file does not exist: ${this.socketPath}`);
    }

    // Create socket
    debug('Creating new Socket instance...');
    this.socket = new net.Socket();
    debug('✓ Socket instance created');

    // Set up socket event handlers
    debug('Setting up socket event handlers...');
    this.setupSocketHandlers();
    debug('✓ Socket event handlers configured');

    // Connect to server
    debug('Starting connection attempt...');
    return new Promise<void>((resolve, reject) => {
      debug('Setting up connection timeout:', this.config.timeout + 'ms');
      this.connectionTimeout = this.setTimeout(() => {
        const timeoutDuration = Date.now() - connectStartTime;
        debug('❌ Connection timeout reached');
        debug('Timeout details:', {
          timeoutMs: this.config.timeout,
          actualDurationMs: timeoutDuration,
          socketPath: this.socketPath,
        });
        this.socket?.destroy();
        reject(new Error(`Connection timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      const errorHandler = (error: Error): void => {
        const errorDuration = Date.now() - connectStartTime;
        debug('❌ Connection error occurred');
        debug('Error details:', {
          errorDurationMs: errorDuration,
          socketPath: this.socketPath,
          errorMessage: error.message,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          errorCode: (error as any)?.code,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          errorErrno: (error as any)?.errno,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          errorSyscall: (error as any)?.syscall,
        });

        if (this.connectionTimeout) {
          this.connectionTimeout.dispose();
          this.connectionTimeout = null;
        }
        reject(error);
      };

      const connectHandler = (): void => {
        const connectDuration = Date.now() - connectStartTime;
        debug('✓ Socket connection established successfully');
        debug('Connection success stats:', {
          connectDurationMs: connectDuration,
          socketPath: this.socketPath,
          socketConnected: true,
        });

        if (this.connectionTimeout) {
          this.connectionTimeout.dispose();
          this.connectionTimeout = null;
        }
        // Remove the temporary error handler
        this.socket?.removeListener('error', errorHandler);
        resolve();
      };

      debug('Registering connection event handlers...');
      this.socket!.once('connect', connectHandler);
      this.socket!.once('error', errorHandler);

      debug('Calling socket.connect() with path:', this.socketPath);
      this.socket!.connect(this.socketPath);
      debug('socket.connect() call completed, waiting for events...');
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
    // Check socket state more strictly
    if (!this.socket || this.socket.destroyed || !this.socket.writable) {
      throw new Error('Socket is not connected');
    }

    const buffer = this.protocol.encode(message);

    return new Promise<void>((resolve, reject) => {
      // Double-check socket state before attempting to write
      if (!this.socket || this.socket.destroyed || !this.socket.writable) {
        reject(new Error('Socket is not connected'));
        return;
      }

      // Set up error handler with proper cleanup
      const errorHandler = (error: Error): void => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((error as any)?.code === 'EPIPE') {
          // Connection was closed by the other end, update our state
          this.setConnectionStatus('disconnected');
        }
        // Don't call reject here - let the write callback handle it
      };

      try {
        this.socket.once('error', errorHandler);

        this.socket.write(buffer, (error) => {
          // Always clean up the error handler
          this.socket?.removeListener('error', errorHandler);

          if (error) {
            // Handle EPIPE errors gracefully (broken pipe - connection closed)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((error as any)?.code === 'EPIPE') {
              // Connection was closed by the other end, update our state
              this.setConnectionStatus('disconnected');
              // Convert EPIPE to a more descriptive error for better handling
              reject(
                new Error(
                  'Connection was closed by server (connection limit or server shutdown)'
                )
              );
              return;
            }
            reject(error);
          } else {
            resolve();
          }
        });
      } catch (syncError) {
        // Clean up error handler if write() throws synchronously
        this.socket?.removeListener('error', errorHandler);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((syncError as any)?.code === 'EPIPE') {
          this.setConnectionStatus('disconnected');
          // Convert EPIPE to a more descriptive error for better handling
          reject(
            new Error(
              'Connection was closed by server (connection limit or server shutdown)'
            )
          );
          return;
        }
        reject(syncError);
      }
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
      // Handle EPIPE errors gracefully to prevent uncaught exceptions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.code === 'EPIPE') {
        // Connection was closed by server, update state but don't emit error
        this.setConnectionStatus('disconnected');
        return;
      }
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
      // Enhanced HOME detection: process.env.HOME || os.homedir()
      const homeDir = process.env.HOME || os.homedir();
      if (!homeDir) {
        throw new Error('Unable to resolve home directory for socket path');
      }
      return path.join(homeDir, filePath.slice(2));
    }
    return filePath;
  }
}
