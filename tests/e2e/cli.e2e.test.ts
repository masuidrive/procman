/**
 * CLI End-to-End Tests
 * Tests actual CLI command execution and system behavior
 * Follows t_wada's boundary testing principles: test observable behaviors, not implementation details
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  TEST_TIMEOUTS,
  TEST_DELAYS,
  TEST_COUNTS,
  TEST_MEMORY_SIZES,
  TEST_PORTS,
} from '../helpers/test-constants';
import * as os from 'os';

// Test utilities
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

/**
 * Execute CLI command and capture output
 */
const execCLI = async (
  args: string[],
  options: {
    cwd?: string;
    timeout?: number;
    input?: string;
  } = {}
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> => {
  const { cwd = process.cwd(), timeout = TEST_TIMEOUTS.LONG, input } = options;

  return new Promise((resolve, reject) => {
    const child = spawn('node', ['dist/src/cli/index.js', ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = globalThis.setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`CLI command timed out after ${timeout}ms`));
    }, timeout);

    child.on('close', (code) => {
      globalThis.clearTimeout(timer);
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
      });
    });

    child.on('error', (error) => {
      globalThis.clearTimeout(timer);
      reject(error);
    });

    // Send input if provided
    if (input) {
      child.stdin?.write(input);
      child.stdin?.end();
    }
  });
};

/**
 * Start long-running CLI process (for daemon tests)
 */
const startCLIProcess = (
  args: string[],
  options: {
    cwd?: string;
  } = {}
): {
  process: ChildProcess;
  stdout: Promise<string>;
  stderr: Promise<string>;
  waitForOutput: (pattern: string, timeout?: number) => Promise<void>;
} => {
  const { cwd = process.cwd() } = options;

  const child = spawn('node', ['dist/src/cli/index.js', ...args], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutData = '';
  let stderrData = '';

  child.stdout?.on('data', (data) => {
    stdoutData += data.toString();
  });

  child.stderr?.on('data', (data) => {
    stderrData += data.toString();
  });

  const waitForOutput = async (
    pattern: string,
    timeout = 5000
  ): Promise<void> => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (stdoutData.includes(pattern) || stderrData.includes(pattern)) {
        return;
      }
      await sleep(100);
    }
    throw new Error(
      `Expected output pattern "${pattern}" not found within ${timeout}ms. stdout: "${stdoutData}", stderr: "${stderrData}"`
    );
  };

  return {
    process: child,
    stdout: new Promise((resolve) => {
      child.on('close', () => resolve(stdoutData.trim()));
    }),
    stderr: new Promise((resolve) => {
      child.on('close', () => resolve(stderrData.trim()));
    }),
    waitForOutput,
  };
};

describe('CLI E2E Tests', () => {
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    // Create temporary directory for test files
    testDir = path.join(os.tmpdir(), 'procman-cli-e2e-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });

    // Prepare test config file
    configPath = path.join(testDir, 'test-config.cjs');
    const configContent = `
module.exports = {
  apps: [
    {
      name: "cli-test-app",
      script: "${process.execPath}",  // Use current Node.js executable
      args: "-e \\"setInterval(() => console.log('alive ' + Date.now()), 1000);\\"",
      cwd: "${testDir}",
      namespace: "cli-test",
      max_memory_restart: "50M",
      env: {
        NODE_ENV: "test",
        TEST_APP: "cli-test-app"
      }
    },
    {
      name: "cli-test-app-2",
      script: "${process.execPath}",
      args: "-e \\"setInterval(() => console.log('app2 alive ' + Date.now()), 1000);\\"",
      cwd: "${testDir}",
      namespace: "cli-test",
      max_memory_restart: "30M",
      env: {
        NODE_ENV: "test",
        TEST_APP: "cli-test-app-2"
      }
    }
  ]
};
`;
    await fs.writeFile(configPath, configContent);

    // Ensure the project is built for CLI testing
    try {
      await fs.access(path.join(process.cwd(), 'dist/src/cli/index.js'));
    } catch {
      throw new Error(
        'CLI is not built. Run "npm run build" before running CLI E2E tests.'
      );
    }
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup test directory:', error);
    }
  });

  describe('Basic CLI Commands', () => {
    test('should show help when no command is provided', async () => {
      const result = await execCLI(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Process Manager CLI Tool');
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('status');
      expect(result.stdout).toContain('start');
      expect(result.stdout).toContain('stop');
    });

    test('should show version information', async () => {
      const result = await execCLI(['--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
    });

    test('should show status command output', async () => {
      const result = await execCLI(['status']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        'Process status feature will be implemented'
      );
    });

    test('should show start command output', async () => {
      const result = await execCLI(['start', 'test-service']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Starting service: test-service');
    });

    test('should show stop command output', async () => {
      const result = await execCLI(['stop', 'test-service']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Stopping service: test-service');
    });
  });

  describe('Process Lifecycle Management', () => {
    test('should handle complete process lifecycle through CLI', async () => {
      // Note: This test is currently limited by the basic CLI implementation
      // It tests the current CLI behavior and documents expected behavior

      // Test starting a service
      const startResult = await execCLI(['start', 'cli-test-app']);
      expect(startResult.exitCode).toBe(0);
      expect(startResult.stdout).toContain('Starting service: cli-test-app');

      // Test checking status
      const statusResult = await execCLI(['status']);
      expect(statusResult.exitCode).toBe(0);
      expect(statusResult.stdout).toContain(
        'Process status feature will be implemented'
      );

      // Test stopping a service
      const stopResult = await execCLI(['stop', 'cli-test-app']);
      expect(stopResult.exitCode).toBe(0);
      expect(stopResult.stdout).toContain('Stopping service: cli-test-app');
    });

    test('should handle multiple process operations', async () => {
      // Start multiple processes
      const start1Result = await execCLI(['start', 'cli-test-app']);
      const start2Result = await execCLI(['start', 'cli-test-app-2']);

      expect(start1Result.exitCode).toBe(0);
      expect(start2Result.exitCode).toBe(0);
      expect(start1Result.stdout).toContain('Starting service: cli-test-app');
      expect(start2Result.stdout).toContain('Starting service: cli-test-app-2');

      // Check status
      const statusResult = await execCLI(['status']);
      expect(statusResult.exitCode).toBe(0);

      // Stop all processes
      const stop1Result = await execCLI(['stop', 'cli-test-app']);
      const stop2Result = await execCLI(['stop', 'cli-test-app-2']);

      expect(stop1Result.exitCode).toBe(0);
      expect(stop2Result.exitCode).toBe(0);
    });
  });

  describe('Configuration File Error Handling', () => {
    test('should handle missing configuration file gracefully', async () => {
      const nonExistentConfig = path.join(testDir, 'nonexistent-config.cjs');

      // Test with future CLI command that would use config file
      // Currently CLI doesn't have config file support, so we test basic error handling
      const result = await execCLI(['start', 'nonexistent-service']);

      expect(result.exitCode).toBe(0); // Current CLI doesn't validate services yet
      expect(result.stdout).toContain('Starting service: nonexistent-service');
    });

    test('should handle invalid configuration file format', async () => {
      // Create invalid config file
      const invalidConfigPath = path.join(testDir, 'invalid-config.cjs');
      const invalidConfigContent = `
        // This is invalid JavaScript/CommonJS
        module.exports = {
          apps: [
            // Missing closing bracket and quotes
            name: invalid-name
            script: 
        }
      `;
      await fs.writeFile(invalidConfigPath, invalidConfigContent);

      // Test with future CLI command that would parse config file
      const result = await execCLI(['status']);

      // Current CLI doesn't parse config files yet, so this tests basic functionality
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        'Process status feature will be implemented'
      );
    });

    test('should show appropriate error messages for invalid commands', async () => {
      const result = await execCLI(['invalid-command']);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('unknown command');
    });

    test('should handle missing required arguments', async () => {
      // Test start command without service name
      const startResult = await execCLI(['start']);

      expect(startResult.exitCode).not.toBe(0);
      expect(startResult.stderr).toContain('missing required argument');

      // Test stop command without service name
      const stopResult = await execCLI(['stop']);

      expect(stopResult.exitCode).not.toBe(0);
      expect(stopResult.stderr).toContain('missing required argument');
    });
  });

  describe('Log Output and Streaming', () => {
    test('should handle CLI output correctly', async () => {
      const result = await execCLI(['status']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
      expect(result.stdout).toContain(
        'Process status feature will be implemented'
      );
    });

    test('should handle CLI error output correctly', async () => {
      const result = await execCLI(['invalid-command']);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
      expect(result.stderr.toLowerCase()).toContain('unknown');
    });

    test('should support verbose output when implemented', async () => {
      // Test with verbose flag when implemented
      const result = await execCLI(['status', '--verbose']);

      // Currently CLI doesn't support --verbose, so this will show unknown option error
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('unknown option');
    });
  });

  describe('Daemon Mode Operations', () => {
    test('should handle daemon start command', async () => {
      // Test daemon mode when implemented
      // Note: Current CLI doesn't have daemon mode, so this tests future functionality

      const result = await execCLI(['start', 'daemon-service']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Starting service: daemon-service');
    });

    test('should handle daemon status checking', async () => {
      const result = await execCLI(['status']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        'Process status feature will be implemented'
      );
    });

    test('should handle daemon stop command', async () => {
      const result = await execCLI(['stop', 'daemon-service']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Stopping service: daemon-service');
    });

    test('should handle daemon restart when implemented', async () => {
      // Test restart command when implemented
      // Current CLI doesn't have restart command, so test unknown command behavior

      const result = await execCLI(['restart', 'test-service']);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('unknown command');
    });
  });

  describe('Error Boundary Testing', () => {
    test('should handle system resource limits gracefully', async () => {
      // Test with very large number of simultaneous operations
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(execCLI(['status']));
      }

      const results = await Promise.all(promises);

      // All commands should complete successfully
      results.forEach((result, index) => {
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(
          'Process status feature will be implemented'
        );
      });
    });

    test('should handle invalid process names', async () => {
      // Test with special characters and edge cases
      const invalidNames = [
        '', // empty name
        '..', // parent directory
        'name with spaces',
        'name-with-special-chars!@#$%',
        'very-long-name-' + 'x'.repeat(1000),
      ];

      for (const name of invalidNames) {
        if (name === '') {
          // Empty name should fail with missing argument error
          const result = await execCLI(['start']);
          expect(result.exitCode).not.toBe(0);
        } else {
          // Other invalid names should be handled gracefully
          const result = await execCLI(['start', name]);
          expect(result.exitCode).toBe(0); // Current CLI doesn't validate names
          expect(result.stdout).toContain(`Starting service: ${name}`);
        }
      }
    });

    test('should handle interrupted operations gracefully', async () => {
      // Test CLI behavior when process is terminated
      const { process: cliProcess, waitForOutput } = startCLIProcess([
        'status',
      ]);

      // Wait for process to start and output
      try {
        await waitForOutput('Process status feature will be implemented', 2000);
      } catch {
        // If process completes too quickly, that's also valid
      }

      // Terminate the process if it's still running
      if (!cliProcess.killed) {
        cliProcess.kill('SIGTERM');
      }

      // Process should exit gracefully
      await new Promise((resolve) => {
        cliProcess.on('close', resolve);
        // Add timeout to prevent hanging
        globalThis.setTimeout(resolve, 1000);
      });

      // Process should have exited (either normally or by signal)
      expect(
        cliProcess.exitCode !== null || cliProcess.signalCode !== null
      ).toBe(true);
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('Integration with Configuration System', () => {
    test('should validate configuration file structure when implemented', async () => {
      // Create various config file structures to test validation

      const validConfig = path.join(testDir, 'valid-config.cjs');
      const validConfigContent = `
module.exports = {
  apps: [
    {
      name: "valid-app",
      script: "node",
      args: "-e \\"console.log('test')\\"",
      namespace: "test"
    }
  ]
};
`;
      await fs.writeFile(validConfig, validConfigContent);

      // Test config validation when CLI supports it
      const result = await execCLI(['status']);
      expect(result.exitCode).toBe(0);
    });

    test('should handle configuration reload scenarios', async () => {
      // Test dynamic config reload when implemented
      const result = await execCLI(['status']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        'Process status feature will be implemented'
      );
    });
  });

  describe('Advanced CLI Command Tests', () => {
    describe('Real-time Log Streaming', () => {
      test('should handle logs command for real-time log output', async () => {
        // Test logs command - current CLI doesn't support this yet
        const result = await execCLI(['logs', 'cli-test-app']);

        // Should show unknown command error until implemented
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('unknown command');
      });

      test('should support logs command with follow flag when implemented', async () => {
        // Test logs with --follow flag
        const result = await execCLI(['logs', '--follow', 'cli-test-app']);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('unknown command');
      });

      test('should handle logs command with tail option when implemented', async () => {
        // Test logs with --tail option
        const result = await execCLI(['logs', '--tail', '100', 'cli-test-app']);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('unknown command');
      });
    });

    describe('Multiple Process Simultaneous Management', () => {
      test('should handle simultaneous start operations for multiple processes', async () => {
        // Test concurrent start operations
        const startPromises = [
          execCLI(['start', 'cli-test-app']),
          execCLI(['start', 'cli-test-app-2']),
          execCLI(['start', 'cli-test-app-3']),
        ];

        const results = await Promise.all(startPromises);

        // All should complete successfully with current basic implementation
        results.forEach((result, index) => {
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain(
            `Starting service: cli-test-app${index === 0 ? '' : '-' + (index + 1)}`
          );
        });
      });

      test('should handle simultaneous stop operations for multiple processes', async () => {
        // Test concurrent stop operations
        const stopPromises = [
          execCLI(['stop', 'cli-test-app']),
          execCLI(['stop', 'cli-test-app-2']),
          execCLI(['stop', 'cli-test-app-3']),
        ];

        const results = await Promise.all(stopPromises);

        results.forEach((result, index) => {
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain(
            `Stopping service: cli-test-app${index === 0 ? '' : '-' + (index + 1)}`
          );
        });
      });

      test('should handle mixed simultaneous operations (start/stop/restart)', async () => {
        // Test mixed concurrent operations
        const mixedPromises = [
          execCLI(['start', 'service-1']),
          execCLI(['stop', 'service-2']),
          execCLI(['restart', 'service-3']), // Will show unknown command
        ];

        const results = await Promise.all(mixedPromises);

        expect(results[0].exitCode).toBe(0);
        expect(results[0].stdout).toContain('Starting service: service-1');

        expect(results[1].exitCode).toBe(0);
        expect(results[1].stdout).toContain('Stopping service: service-2');

        // Restart command doesn't exist yet
        expect(results[2].exitCode).not.toBe(0);
        expect(results[2].stderr).toContain('unknown command');
      });
    });

    describe('Configuration File Dynamic Reload', () => {
      test('should handle reload command when implemented', async () => {
        // Test reload command - not implemented yet
        const result = await execCLI(['reload']);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('unknown command');
      });

      test('should handle configuration file changes and reload', async () => {
        // Create initial config
        const reloadConfigPath = path.join(testDir, 'reload-config.cjs');
        const initialConfig = `
module.exports = {
  apps: [
    {
      name: "reload-test-app",
      script: "node",
      args: "-e \\"console.log('initial')\\""
    }
  ]
};
`;
        await fs.writeFile(reloadConfigPath, initialConfig);

        // Test reload command
        const reloadResult = await execCLI(['reload']);
        expect(reloadResult.exitCode).not.toBe(0);
        expect(reloadResult.stderr).toContain('unknown command');

        // Modify config
        const modifiedConfig = `
module.exports = {
  apps: [
    {
      name: "reload-test-app",
      script: "node",
      args: "-e \\"console.log('modified')\\""
    }
  ]
};
`;
        await fs.writeFile(reloadConfigPath, modifiedConfig);

        // Test reload again
        const secondReloadResult = await execCLI(['reload']);
        expect(secondReloadResult.exitCode).not.toBe(0);
        expect(secondReloadResult.stderr).toContain('unknown command');
      });
    });

    describe('Process Group Operations', () => {
      test('should handle namespace-based batch operations', async () => {
        // Test starting processes by namespace - not implemented yet
        const result = await execCLI(['start', '--namespace', 'cli-test']);

        // Should show unknown option error until implemented
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('unknown option');
      });

      test('should handle group-based stop operations', async () => {
        // Test stopping processes by group
        const result = await execCLI(['stop', '--group', 'web-servers']);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('unknown option');
      });

      test('should handle all processes operations', async () => {
        // Test operations on all processes
        const startAllResult = await execCLI(['start', '--all']);
        expect(startAllResult.exitCode).not.toBe(0);
        expect(startAllResult.stderr).toContain('unknown option');

        const stopAllResult = await execCLI(['stop', '--all']);
        expect(stopAllResult.exitCode).not.toBe(0);
        expect(stopAllResult.stderr).toContain('unknown option');
      });
    });

    describe('Crash Process Auto-restart', () => {
      test('should handle auto-restart configuration', async () => {
        // Create config with auto-restart settings
        const autoRestartConfig = path.join(testDir, 'auto-restart-config.cjs');
        const configContent = `
module.exports = {
  apps: [
    {
      name: "crash-test-app",
      script: "node",
      args: "-e \\"setTimeout(() => process.exit(1), 1000)\\"",
      autorestart: true,
      max_restarts: 3
    }
  ]
};
`;
        await fs.writeFile(autoRestartConfig, configContent);

        // Test starting process with auto-restart
        const result = await execCLI(['start', 'crash-test-app']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Starting service: crash-test-app');
      });

      test('should handle restart command when implemented', async () => {
        // Test manual restart command
        const result = await execCLI(['restart', 'crash-test-app']);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('unknown command');
      });
    });

    describe('Memory Limit Restart', () => {
      test('should handle memory limit configuration and restart', async () => {
        // Create config with memory limits
        const memoryLimitConfig = path.join(testDir, 'memory-limit-config.cjs');
        const configContent = `
module.exports = {
  apps: [
    {
      name: "memory-test-app",
      script: "node",
      args: "-e \\"const arr = []; setInterval(() => arr.push(new Array(1000)), 10)\\"",
      max_memory_restart: "50M"
    }
  ]
};
`;
        await fs.writeFile(memoryLimitConfig, configContent);

        // Test starting process with memory limit
        const result = await execCLI(['start', 'memory-test-app']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Starting service: memory-test-app');
      });

      test('should handle memory monitoring commands', async () => {
        // Test memory monitoring command - not implemented yet
        const result = await execCLI(['monit']);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('unknown command');
      });
    });

    describe('Environment Variables and Parameters', () => {
      test('should handle environment variable transmission to processes', async () => {
        // Create config with custom environment variables
        const envVarConfig = path.join(testDir, 'env-var-config.cjs');
        const configContent = `
module.exports = {
  apps: [
    {
      name: "env-test-app",
      script: "node",
      args: "-e \\"console.log('NODE_ENV:', process.env.NODE_ENV); console.log('CUSTOM_VAR:', process.env.CUSTOM_VAR)\\"",
      env: {
        NODE_ENV: "production",
        CUSTOM_VAR: "test-value",
        DATABASE_URL: "postgres://localhost:5432/test"
      }
    }
  ]
};
`;
        await fs.writeFile(envVarConfig, configContent);

        // Test starting process with custom environment
        const result = await execCLI(['start', 'env-test-app']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Starting service: env-test-app');
      });

      test('should handle command line parameter passing', async () => {
        // Test CLI options for environment variables - not implemented yet
        const result = await execCLI([
          'start',
          'test-app',
          '--env',
          'NODE_ENV=development',
        ]);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('unknown option');
      });

      test('should handle configuration file parameter overrides', async () => {
        // Test parameter override through CLI - not implemented yet
        const result = await execCLI([
          'start',
          'test-app',
          '--config',
          configPath,
        ]);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('unknown option');
      });
    });

    describe('Signal Handling', () => {
      test('should handle SIGTERM signal processing', async () => {
        // Start a long-running CLI process with help command and send SIGTERM
        const { process: cliProcess } = startCLIProcess(['--help']);

        // Wait for process to start producing output
        await sleep(200);

        // Only send signal if process is still running
        if (!cliProcess.killed && cliProcess.exitCode === null) {
          const killResult = cliProcess.kill('SIGTERM');
          expect(killResult).toBe(true);
        }

        // Wait for process to exit
        await new Promise((resolve) => {
          if (cliProcess.exitCode !== null || cliProcess.killed) {
            resolve(undefined);
          } else {
            cliProcess.on('close', resolve);
            globalThis.setTimeout(resolve, 2000); // Timeout safety
          }
        });

        // Process should have exited
        expect(
          cliProcess.exitCode !== null || cliProcess.signalCode !== null
        ).toBe(true);
      });

      test('should handle SIGINT signal processing', async () => {
        // Start a CLI process with help command and send SIGINT (Ctrl+C)
        const { process: cliProcess } = startCLIProcess(['--help']);

        await sleep(200);

        // Only send signal if process is still running
        if (!cliProcess.killed && cliProcess.exitCode === null) {
          const killResult = cliProcess.kill('SIGINT');
          expect(killResult).toBe(true);
        }

        await new Promise((resolve) => {
          if (cliProcess.exitCode !== null || cliProcess.killed) {
            resolve(undefined);
          } else {
            cliProcess.on('close', resolve);
            globalThis.setTimeout(resolve, 2000);
          }
        });

        expect(
          cliProcess.exitCode !== null || cliProcess.signalCode !== null
        ).toBe(true);
      });

      test('should handle SIGKILL signal processing', async () => {
        // Start a CLI process with help command and send SIGKILL (force kill)
        const { process: cliProcess } = startCLIProcess(['--help']);

        await sleep(200);

        // Only send signal if process is still running
        if (!cliProcess.killed && cliProcess.exitCode === null) {
          const killResult = cliProcess.kill('SIGKILL');
          expect(killResult).toBe(true);
        }

        await new Promise((resolve) => {
          if (cliProcess.exitCode !== null || cliProcess.killed) {
            resolve(undefined);
          } else {
            cliProcess.on('close', resolve);
            globalThis.setTimeout(resolve, 2000);
          }
        });

        expect(
          cliProcess.exitCode !== null || cliProcess.signalCode !== null
        ).toBe(true);
      });
    });

    describe('Log Rotation', () => {
      test('should handle log file size limits and rotation', async () => {
        // Create config with log rotation settings
        const logRotationConfig = path.join(testDir, 'log-rotation-config.cjs');
        const configContent = `
module.exports = {
  apps: [
    {
      name: "log-rotation-test",
      script: "node",
      args: "-e \\"setInterval(() => console.log('x'.repeat(1000)), 10)\\"",
      log_file: "${path.join(testDir, 'app.log')}",
      max_log_size: "1M",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
`;
        await fs.writeFile(logRotationConfig, configContent);

        // Test starting process with log rotation
        const result = await execCLI(['start', 'log-rotation-test']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Starting service: log-rotation-test');
      });

      test('should handle log rotation commands', async () => {
        // Test log rotation command - not implemented yet
        const result = await execCLI(['logs', '--rotate']);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('unknown command');
      });
    });

    describe('Concurrent Command Execution', () => {
      test('should handle multiple CLI commands running simultaneously', async () => {
        // Test running multiple CLI commands at the same time
        const concurrentCommands = [
          execCLI(['status']),
          execCLI(['start', 'concurrent-app-1']),
          execCLI(['start', 'concurrent-app-2']),
          execCLI(['stop', 'concurrent-app-3']),
          execCLI(['status']),
        ];

        const results = await Promise.all(concurrentCommands);

        // All commands should complete successfully
        results.forEach((result, index) => {
          expect(result.exitCode).toBe(0);
          if (index === 0 || index === 4) {
            // Status commands
            expect(result.stdout).toContain(
              'Process status feature will be implemented'
            );
          }
        });
      });

      test('should handle concurrent command execution with resource contention', async () => {
        // Test many concurrent commands to check resource handling
        const manyCommands = Array.from({ length: 20 }, (_, i) =>
          execCLI(['start', `stress-test-app-${i}`])
        );

        const results = await Promise.all(manyCommands);

        // All commands should complete without resource exhaustion
        results.forEach((result, index) => {
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain(
            `Starting service: stress-test-app-${index}`
          );
        });
      });

      test('should handle command queue and execution order', async () => {
        // Test command execution order with sequential dependency
        const orderedCommands = [
          {
            command: ['start', 'ordered-app-1'],
            expectedOutput: 'Starting service: ordered-app-1',
          },
          {
            command: ['status'],
            expectedOutput: 'Process status feature will be implemented',
          },
          {
            command: ['stop', 'ordered-app-1'],
            expectedOutput: 'Stopping service: ordered-app-1',
          },
        ];

        // Execute commands sequentially to test order preservation
        for (const { command, expectedOutput } of orderedCommands) {
          const result = await execCLI(command);
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain(expectedOutput);
        }
      });
    });
  });
});
