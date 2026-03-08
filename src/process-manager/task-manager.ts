/**
 * Task Manager - One-shot task execution manager
 *
 * Manages background command execution for AI agents.
 * Unlike ProcessManager (for long-running services), TaskManager handles
 * one-time command execution with exit code tracking and log capture.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  TaskInfo,
  TaskLogWaitOptions,
  TaskLogResponse,
  generateTaskId,
} from '../shared/task.js';

/**
 * Internal task state with process handle and log buffer
 */
interface ManagedTask {
  info: TaskInfo;
  process: ChildProcess | null;
  stdout: string[];
  stderr: string[];
  /** Combined output lines (stdout + stderr interleaved) */
  outputLines: string[];
  /** Event emitter for log wait notifications */
  events: EventEmitter;
}

/**
 * Auto-cleanup interval for completed tasks (default: 1 hour)
 */
const COMPLETED_TASK_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Maximum output buffer size per task (lines)
 */
const MAX_OUTPUT_LINES = 10000;

export class TaskManager extends EventEmitter {
  private tasks = new Map<string, ManagedTask>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.startCleanupTimer();
  }

  /**
   * Run a command as a background task
   */
  runTask(options: {
    command: string;
    name?: string;
    cwd?: string;
    env?: Record<string, string>;
  }): TaskInfo {
    const id = generateTaskId();
    const now = Date.now();

    const info: TaskInfo = {
      id,
      name: options.name,
      command: options.command,
      status: 'running',
      pid: null,
      exit_code: null,
      signal: null,
      started_at: now,
      finished_at: null,
      duration_ms: null,
    };

    const managed: ManagedTask = {
      info,
      process: null,
      stdout: [],
      stderr: [],
      outputLines: [],
      events: new EventEmitter(),
    };

    this.tasks.set(id, managed);

    // Spawn the process using shell
    const child = spawn(options.command, {
      shell: true,
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    managed.process = child;
    info.pid = child.pid || null;

    // Capture stdout
    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        managed.stdout.push(line);
        managed.outputLines.push(line);
        if (managed.outputLines.length > MAX_OUTPUT_LINES) {
          managed.outputLines.shift();
        }
      }
      managed.events.emit('output', lines);
    });

    // Capture stderr
    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        managed.stderr.push(line);
        managed.outputLines.push(line);
        if (managed.outputLines.length > MAX_OUTPUT_LINES) {
          managed.outputLines.shift();
        }
      }
      managed.events.emit('output', lines);
    });

    // Handle process exit
    child.on('exit', (code, signal) => {
      const finishedAt = Date.now();
      info.status = signal ? 'killed' : code === 0 ? 'exited' : 'errored';
      info.exit_code = code;
      info.signal = signal;
      info.finished_at = finishedAt;
      info.duration_ms = finishedAt - info.started_at;
      info.pid = null;
      managed.process = null;
      managed.events.emit('exit', code, signal);
      this.emit('task:exit', id, code, signal);
    });

    child.on('error', (error) => {
      info.status = 'errored';
      info.finished_at = Date.now();
      info.duration_ms = info.finished_at - info.started_at;
      managed.outputLines.push(`[error] ${error.message}`);
      managed.events.emit('exit', 1, null);
      this.emit('task:error', id, error);
    });

    this.emit('task:start', id);
    return { ...info };
  }

  /**
   * Get task info by ID
   */
  getTask(id: string): TaskInfo | null {
    const managed = this.tasks.get(id);
    if (!managed) return null;
    return { ...managed.info };
  }

  /**
   * Get all tasks
   */
  getAllTasks(): TaskInfo[] {
    return Array.from(this.tasks.values()).map((t) => ({ ...t.info }));
  }

  /**
   * Kill a task
   */
  // eslint-disable-next-line no-undef
  killTask(id: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const managed = this.tasks.get(id);
    if (!managed || !managed.process) return false;

    try {
      managed.process.kill(signal);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get task log output with optional wait functionality
   */
  async getTaskLog(
    id: string,
    wait?: TaskLogWaitOptions
  ): Promise<TaskLogResponse | null> {
    const managed = this.tasks.get(id);
    if (!managed) return null;

    // No wait options — return current output immediately
    if (!wait) {
      return this.buildLogResponse(managed, false);
    }

    // Wait for condition
    return new Promise<TaskLogResponse>((resolve) => {
      let resolved = false;
      const done = (timedOut: boolean) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(this.buildLogResponse(managed, timedOut, wait.waitMatch));
      };

      // Timeout
      const timer = setTimeout(() => done(true), wait.timeout);

      const onOutput = () => {
        if (resolved) return;

        // Check wait-lines
        if (wait.waitLines && managed.outputLines.length >= wait.waitLines) {
          done(false);
          return;
        }

        // Check wait-match
        if (wait.waitMatch) {
          const regex = new RegExp(wait.waitMatch);
          for (const line of managed.outputLines) {
            if (regex.test(line)) {
              done(false);
              return;
            }
          }
        }
      };

      const onExit = () => {
        if (resolved) return;
        if (wait.waitExit) {
          done(false);
          return;
        }
        // If waiting for lines/match and process exited, return what we have
        done(false);
      };

      const cleanup = () => {
        clearTimeout(timer);
        managed.events.off('output', onOutput);
        managed.events.off('exit', onExit);
      };

      managed.events.on('output', onOutput);
      managed.events.on('exit', onExit);

      // Check if condition is already met
      if (managed.info.status !== 'running') {
        done(false);
        return;
      }
      onOutput();
    });
  }

  /**
   * Build a TaskLogResponse from current state
   */
  private buildLogResponse(
    managed: ManagedTask,
    timedOut: boolean,
    waitMatch?: string
  ): TaskLogResponse {
    const output = managed.outputLines.join('\n');
    const truncated = managed.outputLines.length >= MAX_OUTPUT_LINES;

    let matched: string | null = null;
    let matchedLine: number | null = null;

    if (waitMatch) {
      const regex = new RegExp(waitMatch);
      for (let i = 0; i < managed.outputLines.length; i++) {
        const m = managed.outputLines[i].match(regex);
        if (m) {
          matched = m[0];
          matchedLine = i + 1;
          break;
        }
      }
    }

    return {
      id: managed.info.id,
      status: managed.info.status,
      exit_code: managed.info.exit_code,
      matched,
      matched_line: matchedLine,
      output,
      truncated,
      timed_out: timedOut,
    };
  }

  /**
   * Start periodic cleanup of completed tasks
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupCompletedTasks();
    }, CLEANUP_INTERVAL_MS);
    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Remove completed tasks older than TTL
   */
  private cleanupCompletedTasks(): void {
    const now = Date.now();
    for (const [id, managed] of this.tasks) {
      if (
        managed.info.status !== 'running' &&
        managed.info.finished_at &&
        now - managed.info.finished_at > COMPLETED_TASK_TTL_MS
      ) {
        managed.events.removeAllListeners();
        this.tasks.delete(id);
      }
    }
  }

  /**
   * Stop all running tasks and cleanup
   */
  async dispose(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Kill all running tasks
    for (const [, managed] of this.tasks) {
      if (managed.process) {
        try {
          managed.process.kill('SIGTERM');
        } catch {
          // ignore
        }
      }
      managed.events.removeAllListeners();
    }

    this.tasks.clear();
    this.removeAllListeners();
  }
}
