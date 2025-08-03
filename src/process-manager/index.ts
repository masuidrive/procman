/**
 * Process Manager Module
 *
 * This module provides process management functionality for the procman system.
 * It includes classes for managing individual processes and orchestrating
 * multiple processes with lifecycle management, monitoring, and statistics.
 */

// Main exports
export { ProcessManager } from './process-manager';
export { ManagedProcessInfo } from './managed-process-info';

// Type exports
export type { ProcessConfig } from './process-manager';

export type {
  ProcessStatistics,
  ManagedProcessEvents,
} from './managed-process-info';

// Re-export shared types for convenience
export type { ProcessInfo, ProcessStatus } from '../shared/process';
