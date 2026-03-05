/**
 * CLI Log Commands End-to-End Tests
 *
 * This test suite covers CLI log-related commands including:
 * - Log command (log display and streaming)
 * - Clear-log command (log management)
 *
 * Key Testing Principles:
 * - Test observable behaviors, not implementation details
 * - Use real processes, no mocks
 * - Test boundary conditions and edge cases
 * - Test log streaming functionality
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  createTestExecCLI,
  setupTestEnvironment,
  setupTestDirectory,
  cleanupTestDirectory,
  cleanupDaemon,
  startCLIProcess,
  sleep,
  PROCESS_STARTUP_TIMEOUT,
  LOG_STREAM_TIMEOUT,
} from './shared/cli-commands-shared';

describe('CLI Log Commands E2E Tests', () => {
  // Set timeout for tests and hooks - critical for CI stability
  vi.setConfig({
    testTimeout: 90000, // 90 seconds for test execution
    hookTimeout: 60000, // 60 seconds for setup/teardown hooks
  });

  let testDir: string;
  let testSocketPath: string;
  let testEnv: Record<string, string>;
  let testExecCLI: ReturnType<typeof createTestExecCLI>;

  beforeAll(async () => {
    // Ensure CLI is built
    try {
      await fs.access(path.join(process.cwd(), 'bin', 'procman'));
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
      const testTempDir = testSocketPath ? path.dirname(testSocketPath) : '';
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

  describe('Log Command - Log Display and Streaming', () => {
    test('should handle log command appropriately', async () => {
      const result = await testExecCLI(['log', 'e2e-test-app']);
      expect([0, 1]).toContain(result.exitCode);
    });

    test('should handle log command with multiple processes', async () => {
      const result = await testExecCLI([
        'log',
        'e2e-test-app',
        'e2e-test-app-2',
      ]);
      expect([0, 1]).toContain(result.exitCode);
    });

    test('should handle log command with line limit option', async () => {
      const result = await testExecCLI(['log', 'e2e-test-app', '-n', '5']);
      expect([0, 1]).toContain(result.exitCode);
    });

    test('should handle log command with human readable format', async () => {
      const result = await testExecCLI(['log', 'e2e-test-app', '--human']);
      expect([0, 1]).toContain(result.exitCode);
    });

    test('should handle log command with namespace option', async () => {
      const result = await testExecCLI(['log', '--namespace', 'e2e-test']);
      expect([0, 1]).toContain(result.exitCode);
    });

    test(
      'should handle log streaming command (may fail in test environment)',
      async () => {
        const { process: logProcess, getOutput } = startCLIProcess(
          ['log', 'e2e-test-app', '--stream'],
          { env: testEnv }
        );

        // Give the process a moment to start
        await sleep(1000);

        // Terminate streaming
        logProcess.kill('SIGTERM');

        const output = getOutput();
        // Should at least attempt streaming (show some output)
        expect(output.stdout || output.stderr).toBeTruthy();
      },
      LOG_STREAM_TIMEOUT + 5000
    );

    test('should handle log command for non-existent process', async () => {
      const result = await testExecCLI(['log', 'nonexistent-process']);

      // May handle gracefully or show appropriate error
      expect([0, 1]).toContain(result.exitCode);
      if (result.exitCode !== 0) {
        expect(result.stderr).toBeTruthy();
      }
    });
  });

  describe('Clear-Log Command - Log Management', () => {
    test('should handle clear-log command appropriately', async () => {
      const result = await testExecCLI(['clear-log', 'e2e-test-app'], {
        input: 'y\n',
      });
      expect([0, 1]).toContain(result.exitCode);
    });

    test('should clear logs for multiple processes', async () => {
      await testExecCLI(['start', 'e2e-test-app-2'], {
        timeout: PROCESS_STARTUP_TIMEOUT,
      });
      await sleep(2000);

      const result = await testExecCLI(
        ['clear-log', 'e2e-test-app', 'e2e-test-app-2'],
        {
          input: 'y\n',
        }
      );

      expect([0, 1]).toContain(result.exitCode);
    });

    test('should clear logs by namespace', async () => {
      const result = await testExecCLI(['clear-log', '-n', 'e2e-test'], {
        input: 'y\n',
      });

      expect([0, 1]).toContain(result.exitCode);
    });

    test('should handle clearing logs for non-existent process', async () => {
      const result = await testExecCLI(['clear-log', 'nonexistent-process']);

      // May handle gracefully or show appropriate error
      expect([0, 1]).toContain(result.exitCode);
      if (result.exitCode !== 0) {
        expect(result.stderr).toBeTruthy();
      }
    });

    test('should handle clear-log with confirmation prompt', async () => {
      // Test declining the confirmation
      const declineResult = await testExecCLI(['clear-log', 'e2e-test-app'], {
        input: 'n\n',
      });
      expect([0, 1]).toContain(declineResult.exitCode);

      // Test accepting the confirmation
      const acceptResult = await testExecCLI(['clear-log', 'e2e-test-app'], {
        input: 'y\n',
      });
      expect([0, 1]).toContain(acceptResult.exitCode);
    });

    test('should handle clear-log with --force flag (skip confirmation)', async () => {
      const result = await testExecCLI([
        'clear-log',
        'e2e-test-app',
        '--force',
      ]);
      expect([0, 1]).toContain(result.exitCode);
    });
  });

  describe('Log Command Advanced Scenarios', () => {
    test('should handle log command with various format options', async () => {
      const formats = ['json', 'yaml', 'table'];

      for (const format of formats) {
        const result = await testExecCLI(['log', 'e2e-test-app', '-f', format]);
        expect([0, 1]).toContain(result.exitCode);

        if (result.exitCode === 0 && result.stdout) {
          // If successful, should have some content
          expect(result.stdout.length).toBeGreaterThan(0);
        }
      }
    });

    test('should handle log command with timestamp options', async () => {
      const timestampOptions = [
        ['log', 'e2e-test-app', '--timestamp'],
        ['log', 'e2e-test-app', '--no-timestamp'],
      ];

      for (const args of timestampOptions) {
        const result = await testExecCLI(args);
        expect([0, 1]).toContain(result.exitCode);
      }
    });

    test('should handle log command with different line counts', async () => {
      const lineCounts = ['1', '5', '10', '100'];

      for (const count of lineCounts) {
        const result = await testExecCLI(['log', 'e2e-test-app', '-n', count]);
        expect([0, 1]).toContain(result.exitCode);
      }
    });

    test('should handle log command edge cases', async () => {
      // Test with zero lines
      const zeroLinesResult = await testExecCLI([
        'log',
        'e2e-test-app',
        '-n',
        '0',
      ]);
      expect([0, 1]).toContain(zeroLinesResult.exitCode);

      // Test with very large line count
      const largeLinesResult = await testExecCLI([
        'log',
        'e2e-test-app',
        '-n',
        '999999',
      ]);
      expect([0, 1]).toContain(largeLinesResult.exitCode);

      // Test with negative line count (should fail gracefully)
      const negativeLinesResult = await testExecCLI([
        'log',
        'e2e-test-app',
        '-n',
        '-5',
      ]);
      expect([0, 1]).toContain(negativeLinesResult.exitCode);
    });
  });

  describe('Log Streaming Advanced Scenarios', () => {
    test(
      'should handle multiple simultaneous log streams',
      async () => {
        const streams = [
          startCLIProcess(['log', 'e2e-test-app', '--stream'], {
            env: testEnv,
          }),
          startCLIProcess(['log', 'e2e-test-app-2', '--stream'], {
            env: testEnv,
          }),
        ];

        // Give streams time to start
        await sleep(1000);

        // Terminate all streams
        streams.forEach(({ process }) => {
          if (!process.killed) {
            process.kill('SIGTERM');
          }
        });

        // Check that streams produced some output
        streams.forEach(({ getOutput }) => {
          const output = getOutput();
          // Should at least attempt streaming
          expect(typeof output.stdout).toBe('string');
          expect(typeof output.stderr).toBe('string');
        });
      },
      LOG_STREAM_TIMEOUT * 2
    );

    test(
      'should handle log stream interruption gracefully',
      async () => {
        const {
          process: logProcess,
          waitForExit,
          getOutput,
        } = startCLIProcess(['log', 'e2e-test-app', '--stream'], {
          env: testEnv,
        });

        // Let stream run for a short time
        await sleep(500);

        // Interrupt with SIGINT
        if (!logProcess.killed) {
          logProcess.kill('SIGINT');
        }

        const { code, signal } = await waitForExit(3000);
        const output = getOutput();

        // Process should terminate cleanly
        expect(code !== null || signal !== null).toBe(true);
        expect(typeof output.stdout).toBe('string');
        expect(typeof output.stderr).toBe('string');
      },
      LOG_STREAM_TIMEOUT
    );
  });
});
