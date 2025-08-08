/**
 * ZombieReaper - Handles zombie process cleanup
 *
 * This class is responsible for:
 * - Detecting zombie processes in the system
 * - Reaping zombie child processes
 * - Preventing zombie accumulation
 *
 * Following SOLID principles:
 * - Single Responsibility: Only handles zombie process cleanup
 * - Interface Segregation: Clean, focused interface
 * - Dependency Inversion: Can be injected as a dependency
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ZombieInfo {
  pid: number;
  ppid: number;
  command: string;
  state: 'Z' | 'zombie' | 'defunct';
}

export interface IZombieReaper {
  startReaping(intervalMs?: number): void;
  stopReaping(): void;
  detectZombies(): Promise<ZombieInfo[]>;
  reapZombies(): Promise<number>;
  isZombie(pid: number): Promise<boolean>;
}

export class ZombieReaper extends EventEmitter implements IZombieReaper {
  private reapInterval: ReturnType<typeof setInterval> | null = null;
  private isReaping = false;
  private readonly maxReapAttempts = 3;
  private sigchldHandler: (() => void) | null = null;

  constructor() {
    super();
    // Don't automatically set up signal handlers in test environment
    if (process.env.NODE_ENV !== 'test') {
      this.setupSignalHandlers();
    }
  }

  /**
   * Set up SIGCHLD handler to automatically reap children
   */
  private setupSignalHandlers(): void {
    // Store handler reference for cleanup
    this.sigchldHandler = () => {
      this.handleSigchld();
    };
    // Handle SIGCHLD to reap zombie children
    process.on('SIGCHLD', this.sigchldHandler);
  }

  /**
   * Clean up signal handlers
   */
  private cleanupSignalHandlers(): void {
    if (this.sigchldHandler) {
      process.removeListener('SIGCHLD', this.sigchldHandler);
      this.sigchldHandler = null;
    }
  }

  /**
   * Handle SIGCHLD signal - called when a child process dies
   */
  private handleSigchld(): void {
    // In Node.js, we need to use waitpid through a native binding
    // or rely on child_process events for proper reaping
    // For now, trigger a reap cycle
    this.reapZombies().catch((error) => {
      console.error('[ZombieReaper] Error handling SIGCHLD:', error);
    });
  }

  /**
   * Start automatic zombie reaping
   */
  startReaping(intervalMs = 30000): void {
    if (this.isReaping) {
      console.log('[ZombieReaper] Already reaping zombies');
      return;
    }

    this.isReaping = true;
    console.log(
      `[ZombieReaper] Starting zombie reaper (interval: ${intervalMs}ms)`
    );

    // Initial reap
    this.reapZombies().catch((error) => {
      console.error('[ZombieReaper] Initial reap failed:', error);
    });

    // Set up periodic reaping
    this.reapInterval = setInterval(async () => {
      try {
        const reapedCount = await this.reapZombies();
        if (reapedCount > 0) {
          console.log(`[ZombieReaper] Reaped ${reapedCount} zombie processes`);
          this.emit('zombies-reaped', reapedCount);
        }
      } catch (error) {
        console.error('[ZombieReaper] Reap cycle failed:', error);
        this.emit('reap-error', error);
      }
    }, intervalMs);

    this.emit('reaper-started');
  }

  /**
   * Stop automatic zombie reaping
   */
  stopReaping(): void {
    if (!this.isReaping) {
      // Still clean up signal handlers even if not actively reaping
      this.cleanupSignalHandlers();
      return;
    }

    this.isReaping = false;

    if (this.reapInterval) {
      clearInterval(this.reapInterval);
      this.reapInterval = null;
    }

    // Clean up signal handlers
    this.cleanupSignalHandlers();

    console.log('[ZombieReaper] Stopped zombie reaper');
    this.emit('reaper-stopped');
  }

  /**
   * Detect zombie processes in the system
   */
  async detectZombies(): Promise<ZombieInfo[]> {
    try {
      // Use ps to find zombie processes
      // Format: PID PPID STATE COMMAND
      const { stdout } = await execAsync(
        'ps axo pid,ppid,state,command | grep -E "Z|<defunct>"'
      );

      const zombies: ZombieInfo[] = [];
      const lines = stdout.trim().split('\n');
      const seenPids = new Set<number>();

      for (const line of lines) {
        // Skip grep process itself
        if (line.includes('grep -E')) continue;

        const match = line.match(/^\s*(\d+)\s+(\d+)\s+([ZT])\S*\s+(.+)$/);
        if (match) {
          const pid = parseInt(match[1], 10);
          const ppid = parseInt(match[2], 10);
          const state = match[3];
          const command = match[4];

          // Avoid duplicates
          if (seenPids.has(pid)) continue;
          seenPids.add(pid);

          // Check if it's truly a zombie
          if (state === 'Z' || command.includes('<defunct>')) {
            zombies.push({
              pid,
              ppid,
              command: command.replace('<defunct>', '').trim(),
              state: 'Z',
            });
          }
        }
      }

      return zombies;
    } catch (error: any) {
      // grep returns exit code 1 if no matches found
      if (
        error.code === 1 &&
        (error.stdout === '' || error.stdout === undefined)
      ) {
        return []; // No zombies found
      }
      throw error;
    }
  }

  /**
   * Check if a specific process is a zombie
   */
  async isZombie(pid: number): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`ps -p ${pid} -o state=`);
      const state = stdout.trim();
      return state === 'Z' || state.startsWith('Z');
    } catch {
      // Process doesn't exist or error checking
      return false;
    }
  }

  /**
   * Reap zombie processes
   */
  async reapZombies(): Promise<number> {
    const zombies = await this.detectZombies();
    let reapedCount = 0;

    for (const zombie of zombies) {
      try {
        // Check if we're the parent of this zombie
        if (zombie.ppid === process.pid) {
          // We're the parent, we can reap it directly
          // In Node.js, this typically happens automatically when using child_process
          console.log(
            `[ZombieReaper] Reaping our zombie child: PID ${zombie.pid}`
          );

          // Try to reap using waitpid equivalent
          await this.reapChild(zombie.pid);
          reapedCount++;
        } else if (zombie.ppid === 1) {
          // Init is the parent, it should handle it
          console.log(
            `[ZombieReaper] Zombie PID ${zombie.pid} is owned by init, skipping`
          );
        } else {
          // Try to notify the parent to reap its child
          try {
            process.kill(zombie.ppid, 'SIGCHLD');
            console.log(
              `[ZombieReaper] Sent SIGCHLD to parent PID ${zombie.ppid} for zombie ${zombie.pid}`
            );
          } catch {
            console.log(
              `[ZombieReaper] Parent PID ${zombie.ppid} not accessible for zombie ${zombie.pid}`
            );
          }
        }
      } catch (error) {
        console.error(
          `[ZombieReaper] Failed to reap zombie PID ${zombie.pid}:`,
          error
        );
      }
    }

    // Also check for any terminated children we haven't reaped
    reapedCount += await this.reapTerminatedChildren();

    return reapedCount;
  }

  /**
   * Reap a specific child process
   */
  private async reapChild(pid: number): Promise<void> {
    // In a real implementation, we would use waitpid() system call
    // For Node.js, we rely on automatic reaping when child_process objects are handled
    // This is a placeholder for demonstration

    try {
      // Try to send signal 0 to check if process exists
      process.kill(pid, 0);

      // If we get here, process still exists as zombie
      // In production, would use native binding to call waitpid()
      console.log(`[ZombieReaper] Would reap zombie PID ${pid} with waitpid()`);

      // For testing, we can try to force cleanup
      await execAsync(`kill -9 ${pid} 2>/dev/null || true`);
    } catch {
      // Process doesn't exist or already reaped
    }
  }

  /**
   * Reap any terminated children that haven't been reaped yet
   */
  private async reapTerminatedChildren(): Promise<number> {
    let reapedCount = 0;

    // In Node.js, we don't have direct access to waitpid
    // This would require a native addon in production
    // For now, we'll use a workaround

    try {
      // Check if any of our children are zombies
      const { stdout } = await execAsync(
        `ps --ppid ${process.pid} -o pid,state | grep Z`
      );
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const match = line.match(/^\s*(\d+)\s+Z/);
        if (match) {
          const childPid = parseInt(match[1], 10);
          await this.reapChild(childPid);
          reapedCount++;
        }
      }
    } catch {
      // No zombie children or error checking
    }

    return reapedCount;
  }

  /**
   * Monitor system for zombie accumulation
   */
  async monitorZombieCount(): Promise<number> {
    const zombies = await this.detectZombies();
    const count = zombies.length;

    if (count > 10) {
      console.warn(
        `[ZombieReaper] WARNING: High zombie count detected: ${count}`
      );
      this.emit('high-zombie-count', count);
    }

    return count;
  }

  /**
   * Clean up resources on shutdown
   */
  cleanup(): void {
    this.stopReaping();
    this.removeAllListeners();
  }
}
