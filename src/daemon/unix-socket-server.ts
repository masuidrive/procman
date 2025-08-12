/**
 * Unix Domain Socket Server Implementation
 *
 * Concrete implementation of IPC server using Unix Domain Sockets.
 * Supports Unix-like systems (Linux, macOS).
 */

import * as net from 'net';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
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
    const startTime = Date.now();
    console.error('[DEBUG-UNIX-SOCKET] Starting Unix socket server...');
    console.error(
      '[DEBUG-UNIX-SOCKET] Socket configuration:',
      JSON.stringify(
        {
          socketPath: this.socketPath,
          processId: process.pid,
          timestamp: new Date().toISOString(),
          environment: {
            HOME: process.env.HOME,
            PROCMAN_SOCKET_PATH: process.env.PROCMAN_SOCKET_PATH,
          },
        },
        null,
        2
      )
    );

    // Ensure directory exists
    const socketDir = path.dirname(this.socketPath);
    console.error('[DEBUG-UNIX-SOCKET] Creating socket directory:', socketDir);
    await fs.mkdir(socketDir, { recursive: true });
    console.error('[DEBUG-UNIX-SOCKET] ✓ Socket directory ready');

    // Remove existing socket file if it exists
    try {
      console.error('[DEBUG-UNIX-SOCKET] Removing existing socket file...');
      await fs.unlink(this.socketPath);
      console.error('[DEBUG-UNIX-SOCKET] ✓ Existing socket file removed');
    } catch (error) {
      console.error(
        '[DEBUG-UNIX-SOCKET] No existing socket file to remove (normal):',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any)?.code
      );
    }

    // Create server
    console.error('[DEBUG-UNIX-SOCKET] Creating net.Server instance...');
    this.server = net.createServer();
    console.error('[DEBUG-UNIX-SOCKET] ✓ Server instance created');

    // Set up server event handlers
    console.error('[DEBUG-UNIX-SOCKET] Setting up server event handlers...');
    this.setupServerHandlers();
    console.error('[DEBUG-UNIX-SOCKET] ✓ Event handlers configured');

    // Start listening
    console.error('[DEBUG-UNIX-SOCKET] Starting to listen on socket...');
    return new Promise<void>((resolve, reject) => {
      // Add error handler before listening
      const errorHandler = (error: Error): void => {
        const listenTime = Date.now() - startTime;
        console.error('[DEBUG-UNIX-SOCKET] ❌ Socket listen error');
        console.error(
          '[DEBUG-UNIX-SOCKET] Listen error details:',
          JSON.stringify(
            {
              listenTimeMs: listenTime,
              socketPath: this.socketPath,
              errorMessage: error.message,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              errorCode: (error as any)?.code,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              errorErrno: (error as any)?.errno,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              errorSyscall: (error as any)?.syscall,
            },
            null,
            2
          )
        );
        this.server!.removeListener('error', errorHandler);
        reject(error);
      };

      this.server!.on('error', errorHandler);

      console.error('[DEBUG-UNIX-SOCKET] Calling listen() on socket path...');
      this.server!.listen(this.socketPath, () => {
        const listenTime = Date.now() - startTime;
        console.error('[DEBUG-UNIX-SOCKET] ✓ Socket listen() callback fired');
        console.error(
          '[DEBUG-UNIX-SOCKET] Listen success stats:',
          JSON.stringify(
            {
              listenTimeMs: listenTime,
              socketPath: this.socketPath,
            },
            null,
            2
          )
        );

        // Remove error handler after successful listen
        this.server!.removeListener('error', errorHandler);

        console.error('[DEBUG-UNIX-SOCKET] Setting socket permissions...');
        this.setSocketPermissions()
          .then(() => {
            const totalTime = Date.now() - startTime;
            console.error('[DEBUG-UNIX-SOCKET] ✓ UNIX SOCKET SERVER READY');
            console.error(
              '[DEBUG-UNIX-SOCKET] Final socket stats:',
              JSON.stringify(
                {
                  totalStartupTimeMs: totalTime,
                  socketPath: this.socketPath,
                  socketExists: true, // At this point it should exist
                },
                null,
                2
              )
            );
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
      // Check connection limit immediately at socket level
      if (this.connections.size >= this.config.maxConnections) {
        // Log rejection for debugging if needed
        // console.error(`[DEBUG-CONNECTION-LIMIT] Socket-level limit check: connections=${this.connections.size}, max=${this.config.maxConnections}, rejecting socket`);
        // Immediately destroy socket at TCP level (no graceful end, immediate destroy)
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
