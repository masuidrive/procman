/**
 * Process Management Type Definitions
 *
 * This module defines basic types for process management in the procman system.
 */

// =============================================================================
// Process Status Type
// =============================================================================

/**
 * Possible states of a managed process
 */
export type ProcessStatus =
  | 'stopped'
  | 'starting'
  | 'online'
  | 'stopping'
  | 'errored'
  | 'max-memory';

// =============================================================================
// Process Information Interface
// =============================================================================

/**
 * Information about a managed process
 */
export interface ProcessInfo {
  /** Process name */
  name: string;
  /** Process namespace */
  namespace: string;
  /** Current process status */
  status: ProcessStatus;
  /** Process ID (null if not running) */
  pid: number | null;
  /** Process uptime in milliseconds */
  uptime: number;
  /** Memory usage in bytes */
  memory: number;
  /** CPU usage percentage */
  cpu: number;
  /** Number of restarts */
  restarts: number;
  /** Listening TCP ports (auto-detected) */
  ports?: number[];
  /** Optional note */
  note?: string;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a string is a valid ProcessStatus
 */
export function isValidProcessStatus(status: string): status is ProcessStatus {
  const validStatuses: ProcessStatus[] = [
    'stopped',
    'starting',
    'online',
    'stopping',
    'errored',
    'max-memory',
  ];
  return validStatuses.includes(status as ProcessStatus);
}

/**
 * Type guard to check if an object is a ProcessInfo
 * Note: This performs complete validation of all required fields.
 */
export function isProcessInfo(obj: unknown): obj is ProcessInfo {
  if (typeof obj !== 'object' || obj === null) return false;

  const info = obj as Record<string, unknown>;

  // Check required fields
  if (typeof info.name !== 'string' || !info.name.trim()) return false;
  if (typeof info.namespace !== 'string') return false;
  if (!isValidProcessStatus(String(info.status))) return false;
  if (typeof info.pid !== 'number' && info.pid !== null) return false;
  if (typeof info.uptime !== 'number' || info.uptime < 0) return false;
  if (typeof info.memory !== 'number' || info.memory < 0) return false;
  if (typeof info.cpu !== 'number' || info.cpu < 0) return false;
  if (
    typeof info.restarts !== 'number' ||
    info.restarts < 0 ||
    !Number.isInteger(info.restarts)
  )
    return false;

  // Check optional fields
  if (info.note !== undefined && typeof info.note !== 'string') return false;

  return true;
}

// =============================================================================
// Process State Change Interface
// =============================================================================

/**
 * Process state change record for history tracking
 */
export interface ProcessStateChange {
  /** Timestamp of the state change */
  timestamp: number;
  /** Previous status */
  from: ProcessStatus;
  /** New status */
  to: ProcessStatus;
  /** Optional reason for the change */
  reason?: string;
}

/**
 * Memory usage sample for history tracking
 */
export interface MemorySample {
  /** Timestamp of the measurement */
  timestamp: number;
  /** Memory usage in bytes */
  usage: number;
}

/**
 * CPU usage sample for history tracking
 */
export interface CPUSample {
  /** Timestamp of the measurement */
  timestamp: number;
  /** CPU usage percentage */
  usage: number;
}

// =============================================================================
// Process Persistence Interface
// =============================================================================

/**
 * Persisted process information for state restoration
 */
export interface PersistedManagedProcessInfo {
  /** Process name */
  name: string;
  /** Process status */
  status: ProcessStatus;
  /** Process ID (null after manager restart) */
  pid: number | null;
  /** Restart count */
  restartCount: number;
  /** Auto-restart enabled flag */
  autoRestartEnabled: boolean;
  /** Last start time timestamp */
  lastStartTime: number | null;
  /** State change history */
  stateHistory: ProcessStateChange[];
  /** Memory usage history */
  memoryHistory: MemorySample[];
  /** CPU usage history */
  cpuHistory: CPUSample[];
  /** Consecutive restart failures */
  consecutiveRestarts: number;
  /** Last restart time timestamp */
  lastRestartTime: number | null;
  /** Last crash time timestamp */
  lastCrashTime: number | null;
}
