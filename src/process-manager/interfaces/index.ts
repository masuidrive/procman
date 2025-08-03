/**
 * Process Manager Interface Exports
 *
 * This module exports all interfaces for the process manager components.
 */

// Lifecycle management
export * from './process-lifecycle';

// Process monitoring
export * from './process-monitor';

// Persistence management
export * from './process-persistence';

// Group management
export * from './process-group';

/**
 * Main process manager interface that coordinates all components
 */
export interface MainProcessManager {
  /** Lifecycle management component */
  lifecycle: import('./process-lifecycle').ProcessLifecycleManager;

  /** Monitoring component */
  monitor: import('./process-monitor').ProcessMonitor;

  /** Persistence component */
  persistence: import('./process-persistence').ProcessPersistence;

  /** Group management component */
  groups: import('./process-group').ProcessGroupManager;

  /**
   * Initialize all components
   */
  initialize(): Promise<void>;

  /**
   * Cleanup all components
   */
  cleanup(): Promise<void>;
}
