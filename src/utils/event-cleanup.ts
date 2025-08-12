import { EventEmitter } from 'events';

/**
 * Interface for disposable resources
 */
interface Disposable {
  dispose(): Promise<void>;
}

/**
 * Simple helper for tracking and cleaning up EventEmitter listeners
 *
 * This is a lightweight alternative to complex listener management systems.
 * Based on Uncle Bob's recommendation for explicit, simple resource cleanup.
 */
export class EventCleanupHelper implements Disposable {
  private listeners: Array<{
    emitter: EventEmitter;
    event: string | symbol;
    listener: (...args: any[]) => void;
  }> = [];

  /**
   * Track a listener for later cleanup
   */
  track(
    emitter: EventEmitter,
    event: string | symbol,
    listener: (...args: any[]) => void
  ): void {
    emitter.on(event, listener);
    this.listeners.push({ emitter, event, listener });
  }

  /**
   * Clean up all tracked listeners
   */
  async dispose(): Promise<void> {
    for (const { emitter, event, listener } of this.listeners) {
      emitter.removeListener(event, listener);
    }
    this.listeners.length = 0;
  }

  /**
   * Get count of tracked listeners (for debugging)
   */
  getListenerCount(): number {
    return this.listeners.length;
  }
}
