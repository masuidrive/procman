/**
 * CrashRecovery - Handles recovery after daemon crash
 *
 * This class is responsible for:
 * - Detecting previous daemon crashes
 * - Cleaning up stale PID and socket files
 * - Recovering orphaned processes
 * - Restoring process state
 *
 * Following SOLID principles:
 * - Single Responsibility: Only handles crash recovery
 * - Open/Closed: Extensible for new recovery strategies
 * - Dependency Inversion: Depends on abstractions
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  OrphanProcessDetector,
  IOrphanDetector,
  ProcessInfo,
} from './orphan-detector';
import { EventEmitter } from 'events';

export interface RecoveryResult {
  crashDetected: boolean;
  recoveredProcesses: ProcessInfo[];
  cleanedResources: string[];
  errors: string[];
}

export interface ICrashRecovery {
  detectAndRecover(): Promise<RecoveryResult>;
  cleanupStaleResources(): Promise<string[]>;
  recoverOrphanedProcesses(): Promise<ProcessInfo[]>;
}

export class CrashRecovery extends EventEmitter implements ICrashRecovery {
  private readonly dataDir: string;
  private readonly socketPath: string;
  private readonly pidFile: string;
  private readonly orphanDetector: IOrphanDetector;

  constructor(
    dataDir: string = path.join(process.env.HOME || '', '.masuidrive-procman'),
    socketPath?: string,
    orphanDetector?: IOrphanDetector
  ) {
    super();
    this.dataDir = dataDir;
    this.socketPath = socketPath || path.join(dataDir, 'procman.sock');
    this.pidFile = path.join(dataDir, 'daemon.pid');
    this.orphanDetector = orphanDetector || new OrphanProcessDetector(dataDir);
  }

  /**
   * Main recovery entry point - detects crash and performs recovery
   */
  async detectAndRecover(): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      crashDetected: false,
      recoveredProcesses: [],
      cleanedResources: [],
      errors: [],
    };

    try {
      // Check if there was a previous crash
      result.crashDetected = await this.detectPreviousCrash();

      if (result.crashDetected) {
        this.emit('crash-detected');
        console.log(
          '[CrashRecovery] Previous daemon crash detected, initiating recovery...'
        );

        // Clean up stale resources
        try {
          result.cleanedResources = await this.cleanupStaleResources();
          console.log(
            `[CrashRecovery] Cleaned ${result.cleanedResources.length} stale resources`
          );
        } catch (error) {
          const errMsg = `Failed to cleanup resources: ${error}`;
          result.errors.push(errMsg);
          console.error(`[CrashRecovery] ${errMsg}`);
        }

        // Recover orphaned processes
        try {
          result.recoveredProcesses = await this.recoverOrphanedProcesses();
          console.log(
            `[CrashRecovery] Recovered ${result.recoveredProcesses.length} orphaned processes`
          );
        } catch (error) {
          const errMsg = `Failed to recover processes: ${error}`;
          result.errors.push(errMsg);
          console.error(`[CrashRecovery] ${errMsg}`);
        }

        this.emit('recovery-complete', result);
      } else {
        console.log(
          '[CrashRecovery] No previous crash detected, normal startup'
        );
      }
    } catch (error) {
      const errMsg = `Recovery process failed: ${error}`;
      result.errors.push(errMsg);
      console.error(`[CrashRecovery] ${errMsg}`);
    }

    return result;
  }

  /**
   * Detect if there was a previous daemon crash
   */
  private async detectPreviousCrash(): Promise<boolean> {
    try {
      // Check if PID file exists
      const pidFileExists = await this.fileExists(this.pidFile);
      if (!pidFileExists) {
        return false;
      }

      // Read the PID from file
      const pidContent = await fs.readFile(this.pidFile, 'utf-8');
      const previousPid = parseInt(pidContent.trim(), 10);

      if (isNaN(previousPid)) {
        // Invalid PID file, consider it a crash
        return true;
      }

      // Check if the process is still running
      try {
        process.kill(previousPid, 0);
        // Process exists, check if it's our daemon
        const { execSync } = await import('child_process');
        const psOutput = execSync(
          `ps -p ${previousPid} -o command=`,
          { timeout: 5000 } // Add 5 second timeout
        ).toString();

        if (
          psOutput.includes('daemon-main') ||
          psOutput.includes('procman-daemon')
        ) {
          // Daemon is still running, no crash
          return false;
        } else {
          // PID exists but it's not our daemon, previous daemon crashed
          return true;
        }
      } catch {
        // Process doesn't exist, daemon crashed
        return true;
      }
    } catch (error) {
      // Error checking, assume no crash
      console.error('[CrashRecovery] Error detecting crash:', error);
      return false;
    }
  }

  /**
   * Clean up stale resources from previous daemon
   */
  async cleanupStaleResources(): Promise<string[]> {
    const cleaned: string[] = [];

    // Clean up PID file
    if (await this.fileExists(this.pidFile)) {
      try {
        await fs.unlink(this.pidFile);
        cleaned.push(`PID file: ${this.pidFile}`);
        console.log('[CrashRecovery] Cleaned up stale PID file');
      } catch (error) {
        console.error('[CrashRecovery] Failed to clean PID file:', error);
      }
    }

    // Clean up socket file
    if (await this.fileExists(this.socketPath)) {
      try {
        await fs.unlink(this.socketPath);
        cleaned.push(`Socket file: ${this.socketPath}`);
        console.log('[CrashRecovery] Cleaned up stale socket file');
      } catch (error) {
        console.error('[CrashRecovery] Failed to clean socket file:', error);
      }
    }

    // Clean up lock files
    try {
      const lockDir = path.join(this.dataDir, 'locks');
      if (await this.fileExists(lockDir)) {
        const lockFiles = await fs.readdir(lockDir);
        for (const lockFile of lockFiles) {
          const lockPath = path.join(lockDir, lockFile);
          await fs.unlink(lockPath);
          cleaned.push(`Lock file: ${lockPath}`);
        }
        console.log(
          `[CrashRecovery] Cleaned up ${lockFiles.length} lock files`
        );
      }
    } catch (error) {
      console.error('[CrashRecovery] Failed to clean lock files:', error);
    }

    // Clean up temporary files
    try {
      const tempDir = path.join(this.dataDir, 'tmp');
      if (await this.fileExists(tempDir)) {
        await fs.rm(tempDir, { recursive: true, force: true });
        cleaned.push(`Temp directory: ${tempDir}`);
        console.log('[CrashRecovery] Cleaned up temp directory');
      }
    } catch (error) {
      console.error('[CrashRecovery] Failed to clean temp directory:', error);
    }

    return cleaned;
  }

  /**
   * Recover orphaned processes from crashed daemon
   */
  async recoverOrphanedProcesses(): Promise<ProcessInfo[]> {
    const orphanedProcesses =
      await this.orphanDetector.detectOrphanedProcesses();
    const recovered: ProcessInfo[] = [];

    for (const proc of orphanedProcesses) {
      try {
        // Try to recover process metadata
        const metadata = await this.loadProcessMetadata(proc.pid);

        if (metadata) {
          proc.name = metadata.name || proc.name;
          proc.namespace = metadata.namespace;
        }

        // Emit event for each recovered process
        this.emit('process-recovered', proc);
        recovered.push(proc);

        console.log(
          `[CrashRecovery] Recovered process: ${proc.name} (PID: ${proc.pid})`
        );
      } catch (error) {
        console.error(
          `[CrashRecovery] Failed to recover process ${proc.pid}:`,
          error
        );
      }
    }

    return recovered;
  }

  /**
   * Load saved process metadata
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadProcessMetadata(pid: number): Promise<any> {
    try {
      const metadataFile = path.join(this.dataDir, 'processes', `${pid}.json`);
      if (await this.fileExists(metadataFile)) {
        const content = await fs.readFile(metadataFile, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error(
        `[CrashRecovery] Failed to load metadata for PID ${pid}:`,
        error
      );
    }
    return null;
  }

  /**
   * Save current daemon PID for future crash detection
   */
  async saveDaemonPid(pid: number = process.pid): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.pidFile), { recursive: true });
      await fs.writeFile(this.pidFile, pid.toString(), 'utf-8');
      console.log(`[CrashRecovery] Saved daemon PID: ${pid}`);
    } catch (error) {
      console.error('[CrashRecovery] Failed to save daemon PID:', error);
      throw error;
    }
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Restore process state from saved data
   */
  async restoreProcessState(): Promise<void> {
    try {
      const stateFile = path.join(this.dataDir, 'daemon-state.json');
      if (await this.fileExists(stateFile)) {
        const stateData = await fs.readFile(stateFile, 'utf-8');
        const state = JSON.parse(stateData);

        this.emit('state-restored', state);
        console.log(
          '[CrashRecovery] Process state restored from previous session'
        );
      }
    } catch (error) {
      console.error('[CrashRecovery] Failed to restore process state:', error);
    }
  }

  /**
   * Save current process state for recovery
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async saveProcessState(state: any): Promise<void> {
    try {
      const stateFile = path.join(this.dataDir, 'daemon-state.json');
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      console.error('[CrashRecovery] Failed to save process state:', error);
    }
  }
}
