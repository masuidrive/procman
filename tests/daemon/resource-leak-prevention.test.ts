/**
 * Resource Leak Prevention Tests
 *
 * Tests for resource management and leak prevention in IPC components.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ResourceManager,
  DisposableBase,
  DisposalGuard,
  createResourceManager,
  createDisposalGuard,
} from '../../src/daemon/resource-manager';
import { EventEmitter } from 'events';

describe('Resource Manager', () => {
  let resourceManager: ResourceManager;

  beforeEach(() => {
    resourceManager = createResourceManager();
  });

  afterEach(async () => {
    if (!resourceManager.isDisposed()) {
      await resourceManager.dispose();
    }
  });

  describe('Timeout Tracking', () => {
    it('should track and dispose timeouts', async () => {
      const callback = vi.fn();
      const timeout = resourceManager.trackTimeout(callback, 1000);

      expect(resourceManager.getResourceCount('timeout')).toBe(1);
      expect(timeout.isDisposed()).toBe(false);

      await timeout.dispose();
      expect(timeout.isDisposed()).toBe(true);
      expect(resourceManager.getResourceCount('timeout')).toBe(0);
    });

    it('should auto-remove timeout when it fires', async () => {
      const callback = vi.fn();

      resourceManager.trackTimeout(callback, 10);
      expect(resourceManager.getResourceCount('timeout')).toBe(1);

      // Wait for timeout to fire
      await new Promise((resolve) => global.setTimeout(resolve, 50));

      expect(callback).toHaveBeenCalled();
      expect(resourceManager.getResourceCount('timeout')).toBe(0);
    });

    it('should handle multiple timeouts', async () => {
      const timeout1 = resourceManager.trackTimeout(() => {}, 1000);
      const timeout2 = resourceManager.trackTimeout(() => {}, 2000);

      expect(resourceManager.getResourceCount('timeout')).toBe(2);

      await timeout1.dispose();
      expect(resourceManager.getResourceCount('timeout')).toBe(1);

      await timeout2.dispose();
      expect(resourceManager.getResourceCount('timeout')).toBe(0);
    });
  });

  describe('Interval Tracking', () => {
    it('should track and dispose intervals', async () => {
      const callback = vi.fn();
      const interval = resourceManager.trackInterval(callback, 1000);

      expect(resourceManager.getResourceCount('interval')).toBe(1);
      expect(interval.isDisposed()).toBe(false);

      await interval.dispose();
      expect(interval.isDisposed()).toBe(true);
      expect(resourceManager.getResourceCount('interval')).toBe(0);
    });

    it('should handle multiple intervals', async () => {
      const interval1 = resourceManager.trackInterval(() => {}, 1000);
      const interval2 = resourceManager.trackInterval(() => {}, 2000);

      expect(resourceManager.getResourceCount('interval')).toBe(2);

      await interval1.dispose();
      expect(resourceManager.getResourceCount('interval')).toBe(1);

      await interval2.dispose();
      expect(resourceManager.getResourceCount('interval')).toBe(0);
    });
  });

  describe('Event Listener Tracking', () => {
    it('should track and dispose event listeners', async () => {
      const emitter = new EventEmitter();
      const listener = vi.fn();

      const trackedListener = resourceManager.trackEventListener(
        emitter,
        'test',
        listener
      );

      expect(resourceManager.getResourceCount('eventListener')).toBe(1);
      expect(trackedListener.isDisposed()).toBe(false);

      // Verify listener is actually attached
      emitter.emit('test', 'data');
      expect(listener).toHaveBeenCalledWith('data');

      await trackedListener.dispose();
      expect(trackedListener.isDisposed()).toBe(true);
      expect(resourceManager.getResourceCount('eventListener')).toBe(0);

      // Verify listener is removed
      listener.mockClear();
      emitter.emit('test', 'data2');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle multiple event listeners', async () => {
      const emitter = new EventEmitter();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const trackedListener1 = resourceManager.trackEventListener(
        emitter,
        'test',
        listener1
      );
      const trackedListener2 = resourceManager.trackEventListener(
        emitter,
        'test',
        listener2
      );

      expect(resourceManager.getResourceCount('eventListener')).toBe(2);

      await trackedListener1.dispose();
      expect(resourceManager.getResourceCount('eventListener')).toBe(1);

      await trackedListener2.dispose();
      expect(resourceManager.getResourceCount('eventListener')).toBe(0);
    });
  });

  describe('Resource Cleanup', () => {
    it('should dispose all resources on manager disposal', async () => {
      const emitter = new EventEmitter();

      resourceManager.trackTimeout(() => {}, 1000);
      resourceManager.trackInterval(() => {}, 1000);
      resourceManager.trackEventListener(emitter, 'test', () => {});

      expect(resourceManager.getResourceCount()).toBe(3);

      await resourceManager.dispose();
      expect(resourceManager.getResourceCount()).toBe(0);
      expect(resourceManager.isDisposed()).toBe(true);
    });

    it('should clean up stale resources', async () => {
      // Manually create stale timeout
      const id1 = 'stale-timeout-1';
      const timeout1Handle = global.setTimeout(() => {}, 5000);
      const staleTimeout = {
        id: id1,
        type: 'timeout',
        createdAt: Date.now() - 10000, // 10 seconds ago
        dispose: async (): Promise<void> => {
          global.clearTimeout(timeout1Handle);
        },
      };

      resourceManager.trackResource(staleTimeout);
      resourceManager.trackTimeout(() => {}, 5000);

      expect(resourceManager.getResourceCount()).toBe(2);

      const cleaned = await resourceManager.cleanupStaleResources(5000); // 5 second threshold
      expect(cleaned).toBe(1); // Only the old one should be cleaned
      expect(resourceManager.getResourceCount()).toBe(1);
    });

    it('should handle disposal errors gracefully', async () => {
      // Create a resource that throws on disposal
      const badResource = {
        id: 'bad-resource',
        type: 'bad',
        createdAt: Date.now(),
        dispose: vi.fn().mockRejectedValue(new Error('Disposal failed')),
      };

      resourceManager.trackResource(badResource);
      expect(resourceManager.getResourceCount()).toBe(1);

      // Disposal should complete despite error
      await resourceManager.dispose();
      expect(resourceManager.getResourceCount()).toBe(0);
      expect(badResource.dispose).toHaveBeenCalled();
    });
  });

  describe('Resource Statistics', () => {
    it('should provide accurate resource statistics', () => {
      const emitter = new EventEmitter();

      resourceManager.trackTimeout(() => {}, 1000);
      resourceManager.trackTimeout(() => {}, 2000);
      resourceManager.trackInterval(() => {}, 1000);
      resourceManager.trackEventListener(emitter, 'test', () => {});

      expect(resourceManager.getResourceCount('timeout')).toBe(2);
      expect(resourceManager.getResourceCount('interval')).toBe(1);
      expect(resourceManager.getResourceCount('eventListener')).toBe(1);
      expect(resourceManager.getResourceCount()).toBe(4);

      const timeouts = resourceManager.getResourcesByType('timeout');
      expect(timeouts).toHaveLength(2);

      const intervals = resourceManager.getResourcesByType('interval');
      expect(intervals).toHaveLength(1);
    });
  });
});

describe('DisposableBase', () => {
  class TestDisposable extends DisposableBase {
    public disposeCoreCalled = false;

    protected async disposeCore(): Promise<void> {
      this.disposeCoreCalled = true;
    }

    public testSafeSetTimeout(callback: () => void, delay: number): void {
      return this.safeSetTimeout(callback, delay);
    }

    public testSafeSetInterval(callback: () => void, interval: number): void {
      return this.safeSetInterval(callback, interval);
    }

    public testSafeAddEventListener(
      emitter: EventEmitter,
      event: string,
      listener: () => void
    ): void {
      return this.safeAddEventListener(emitter, event, listener);
    }
  }

  let disposable: TestDisposable;

  beforeEach(() => {
    disposable = new TestDisposable();
  });

  afterEach(async () => {
    if (!disposable.isDisposed()) {
      await disposable.dispose();
    }
  });

  it('should implement proper disposal lifecycle', async () => {
    expect(disposable.isDisposed()).toBe(false);
    expect(disposable.disposeCoreCalled).toBe(false);

    await disposable.dispose();

    expect(disposable.isDisposed()).toBe(true);
    expect(disposable.disposeCoreCalled).toBe(true);

    // Double disposal should be safe
    await disposable.dispose();
    expect(disposable.isDisposed()).toBe(true);
  });

  it('should track resources through safe methods', async () => {
    const callback = vi.fn();
    const emitter = new EventEmitter();

    disposable.testSafeSetTimeout(callback, 1000);
    disposable.testSafeSetInterval(callback, 1000);
    disposable.testSafeAddEventListener(emitter, 'test', callback);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((disposable as any).resourceManager.getResourceCount()).toBe(3);

    await disposable.dispose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((disposable as any).resourceManager.getResourceCount()).toBe(0);
  });

  it('should prevent operations after disposal', async () => {
    await disposable.dispose();

    expect(() => {
      disposable.testSafeSetTimeout(() => {}, 1000);
    }).toThrow('TestDisposable has been disposed');

    expect(() => {
      disposable.testSafeSetInterval(() => {}, 1000);
    }).toThrow('TestDisposable has been disposed');
  });
});

describe('DisposalGuard', () => {
  let guard: DisposalGuard;

  beforeEach(() => {
    guard = createDisposalGuard();
  });

  it('should allow operations before disposal', async () => {
    const result = await guard.executeWithGuard(async () => {
      return 'success';
    });

    expect(result).toBe('success');
  });

  it('should prevent operations during disposal', async () => {
    let disposalStarted = false;
    let operationCompleted = false;

    // Start disposal process
    const disposalPromise = guard.executeDisposal(async () => {
      disposalStarted = true;
      await new Promise((resolve) => global.setTimeout(resolve, 100));
    });

    // Try to execute operation while disposing
    await expect(
      guard.executeWithGuard(async () => {
        operationCompleted = true;
        return 'should not complete';
      })
    ).rejects.toThrow('Object is being disposed');

    await disposalPromise;
    expect(disposalStarted).toBe(true);
    expect(operationCompleted).toBe(false);
  });

  it('should prevent operations after disposal', async () => {
    await guard.executeDisposal(async () => {
      // Disposal logic
    });

    expect(guard.isDisposed()).toBe(true);

    await expect(
      guard.executeWithGuard(async () => {
        return 'should fail';
      })
    ).rejects.toThrow('Object has been disposed');
  });

  it('should handle double disposal gracefully', async () => {
    const first = await guard.executeDisposal(async () => {
      // First disposal
    });
    expect(first).toBe(true);

    const second = await guard.executeDisposal(async () => {
      // Second disposal attempt
    });
    expect(second).toBe(false); // Should return false for already disposed
  });

  it('should reset disposal state on error', async () => {
    await expect(
      guard.executeDisposal(async () => {
        throw new Error('Disposal failed');
      })
    ).rejects.toThrow('Disposal failed');

    expect(guard.isDisposed()).toBe(false);
    expect(guard.isDisposing()).toBe(false);

    // Should be able to try again
    const retry = await guard.executeDisposal(async () => {
      // Successful disposal
    });
    expect(retry).toBe(true);
    expect(guard.isDisposed()).toBe(true);
  });
});

describe('Resource Leak Prevention Integration', () => {
  it('should demonstrate comprehensive resource management', async () => {
    class TestIPCComponent extends DisposableBase {
      private connections: Set<unknown> = new Set();

      private messageHandlers: Map<string, (...args: unknown[]) => unknown> =
        new Map();

      constructor() {
        super();
        this.setupPingInterval();
        this.setupCleanupTimer();
      }

      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      private setupPingInterval() {
        this.safeSetInterval(
          () => {
            // Ping logic
          },
          30000,
          { type: 'pingInterval' }
        );
      }

      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      private setupCleanupTimer() {
        this.safeSetTimeout(
          () => {
            this.cleanupStaleConnections();
          },
          60000,
          { type: 'cleanupTimer' }
        );
      }

      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any
      addConnection(connection: any) {
        this.connections.add(connection);

        // Track connection events
        this.safeAddEventListener(
          connection,
          'close',
          () => this.connections.delete(connection),
          { connectionId: connection.id }
        );
      }

      addMessageHandler(
        type: string,
        handler: (...args: unknown[]) => unknown
      ): void {
        this.messageHandlers.set(type, handler);
      }

      private cleanupStaleConnections(): void {
        // Cleanup logic
      }

      protected async disposeCore(): Promise<void> {
        // Clear connections
        this.connections.clear();
        this.messageHandlers.clear();
      }

      getStats(): { connections: number; handlers: number; resources: number } {
        return {
          connections: this.connections.size,
          handlers: this.messageHandlers.size,
          resources: this.resourceManager.getResourceCount(),
        };
      }
    }

    const component = new TestIPCComponent();
    const mockConnection = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockConnection as any).id = 'test-connection';

    component.addConnection(mockConnection);
    component.addMessageHandler('test', () => {});

    const stats = component.getStats();
    expect(stats.connections).toBe(1);
    expect(stats.handlers).toBe(1);
    expect(stats.resources).toBe(3); // ping interval + cleanup timer + event listener

    // Dispose and verify cleanup
    await component.dispose();

    const finalStats = component.getStats();
    expect(finalStats.connections).toBe(0);
    expect(finalStats.handlers).toBe(0);
    expect(finalStats.resources).toBe(0);
    expect(component.isDisposed()).toBe(true);
  });
});
