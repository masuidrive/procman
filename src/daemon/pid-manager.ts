/**
 * PID file management for procman daemon
 *
 * Manages the daemon.pid file for preventing duplicate daemon processes
 * and tracking daemon process status.
 */

import * as fs from 'fs/promises';
import { DataDirectory } from './data-directory.js';

/**
 * Manages PID file for daemon process lifecycle
 */
export class PIDManager {
  private readonly dataDirectory: DataDirectory;

  constructor(dataDirectory: DataDirectory) {
    this.dataDirectory = dataDirectory;
  }

  /**
   * Get the path to the PID file
   */
  getPIDFilePath(): string {
    return this.dataDirectory.getSubPath('daemon.pid');
  }

  /**
   * Write current process PID to the PID file
   */
  async writePIDFile(): Promise<void> {
    const pidFilePath = this.getPIDFilePath();
    const pid = process.pid.toString();

    await this.dataDirectory.createFileWithPermissions(pidFilePath, pid);
  }

  /**
   * Read PID from the PID file
   * @returns PID number or null if file doesn't exist or contains invalid data
   */
  async readPIDFile(): Promise<number | null> {
    try {
      const pidFilePath = this.getPIDFilePath();
      const pidContent = await fs.readFile(pidFilePath, 'utf-8');
      const pid = parseInt(pidContent.trim(), 10);

      if (isNaN(pid) || pid <= 0) {
        return null;
      }

      return pid;
    } catch {
      return null;
    }
  }

  /**
   * Remove the PID file
   */
  async removePIDFile(): Promise<void> {
    try {
      const pidFilePath = this.getPIDFilePath();
      await fs.unlink(pidFilePath);
    } catch {
      // Ignore errors - file might not exist
    }
  }

  /**
   * Check if a process with given PID is running
   */
  isProcessRunning(pid: number): boolean {
    if (pid <= 0) {
      return false;
    }

    try {
      // Signal 0 can be used to check if process exists
      // This doesn't actually send a signal, just checks permissions
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if daemon is currently running based on PID file
   */
  async isDaemonRunning(): Promise<boolean> {
    const pid = await this.readPIDFile();

    if (pid === null) {
      return false;
    }

    return this.isProcessRunning(pid);
  }

  /**
   * Ensure no daemon is currently running
   * Throws error if daemon is running, cleans up stale PID files
   */
  async ensureNoDaemonRunning(): Promise<void> {
    const pid = await this.readPIDFile();

    if (pid === null) {
      // No PID file exists
      return;
    }

    if (this.isProcessRunning(pid)) {
      throw new Error(`Daemon is already running with PID ${pid}`);
    }

    // Clean up stale PID file
    await this.removePIDFile();
  }

  /**
   * Cleanup PID file (typically called on daemon shutdown)
   */
  async cleanup(): Promise<void> {
    await this.removePIDFile();
  }
}
