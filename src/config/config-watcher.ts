/**
 * Configuration Watcher
 *
 * Handles file watching functionality for procman configuration files.
 * Provides change detection and notification capabilities.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { createError } from '../shared/errors.js';

/**
 * File change event types
 */
export type FileChangeEvent = 'change' | 'rename';

/**
 * Watch callback function type
 */
export type WatchCallback = (event: FileChangeEvent, filename?: string) => void;

/**
 * ConfigWatcher event types
 */
export interface ConfigWatcherEvents {
  configChanged: (filePath: string) => void;
}

/**
 * Watcher disposal interface
 */
export interface WatcherDisposal {
  dispose: () => void;
}

/**
 * Configuration watcher options
 */
export interface ConfigWatcherOptions {
  /** Polling interval for file watching in milliseconds (default: 1000) */
  interval?: number;
  /** Whether to watch for file existence changes (default: true) */
  persistent?: boolean;
}

/**
 * Configuration watcher class
 * Responsible for monitoring configuration file changes
 */
export class ConfigWatcher extends EventEmitter {
  private fileWatchers: Map<string, fs.FSWatcher>;
  private interval: number;
  private persistent: boolean;

  constructor(options: ConfigWatcherOptions = {}) {
    super();
    this.fileWatchers = new Map();
    this.interval = options.interval || 1000;
    this.persistent = options.persistent !== false;
  }

  /**
   * Watch a configuration file for changes
   * @param filePath Path to configuration file to watch
   * @param callback Callback function for change events
   * @returns Disposal object to stop watching
   */
  watchConfig(filePath: string, callback: WatchCallback): WatcherDisposal {
    const absolutePath = path.resolve(filePath);

    // Clean up existing watcher
    this.stopWatching(absolutePath);

    try {
      const watcher = fs.watchFile(
        absolutePath,
        {
          interval: this.interval,
          persistent: this.persistent,
        },
        async (curr, prev) => {
          if (curr.mtime !== prev.mtime) {
            callback('change', path.basename(absolutePath));

            // Emit internal event
            this.emit('configChanged', absolutePath);
          }
        }
      );

      // Store reference (fs.watchFile doesn't return FSWatcher, so we'll track manually)
      this.fileWatchers.set(absolutePath, watcher as unknown as fs.FSWatcher);

      return {
        dispose: () => this.stopWatching(absolutePath),
      };
    } catch (error) {
      throw createError('CONFIG_WATCH_ERROR', {
        message: `Failed to watch configuration file: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
        details: { filePath: absolutePath },
      });
    }
  }

  /**
   * Watch multiple configuration files
   * @param filePaths Array of file paths to watch
   * @param callback Callback function for change events
   * @returns Disposal object to stop watching all files
   */
  watchMultiple(filePaths: string[], callback: WatchCallback): WatcherDisposal {
    const disposals = filePaths.map((filePath) =>
      this.watchConfig(filePath, callback)
    );

    return {
      dispose: (): void => {
        disposals.forEach((disposal) => disposal.dispose());
      },
    };
  }

  /**
   * Stop watching a configuration file
   * @param filePath Path to stop watching
   */
  stopWatching(filePath: string): void {
    const absolutePath = path.resolve(filePath);

    if (this.fileWatchers.has(absolutePath)) {
      fs.unwatchFile(absolutePath);
      this.fileWatchers.delete(absolutePath);
    }
  }

  /**
   * Stop watching all configuration files
   */
  stopAllWatching(): void {
    for (const filePath of Array.from(this.fileWatchers.keys())) {
      fs.unwatchFile(filePath);
    }
    this.fileWatchers.clear();
  }

  /**
   * Check if a file is currently being watched
   * @param filePath Path to check
   * @returns True if file is being watched
   */
  isWatching(filePath: string): boolean {
    const absolutePath = path.resolve(filePath);
    return this.fileWatchers.has(absolutePath);
  }

  /**
   * Get list of all watched file paths
   * @returns Array of watched file paths
   */
  getWatchedFiles(): string[] {
    return Array.from(this.fileWatchers.keys());
  }

  /**
   * Check if configuration file has changed since last check
   * @param filePath Path to configuration file
   * @param lastCheckTime Timestamp of last check
   * @returns Promise resolving to true if file has changed
   */
  async hasConfigChanged(
    filePath: string,
    lastCheckTime: number
  ): Promise<boolean> {
    try {
      const absolutePath = path.resolve(filePath);
      const stats = await fs.promises.stat(absolutePath);
      return stats.mtime.getTime() > lastCheckTime;
    } catch {
      // File doesn't exist or can't be accessed - consider it changed
      return true;
    }
  }

  /**
   * Get file modification time
   * @param filePath Path to file
   * @returns Promise resolving to modification time timestamp
   */
  async getFileModTime(filePath: string): Promise<number> {
    try {
      const absolutePath = path.resolve(filePath);
      const stats = await fs.promises.stat(absolutePath);
      return stats.mtime.getTime();
    } catch (error) {
      throw createError('CONFIG_WATCH_ERROR', {
        message: `Failed to get file modification time: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
        details: { filePath },
      });
    }
  }

  /**
   * Watch for configuration changes with debouncing
   * @param filePath Path to configuration file
   * @param callback Callback function for change events
   * @param debounceMs Debounce delay in milliseconds (default: 100)
   * @returns Disposal object to stop watching
   */
  watchConfigDebounced(
    filePath: string,
    callback: WatchCallback,
    debounceMs: number = 100
  ): WatcherDisposal {
    let debounceTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

    const debouncedCallback: WatchCallback = (event, filename) => {
      if (debounceTimer) {
        globalThis.clearTimeout(debounceTimer);
      }

      debounceTimer = globalThis.setTimeout(() => {
        callback(event, filename);
        debounceTimer = null;
      }, debounceMs);
    };

    return this.watchConfig(filePath, debouncedCallback);
  }

  /**
   * Listen for configuration change events (type-safe version)
   * @param event Event name
   * @param listener Event listener function
   */
  on<K extends keyof ConfigWatcherEvents>(
    event: K,
    listener: ConfigWatcherEvents[K]
  ): this;
  on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  /**
   * Remove configuration change event listener (type-safe version)
   * @param event Event name
   * @param listener Event listener function
   */
  off<K extends keyof ConfigWatcherEvents>(
    event: K,
    listener: ConfigWatcherEvents[K]
  ): this;
  off(event: string | symbol, listener: (...args: unknown[]) => void): this;
  off(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }

  /**
   * Dispose of all watchers and cleanup resources
   */
  dispose(): void {
    this.stopAllWatching();
    this.removeAllListeners();
  }

  /**
   * Get resource usage information
   * @returns Object with watcher count and memory usage
   */
  getResourceUsage(): {
    watcherCount: number;
    watchedFiles: string[];
    memoryUsage: ReturnType<typeof process.memoryUsage>;
  } {
    return {
      watcherCount: this.fileWatchers.size,
      watchedFiles: this.getWatchedFiles(),
      memoryUsage: process.memoryUsage(),
    };
  }

  /**
   * Set polling interval for file watching
   * @param interval New interval in milliseconds
   */
  setInterval(interval: number): void {
    if (interval < 100) {
      throw createError('CONFIG_WATCH_ERROR', {
        message: 'Watch interval must be at least 100ms',
        details: { interval },
      });
    }
    this.interval = interval;
  }

  /**
   * Get current polling interval
   * @returns Current interval in milliseconds
   */
  getInterval(): number {
    return this.interval;
  }

  /**
   * Enable or disable persistent watching
   * @param persistent Whether to keep the process alive for watching
   */
  setPersistent(persistent: boolean): void {
    this.persistent = persistent;
  }

  /**
   * Check if persistent watching is enabled
   * @returns True if persistent watching is enabled
   */
  isPersistent(): boolean {
    return this.persistent;
  }

  /**
   * Create backup of configuration file
   * @param filePath Path to configuration file
   * @returns Path to backup file
   */
  async createBackup(filePath: string): Promise<string> {
    const absolutePath = path.resolve(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${absolutePath}.backup.${timestamp}`;

    await fs.promises.copyFile(absolutePath, backupPath);
    return backupPath;
  }
}

/**
 * Create a new configuration watcher instance
 * @param options Watcher options
 * @returns ConfigWatcher instance
 */
export function createConfigWatcher(
  options?: ConfigWatcherOptions
): ConfigWatcher {
  return new ConfigWatcher(options);
}
