/**
 * ManagedProcessEvents - Events emitted by ManagedProcessInfo
 */

import { ProcessStatus } from '../shared/process.js';

/**
 * Events emitted by ManagedProcessInfo
 */
export interface ManagedProcessEvents {
  /** Process status changed */
  'status-change': (newStatus: ProcessStatus, oldStatus: ProcessStatus) => void;
  /** Process started */
  start: (pid: number) => void;
  /** Process stopped */
  stop: (exitCode: number | null) => void;
  /** Process restarted */
  restart: (restartCount: number) => void;
  /** Process memory limit exceeded */
  'memory-limit': (memoryUsage: number, limit: number) => void;
  /** Process error occurred */
  error: (error: Error) => void;
}
