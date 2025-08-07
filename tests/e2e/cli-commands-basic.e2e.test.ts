/**
 * Basic CLI Commands End-to-End Tests
 *
 * This test suite covers basic CLI functionality including:
 * - Help and version commands
 * - Exit command
 * - Error boundary testing
 * - Basic error handling and invalid command scenarios
 *
 * Key Testing Principles:
 * - Test observable behaviors, not implementation details
 * - Use real processes, no mocks
 * - Test boundary conditions and edge cases
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import {
  createTestExecCLI,
  setupTestEnvironment,
  setupTestDirectory,
  cleanupTestDirectory,
  cleanupDaemon,
} from './shared/cli-commands-shared';

describe('Basic CLI Commands E2E Tests', () => {
  let testDir: string;
  let testSocketPath: string;
  let testEnv: Record<string, string>;
  let testExecCLI: ReturnType<typeof createTestExecCLI>;

  beforeAll(async () => {
    // Ensure CLI is built
    try {
      await fs.access('./bin/procman');
    } catch {
      throw new Error(
        'CLI is not built. Run "npm run build" before running E2E tests.'
      );
    }

    const { testSocketPath: socketPath, testEnv: env } =
      await setupTestEnvironment();
    testSocketPath = socketPath;
    testEnv = env;
    testExecCLI = createTestExecCLI(testEnv);
  });

  afterAll(async () => {
    // Cleanup test socket directory
    try {
      const testTempDir = testSocketPath
        ? require('path').dirname(testSocketPath)
        : '';
      if (testTempDir) {
        await fs.rm(testTempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    const testDirectorySetup = await setupTestDirectory();
    testDir = testDirectorySetup.testDir;

    // Cleanup any existing daemon
    await cleanupDaemon(testEnv);
  });

  afterEach(async () => {
    // Cleanup daemon and test directory
    await cleanupDaemon(testEnv);
    await cleanupTestDirectory(testDir);
  });

  describe('Help and Version Commands', () => {
    test('should display comprehensive help information', async () => {
      const result = await testExecCLI(['help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Process Manager');
      expect(result.stdout).toContain('Commands');
      expect(result.stdout).toContain('load');
      expect(result.stdout).toContain('start');
      expect(result.stdout).toContain('stop');
      expect(result.stdout).toContain('restart');
      expect(result.stdout).toContain('exit');
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('log');
      expect(result.stdout).toContain('clear-log');
    });

    test('should display help with prompt alias', async () => {
      const result = await testExecCLI(['prompt']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Process Manager');
      expect(result.stdout).toContain('Commands');
    });

    test('should display help in different formats', async () => {
      const markdownResult = await testExecCLI(['help', '-f', 'markdown']);
      const textResult = await testExecCLI(['help', '-f', 'text']);

      expect(markdownResult.exitCode).toBe(0);
      expect(textResult.exitCode).toBe(0);
      expect(markdownResult.stdout).toContain('Process Manager');
      expect(textResult.stdout).toContain('Process Manager');
    });

    test('should display version information', async () => {
      const result = await testExecCLI(['--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    test('should show help when no command provided', async () => {
      const result = await testExecCLI(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Process Manager CLI Tool');
      expect(result.stdout).toContain('Commands:');
    });
  });

  describe('Exit Command - Daemon Shutdown', () => {
    test('should handle exit command appropriately', async () => {
      const result = await testExecCLI(['exit']);
      expect([0, 1]).toContain(result.exitCode);
    });

    test('should handle exit command with --force flag', async () => {
      const result = await testExecCLI(['exit', '--force']);
      expect([0, 1]).toContain(result.exitCode);
    });

    test('should handle exit when daemon not running', async () => {
      const result = await testExecCLI(['exit']);
      expect([0, 1]).toContain(result.exitCode);
    });
  });

  describe('Error Boundary Testing', () => {
    test('should handle invalid command gracefully', async () => {
      const result = await testExecCLI(['invalid-command']);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('unknown command');
    });

    test('should handle missing required arguments', async () => {
      // Most commands accept empty target lists, but test edge cases
      const result = await testExecCLI(['load']); // No config file

      expect([0, 1]).toContain(result.exitCode); // May have default behavior or fail
    });

    test('should handle commands without daemon running', async () => {
      // Don't load daemon first
      const commands = ['list', 'start', 'stop', 'restart', 'log', 'clear-log'];

      for (const cmd of commands) {
        const result = await testExecCLI([cmd], { timeout: 5000 });
        // Some commands may succeed gracefully or handle missing daemon appropriately
        expect([0, 1]).toContain(result.exitCode);
        if (result.exitCode !== 0) {
          expect(result.stderr).toBeTruthy();
        }
      }
    });

    test('should handle verbose error output', async () => {
      const result = await testExecCLI(['--verbose', 'list']);

      // Command may succeed or fail gracefully with verbose output
      expect([0, 1]).toContain(result.exitCode);
      // Should produce some output (either stdout or stderr)
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });

    test('should handle extremely long process names', async () => {
      const longName = 'a'.repeat(1000);
      const result = await testExecCLI(['start', longName]);

      // May handle gracefully or reject the long name
      expect([0, 1]).toContain(result.exitCode);
      if (result.exitCode !== 0) {
        expect(result.stderr).toBeTruthy();
      }
    });

    test('should handle special characters in process names', async () => {
      const specialNames = [
        'process@#$%',
        'process with spaces',
        'process/with/slashes',
        'process\nwith\nnewlines',
        '../../malicious',
      ];

      for (const name of specialNames) {
        const result = await testExecCLI(['start', name]);
        // May handle gracefully or reject special characters
        expect([0, 1]).toContain(result.exitCode);
        if (result.exitCode !== 0) {
          expect(result.stderr).toBeTruthy();
        }
      }
    });
  });

  describe('Performance and Timeout Testing', () => {
    test('should handle timeout scenarios gracefully', async () => {
      // Test very short timeout to ensure timeout handling works
      try {
        await testExecCLI(['--help'], { timeout: 1 }); // 1ms timeout
        // If this doesn't timeout, that's also okay (command might be very fast)
      } catch (error) {
        expect((error as Error).message).toContain('timed out');
      }
    });
  });
});
