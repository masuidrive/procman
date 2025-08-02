/**
 * Simple Resource Manager - PM2 Style
 *
 * Lightweight resource management inspired by PM2's approach (~150 lines).
 * Replaces the over-engineered ResourceManager with simple timeout/interval tracking.
 */

import { EventEmitter } from 'events';
import { setTimeout, clearTimeout, setInterval, clearInterval } from 'timers';

/**
 * Simple disposable interface
 */
export interface SimpleDisposable {
  dispose(): void;
}

/**
 * Simple timeout wrapper for cleanup tracking
 */
export class SimpleTimeout implements SimpleDisposable {
  private handle: ReturnType<typeof setTimeout> | null;
  private disposed = false;

  constructor(handle: ReturnType<typeof setTimeout>) {
    this.handle = handle;
  }

  dispose(): void {
    if (this.disposed || !this.handle) return;

    clearTimeout(this.handle);
    this.handle = null;
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Simple interval wrapper for cleanup tracking
 */
export class SimpleInterval implements SimpleDisposable {
  private handle: ReturnType<typeof setInterval> | null;
  private disposed = false;

  constructor(handle: ReturnType<typeof setInterval>) {
    this.handle = handle;
  }

  dispose(): void {
    if (this.disposed || !this.handle) return;

    clearInterval(this.handle);
    this.handle = null;
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Simple resource cleanup manager
 * PM2-style lightweight implementation
 */
export class SimpleResourceManager {
  private timeouts: Set<SimpleTimeout> = new Set();
  private intervals: Set<SimpleInterval> = new Set();
  private listeners: Array<{
    emitter: EventEmitter;
    event: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void;
  }> = [];
  private disposed = false;

  /**
   * Create and track a timeout (PM2 style)
   */
  setTimeout(callback: () => void, delay: number): SimpleTimeout {
    if (this.disposed) {
      throw new Error('ResourceManager disposed');
    }

    const handle = setTimeout(() => {
      // Auto-cleanup when timeout fires (PM2 pattern)
      this.timeouts.delete(timeout);
      callback();
    }, delay);

    const timeout = new SimpleTimeout(handle);
    this.timeouts.add(timeout);
    return timeout;
  }

  /**
   * Create and track an interval (PM2 style)
   */
  setInterval(callback: () => void, interval: number): SimpleInterval {
    if (this.disposed) {
      throw new Error('ResourceManager disposed');
    }

    const handle = setInterval(callback, interval);
    const intervalObj = new SimpleInterval(handle);
    this.intervals.add(intervalObj);
    return intervalObj;
  }

  /**
   * Track event listener for cleanup (PM2 style)
   */
  addEventListener(
    emitter: EventEmitter,
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void
  ): void {
    if (this.disposed) {
      throw new Error('ResourceManager disposed');
    }

    emitter.addListener(event, listener);
    this.listeners.push({ emitter, event, listener });
  }

  /**
   * Clean up all resources (PM2 graceful shutdown style)
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Clear all timeouts
    for (const timeout of this.timeouts) {
      timeout.dispose();
    }
    this.timeouts.clear();

    // Clear all intervals
    for (const interval of this.intervals) {
      interval.dispose();
    }
    this.intervals.clear();

    // Remove all event listeners
    for (const { emitter, event, listener } of this.listeners) {
      try {
        emitter.removeListener(event, listener);
      } catch {
        // Ignore cleanup errors (PM2 style)
      }
    }
    this.listeners.length = 0;
  }

  /**
   * Get current resource count (basic monitoring)
   */
  getResourceCount(): {
    timeouts: number;
    intervals: number;
    listeners: number;
  } {
    return {
      timeouts: this.timeouts.size,
      intervals: this.intervals.size,
      listeners: this.listeners.length,
    };
  }
}

/**
 * Base class with simple resource management
 * Replaces the over-engineered DisposableBase
 */
export abstract class SimpleDisposableBase implements SimpleDisposable {
  protected resources = new SimpleResourceManager();
  protected disposed = false;

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Call custom cleanup first
    this.disposeCore();

    // Then clean up all resources
    this.resources.dispose();
  }

  /**
   * Override for custom cleanup logic
   */
  protected disposeCore(): void {
    // Default: no-op
  }

  /**
   * Simple timeout creation (PM2 style)
   */
  protected setTimeout(callback: () => void, delay: number): SimpleTimeout {
    return this.resources.setTimeout(callback, delay);
  }

  /**
   * Simple interval creation (PM2 style)
   */
  protected setInterval(
    callback: () => void,
    interval: number
  ): SimpleInterval {
    return this.resources.setInterval(callback, interval);
  }

  /**
   * Simple event listener tracking (PM2 style)
   */
  protected addEventListener(
    emitter: EventEmitter,
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void
  ): void {
    this.resources.addEventListener(emitter, event, listener);
  }

  protected ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`${this.constructor.name} disposed`);
    }
  }
}
