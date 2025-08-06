/**
 * Test for PIDManager class
 * Tests PID file management functionality for the procman daemon
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { PIDManager } from '../../src/daemon/pid-manager.js';
import { DataDirectory } from '../../src/daemon/data-directory.js';

describe('PIDManager', () => {
  let tempTestDir: string;
  let dataDirectory: DataDirectory;
  let pidManager: PIDManager;
  let originalHome: string | undefined;

  beforeEach(async () => {
    // Create temporary test directory
    tempTestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'procman-test-'));

    // Set temporary HOME environment variable
    originalHome = process.env.HOME;
    process.env.HOME = tempTestDir;

    dataDirectory = new DataDirectory();
    await dataDirectory.ensureDataDirectory();

    pidManager = new PIDManager(dataDirectory);
  });

  afterEach(async () => {
    // Clean up PID file if exists
    try {
      await pidManager.removePIDFile();
    } catch {
      // Ignore cleanup errors
    }

    // Restore original HOME
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }

    // Clean up test directory
    try {
      await fs.rm(tempTestDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    test('should create PIDManager instance', () => {
      expect(pidManager).toBeInstanceOf(PIDManager);
    });
  });

  describe('getPIDFilePath', () => {
    test('should return correct PID file path', () => {
      const pidFilePath = pidManager.getPIDFilePath();
      const expected = dataDirectory.getSubPath('daemon.pid');
      expect(pidFilePath).toBe(expected);
    });
  });

  describe('writePIDFile', () => {
    test('should create PID file with current process ID', async () => {
      await pidManager.writePIDFile();

      const pidFilePath = pidManager.getPIDFilePath();
      const pidContent = await fs.readFile(pidFilePath, 'utf-8');
      const storedPID = parseInt(pidContent.trim(), 10);

      expect(storedPID).toBe(process.pid);
    });

    test('should overwrite existing PID file', async () => {
      const pidFilePath = pidManager.getPIDFilePath();

      // Write initial PID file with different content
      await fs.writeFile(pidFilePath, '12345');

      // Write correct PID
      await pidManager.writePIDFile();

      const pidContent = await fs.readFile(pidFilePath, 'utf-8');
      const storedPID = parseInt(pidContent.trim(), 10);

      expect(storedPID).toBe(process.pid);
    });

    test('should create file with correct permissions', async () => {
      await pidManager.writePIDFile();

      const pidFilePath = pidManager.getPIDFilePath();
      const stats = await fs.stat(pidFilePath);
      const mode = stats.mode & parseInt('777', 8);

      // Check that file has restrictive permissions
      expect([parseInt('600', 8), parseInt('644', 8)]).toContain(mode);
    });
  });

  describe('readPIDFile', () => {
    test('should read PID from existing file', async () => {
      await pidManager.writePIDFile();

      const pid = await pidManager.readPIDFile();
      expect(pid).toBe(process.pid);
    });

    test('should return null if PID file does not exist', async () => {
      const pid = await pidManager.readPIDFile();
      expect(pid).toBeNull();
    });

    test('should return null if PID file contains invalid content', async () => {
      const pidFilePath = pidManager.getPIDFilePath();
      await fs.writeFile(pidFilePath, 'invalid-pid');

      const pid = await pidManager.readPIDFile();
      expect(pid).toBeNull();
    });

    test('should return null if PID file is empty', async () => {
      const pidFilePath = pidManager.getPIDFilePath();
      await fs.writeFile(pidFilePath, '');

      const pid = await pidManager.readPIDFile();
      expect(pid).toBeNull();
    });
  });

  describe('removePIDFile', () => {
    test('should remove existing PID file', async () => {
      await pidManager.writePIDFile();
      const pidFilePath = pidManager.getPIDFilePath();

      // Confirm file exists
      const existsBefore = await fs
        .access(pidFilePath)
        .then(() => true)
        .catch(() => false);
      expect(existsBefore).toBe(true);

      await pidManager.removePIDFile();

      // Confirm file is removed
      const existsAfter = await fs
        .access(pidFilePath)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });

    test('should not fail if PID file does not exist', async () => {
      // Should not throw
      await expect(pidManager.removePIDFile()).resolves.toBeUndefined();
    });
  });

  describe('isProcessRunning', () => {
    test('should return true for current process', () => {
      const isRunning = pidManager.isProcessRunning(process.pid);
      expect(isRunning).toBe(true);
    });

    test('should return false for non-existent process', () => {
      // Use a very high PID that is unlikely to exist
      const nonExistentPID = 999999;
      const isRunning = pidManager.isProcessRunning(nonExistentPID);
      expect(isRunning).toBe(false);
    });

    test('should return false for invalid PID', () => {
      const isRunning = pidManager.isProcessRunning(-1);
      expect(isRunning).toBe(false);
    });

    test('should return false for zero PID', () => {
      const isRunning = pidManager.isProcessRunning(0);
      expect(isRunning).toBe(false);
    });
  });

  describe('isDaemonRunning', () => {
    test('should return false if no PID file exists', async () => {
      const isRunning = await pidManager.isDaemonRunning();
      expect(isRunning).toBe(false);
    });

    test('should return true if PID file exists and process is running', async () => {
      await pidManager.writePIDFile();

      const isRunning = await pidManager.isDaemonRunning();
      expect(isRunning).toBe(true);
    });

    test('should return false if PID file exists but process is not running', async () => {
      const pidFilePath = pidManager.getPIDFilePath();
      // Write a PID that definitely doesn't exist
      await fs.writeFile(pidFilePath, '999999');

      const isRunning = await pidManager.isDaemonRunning();
      expect(isRunning).toBe(false);
    });

    test('should return false if PID file contains invalid content', async () => {
      const pidFilePath = pidManager.getPIDFilePath();
      await fs.writeFile(pidFilePath, 'invalid-pid');

      const isRunning = await pidManager.isDaemonRunning();
      expect(isRunning).toBe(false);
    });
  });

  describe('ensureNoDaemonRunning', () => {
    test('should succeed if no daemon is running', async () => {
      await expect(pidManager.ensureNoDaemonRunning()).resolves.toBeUndefined();
    });

    test('should throw error if daemon is already running', async () => {
      await pidManager.writePIDFile();

      await expect(pidManager.ensureNoDaemonRunning()).rejects.toThrow(
        'Daemon is already running with PID'
      );
    });

    test('should succeed if PID file exists but process is not running', async () => {
      const pidFilePath = pidManager.getPIDFilePath();
      // Write a PID that definitely doesn't exist
      await fs.writeFile(pidFilePath, '999999');

      // Should clean up stale PID file and succeed
      await expect(pidManager.ensureNoDaemonRunning()).resolves.toBeUndefined();

      // Verify PID file was removed
      const exists = await fs
        .access(pidFilePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe('cleanup', () => {
    test('should remove PID file on cleanup', async () => {
      await pidManager.writePIDFile();
      const pidFilePath = pidManager.getPIDFilePath();

      // Confirm file exists
      const existsBefore = await fs
        .access(pidFilePath)
        .then(() => true)
        .catch(() => false);
      expect(existsBefore).toBe(true);

      await pidManager.cleanup();

      // Confirm file is removed
      const existsAfter = await fs
        .access(pidFilePath)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });
  });
});
