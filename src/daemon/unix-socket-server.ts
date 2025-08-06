/**
 * Unix Domain Socket Server Implementation
 *
 * Concrete implementation of IPC server using Unix Domain Sockets.
 * Supports Unix-like systems (Linux, macOS).
 */

import * as net from 'net';
import * as fs from 'fs/promises';
import * as path from 'path';
import { setTimeout, clearTimeout } from 'timers';
import { IPCServerBase } from './ipc-server-base.js';
import type { IPCServerConfig } from '../shared/ipc.js';
import { BaseSocketConnection } from './base-socket-connection.js';
import { SOCKET_PERMISSIONS } from '../shared/constants.js';

/**
 * Unix Socket connection implementation
 */
class UnixSocketConnection extends BaseSocketConnection {
  constructor(socket: net.Socket) {
    super(socket);
  }
}

/**
 * Unix Domain Socket Server
 */
export class UnixSocketServer extends IPCServerBase {
  private server: net.Server | null = null;
  private readonly socketPath: string;

  constructor(config: IPCServerConfig = { path: '' }) {
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
  }

  /**
   * Start the Unix socket server
   */
  protected async startServer(): Promise<void> {
    // Ensure directory exists
    const socketDir = path.dirname(this.socketPath);
    await fs.mkdir(socketDir, { recursive: true });

    // Remove existing socket file if it exists
    try {
      await fs.unlink(this.socketPath);
    } catch {
      // File doesn't exist, which is fine
    }

    // Create server
    this.server = net.createServer();

    // Set up server event handlers
    this.setupServerHandlers();

    // Start listening
    return new Promise<void>((resolve, reject) => {
      // Add error handler before listening
      const errorHandler = (error: Error): void => {
        this.server!.removeListener('error', errorHandler);
        reject(error);
      };

      this.server!.on('error', errorHandler);

      this.server!.listen(this.socketPath, () => {
        // Remove error handler after successful listen
        this.server!.removeListener('error', errorHandler);

        this.setSocketPermissions()
          .then(() => {
            resolve();
          })
          .catch(reject);
      });
    });
  }

  /**
   * Stop the Unix socket server
   */
  protected async stopServer(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        this.server = null;
        resolve();
      }, 5000);

      this.server!.close((error) => {
        clearTimeout(timeout);
        if (error) {
          reject(error);
        } else {
          // Clean up socket file
          this.cleanupSocketFile()
            .then(() => {
              this.server = null;
              resolve();
            })
            .catch(() => {
              // Ignore cleanup errors
              this.server = null;
              resolve();
            });
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
   * Set up server event handlers
   */
  private setupServerHandlers(): void {
    if (!this.server) {
      return;
    }

    this.server.on('connection', (socket: net.Socket) => {
      // Check connection limit before accepting
      if (this.connections.size >= this.config.maxConnections) {
        // Immediately destroy socket when limit exceeded
        socket.end();
        socket.destroy();
        return;
      }

      const connection = new UnixSocketConnection(socket);
      this.setupConnectionEvents(connection);
    });

    this.setupCommonServerEvents(this.server);
  }

  /**
   * Set socket file permissions (0600 - owner read/write only)
   */
  private async setSocketPermissions(): Promise<void> {
    try {
      // Check if socket file exists before trying to set permissions
      await fs.access(this.socketPath, fs.constants.F_OK);
      await fs.chmod(this.socketPath, SOCKET_PERMISSIONS);
    } catch (error) {
      // Log warning but don't fail - socket permissions may not be critical in test environments
      console.warn(`Failed to set socket permissions: ${error}`);
    }
  }

  /**
   * Clean up socket file
   */
  private async cleanupSocketFile(): Promise<void> {
    try {
      await fs.unlink(this.socketPath);
    } catch {
      // Ignore errors - file might not exist
    }
  }

  /**
   * Override dispose to clean up server-specific resources
   */
  protected async disposeCore(): Promise<void> {
    // Clean up socket file first
    await this.cleanupSocketFile();

    // Call parent dispose
    await super.disposeCore();
  }

  /**
   * Get server-specific resource stats
   */
  getServerStats(): {
    socketPath: string;
    socketExists: boolean;
    serverListening: boolean;
  } & ReturnType<typeof this.getResourceStats> {
    return {
      ...this.getResourceStats(),
      socketPath: this.socketPath,
      socketExists: false, // This would need to be checked asynchronously
      serverListening: !!this.server?.listening,
    };
  }

  /**
   * Expand tilde in file paths
   */
  private expandPath(filePath: string): string {
    if (filePath.startsWith('~/')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      if (!homeDir) {
        throw new Error('Unable to resolve home directory for socket path');
      }
      return path.join(homeDir, filePath.slice(2));
    }
    return filePath;
  }
}
