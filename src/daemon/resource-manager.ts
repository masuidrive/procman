/**
 * Resource Management Utilities
 *
 * Provides utilities for resource leak prevention, tracking, and cleanup.
 * Implements the Disposable pattern for proper resource management.
 */

import { setTimeout, setInterval } from 'timers';
import { EventEmitter } from 'events';

import type { IDisposable, TrackedResource } from './resource-types.js';
import {
  TrackedTimeout,
  TrackedInterval,
  TrackedEventListener,
} from './tracked-resources.js';

// Re-export everything from split modules for backward compatibility
export type { IDisposable, TrackedResource } from './resource-types.js';
export {
  TrackedTimeout,
  TrackedInterval,
  TrackedEventListener,
} from './tracked-resources.js';
export { DisposableBase } from './disposable-base.js';
export { DisposalGuard, createDisposalGuard } from './disposal-guard.js';

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
 * Create a new resource manager instance
 */
export function createResourceManager(): ResourceManager {
  return new ResourceManager();
}
