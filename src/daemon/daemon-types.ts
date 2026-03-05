/**
 * Shared types for daemon module decomposition
 *
 * Provides the DaemonContext interface that allows extracted modules
 * to access internal daemon state without circular dependencies.
 */

import type { DataDirectory } from './data-directory.js';
import type { PIDManager } from './pid-manager.js';
import type { DaemonStateManager } from './daemon-state-manager.js';
import type { ComponentManager } from './component-manager.js';
import type { SignalHandler } from './signal-handler.js';
import type { MemoryMonitor } from '../utils/memory/memory-monitor.js';

/**
 * Internal context shared across daemon sub-modules.
 * Exposes the internal managers and mutable state that lifecycle,
 * shutdown, and query functions need to operate on.
 */
export interface DaemonContext {
  readonly dataDirectory: DataDirectory;
  readonly pidManager: PIDManager;
  readonly stateManager: DaemonStateManager;
  readonly componentManager: ComponentManager;
  readonly signalHandler: SignalHandler;
  readonly memoryMonitor: MemoryMonitor;
  currentConfig?: import('../shared/config.js').AppConfig[];
  configFilePath?: string;
  recoveryAttempts: number;
  isShuttingDown: boolean;
}
