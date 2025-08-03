/**
 * Process Lifecycle Management Interface
 *
 * Handles the core lifecycle operations for processes:
 * - Starting and stopping processes
 * - Signal handling
 * - Child process management
 */

import { ChildProcess } from 'child_process';

/**
 * Result of a process lifecycle operation
 */
export interface ProcessLifecycleResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
  /** Process ID if process was started */
  pid?: number;
  /** Additional metadata about the operation */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for process lifecycle management
 */
export interface ProcessLifecycleManager {
  /**
   * Start a process with the given configuration
   * @param name Process name
   * @returns Promise resolving to the result
   */
  startProcess(name: string): Promise<ProcessLifecycleResult>;

  /**
   * Stop a running process gracefully
   * @param name Process name
   * @returns Promise resolving to the result
   */
  stopProcess(name: string): Promise<ProcessLifecycleResult>;

  /**
   * Restart a process (stop then start)
   * @param name Process name
   * @returns Promise resolving to the result
   */
  restartProcess(name: string): Promise<ProcessLifecycleResult>;

  /**
   * Send a signal to a process
   * @param name Process name
   * @param signal Signal to send
   * @returns Promise resolving to the result
   */
  sendSignalToProcess(
    name: string,
    signal: string
  ): Promise<ProcessLifecycleResult>;

  /**
   * Get the child process for a given process name
   * @param name Process name
   * @returns ChildProcess instance or undefined
   */
  getChildProcess(name: string): ChildProcess | undefined;

  /**
   * Check if a process is running
   * @param name Process name
   * @returns True if process is running
   */
  isProcessRunning(name: string): boolean;

  /**
   * Cleanup all managed processes and resources
   * @returns Promise resolving when cleanup is complete
   */
  cleanup(): Promise<void>;
}

/**
 * Event types emitted by ProcessLifecycleManager
 */
export interface ProcessLifecycleEvents {
  /** Process started successfully */
  'process:started': { name: string; pid: number };
  /** Process stopped */
  'process:stopped': {
    name: string;
    code: number | null;
    signal: string | null;
  };
  /** Process exited unexpectedly */
  'process:exit': { name: string; code: number | null; signal: string | null };
  /** Process startup failed */
  'process:error': { name: string; error: Error };
}
