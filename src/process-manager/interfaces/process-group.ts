/**
 * Process Group Management Interface
 *
 * Handles namespace-based grouping and batch operations:
 * - Group management by namespace
 * - Batch operations on process groups
 * - Dependency management foundation
 */

import { ProcessInfo } from '../../shared/process.js';

/**
 * Namespace status summary
 */
export interface NamespaceStatus {
  /** Namespace name */
  namespace: string;
  /** Total number of processes */
  total: number;
  /** Number of online processes */
  online: number;
  /** Number of stopped processes */
  stopped: number;
  /** Number of errored processes */
  errored: number;
  /** Number of processes in other states */
  other: number;
}

/**
 * Result of a batch operation
 */
export interface BatchOperationResult {
  /** Overall success status */
  success: boolean;
  /** Results for individual processes */
  results: Array<{
    /** Process name */
    name: string;
    /** Whether this specific operation succeeded */
    success: boolean;
    /** Error message if this operation failed */
    error?: string;
  }>;
  /** Summary of successful operations */
  successCount: number;
  /** Summary of failed operations */
  failureCount: number;
}

/**
 * Process dependency configuration
 */
export interface ProcessDependency {
  /** Process name that depends on others */
  name: string;
  /** Array of process names this process depends on */
  dependsOn: string[];
  /** Maximum wait time in milliseconds for dependencies to start */
  waitTimeout?: number;
}

/**
 * Dependency resolution result
 */
export interface DependencyResolutionResult {
  /** Processes that can be started immediately (no dependencies) */
  independent: string[];
  /** Processes with dependencies, in order of dependency levels */
  dependent: string[][];
  /** Processes with circular dependencies */
  circular: string[];
  /** Ordered startup groups (independent + dependent combined) */
  startupOrder: string[][];
  /** Alias for circular (for backward compatibility) */
  circularDependencies: string[];
  /** Processes that could not be resolved */
  unresolvedProcesses: string[];
}

/**
 * Interface for process group management
 */
export interface ProcessGroupManager {
  /**
   * Get all available namespaces
   * @returns Array of namespace names
   */
  getNamespaces(): string[];

  /**
   * Get status summary for a namespace
   * @param namespace Namespace name
   * @returns Status summary
   */
  getNamespaceStatus(namespace: string): NamespaceStatus;

  /**
   * Get all processes in a namespace
   * @param namespace Namespace name
   * @returns Array of process information
   */
  getProcessesByNamespace(namespace: string): ProcessInfo[];

  /**
   * Get process names in a namespace
   * @param namespace Namespace name
   * @returns Array of process names
   */
  getProcessNamesByNamespace(namespace: string): string[];

  /**
   * Start all processes in a namespace
   * @param namespace Namespace name
   * @returns Promise resolving to batch operation result
   */
  startNamespace(namespace: string): Promise<BatchOperationResult>;

  /**
   * Stop all processes in a namespace
   * @param namespace Namespace name
   * @returns Promise resolving to batch operation result
   */
  stopNamespace(namespace: string): Promise<BatchOperationResult>;

  /**
   * Restart all processes in a namespace
   * @param namespace Namespace name
   * @returns Promise resolving to batch operation result
   */
  restartNamespace(namespace: string): Promise<BatchOperationResult>;

  /**
   * Start multiple processes
   * @param names Array of process names
   * @returns Promise resolving to batch operation result
   */
  startProcesses(names: string[]): Promise<BatchOperationResult>;

  /**
   * Stop multiple processes
   * @param names Array of process names
   * @returns Promise resolving to batch operation result
   */
  stopProcesses(names: string[]): Promise<BatchOperationResult>;

  /**
   * Restart multiple processes
   * @param names Array of process names
   * @returns Promise resolving to batch operation result
   */
  restartProcesses(names: string[]): Promise<BatchOperationResult>;

  /**
   * Configure a process dependency
   * @param dependency Dependency configuration
   */
  configureDependency(dependency: ProcessDependency): void;

  /**
   * Remove a process dependency
   * @param name Process name
   */
  removeDependency(name: string): void;

  /**
   * Get dependency configuration for a process
   * @param name Process name
   * @returns Dependency configuration or undefined
   */
  getDependency(name: string): ProcessDependency | undefined;

  /**
   * Get all dependency configurations
   * @returns Array of dependency configurations
   */
  getAllDependencies(): ProcessDependency[];

  /**
   * Resolve dependencies for a set of processes
   * @param names Array of process names
   * @returns Dependency resolution result
   */
  resolveDependencies(names: string[]): DependencyResolutionResult;

  /**
   * Start processes with dependency resolution
   * @param names Array of process names
   * @returns Promise resolving to batch operation result
   */
  startProcessesWithDependencies(
    names: string[]
  ): Promise<BatchOperationResult>;
}

/**
 * Event types emitted by ProcessGroupManager
 */
export interface ProcessGroupEvents {
  /** Namespace operation started */
  'namespace:operation-start': {
    namespace: string;
    operation: 'start' | 'stop' | 'restart';
  };
  /** Namespace operation completed */
  'namespace:operation-complete': {
    namespace: string;
    operation: 'start' | 'stop' | 'restart';
    result: BatchOperationResult;
  };
  /** Batch operation started */
  'batch:operation-start': {
    operation: 'start' | 'stop' | 'restart';
    processCount: number;
  };
  /** Batch operation completed */
  'batch:operation-complete': {
    operation: 'start' | 'stop' | 'restart';
    result: BatchOperationResult;
  };
  /** Dependency configured */
  'dependency:configured': { dependency: ProcessDependency };
  /** Dependency removed */
  'dependency:removed': { name: string };
}
