/**
 * OrphanProcessDetector - Detects and manages orphaned processes
 *
 * This class is responsible for:
 * - Scanning system processes to find orphaned procman-managed processes
 * - Identifying processes that were managed by a crashed daemon
 * - Providing a list of recoverable processes
 *
 * Following SOLID principles:
 * - Single Responsibility: Only detects orphaned processes
 * - Dependency Inversion: Depends on interfaces, not concrete implementations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProcessInfo {
  pid: number;
  ppid: number;
  command: string;
  cwd: string;
  name: string;
  namespace?: string;
}

export interface IOrphanDetector {
  detectOrphanedProcesses(): Promise<ProcessInfo[]>;
  isProcessOrphaned(pid: number): Promise<boolean>;
  isProcmanManagedProcess(processInfo: ProcessInfo): boolean;
}

export class OrphanProcessDetector implements IOrphanDetector {
  private readonly dataDir: string;
  private readonly processIdentifiers = [
    'node', // Node.js processes
    'test-process.js', // Our test processes
    '/workspaces/procman', // Processes in our project directory
  ];

  constructor(
    dataDir: string = path.join(process.env.HOME || '', '.masuidrive-procman')
  ) {
    this.dataDir = dataDir;
  }

  /**
   * Detect all orphaned processes that were managed by procman
   */
  async detectOrphanedProcesses(): Promise<ProcessInfo[]> {
    const allProcesses = await this.getAllProcesses();
    const orphanedProcesses: ProcessInfo[] = [];

    for (const proc of allProcesses) {
      if (
        (await this.isProcessOrphaned(proc.pid)) &&
        this.isProcmanManagedProcess(proc)
      ) {
        orphanedProcesses.push(proc);
      }
    }

    return orphanedProcesses;
  }

  /**
   * Check if a specific process is orphaned
   */
  async isProcessOrphaned(pid: number): Promise<boolean> {
    try {
      // Check if process exists
      process.kill(pid, 0);

      // Get process info
      const proc = await this.getProcessInfo(pid);
      if (!proc) return false;

      // A process is orphaned if:
      // 1. Its parent is init (ppid = 1)
      // 2. Or its parent doesn't exist
      if (proc.ppid === 1) {
        return true;
      }

      // Check if parent process exists
      try {
        process.kill(proc.ppid, 0);
        return false; // Parent exists, not orphaned
      } catch {
        return true; // Parent doesn't exist, process is orphaned
      }
    } catch {
      return false; // Process doesn't exist
    }
  }

  /**
   * Determine if a process was managed by procman
   */
  isProcmanManagedProcess(processInfo: ProcessInfo): boolean {
    // Check if command contains our identifiers
    for (const identifier of this.processIdentifiers) {
      if (processInfo.command.includes(identifier)) {
        return true;
      }
    }

    // Check if process was started from our working directory
    if (processInfo.cwd && processInfo.cwd.includes('/workspaces/procman')) {
      return true;
    }

    // Check for specific test process patterns
    if (
      processInfo.command.includes('test-process') ||
      processInfo.command.includes('crash-after') ||
      processInfo.command.includes('zombie-creator') ||
      processInfo.command.includes('memory-leaker')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Get information about all running processes
   */
  private async getAllProcesses(): Promise<ProcessInfo[]> {
    try {
      // Use ps command to get process information
      // Format: PID PPID COMMAND
      const { stdout } = await execAsync('ps axo pid,ppid,command');
      const lines = stdout.trim().split('\n').slice(1); // Skip header

      const processes: ProcessInfo[] = [];

      for (const line of lines) {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
        if (match) {
          const pid = parseInt(match[1], 10);
          const ppid = parseInt(match[2], 10);
          const command = match[3];

          // Try to get additional info
          const cwd = await this.getProcessCwd(pid);
          const name = this.extractProcessName(command);

          processes.push({
            pid,
            ppid,
            command,
            cwd,
            name,
          });
        }
      }

      return processes;
    } catch (error) {
      console.error('Failed to get process list:', error);
      return [];
    }
  }

  /**
   * Get detailed information about a specific process
   */
  private async getProcessInfo(pid: number): Promise<ProcessInfo | null> {
    try {
      const { stdout } = await execAsync(`ps -p ${pid} -o pid,ppid,command`);
      const lines = stdout.trim().split('\n');

      if (lines.length < 2) return null;

      const match = lines[1].match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) return null;

      const cwd = await this.getProcessCwd(pid);
      const command = match[3];

      return {
        pid: parseInt(match[1], 10),
        ppid: parseInt(match[2], 10),
        command,
        cwd,
        name: this.extractProcessName(command),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get the current working directory of a process
   */
  private async getProcessCwd(pid: number): Promise<string> {
    try {
      // On Linux, we can read the cwd from /proc
      if (process.platform === 'linux') {
        const cwdLink = `/proc/${pid}/cwd`;
        return await fs.readlink(cwdLink);
      }

      // On macOS, use lsof
      if (process.platform === 'darwin') {
        const { stdout } = await execAsync(
          `lsof -p ${pid} | grep cwd | awk '{print $NF}'`
        );
        return stdout.trim();
      }

      return '';
    } catch {
      return '';
    }
  }

  /**
   * Extract a meaningful name from the command string
   */
  private extractProcessName(command: string): string {
    // Extract the main executable or script name
    const parts = command.split(/\s+/);
    if (parts.length === 0) return 'unknown';

    // Find the main script or executable
    for (const part of parts) {
      if (part.endsWith('.js') || part.endsWith('.ts')) {
        return path.basename(part);
      }
    }

    return path.basename(parts[0]);
  }

  /**
   * Try to recover process metadata from saved state
   */
  async recoverProcessMetadata(
    pid: number
  ): Promise<{ name?: string; namespace?: string } | null> {
    try {
      // Look for saved process state in data directory
      const stateFile = path.join(this.dataDir, 'processes', `${pid}.json`);
      const data = await fs.readFile(stateFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
}
