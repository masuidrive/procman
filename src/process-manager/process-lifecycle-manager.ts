/**
 * ProcessLifecycleManager - Handles process lifecycle operations
 *
 * This class is responsible for:
 * - Starting and stopping processes
 * - Signal handling and graceful shutdown
 * - Child process management
 * - Process state transitions
 * - Mutex-based concurrency control
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import {
  ProcessLifecycleManager as IProcessLifecycleManager,
  ProcessLifecycleResult,
} from './interfaces/process-lifecycle.js';
import { ManagedProcessInfo } from './managed-process-info.js';
import {
  GRACEFUL_SHUTDOWN_TIMEOUT,
  FORCE_KILL_TIMEOUT,
  GRACEFUL_SHUTDOWN_SIGNAL,
  FORCE_KILL_SIGNAL,
} from '../shared/constants.js';
import { KeyedMutex, withKeyedLock } from './utils/mutex.js';

// Node.js global types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TimeoutId = any;
declare const setTimeout: (
  callback: (...args: unknown[]) => void,
  ms: number
) => TimeoutId;
declare const clearTimeout: (id: TimeoutId) => void;

/**
 * ProcessLifecycleManager implementation
 */
export class ProcessLifecycleManagerImpl
  extends EventEmitter
  implements IProcessLifecycleManager
{
  private readonly processes: Map<string, ManagedProcessInfo>;
  private readonly childProcesses: Map<string, ChildProcess>;
  private readonly operationMutex: KeyedMutex<string>;

  constructor(
    processes: Map<string, ManagedProcessInfo>,
    childProcesses: Map<string, ChildProcess>
  ) {
    super();
    this.processes = processes;
    this.childProcesses = childProcesses;
    this.operationMutex = new KeyedMutex<string>();
  }

  /**
   * Start a process with the given configuration
   */
  public async startProcess(name: string): Promise<ProcessLifecycleResult> {
    return withKeyedLock(this.operationMutex, name, async () => {
      return this.startProcessInternal(name);
    });
  }

  /**
   * Internal start process implementation (no mutex)
   */
  private async startProcessInternal(
    name: string
  ): Promise<ProcessLifecycleResult> {
    const managedProcess = this.processes.get(name);
    if (!managedProcess) {
      return {
        success: false,
        error: `Process '${name}' not found. Use initializeProcess() first.`,
      };
    }

    const config = managedProcess.getConfig();
    const currentStatus = managedProcess.getStatus();

    // Check if process is already running or starting
    if (currentStatus === 'online' || currentStatus === 'starting') {
      return {
        success: false,
        error: `Process '${name}' is already ${currentStatus}`,
      };
    }

    return new Promise<ProcessLifecycleResult>((resolve) => {
      try {
        // Set status to starting
        managedProcess.setStatus('starting');

        // Determine the command and arguments
        let command: string;
        let commandArgs: string[];

        // If script ends with .js, .mjs, or .cjs, run it with node
        if (config.script.match(/\.(js|mjs|cjs)$/i)) {
          command = process.execPath; // Use the same node binary that's running this process
          commandArgs = [config.script, ...config.args];
        } else {
          command = config.script;
          commandArgs = config.args;
        }

        // Spawn the child process
        const childProcess = spawn(command, commandArgs, {
          cwd: config.cwd,
          env: config.env,
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, stdout/stderr captured
        });

        // Store the child process reference
        this.childProcesses.set(name, childProcess);

        // Handle spawn errors
        childProcess.on('error', (error: Error) => {
          managedProcess.setStatus('errored');
          managedProcess.emitError(error);
          this.childProcesses.delete(name);
          this.emit('process:error', name, error);
          resolve({
            success: false,
            error: error.message,
          });
        });

        // Handle successful spawn
        childProcess.on('spawn', () => {
          // Set up remaining event handlers
          this.setupChildProcessEventHandlers(
            name,
            childProcess,
            managedProcess
          );

          // Handle process startup
          const pid = childProcess.pid;
          if (!pid) {
            const error = new Error(`Failed to get PID for process '${name}'`);
            managedProcess.setStatus('errored');
            managedProcess.emitError(error);
            this.childProcesses.delete(name);
            this.emit('process:error', name, error);
            resolve({
              success: false,
              error: error.message,
            });
            return;
          }

          // Set process info
          managedProcess.emitStart(pid);
          managedProcess.setStatus('online');

          this.emit('process:started', name, pid);
          resolve({
            success: true,
            pid,
          });
        });
      } catch (error) {
        // Handle synchronous startup error
        managedProcess.setStatus('errored');
        const errorInstance =
          error instanceof Error ? error : new Error(String(error));
        managedProcess.emitError(errorInstance);
        this.childProcesses.delete(name);
        this.emit('process:error', name, errorInstance);
        resolve({
          success: false,
          error: errorInstance.message,
        });
      }
    });
  }

  /**
   * Stop a running process gracefully
   */
  public async stopProcess(name: string): Promise<ProcessLifecycleResult> {
    return withKeyedLock(this.operationMutex, name, async () => {
      return this.stopProcessInternal(name);
    });
  }

  /**
   * Internal stop process implementation (no mutex)
   */
  private async stopProcessInternal(
    name: string
  ): Promise<ProcessLifecycleResult> {
    const managedProcess = this.processes.get(name);
    if (!managedProcess) {
      return {
        success: false,
        error: `Process '${name}' not found`,
      };
    }

    const currentStatus = managedProcess.getStatus();
    if (currentStatus === 'stopped' || currentStatus === 'errored') {
      return {
        success: true,
        metadata: { wasAlreadyStopped: true },
      };
    }

    const childProcess = this.childProcesses.get(name);
    if (!childProcess) {
      managedProcess.setStatus('stopped');
      return {
        success: true,
        metadata: { wasAlreadyStopped: true },
      };
    }

    return new Promise<ProcessLifecycleResult>((resolve) => {
      let resolved = false;
      let forceKillTimeout: TimeoutId | null = null;

      // Handle process exit
      const handleExit = (code: number | null, signal: string | null): void => {
        if (resolved) return;
        resolved = true;

        if (forceKillTimeout) {
          clearTimeout(forceKillTimeout);
        }

        managedProcess.setStatus('stopped');
        managedProcess.emitStop(code);
        this.childProcesses.delete(name);

        this.emit('process:stopped', name, code, signal);
        resolve({
          success: true,
          metadata: { exitCode: code, signal },
        });
      };

      // Set status to stopping
      managedProcess.setStatus('stopping');

      // Remove existing exit handler and add our own
      childProcess.removeAllListeners('exit');
      childProcess.once('exit', handleExit);

      // Try graceful shutdown first
      const killed = childProcess.kill(GRACEFUL_SHUTDOWN_SIGNAL);
      if (!killed) {
        // Process already died
        handleExit(null, null);
        return;
      }

      // Set timeout for force kill
      forceKillTimeout = setTimeout(() => {
        if (!resolved) {
          console.warn(
            `Process '${name}' did not exit gracefully, sending SIGKILL`
          );
          childProcess.kill(FORCE_KILL_SIGNAL);

          // Set another timeout in case SIGKILL doesn't work
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.error(`Failed to kill process '${name}'`);
              managedProcess.setStatus('errored');
              this.emit(
                'process:error',
                name,
                new Error('Failed to kill process')
              );
              resolve({
                success: false,
                error: 'Failed to kill process after timeout',
              });
            }
          }, FORCE_KILL_TIMEOUT);
        }
      }, GRACEFUL_SHUTDOWN_TIMEOUT);
    });
  }

  /**
   * Restart a process (stop then start)
   */
  public async restartProcess(name: string): Promise<ProcessLifecycleResult> {
    // We acquire the lock for the entire restart operation
    return withKeyedLock(this.operationMutex, name, async () => {
      // Call the internal methods that don't acquire locks again
      const stopResult = await this.stopProcessInternal(name);
      if (!stopResult.success) {
        return stopResult;
      }

      // Wait a bit before starting again
      await new Promise((resolve) => setTimeout(resolve, 100));

      const startResult = await this.startProcessInternal(name);
      if (startResult.success) {
        const managedProcess = this.processes.get(name);
        if (managedProcess) {
          managedProcess.recordRestart();
          this.emit('process:restarted', name);
        }
      }

      return startResult;
    });
  }

  /**
   * Send a signal to a process
   */
  public async sendSignalToProcess(
    name: string,
    signal: string
  ): Promise<ProcessLifecycleResult> {
    return withKeyedLock(this.operationMutex, name, async () => {
      const managedProcess = this.processes.get(name);
      if (!managedProcess) {
        return {
          success: false,
          error: `Process '${name}' not found`,
        };
      }

      const childProcess = this.childProcesses.get(name);
      if (!childProcess) {
        return {
          success: false,
          error: `Process '${name}' is not running`,
        };
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const killed = childProcess.kill(signal as any);
        if (!killed) {
          return {
            success: false,
            error: `Failed to send signal ${signal} to process '${name}'`,
          };
        }

        this.emit('process:signal-sent', name, signal);
        return {
          success: true,
          metadata: { signal },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Error sending signal: ${errorMessage}`,
        };
      }
    });
  }

  /**
   * Get the child process instance
   */
  public getChildProcess(name: string): ChildProcess | undefined {
    return this.childProcesses.get(name);
  }

  /**
   * Check if a process is running
   */
  public isProcessRunning(name: string): boolean {
    const managedProcess = this.processes.get(name);
    if (!managedProcess) {
      return false;
    }

    const status = managedProcess.getStatus();
    return status === 'online' || status === 'starting';
  }

  /**
   * Check if any operations are currently locked
   */
  public getLockedProcesses(): string[] {
    return this.operationMutex.getLockedKeys();
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    // Stop all running processes
    const runningProcesses = Array.from(this.processes.entries())
      .filter(([, process]) => {
        const status = process.getStatus();
        return status === 'online' || status === 'starting';
      })
      .map(([name]) => name);

    await Promise.all(runningProcesses.map((name) => this.stopProcess(name)));

    // Clear all references
    this.childProcesses.clear();
    this.removeAllListeners();
  }

  /**
   * Set up event handlers for child process
   */
  private setupChildProcessEventHandlers(
    name: string,
    childProcess: ChildProcess,
    managedProcess: ManagedProcessInfo
  ): void {
    // Handle process exit
    childProcess.on('exit', (code: number | null, signal: string | null) => {
      const wasUnexpected = managedProcess.isUnexpectedExit(code, signal);

      if (wasUnexpected) {
        managedProcess.setStatus('errored', true, 'Unexpected exit');
        managedProcess.recordRestartFailure();
      } else {
        managedProcess.setStatus('stopped', true, 'Normal exit');
        managedProcess.recordRestartSuccess();
      }

      managedProcess.emitStop(code);
      this.childProcesses.delete(name);

      this.emit('process:exit', name, code, signal, wasUnexpected);

      // Check if auto-restart should happen
      if (wasUnexpected && managedProcess.shouldRestart()) {
        const delay = managedProcess.getNextRestartDelay();
        console.log(
          `Process '${name}' will be restarted after ${delay}ms delay`
        );
        setTimeout(() => {
          this.startProcess(name).catch((error) => {
            console.error(`Failed to auto-restart process '${name}':`, error);
          });
        }, delay);
      }
    });

    // Handle stdout
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        this.emit('process:stdout', name, data.toString());
      });
    }

    // Handle stderr
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        this.emit('process:stderr', name, data.toString());
      });
    }
  }
}
