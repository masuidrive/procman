/**
 * Mock ConfigWatcher for testing
 *
 * Provides a controllable mock implementation of ConfigWatcher
 * that can simulate file change events without relying on
 * file system watching functionality.
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import {
  ConfigWatcher,
  WatchCallback,
  WatcherDisposal,
  ConfigWatcherOptions,
} from '../../src/config/config-watcher.js';

export interface MockWatcherEvents {
  [filePath: string]: WatchCallback[];
}

/**
 * Mock implementation of ConfigWatcher for testing
 * Allows manual triggering of file change events
 */
export class MockConfigWatcher extends EventEmitter {
  private watchers: MockWatcherEvents = {};
  private watchedFiles: Set<string> = new Set();

  /**
   * Mock implementation of watchConfig
   * Records the callback and provides manual trigger capability
   */
  watchConfig(filePath: string, callback: WatchCallback): WatcherDisposal {
    const absolutePath = path.resolve(filePath);

    if (!this.watchers[absolutePath]) {
      this.watchers[absolutePath] = [];
    }

    this.watchers[absolutePath].push(callback);
    this.watchedFiles.add(absolutePath);

    return {
      dispose: () => {
        this.stopWatching(absolutePath);
      },
    };
  }

  /**
   * Manually trigger a file change event for testing
   * @param filePath Path of the file that "changed"
   * @param event Type of change event
   */
  triggerFileChange(
    filePath: string,
    event: 'change' | 'rename' = 'change'
  ): void {
    const absolutePath = path.resolve(filePath);
    const callbacks = this.watchers[absolutePath];

    if (callbacks) {
      callbacks.forEach((callback) => {
        callback(event, path.basename(absolutePath));
      });

      // Emit internal configChanged event
      this.emit('configChanged', absolutePath);
    }
  }

  /**
   * Trigger multiple rapid file changes for stress testing
   * @param filePath Path of the file
   * @param count Number of change events to trigger
   * @param interval Interval between events in milliseconds
   */
  async triggerRapidChanges(
    filePath: string,
    count: number,
    interval: number = 10
  ): Promise<void> {
    for (let i = 0; i < count; i++) {
      this.triggerFileChange(filePath, 'change');
      if (i < count - 1) {
        await new Promise((resolve) =>
          globalThis.setTimeout(resolve, interval)
        );
      }
    }
  }

  /**
   * Mock implementation of stopWatching
   */
  stopWatching(filePath: string): void {
    const absolutePath = path.resolve(filePath);
    delete this.watchers[absolutePath];
    this.watchedFiles.delete(absolutePath);
  }

  /**
   * Mock implementation of stopAllWatching
   */
  stopAllWatching(): void {
    this.watchers = {};
    this.watchedFiles.clear();
  }

  /**
   * Check if a file is being watched
   */
  isWatching(filePath: string): boolean {
    const absolutePath = path.resolve(filePath);
    return this.watchedFiles.has(absolutePath);
  }

  /**
   * Mock implementation of hasConfigChanged
   */
  async hasConfigChanged(
    filePath: string,
    lastCheckTime: number
  ): Promise<boolean> {
    // For testing, we can simulate that files have changed
    return true;
  }

  /**
   * Mock implementation of dispose
   */
  dispose(): void {
    this.stopAllWatching();
    this.removeAllListeners();
  }

  /**
   * Mock implementation of getWatchedFiles
   */
  getWatchedFiles(): string[] {
    return Array.from(this.watchedFiles);
  }

  /**
   * Mock implementation of createBackup
   */
  async createBackup(filePath: string): Promise<string> {
    const absolutePath = path.resolve(filePath);
    const backupPath = `${absolutePath}.backup`;
    // In mock, we don't actually create a backup file
    return backupPath;
  }

  /**
   * Get all registered callbacks for a file (testing utility)
   */
  getCallbacks(filePath: string): WatchCallback[] | undefined {
    const absolutePath = path.resolve(filePath);
    return this.watchers[absolutePath];
  }

  /**
   * Get count of registered watchers (testing utility)
   */
  getWatcherCount(): number {
    return Object.keys(this.watchers).length;
  }

  /**
   * Reset all mock state (testing utility)
   */
  reset(): void {
    this.stopAllWatching();
    this.removeAllListeners();
  }

  /**
   * Simulate an error on file watch (testing utility)
   */
  simulateError(filePath: string, error: Error): void {
    const absolutePath = path.resolve(filePath);
    const callbacks = this.watchers[absolutePath];

    if (callbacks) {
      // Emit error event
      this.emit('error', error);
    }
  }

  /**
   * Set specific behavior for hasConfigChanged (testing utility)
   */
  private _hasConfigChangedBehavior?: (
    filePath: string,
    lastCheckTime: number
  ) => Promise<boolean>;

  setHasConfigChangedBehavior(
    behavior: (filePath: string, lastCheckTime: number) => Promise<boolean>
  ): void {
    this._hasConfigChangedBehavior = behavior;
  }

  /**
   * Override hasConfigChanged with custom behavior if set
   */
  async hasConfigChangedWithBehavior(
    filePath: string,
    lastCheckTime: number
  ): Promise<boolean> {
    if (this._hasConfigChangedBehavior) {
      return this._hasConfigChangedBehavior(filePath, lastCheckTime);
    }
    return this.hasConfigChanged(filePath, lastCheckTime);
  }

  /**
   * Get statistics about mock usage (testing utility)
   */
  getStats(): {
    watchedFiles: number;
    totalCallbacks: number;
    eventEmitterListeners: number;
  } {
    const totalCallbacks = Object.values(this.watchers).reduce(
      (sum, callbacks) => sum + callbacks.length,
      0
    );

    return {
      watchedFiles: this.watchedFiles.size,
      totalCallbacks,
      eventEmitterListeners: this.listenerCount('configChanged'),
    };
  }
}

/**
 * Create a mock config watcher for testing
 */
export function createMockConfigWatcher(): MockConfigWatcher {
  return new MockConfigWatcher();
}
