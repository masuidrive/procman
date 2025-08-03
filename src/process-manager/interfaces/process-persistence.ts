/**
 * Process Persistence Interface
 *
 * Handles saving and loading process state to/from persistent storage:
 * - State serialization and deserialization
 * - File I/O operations
 * - Backup and recovery
 */

import { PersistedManagedProcessInfo } from '../../shared/process';

/**
 * Persistence configuration
 */
export interface PersistenceConfig {
  /** Path to the persistence file */
  filePath: string;
  /** Debounce delay for saving state in milliseconds */
  saveDelay: number;
  /** Whether to create backup files */
  enableBackup: boolean;
}

/**
 * Result of a persistence operation
 */
export interface PersistenceResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
  /** Additional metadata */
  metadata?: {
    /** File path used */
    filePath?: string;
    /** Whether backup was used */
    usedBackup?: boolean;
    /** Number of processes loaded/saved */
    processCount?: number;
  };
}

/**
 * Interface for process persistence
 */
export interface ProcessPersistence {
  /**
   * Initialize persistence with configuration
   * @param config Persistence configuration
   */
  initialize(config: PersistenceConfig): void;

  /**
   * Save current process state to persistent storage
   * @param processes Array of process information to save
   * @returns Promise resolving to the result
   */
  saveState(
    processes: PersistedManagedProcessInfo[]
  ): Promise<PersistenceResult>;

  /**
   * Force save state immediately (bypassing debounce)
   * @param processes Array of process information to save
   * @returns Promise resolving to the result
   */
  forceSaveState(
    processes: PersistedManagedProcessInfo[]
  ): Promise<PersistenceResult>;

  /**
   * Load process state from persistent storage
   * @returns Promise resolving to loaded processes or empty array if none found
   */
  loadState(): Promise<PersistedManagedProcessInfo[]>;

  /**
   * Load process state from backup file
   * @returns Promise resolving to loaded processes or empty array if none found
   */
  loadFromBackup(): Promise<PersistedManagedProcessInfo[]>;

  /**
   * Get the persistence file path
   * @returns File path being used for persistence
   */
  getFilePath(): string;

  /**
   * Check if persistence file exists
   * @returns True if persistence file exists
   */
  exists(): Promise<boolean>;

  /**
   * Check if backup file exists
   * @returns True if backup file exists
   */
  backupExists(): Promise<boolean>;

  /**
   * Create a backup of the current persistence file
   * @returns Promise resolving to the result
   */
  createBackup(): Promise<PersistenceResult>;

  /**
   * Cleanup persistence resources
   */
  cleanup(): void;
}

/**
 * Event types emitted by ProcessPersistence
 */
export interface ProcessPersistenceEvents {
  /** State was saved successfully */
  'persistence:saved': { filePath: string; processCount: number };
  /** State save failed */
  'persistence:save-error': { filePath: string; error: Error };
  /** State was loaded successfully */
  'persistence:loaded': {
    filePath: string;
    processCount: number;
    usedBackup: boolean;
  };
  /** State load failed */
  'persistence:load-error': { filePath: string; error: Error };
  /** Backup was created */
  'persistence:backup-created': { filePath: string };
}
