/**
 * Disposable Base Class
 *
 * Abstract base class implementing the Disposable pattern with
 * integrated resource management.
 */

import { EventEmitter } from 'events';

import type { IDisposable } from './resource-types.js';
import { ResourceManager } from './resource-manager.js';
import type { TrackedTimeout } from './tracked-resources.js';
import type { TrackedInterval } from './tracked-resources.js';
import type { TrackedEventListener } from './tracked-resources.js';

/**
 * Abstract base class implementing the Disposable pattern
 */
export abstract class DisposableBase implements IDisposable {
  private disposed = false;
  protected readonly resourceManager: ResourceManager;

  constructor() {
    this.resourceManager = new ResourceManager();
  }

  /**
   * Dispose the object and all its resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    try {
      // Call the derived class cleanup method
      await this.disposeCore();
    } finally {
      // Always dispose the resource manager
      await this.resourceManager.dispose();
    }
  }

  /**
   * Check if the object is disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Ensure the object is not disposed
   */
  protected ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`${this.constructor.name} has been disposed`);
    }
  }

  /**
   * Override this method to implement custom disposal logic
   */
  protected abstract disposeCore(): Promise<void>;

  /**
   * Helper method to safely track timeouts
   */
  protected safeSetTimeout(
    callback: () => void,
    delay: number,
    metadata?: Record<string, unknown>
  ): TrackedTimeout {
    this.ensureNotDisposed();
    return this.resourceManager.trackTimeout(callback, delay, metadata);
  }

  /**
   * Helper method to safely track intervals
   */
  protected safeSetInterval(
    callback: () => void,
    interval: number,
    metadata?: Record<string, unknown>
  ): TrackedInterval {
    this.ensureNotDisposed();
    return this.resourceManager.trackInterval(callback, interval, metadata);
  }

  /**
   * Helper method to safely track event listeners
   */
  protected safeAddEventListener(
    emitter: EventEmitter,
    event: string,
    listener: (...args: any[]) => void,
    metadata?: Record<string, unknown>
  ): TrackedEventListener {
    this.ensureNotDisposed();
    return this.resourceManager.trackEventListener(
      emitter,
      event,
      listener,
      metadata
    );
  }
}
