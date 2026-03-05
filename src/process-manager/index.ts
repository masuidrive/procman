/**
 * Process Manager Module
 *
 * This module provides process management functionality for the procman system.
 * It includes classes for managing individual processes and orchestrating
 * multiple processes with lifecycle management, monitoring, and statistics.
 */

// Main exports
export { ProcessManager } from './process-manager.js';
export { ManagedProcessInfo } from './managed-process-info.js';
export { RestartManager } from './restart-manager.js';
export { ProcessMonitoringData } from './process-monitoring.js';

// Type exports
export type { ProcessConfig } from './process-manager.js';

export type { ProcessStatistics } from './process-statistics.js';

export type { ManagedProcessEvents } from './managed-process-events.js';

export { createDefaultStatistics } from './process-statistics.js';

// Re-export shared types for convenience
export type { ProcessInfo, ProcessStatus } from '../shared/process.js';
