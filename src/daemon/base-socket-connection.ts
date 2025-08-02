/**
 * Base Socket Connection Implementation
 *
 * Abstract base class for socket connection implementations.
 * Eliminates code duplication between UnixSocketConnection and NamedPipeConnection.
 */

import { EventEmitter } from 'events';
import * as net from 'net';
import { setTimeout, clearTimeout } from 'timers';
import type { IPCConnection, IPCMessage } from '../shared/ipc';
import { generateMessageId } from '../shared/ipc';
import { MessageProtocol } from './message-protocol';
import { IDisposable } from './resource-manager';

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
  private eventListeners: Set<{
    event: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void;
  }> = new Set();

  constructor(socket: net.Socket) {
    super();

    this.id = generateMessageId();
    this.socket = socket;
    this.connectedAt = Date.now();
    this.lastActivity = Date.now();
    this.protocol = new MessageProtocol();

    this.setupSocketHandlers();
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Remove all tracked event listeners
    for (const { event, listener } of this.eventListeners) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.socket.removeListener(event, listener as any);
    }
    this.eventListeners.clear();

    // Remove all our own event listeners
    this.removeAllListeners();

    // Destroy socket if not already destroyed
    if (!this.socket.destroyed) {
      this.socket.destroy();
    }
  }

  isDisposed(): boolean {
    return this.disposed;
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
      this.socket.write(buffer, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
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
      this.status = 'error';
      this.emit('error', error);
    };

    const closeHandler = (): void => {
      this.status = 'disconnected';
      this.emit('close');
    };

    const endHandler = (): void => {
      this.status = 'disconnected';
      this.emit('end');
    };

    // Track event listeners for cleanup
    this.eventListeners.add({ event: 'data', listener: dataHandler });
    this.eventListeners.add({ event: 'error', listener: errorHandler });
    this.eventListeners.add({ event: 'close', listener: closeHandler });
    this.eventListeners.add({ event: 'end', listener: endHandler });

    this.socket.on('data', dataHandler);
    this.socket.on('error', errorHandler);
    this.socket.on('close', closeHandler);
    this.socket.on('end', endHandler);
  }
}
