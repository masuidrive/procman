/**
 * Data directory management for procman daemon
 *
 * Manages the ~/.masuidrive-procman/ directory structure, permissions,
 * and provides utilities for working with files within the data directory.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { PROCMAN_DIR } from '../shared/constants.js';

/**
 * Manages data directory for procman daemon
 */
export class DataDirectory {
  private readonly dataDir: string;

  constructor() {
    this.dataDir = this.resolveDataDir();
  }

  /**
   * Resolve the data directory path, expanding ~ to home directory
   */
  resolveDataDir(customPath?: string): string {
    const pathToResolve = customPath || PROCMAN_DIR;

    if (pathToResolve.startsWith('~')) {
      const homeDir = os.homedir();
      if (!homeDir) {
        throw new Error('Unable to determine home directory');
      }
      return pathToResolve.replace(/^~/, homeDir);
    }

    return pathToResolve;
  }

  /**
   * Ensure the data directory exists with correct permissions (0700)
   */
  async ensureDataDirectory(): Promise<void> {
    try {
      // Check if directory exists
      const stats = await fs.stat(this.dataDir);

      if (!stats.isDirectory()) {
        throw new Error(`Path exists but is not a directory: ${this.dataDir}`);
      }

      // Check and fix permissions if needed
      const mode = stats.mode & parseInt('777', 8);
      if (mode !== parseInt('700', 8)) {
        await fs.chmod(this.dataDir, 0o700);
      }
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any).code === 'ENOENT') {
        // Directory doesn't exist, create it
        await fs.mkdir(this.dataDir, { mode: 0o700, recursive: true });
      } else {
        throw error;
      }
    }
  }

  /**
   * Validate that the data directory exists and has correct permissions
   */
  async validateDataDirectory(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.dataDir);

      if (!stats.isDirectory()) {
        return false;
      }

      // Check permissions (should be 0700)
      const mode = stats.mode & parseInt('777', 8);
      return mode === parseInt('700', 8);
    } catch {
      return false;
    }
  }

  /**
   * Get a path within the data directory
   */
  getSubPath(...pathSegments: string[]): string {
    return path.join(this.dataDir, ...pathSegments);
  }

  /**
   * Create a file with correct permissions (0600)
   */
  async createFileWithPermissions(
    filePath: string,
    content: string
  ): Promise<void> {
    await fs.writeFile(filePath, content, { mode: 0o600 });
  }

  /**
   * Get the resolved data directory path
   */
  getDataDir(): string {
    return this.dataDir;
  }

  /**
   * Get the data directory path (creates if needed)
   */
  async getDataDirectory(): Promise<string> {
    await this.ensureDataDirectory();
    return this.dataDir;
  }

  /**
   * Get the log directory path
   */
  async getLogDirectory(): Promise<string> {
    const appLogsDir = path.join(this.dataDir, 'app-logs');
    await fs.mkdir(appLogsDir, { recursive: true, mode: 0o700 });
    return appLogsDir;
  }

  /**
   * Get the socket path for IPC
   */
  async getSocketPath(): Promise<string> {
    await this.ensureDataDirectory();
    if (process.platform === 'win32') {
      return '\\\\.\\pipe\\masuidrive-procman';
    }
    return path.join(this.dataDir, 'procman.sock');
  }
}
