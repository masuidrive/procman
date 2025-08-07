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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    console.log(
      '[DEBUG-UNIX-CLIENT] Starting Unix socket client connection...'
    );
    console.log(
      '[DEBUG-UNIX-CLIENT] Connection parameters:',
      JSON.stringify(
        {
          socketPath: this.socketPath,
          timeout: this.config.timeout,
          processId: process.pid,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    // Check if socket file exists
    console.log('[DEBUG-UNIX-CLIENT] Checking if socket file exists...');
    const socketFileExists = await this.socketExists();
    console.log(
      '[DEBUG-UNIX-CLIENT] Socket file existence check:',
      JSON.stringify(
        {
          socketPath: this.socketPath,
          exists: socketFileExists,
          checkDurationMs: Date.now() - connectStartTime,
        },
        null,
        2
      )
    );

    if (!socketFileExists) {
      console.error('[DEBUG-UNIX-CLIENT] ❌ Socket file does not exist');
      throw new Error(`Socket file does not exist: ${this.socketPath}`);
    }

    // Create socket
    console.log('[DEBUG-UNIX-CLIENT] Creating new Socket instance...');
    this.socket = new net.Socket();
    console.log('[DEBUG-UNIX-CLIENT] ✓ Socket instance created');

    // Set up socket event handlers
    console.log('[DEBUG-UNIX-CLIENT] Setting up socket event handlers...');
    this.setupSocketHandlers();
    console.log('[DEBUG-UNIX-CLIENT] ✓ Socket event handlers configured');

    // Connect to server
    console.log('[DEBUG-UNIX-CLIENT] Starting connection attempt...');
    return new Promise<void>((resolve, reject) => {
      console.log(
        '[DEBUG-UNIX-CLIENT] Setting up connection timeout:',
        this.config.timeout,
        'ms'
      );
      this.connectionTimeout = this.setTimeout(() => {
        const timeoutDuration = Date.now() - connectStartTime;
        console.error('[DEBUG-UNIX-CLIENT] ❌ Connection timeout reached');
        console.error(
          '[DEBUG-UNIX-CLIENT] Timeout details:',
          JSON.stringify(
            {
              timeoutMs: this.config.timeout,
              actualDurationMs: timeoutDuration,
              socketPath: this.socketPath,
            },
            null,
            2
          )
        );
        this.socket?.destroy();
        reject(new Error(`Connection timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      const errorHandler = (error: Error): void => {
        const errorDuration = Date.now() - connectStartTime;
        console.error('[DEBUG-UNIX-CLIENT] ❌ Connection error occurred');
        console.error(
          '[DEBUG-UNIX-CLIENT] Error details:',
          JSON.stringify(
            {
              errorDurationMs: errorDuration,
              socketPath: this.socketPath,
              errorMessage: error.message,
              errorCode: (error as any)?.code,
              errorErrno: (error as any)?.errno,
              errorSyscall: (error as any)?.syscall,
            },
            null,
            2
          )
        );

        if (this.connectionTimeout) {
          this.connectionTimeout.dispose();
          this.connectionTimeout = null;
        }
        reject(error);
      };

      const connectHandler = (): void => {
        const connectDuration = Date.now() - connectStartTime;
        console.log(
          '[DEBUG-UNIX-CLIENT] ✓ Socket connection established successfully'
        );
        console.log(
          '[DEBUG-UNIX-CLIENT] Connection success stats:',
          JSON.stringify(
            {
              connectDurationMs: connectDuration,
              socketPath: this.socketPath,
              socketConnected: true,
            },
            null,
            2
          )
        );

        if (this.connectionTimeout) {
          this.connectionTimeout.dispose();
          this.connectionTimeout = null;
        }
        // Remove the temporary error handler
        this.socket?.removeListener('error', errorHandler);
        resolve();
      };

      console.log(
        '[DEBUG-UNIX-CLIENT] Registering connection event handlers...'
      );
      this.socket!.once('connect', connectHandler);
      this.socket!.once('error', errorHandler);

      console.log(
        '[DEBUG-UNIX-CLIENT] Calling socket.connect() with path:',
        this.socketPath
      );
      this.socket!.connect(this.socketPath);
      console.log(
        '[DEBUG-UNIX-CLIENT] socket.connect() call completed, waiting for events...'
      );
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
