/**
 * Tracked Resource Implementations
 *
 * Provides concrete tracked resource wrappers for timeouts, intervals,
 * and event listeners.
 */

import { setTimeout, clearTimeout, setInterval, clearInterval } from 'timers';
import { EventEmitter } from 'events';

import type { TrackedResource } from './resource-types.js';
import type { ResourceManager } from './resource-manager.js';

/**
 * Timer resource wrapper for timeout tracking
 */
export class TrackedTimeout implements TrackedResource {
  public readonly id: string;
  public readonly type = 'timeout';
  public readonly createdAt: number;
  public readonly metadata?: Record<string, unknown>;

  private timeoutHandle: ReturnType<typeof setTimeout> | null;
  private disposed = false;
  private manager?: ResourceManager;

  constructor(
    id: string,
    timeoutHandle: ReturnType<typeof setTimeout>,
    metadata?: Record<string, unknown>,
    manager?: ResourceManager
  ) {
    this.id = id;
    this.timeoutHandle = timeoutHandle;
    this.createdAt = Date.now();
    this.metadata = metadata;
    this.manager = manager;
  }

  async dispose(): Promise<void> {
    if (this.disposed || !this.timeoutHandle) {
      return;
    }

    clearTimeout(this.timeoutHandle);
    this.timeoutHandle = null;
    this.disposed = true;

    // Auto-remove from manager
    if (this.manager) {
      this.manager.untrackResource(this.id);
    }
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  getHandle(): ReturnType<typeof setTimeout> | null {
    return this.timeoutHandle;
  }
}

/**
 * Interval resource wrapper for interval tracking
 */
export class TrackedInterval implements TrackedResource {
  public readonly id: string;
  public readonly type = 'interval';
  public readonly createdAt: number;
  public readonly metadata?: Record<string, unknown>;

  private intervalHandle: ReturnType<typeof setInterval> | null;
  private disposed = false;
  private manager?: ResourceManager;

  constructor(
    id: string,
    intervalHandle: ReturnType<typeof setInterval>,
    metadata?: Record<string, unknown>,
    manager?: ResourceManager
  ) {
    this.id = id;
    this.intervalHandle = intervalHandle;
    this.createdAt = Date.now();
    this.metadata = metadata;
    this.manager = manager;
  }

  async dispose(): Promise<void> {
    if (this.disposed || !this.intervalHandle) {
      return;
    }

    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    this.disposed = true;

    // Auto-remove from manager
    if (this.manager) {
      this.manager.untrackResource(this.id);
    }
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  getHandle(): ReturnType<typeof setInterval> | null {
    return this.intervalHandle;
  }
}

/**
 * Event listener resource wrapper
 */
export class TrackedEventListener implements TrackedResource {
  public readonly id: string;
  public readonly type = 'eventListener';
  public readonly createdAt: number;
  public readonly metadata?: Record<string, unknown>;

  private disposed = false;
  private manager?: ResourceManager;

  constructor(
    id: string,
    private emitter: EventEmitter,
    private event: string,
    private listener: (...args: any[]) => void,
    metadata?: Record<string, unknown>,
    manager?: ResourceManager
  ) {
    this.id = id;
    this.createdAt = Date.now();
    this.metadata = { event, ...metadata };
    this.manager = manager;
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    try {
      this.emitter.removeListener(this.event, this.listener);
    } catch {
      // Ignore errors during cleanup
    }
    this.disposed = true;

    // Auto-remove from manager
    if (this.manager) {
      this.manager.untrackResource(this.id);
    }
  }

  isDisposed(): boolean {
    return this.disposed;
  }
}
