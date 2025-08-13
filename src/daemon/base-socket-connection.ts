/**
 * Base Socket Connection Implementation
 *
 * Abstract base class for socket connection implementations.
 * Eliminates code duplication between UnixSocketConnection and NamedPipeConnection.
 */

import { EventEmitter } from 'events';
import * as net from 'net';
import { setTimeout, clearTimeout } from 'timers';
import type { IPCConnection, IPCMessage } from '../shared/ipc.js';
import { generateMessageId } from '../shared/ipc.js';
import { MessageProtocol } from './message-protocol.js';
import { IDisposable } from './resource-manager.js';
import { EventCleanupHelper } from '../utils/event-cleanup.js';

/**
 * Base socket connection class implementing common functionality
 */
export abstract class BaseSocketConnection
  extends EventEmitter
  implements IPCConnection, IDisposable
{
  public readonly id: string;
  public status: 'connected' | 'disconnected' | 'connecting' | 'error' =
    'connected';
  public readonly connectedAt: number;
  public lastActivity: number;

  protected readonly socket: net.Socket;
  protected readonly protocol: MessageProtocol;
  private disposed = false;

  // Use EventCleanupHelper for listener tracking
  private readonly cleanup = new EventCleanupHelper();

  constructor(socket: net.Socket) {
    super();

    this.id = generateMessageId();
    this.socket = socket;
    this.connectedAt = Date.now();
    this.lastActivity = Date.now();
    this.protocol = new MessageProtocol();

    // No initialization needed for EventCleanupHelper

    this.setupSocketHandlers();
  }

  /**
   * Private method to register and track listeners
   */
  private registerListener<T extends EventEmitter>(
    emitter: T,
    event: string | symbol,
    listener: (...args: any[]) => void
  ): void {
    this.cleanup.track(emitter, event, listener);
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Clean up all tracked listeners
    await this.cleanup.dispose();

    // Remove all our own event listeners
    this.removeAllListeners();

    // Destroy socket if not already destroyed
    if (!this.socket.destroyed) {
      this.socket.destroy();
    }

    // Listeners cleaned up by EventCleanupHelper
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get statistics about listener management
   */
  public getListenerStats(): {
    managedListeners: number;
    ownListeners: number;
  } {
    const ownEvents = this.eventNames();
    let ownListenersCount = 0;

    for (const event of ownEvents) {
      ownListenersCount += this.listenerCount(event);
    }

    return {
      managedListeners: this.cleanup.getListenerCount(),
      ownListeners: ownListenersCount,
    };
  }

  /**
   * Send message to this connection
   */
  async send(message: IPCMessage): Promise<void> {
    if (this.status !== 'connected') {
      throw new Error('Connection is not active');
    }

    try {
      const buffer = this.protocol.encode(message);
      await this.writeToSocket(buffer);
      this.lastActivity = Date.now();
    } catch (error) {
      this.status = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (this.status === 'disconnected') {
      return;
    }

    this.status = 'disconnected';

    return new Promise<void>((resolve) => {
      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        if (!this.socket.destroyed) {
          this.socket.destroy();
        }
        this.dispose();
        resolve();
      }, 2000);

      this.socket.once('close', () => {
        clearTimeout(timeout);
        this.emit('close');
        this.dispose();
        resolve();
      });

      // Try graceful close first
      if (!this.socket.destroyed) {
        this.socket.end();

        // Force close after a short delay if not closed gracefully
        setTimeout(() => {
          if (!this.socket.destroyed) {
            this.socket.destroy();
          }
        }, 1000);
      }
    });
  }

  /**
   * Force destroy the connection immediately (synchronous)
   */
  destroy(): void {
    this.status = 'disconnected';
    if (!this.socket.destroyed) {
      this.socket.destroy();
    }
    this.dispose();
  }

  /**
   * Check if connection is alive
   */
  isAlive(): boolean {
    return this.status === 'connected' && !this.socket.destroyed;
  }

  /**
   * Write buffer to socket
   */
  private writeToSocket(buffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check socket state more strictly
      if (this.socket.destroyed || !this.socket.writable) {
        reject(new Error('Socket is not connected'));
        return;
      }

      // Set up error handler with proper cleanup
      const errorHandler = (error: Error): void => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((error as any)?.code === 'EPIPE') {
          // Connection was closed by the other end, update our state
          this.status = 'disconnected';
        }
        // Don't call reject here - let the write callback handle it
      };

      try {
        this.socket.once('error', errorHandler);

        this.socket.write(buffer, (error) => {
          // Always clean up the error handler
          this.socket.removeListener('error', errorHandler);

          if (error) {
            // Handle EPIPE errors gracefully (broken pipe - connection closed)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((error as any)?.code === 'EPIPE') {
              // Connection was closed by the other end, update our state
              this.status = 'disconnected';
            }
            reject(error);
          } else {
            resolve();
          }
        });
      } catch (syncError) {
        // Clean up error handler if write() throws synchronously
        this.socket.removeListener('error', errorHandler);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((syncError as any)?.code === 'EPIPE') {
          this.status = 'disconnected';
        }
        reject(syncError);
      }
    });
  }

  /**
   * Set up socket event handlers
   */
  private setupSocketHandlers(): void {
    const dataHandler = (data: Buffer): void => {
      try {
        this.lastActivity = Date.now();
        this.emit('data', data);
      } catch (error) {
        this.emit('error', error);
      }
    };

    const errorHandler = (error: Error): void => {
      // Handle EPIPE errors gracefully (broken pipe - connection closed)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.code === 'EPIPE') {
        // EPIPE is expected when connection closes, just update status
        this.status = 'disconnected';
        // Don't emit error for expected EPIPE, just emit close
        this.emit('close');
      } else {
        this.status = 'error';
        this.emit('error', error);
      }
    };

    const closeHandler = (): void => {
      this.status = 'disconnected';
      this.emit('close');
    };

    const endHandler = (): void => {
      this.status = 'disconnected';
      this.emit('end');
    };

    // Register and track event listeners with EventCleanupHelper
    this.registerListener(this.socket, 'data', dataHandler);
    this.registerListener(this.socket, 'error', errorHandler);
    this.registerListener(this.socket, 'close', closeHandler);
    this.registerListener(this.socket, 'end', endHandler);
  }
}
