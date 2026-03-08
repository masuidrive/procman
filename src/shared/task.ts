/**
 * Task Management Type Definitions
 *
 * Types for one-shot task execution (as opposed to long-running service processes).
 * Designed for AI agent background task management.
 */

// =============================================================================
// Task Status Type
// =============================================================================

/**
 * Possible states of a managed task
 */
export type TaskStatus = 'running' | 'exited' | 'killed' | 'errored';

// =============================================================================
// Task Information Interface
// =============================================================================

/**
 * Information about a managed task
 */
export interface TaskInfo {
  /** Unique task identifier (e.g. "task-a1b2c3") */
  id: string;
  /** Optional human-readable name */
  name?: string;
  /** Command being executed */
  command: string;
  /** Current task status */
  status: TaskStatus;
  /** Process ID (null if not yet started or already exited) */
  pid: number | null;
  /** Exit code (null if still running) */
  exit_code: number | null;
  /** Signal that terminated the process (null if exited normally) */
  signal: string | null;
  /** Start timestamp (ms) */
  started_at: number;
  /** Finish timestamp (ms, null if still running) */
  finished_at: number | null;
  /** Duration in milliseconds (null if still running) */
  duration_ms: number | null;
}

// =============================================================================
// Task Log Wait Options
// =============================================================================

/**
 * Options for waiting on task log output
 */
export interface TaskLogWaitOptions {
  /** Wait until N lines have been output */
  waitLines?: number;
  /** Wait until a line matches this regex pattern */
  waitMatch?: string;
  /** Wait until the process exits */
  waitExit?: boolean;
  /** Timeout in milliseconds */
  timeout: number;
}

// =============================================================================
// Task Log Response
// =============================================================================

/**
 * Response from task log query with wait options
 */
export interface TaskLogResponse {
  /** Task ID */
  id: string;
  /** Current task status */
  status: TaskStatus | 'running';
  /** Exit code (null if still running) */
  exit_code: number | null;
  /** Matched pattern (null if no match or not waiting for match) */
  matched: string | null;
  /** Line number where match was found (null if no match) */
  matched_line: number | null;
  /** Captured output */
  output: string;
  /** Whether output was truncated */
  truncated: boolean;
  /** Whether the wait timed out */
  timed_out: boolean;
}

// =============================================================================
// IPC Payload Types
// =============================================================================

/**
 * Payload for 'run-task' command
 */
export interface RunTaskCommandPayload {
  /** Command to execute (passed to shell) */
  command: string;
  /** Optional task name */
  name?: string;
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Payload for 'task-status' command
 */
export interface TaskStatusCommandPayload {
  /** Task ID */
  id: string;
}

/**
 * Payload for 'task-list' command
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TaskListCommandPayload {}

/**
 * Payload for 'task-kill' command
 */
export interface TaskKillCommandPayload {
  /** Task ID */
  id: string;
  /** Signal to send (default: SIGTERM) */
  signal?: string;
}

/**
 * Payload for 'task-log' command
 */
export interface TaskLogCommandPayload {
  /** Task ID */
  id: string;
  /** Wait options */
  wait?: TaskLogWaitOptions;
}

// =============================================================================
// IPC Response Data Types
// =============================================================================

export interface RunTaskResponseData {
  task: TaskInfo;
}

export interface TaskStatusResponseData {
  task: TaskInfo;
}

export interface TaskListResponseData {
  tasks: TaskInfo[];
}

export interface TaskKillResponseData {
  id: string;
  killed: boolean;
}

export interface TaskLogResponseData {
  log: TaskLogResponse;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a short task ID
 */
export function generateTaskId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'task-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
