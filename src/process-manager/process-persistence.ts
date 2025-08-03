/**
 * ProcessPersistence - Handles process state persistence
 *
 * This class is responsible for:
 * - Saving and loading process state to/from persistent storage
 * - Atomic file operations with backup management
 * - File I/O operations with proper permissions
 * - State serialization and deserialization
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  ProcessPersistence as IProcessPersistence,
  PersistenceConfig,
  PersistenceResult,
} from './interfaces/process-persistence';
import { PersistedManagedProcessInfo } from '../shared/process';
import { ManagedProcessInfo } from './managed-process-info';
import { DEBOUNCE_SAVE_STATE_DELAY } from '../shared/constants';

// Node.js global types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TimeoutId = any;
declare const setTimeout: (
  callback: (...args: unknown[]) => void,
  ms: number
) => TimeoutId;
declare const clearTimeout: (id: TimeoutId) => void;

/**
 * Type guard to check if an error has a code property
 */
function hasErrorCode(error: Error): error is Error & { code: string } {
  return (
    'code' in error &&
    typeof (error as unknown as { code?: unknown }).code === 'string'
  );
}

/**
 * Debounce function for state saving
 */
function createDebounce(
  func: () => Promise<void>,
  delay: number
): { trigger: () => void; cleanup: () => void } {
  let timeoutId: TimeoutId | null = null;

  const trigger = (): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func().catch((error) => {
        console.error('[ProcessPersistence] Debounced save error:', error);
      });
    }, delay);
  };

  const cleanup = (): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return { trigger, cleanup };
}

/**
 * ProcessPersistence implementation
 */
export class ProcessPersistenceImpl
  extends EventEmitter
  implements IProcessPersistence
{
  private readonly processes: Map<string, ManagedProcessInfo>;
  private config: PersistenceConfig;
  private debouncedSave: { trigger: () => void; cleanup: () => void } | null =
    null;
  private isInitialized = false;

  constructor(processes: Map<string, ManagedProcessInfo>) {
    super();
    this.processes = processes;
    this.config = {
      filePath: '',
      saveDelay: DEBOUNCE_SAVE_STATE_DELAY,
      enableBackup: true,
    };
  }

  /**
   * Initialize persistence with configuration
   */
  public initialize(config: PersistenceConfig): void {
    this.config = { ...this.config, ...config };
    this.isInitialized = true;

    // Setup debounced save
    this.debouncedSave = createDebounce(async () => {
      await this.forceSaveState(this.collectProcessStates());
    }, this.config.saveDelay);
  }

  /**
   * Save current process state to persistent storage
   */
  public async saveState(
    processes: PersistedManagedProcessInfo[]
  ): Promise<PersistenceResult> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Persistence not initialized',
      };
    }

    if (this.debouncedSave) {
      this.debouncedSave.trigger();
      return {
        success: true,
        metadata: {
          processCount: processes.length,
        },
      };
    }

    return this.forceSaveState(processes);
  }

  /**
   * Force save state immediately (bypassing debounce)
   */
  public async forceSaveState(
    processes: PersistedManagedProcessInfo[]
  ): Promise<PersistenceResult> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Persistence not initialized',
      };
    }

    try {
      // Create the proper structure for persistence
      const persistenceData = {
        version: '1.0',
        timestamp: Date.now(),
        processes: processes,
      };

      const jsonState = JSON.stringify(persistenceData, null, 2);

      // Use atomic write pattern
      const tempFilePath = `${this.config.filePath}.tmp`;
      const backupFilePath = `${this.config.filePath}.bak`;

      // Ensure directory exists with secure permissions
      await fs.mkdir(path.dirname(this.config.filePath), {
        recursive: true,
        mode: 0o700,
      });

      // Create backup of existing file if it exists and backup is enabled
      if (this.config.enableBackup) {
        try {
          await fs.access(this.config.filePath);
          await fs.copyFile(this.config.filePath, backupFilePath);
          // Set secure permissions for backup file
          try {
            await fs.chmod(backupFilePath, 0o600);
          } catch (chmodError) {
            console.warn(
              `[ProcessPersistence] Could not set permissions for backup file ${backupFilePath}:`,
              chmodError
            );
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (hasErrorCode(error) && error.code !== 'ENOENT') {
            console.warn(
              `[ProcessPersistence] Could not create backup of ${this.config.filePath}:`,
              error.message
            );
          }
          // Continue with save even if backup fails
        }
      }

      // Write to temporary file first
      await fs.writeFile(tempFilePath, jsonState, 'utf-8');

      // Set secure file permissions (read/write for owner only)
      try {
        await fs.chmod(tempFilePath, 0o600);
      } catch (chmodError) {
        console.warn(
          `[ProcessPersistence] Could not set file permissions for ${tempFilePath}:`,
          chmodError
        );
      }

      // Atomically move temp file to final location
      await fs.rename(tempFilePath, this.config.filePath);

      this.emit('persistence:saved', {
        filePath: this.config.filePath,
        processCount: processes.length,
      });

      return {
        success: true,
        metadata: {
          filePath: this.config.filePath,
          processCount: processes.length,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.emit('persistence:save-error', {
        filePath: this.config.filePath,
        error: error instanceof Error ? error : new Error(errorMessage),
      });

      return {
        success: false,
        error: `Error saving process state: ${errorMessage}`,
        metadata: {
          filePath: this.config.filePath,
          processCount: processes.length,
        },
      };
    }
  }

  /**
   * Load process state from persistent storage
   */
  public async loadState(): Promise<PersistedManagedProcessInfo[]> {
    if (!this.isInitialized) {
      console.warn('[ProcessPersistence] Cannot load state: not initialized');
      return [];
    }

    try {
      const data = await fs.readFile(this.config.filePath, 'utf-8');
      const parsedData = JSON.parse(data);

      // Handle both old format (array) and new format (object with version)
      let persistedProcs: PersistedManagedProcessInfo[];
      if (Array.isArray(parsedData)) {
        // Old format - direct array
        persistedProcs = parsedData;
      } else if (
        parsedData &&
        typeof parsedData === 'object' &&
        parsedData.processes
      ) {
        // New format with version
        persistedProcs = parsedData.processes;
      } else {
        throw new Error('Invalid persistence file format');
      }

      this.emit('persistence:loaded', {
        filePath: this.config.filePath,
        processCount: persistedProcs.length,
        usedBackup: false,
      });

      return persistedProcs;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (hasErrorCode(err) && err.code === 'ENOENT') {
        // File not found - this is normal on first run
        console.log(
          '[ProcessPersistence] No persistence file found, starting fresh'
        );
        return [];
      }

      if (error instanceof SyntaxError) {
        // JSON parse error - try loading from backup
        console.warn(
          `[ProcessPersistence] Corrupted persistence file, attempting backup recovery:`,
          err.message
        );
        return this.loadFromBackup();
      }

      this.emit('persistence:load-error', {
        filePath: this.config.filePath,
        error: err,
      });

      console.error(`[ProcessPersistence] Error loading process state:`, err);
      return [];
    }
  }

  /**
   * Load process state from backup file
   */
  public async loadFromBackup(): Promise<PersistedManagedProcessInfo[]> {
    if (!this.isInitialized) {
      console.warn(
        '[ProcessPersistence] Cannot load from backup: not initialized'
      );
      return [];
    }

    const backupFilePath = `${this.config.filePath}.bak`;

    try {
      const data = await fs.readFile(backupFilePath, 'utf-8');
      const parsedData = JSON.parse(data);

      // Handle both old format (array) and new format (object with version)
      let persistedProcs: PersistedManagedProcessInfo[];
      if (Array.isArray(parsedData)) {
        // Old format - direct array
        persistedProcs = parsedData;
      } else if (
        parsedData &&
        typeof parsedData === 'object' &&
        parsedData.processes
      ) {
        // New format with version
        persistedProcs = parsedData.processes;
      } else {
        throw new Error('Invalid backup file format');
      }

      console.log(
        `[ProcessPersistence] Successfully loaded state from backup: ${backupFilePath}`
      );

      this.emit('persistence:loaded', {
        filePath: backupFilePath,
        processCount: persistedProcs.length,
        usedBackup: true,
      });

      return persistedProcs;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[ProcessPersistence] Error loading from backup file:`,
        err
      );

      this.emit('persistence:load-error', {
        filePath: backupFilePath,
        error: err,
      });

      return [];
    }
  }

  /**
   * Get the persistence file path
   */
  public getFilePath(): string {
    return this.config.filePath;
  }

  /**
   * Check if persistence file exists
   */
  public async exists(): Promise<boolean> {
    try {
      await fs.access(this.config.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if backup file exists
   */
  public async backupExists(): Promise<boolean> {
    try {
      const backupFilePath = `${this.config.filePath}.bak`;
      await fs.access(backupFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a backup of the current persistence file
   */
  public async createBackup(): Promise<PersistenceResult> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Persistence not initialized',
      };
    }

    const backupFilePath = `${this.config.filePath}.bak`;

    try {
      await fs.copyFile(this.config.filePath, backupFilePath);

      // Set secure permissions for backup file
      try {
        await fs.chmod(backupFilePath, 0o600);
      } catch (chmodError) {
        console.warn(
          `[ProcessPersistence] Could not set permissions for backup file ${backupFilePath}:`,
          chmodError
        );
      }

      this.emit('persistence:backup-created', { filePath: backupFilePath });

      return {
        success: true,
        metadata: {
          filePath: backupFilePath,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Error creating backup: ${errorMessage}`,
        metadata: {
          filePath: backupFilePath,
        },
      };
    }
  }

  /**
   * Cleanup persistence resources
   */
  public cleanup(): void {
    if (this.debouncedSave) {
      this.debouncedSave.cleanup();
      this.debouncedSave = null;
    }
    this.isInitialized = false;
  }

  /**
   * Collect current process states
   */
  private collectProcessStates(): PersistedManagedProcessInfo[] {
    return Array.from(this.processes.values()).map((process) =>
      process.toJSON()
    );
  }
}
