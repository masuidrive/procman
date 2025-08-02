/**
 * Named Pipe Server Implementation
 *
 * Concrete implementation of IPC server using Named Pipes.
 * Supports Windows systems.
 */

import * as net from 'net';
import { setTimeout, clearTimeout } from 'timers';
import { IPCServerBase } from './ipc-server-base';
import type { IPCServerConfig } from '../shared/ipc';
import { BaseSocketConnection } from './base-socket-connection';

/**
 * Named Pipe connection implementation
 */
class NamedPipeConnection extends BaseSocketConnection {
  constructor(socket: net.Socket) {
    super(socket);
  }
}

/**
 * Named Pipe Server
 */
export class NamedPipeServer extends IPCServerBase {
  private server: net.Server | null = null;
  private readonly pipePath: string;

  constructor(config: IPCServerConfig = {}) {
    super(config);

    // Determine pipe path
    this.pipePath = config.namedPipePath || '\\\\.\\pipe\\masuidrive-procman';
  }

  /**
   * Start the Named Pipe server
   */
  protected async startServer(): Promise<void> {
    // Create server
    this.server = net.createServer();

    // Set up server event handlers
    this.setupServerHandlers();

    // Start listening on named pipe
    return new Promise<void>((resolve, reject) => {
      this.server!.listen(this.pipePath, () => {
        resolve();
      });

      this.server!.on('error', reject);
    });
  }

  /**
   * Stop the Named Pipe server
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
          this.server = null;
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
   * Set up server event handlers
   */
  private setupServerHandlers(): void {
    if (!this.server) {
      return;
    }

    this.server.on('connection', (socket: net.Socket) => {
      const connection = new NamedPipeConnection(socket);
      this.setupConnectionEvents(connection);
    });

    this.setupCommonServerEvents(this.server);
  }

  /**
   * Get server-specific resource stats
   */
  getServerStats(): {
    pipePath: string;
    serverListening: boolean;
  } & ReturnType<typeof this.getResourceStats> {
    return {
      ...this.getResourceStats(),
      pipePath: this.pipePath,
      serverListening: !!this.server?.listening,
    };
  }
}
