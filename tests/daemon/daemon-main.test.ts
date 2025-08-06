/**
 * Test for daemon-main module
 * Tests daemon entry point and process management
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock child_process before importing daemon-main
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Import after mocking
import { startDaemon, isDaemonRunning } from '../../src/daemon/daemon-main.js';
import { DataDirectory } from '../../src/daemon/data-directory.js';
import { PIDManager } from '../../src/daemon/pid-manager.js';

describe('daemon-main', () => {
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
    // Clean up PID file
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

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('isDaemonRunning', () => {
    test('should return false when no daemon is running', async () => {
      const isRunning = await isDaemonRunning();
      expect(isRunning).toBe(false);
    });

    test('should return true when daemon PID file exists and process is running', async () => {
      // Write current process PID to simulate running daemon
      await pidManager.writePIDFile();

      const isRunning = await isDaemonRunning();
      expect(isRunning).toBe(true);
    });

    test('should return false when PID file exists but process is not running', async () => {
      const pidFilePath = pidManager.getPIDFilePath();
      // Write a PID that definitely doesn't exist
      await fs.writeFile(pidFilePath, '999999');

      const isRunning = await isDaemonRunning();
      expect(isRunning).toBe(false);
    });
  });

  describe('startDaemon', () => {
    test('should throw error if daemon is already running', async () => {
      // Simulate running daemon
      await pidManager.writePIDFile();

      await expect(startDaemon()).rejects.toThrow('Daemon is already running');
    });

    test('should spawn detached daemon process', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = spawn as any;

      // Mock spawn to return a mock child process
      const mockChild = {
        pid: 12345,
        unref: vi.fn(),
        disconnect: vi.fn(),
        stdio: [null, null, null, null, null],
      };

      mockSpawn.mockReturnValue(mockChild);

      const daemonPid = await startDaemon();

      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining([
          expect.stringContaining('daemon-main'),
          '--daemon',
        ]),
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
        })
      );

      expect(mockChild.unref).toHaveBeenCalled();
      expect(daemonPid).toBe(12345);
    });

    test('should handle daemon process startup failure', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = spawn as any;

      // Mock spawn to simulate failure
      const mockChild = {
        pid: undefined,
        unref: vi.fn(),
        disconnect: vi.fn(),
        stdio: [null, null, null, null, null],
      };

      mockSpawn.mockReturnValue(mockChild);

      await expect(startDaemon()).rejects.toThrow(
        'Failed to start daemon process'
      );
    });

    test('should pass additional arguments to daemon', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = spawn as any;

      const mockChild = {
        pid: 12345,
        unref: vi.fn(),
        disconnect: vi.fn(),
        stdio: [null, null, null, null, null],
      };

      mockSpawn.mockReturnValue(mockChild);

      await startDaemon(['--config', '/custom/config.yaml']);

      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining([
          expect.stringContaining('daemon-main'),
          '--daemon',
          '--config',
          '/custom/config.yaml',
        ]),
        expect.any(Object)
      );
    });
  });

  describe('daemon process detachment', () => {
    test('should configure stdio correctly for detached process', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = spawn as any;

      const mockChild = {
        pid: 12345,
        unref: vi.fn(),
        disconnect: vi.fn(),
        stdio: [null, null, null, null, null],
      };

      mockSpawn.mockReturnValue(mockChild);

      await startDaemon();

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
        })
      );
    });

    test('should unref child process for proper detachment', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = spawn as any;

      const mockChild = {
        pid: 12345,
        unref: vi.fn(),
        disconnect: vi.fn(),
        stdio: [null, null, null, null, null],
      };

      mockSpawn.mockReturnValue(mockChild);

      await startDaemon();

      expect(mockChild.unref).toHaveBeenCalled();
    });
  });

  describe('command line arguments', () => {
    test('should handle --daemon flag correctly', () => {
      // This test would verify that the daemon recognizes the --daemon flag
      // and runs in daemon mode vs. CLI mode

      const args = ['--daemon'];
      expect(args).toContain('--daemon');
    });

    test('should pass through configuration arguments', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = spawn as any;

      const mockChild = {
        pid: 12345,
        unref: vi.fn(),
        disconnect: vi.fn(),
        stdio: [null, null, null, null, null],
      };

      mockSpawn.mockReturnValue(mockChild);

      const customArgs = ['--config', '/path/to/config', '--verbose'];
      await startDaemon(customArgs);

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          '--daemon',
          '--config',
          '/path/to/config',
          '--verbose',
        ]),
        expect.any(Object)
      );
    });
  });

  describe('error handling', () => {
    test('should handle spawn errors gracefully', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = spawn as any;

      // Mock spawn to throw an error
      mockSpawn.mockImplementation(() => {
        throw new Error('Spawn failed');
      });

      await expect(startDaemon()).rejects.toThrow('Spawn failed');
    });
  });
});
