/**
 * Resource Management Utilities
 *
 * Provides utilities for resource leak prevention, tracking, and cleanup.
 * Implements the Disposable pattern for proper resource management.
 */

import { setTimeout, clearTimeout, setInterval, clearInterval } from 'timers';
import { EventEmitter } from 'events';

/**
 * Represents a resource that can be disposed
 */
export interface IDisposable {
  dispose(): Promise<void> | void;
  isDisposed(): boolean;
}

/**
 * Represents a trackable resource with metadata
 */
export interface TrackedResource {
  id: string;
  type: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
  dispose(): Promise<void> | void;
}

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Resource manager for tracking and cleaning up resources
 */
export class ResourceManager extends EventEmitter implements IDisposable {
  private resources: Map<string, TrackedResource> = new Map();
  private disposed = false;
  private resourceCounter = 0;

  /**
   * Track a timeout and return a tracked wrapper
   */
  trackTimeout(
    callback: () => void,
    delay: number,
    metadata?: Record<string, unknown>
  ): TrackedTimeout {
    this.ensureNotDisposed();

    const id = this.generateResourceId('timeout');
    const timeoutHandle = setTimeout(() => {
      // Auto-remove from tracking when timeout fires
      this.untrackResource(id);
      callback();
    }, delay);

    const trackedTimeout = new TrackedTimeout(
      id,
      timeoutHandle,
      metadata,
      this
    );
    this.resources.set(id, trackedTimeout);
    this.emit('resourceTracked', trackedTimeout);

    return trackedTimeout;
  }

  /**
   * Track an interval and return a tracked wrapper
   */
  trackInterval(
    callback: () => void,
    interval: number,
    metadata?: Record<string, unknown>
  ): TrackedInterval {
    this.ensureNotDisposed();

    const id = this.generateResourceId('interval');
    const intervalHandle = setInterval(callback, interval);

    const trackedInterval = new TrackedInterval(
      id,
      intervalHandle,
      metadata,
      this
    );
    this.resources.set(id, trackedInterval);
    this.emit('resourceTracked', trackedInterval);

    return trackedInterval;
  }

  /**
   * Track an event listener and return a tracked wrapper
   */
  trackEventListener(
    emitter: EventEmitter,
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void,
    metadata?: Record<string, unknown>
  ): TrackedEventListener {
    this.ensureNotDisposed();

    const id = this.generateResourceId('eventListener');
    emitter.addListener(event, listener);

    const trackedListener = new TrackedEventListener(
      id,
      emitter,
      event,
      listener,
      metadata,
      this
    );
    this.resources.set(id, trackedListener);
    this.emit('resourceTracked', trackedListener);

    return trackedListener;
  }

  /**
   * Track a custom resource
   */
  trackResource(resource: TrackedResource): void {
    this.ensureNotDisposed();

    if (this.resources.has(resource.id)) {
      throw new Error(`Resource with ID '${resource.id}' is already tracked`);
    }

    this.resources.set(resource.id, resource);
    this.emit('resourceTracked', resource);
  }

  /**
   * Untrack a resource by ID without disposing it
   */
  untrackResource(id: string): boolean {
    const resource = this.resources.get(id);
    if (resource) {
      this.resources.delete(id);
      this.emit('resourceUntracked', resource);
      return true;
    }
    return false;
  }

  /**
   * Dispose a specific resource by ID
   */
  async disposeResource(id: string): Promise<boolean> {
    const resource = this.resources.get(id);
    if (!resource) {
      return false;
    }

    try {
      await resource.dispose();
      this.resources.delete(id);
      this.emit('resourceDisposed', resource);
      return true;
    } catch (error) {
      this.emit('resourceDisposeError', resource, error);
      // Still remove it from tracking even if disposal failed
      this.resources.delete(id);
      return false;
    }
  }

  /**
   * Get all tracked resources
   */
  getTrackedResources(): TrackedResource[] {
    return Array.from(this.resources.values());
  }

  /**
   * Get tracked resources by type
   */
  getResourcesByType(type: string): TrackedResource[] {
    return Array.from(this.resources.values()).filter((r) => r.type === type);
  }

  /**
   * Get resource count by type
   */
  getResourceCount(type?: string): number {
    if (type) {
      return this.getResourcesByType(type).length;
    }
    return this.resources.size;
  }

  /**
   * Get resources older than specified age in milliseconds
   */
  getStaleResources(maxAge: number): TrackedResource[] {
    const cutoff = Date.now() - maxAge;
    return Array.from(this.resources.values()).filter(
      (resource) => resource.createdAt < cutoff
    );
  }

  /**
   * Clean up stale resources
   */
  async cleanupStaleResources(maxAge: number): Promise<number> {
    const staleResources = this.getStaleResources(maxAge);
    let cleaned = 0;

    for (const resource of staleResources) {
      try {
        await this.disposeResource(resource.id);
        cleaned++;
      } catch (error) {
        this.emit('resourceDisposeError', resource, error);
      }
    }

    return cleaned;
  }

  /**
   * Dispose all tracked resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    const disposePromises = Array.from(this.resources.values()).map(
      async (resource) => {
        try {
          await resource.dispose();
          this.emit('resourceDisposed', resource);
        } catch (error) {
          this.emit('resourceDisposeError', resource, error);
        }
      }
    );

    await Promise.all(disposePromises);
    this.resources.clear();
    this.emit('disposed');
  }

  /**
   * Check if the resource manager is disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Generate a unique resource ID
   */
  private generateResourceId(type: string): string {
    return `${type}_${++this.resourceCounter}_${Date.now()}`;
  }

  /**
   * Ensure the manager is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('ResourceManager has been disposed');
    }
  }
}

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Utility class for preventing race conditions during disposal
 */
export class DisposalGuard {
  private disposing = false;
  private disposed = false;

  /**
   * Execute an operation with disposal protection
   */
  async executeWithGuard<T>(operation: () => Promise<T>): Promise<T> {
    if (this.disposed) {
      throw new Error('Object has been disposed');
    }

    if (this.disposing) {
      throw new Error('Object is being disposed');
    }

    return operation();
  }

  /**
   * Execute disposal with race condition protection
   */
  async executeDisposal(disposalFunc: () => Promise<void>): Promise<boolean> {
    if (this.disposed) {
      return false; // Already disposed
    }

    if (this.disposing) {
      return false; // Already disposing
    }

    this.disposing = true;

    try {
      await disposalFunc();
      this.disposed = true;
      return true;
    } catch (error) {
      this.disposing = false; // Reset on error
      throw error;
    }
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  isDisposing(): boolean {
    return this.disposing;
  }
}

/**
 * Create a new resource manager instance
 */
export function createResourceManager(): ResourceManager {
  return new ResourceManager();
}

/**
 * Create a new disposal guard instance
 */
export function createDisposalGuard(): DisposalGuard {
  return new DisposalGuard();
}
