/**
 * Shared utilities and helpers for CLI E2E tests
 *
 * This module contains common functionality used across multiple CLI E2E test files
 * to avoid code duplication and ensure consistency.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  TEST_TIMEOUTS,
  TEST_DELAYS,
  TEST_COUNTS,
} from '../../helpers/test-constants';

// Test configuration constants
export const CLI_TIMEOUT = 60000; // 60 seconds for complex operations
export const DAEMON_STARTUP_TIMEOUT = 45000; // 45 seconds - allow for resource contention
export const CONCURRENT_DAEMON_TIMEOUT = 120000; // 120 seconds for concurrent daemon operations
export const PROCESS_STARTUP_TIMEOUT = 5000; // 5 seconds for process startup
export const LOG_STREAM_TIMEOUT = 10000; // 10 seconds for log streaming tests

// Utility functions
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

// Debug utilities for root cause analysis
export const debugLog = (testName: string, step: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(
    `[DEBUG ${testName}] ${step} - ${timestamp}`,
    data ? JSON.stringify(data, null, 2) : ''
  );
};

export const debugTimer = (testName: string) => {
  const start = Date.now();
  return {
    log: (step: string, data?: any) => {
      const elapsed = Date.now() - start;
      debugLog(testName, `${step} (${elapsed}ms)`, data);
    },
    elapsed: () => Date.now() - start,
  };
};

// Type definitions for CLI execution results
export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface CLIOptions {
  cwd?: string;
  timeout?: number;
  input?: string;
  env?: Record<string, string>;
}

export interface CLIProcessResult {
  process: ChildProcess;
  stdout: Promise<string>;
  stderr: Promise<string>;
  waitForOutput: (pattern: string | RegExp, timeout?: number) => Promise<void>;
  waitForExit: (
    timeout?: number
  ) => Promise<{ code: number | null; signal: string | null }>;
  getOutput: () => { stdout: string; stderr: string };
}

/**
 * Execute CLI command and capture output with comprehensive error handling
 */
export const execCLI = async (
  args: string[],
  options: CLIOptions = {}
): Promise<CLIResult> => {
  const {
    cwd = process.cwd(),
    timeout = CLI_TIMEOUT,
    input,
    env = {},
  } = options;

  const startTime = Date.now();

  // Ensure HOME is set for socket path expansion
  const testHome = os.tmpdir();
  const testEnv = {
    ...process.env,
    HOME: testHome,
    USERPROFILE: testHome, // Windows compatibility
    ...env,
  };

  return new Promise((resolve, reject) => {
    const child = spawn('./bin/procman', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: testEnv,
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
      child.kill('SIGKILL');
      reject(
        new Error(
          `CLI command timed out after ${timeout}ms. Args: [${args.join(', ')}]`
        )
      );
    }, timeout);

    child.on('close', (code) => {
      globalThis.clearTimeout(timer);
      const duration = Date.now() - startTime;
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
        duration,
      });
    });

    child.on('error', (error) => {
      globalThis.clearTimeout(timer);
      reject(new Error(`CLI process error: ${error.message}`));
    });

    // Send input if provided
    if (input) {
      child.stdin?.write(input);
      child.stdin?.end();
    }
  });
};

/**
 * Create unique socket path for concurrent testing
 */
export const createUniqueSocketPath = (
  prefix: string,
  index: number
): string => {
  // Add process ID and random component for true uniqueness
  const uniqueId = `${Date.now()}-${process.pid}-${Math.random().toString(36).substr(2, 9)}-${index}`;
  const testTempDir = path.join(
    os.tmpdir(),
    `procman-concurrent-test-${prefix}-${uniqueId}`
  );
  return path.join(testTempDir, 'procman.sock');
};

/**
 * Create unique HOME directory for concurrent testing to avoid PID file conflicts
 */
export const createUniqueHomeDir = (prefix: string, index: number): string => {
  // Use same unique ID pattern as socket path for consistency
  const uniqueId = `${Date.now()}-${process.pid}-${Math.random().toString(36).substr(2, 9)}-${index}`;
  return path.join(os.tmpdir(), `procman-home-${prefix}-${uniqueId}`);
};

/**
 * Force complete cleanup - don't just log errors
 */
export const cleanupDaemon = async (
  env: Record<string, string>
): Promise<void> => {
  try {
    // Reduced timeout for CI environments to avoid hook timeouts
    const exitTimeout = process.env.CI === 'true' ? 2000 : 5000;
    
    // In CI, use more aggressive cleanup approach
    if (process.env.CI === 'true') {
      // For CI: try graceful exit but timeout quickly, then force kill
      await Promise.race([
        execCLI(['exit'], { timeout: exitTimeout, env }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('CI timeout')), 1500)
        )
      ]);
    } else {
      await execCLI(['exit'], { timeout: exitTimeout, env });
    }
  } catch (error) {
    // FORCE cleanup when exit command fails - Use parallel cleanup in CI
    const socketPath = env.PROCMAN_SOCKET_PATH;
    const homeDir = env.HOME || os.homedir();
    const pidFile = path.join(homeDir, '.masuidrive-procman', 'procman.pid');
    const uniqueDir = socketPath ? path.dirname(socketPath) : '';

    // Parallel cleanup operations for faster CI execution
    await Promise.allSettled([
      // Clean socket file
      socketPath
        ? fs.access(socketPath).then(() => fs.unlink(socketPath)).catch(() => {})
        : Promise.resolve(),
      
      // Clean PID file and kill process
      (async () => {
        try {
          if (await fs.access(pidFile).then(() => true).catch(() => false)) {
            const pid = await fs.readFile(pidFile, 'utf-8');
            process.kill(parseInt(pid.trim()), 'SIGKILL');
            await fs.unlink(pidFile).catch(() => {});
          }
        } catch {
          // Ignore errors
        }
      })(),
      
      // Clean unique test directory
      uniqueDir
        ? fs.rm(uniqueDir, { recursive: true, force: true }).catch(() => {})
        : Promise.resolve(),
    ]);
  }

  // Wait for complete cleanup - reduced for CI
  const cleanupDelay = process.env.CI === 'true' ? 100 : 300;
  await new Promise((resolve) => setTimeout(resolve, cleanupDelay));
};

/**
 * Kill any remaining procman daemon processes
 */
export const killOrphanedProcesses = async (): Promise<void> => {
  try {
    // Kill any remaining procman daemon processes
    const { execSync } = await import('child_process');
    execSync('pkill -f "daemon-main.js" || true', { stdio: 'ignore' });
  } catch {
    // Ignore errors
  }
};

/**
 * Clean up old temporary directories
 */
export const cleanupOldTempDirs = async (): Promise<void> => {
  try {
    const tmpDir = os.tmpdir();
    const entries = await fs.readdir(tmpDir);

    for (const entry of entries) {
      if (
        entry.startsWith('procman-concurrent-test-') ||
        entry.startsWith('procman-cli-e2e-')
      ) {
        const fullPath = path.join(tmpDir, entry);
        await fs.rm(fullPath, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch {
    // Ignore errors
  }
};

/**
 * Start long-running CLI process with advanced monitoring
 */
export const startCLIProcess = (
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
  } = {}
): CLIProcessResult => {
  const { cwd = process.cwd(), env = {} } = options;

  // Ensure HOME is set for socket path expansion
  const testHome = os.tmpdir();
  const testEnv = {
    ...process.env,
    HOME: testHome,
    USERPROFILE: testHome, // Windows compatibility
    ...env,
  };

  const child = spawn('./bin/procman', args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: testEnv,
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
    pattern: string | RegExp,
    timeout = 5000
  ): Promise<void> => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const combined = stdoutData + stderrData;
      if (
        typeof pattern === 'string'
          ? combined.includes(pattern)
          : pattern.test(combined)
      ) {
        return;
      }
      await sleep(100);
    }
    throw new Error(
      `Expected output pattern "${pattern}" not found within ${timeout}ms. stdout: "${stdoutData}", stderr: "${stderrData}"`
    );
  };

  const waitForExit = async (
    timeout = 10000
  ): Promise<{ code: number | null; signal: string | null }> => {
    // If process already exited, return its exit status immediately
    if (child.exitCode !== null || child.killed) {
      return { code: child.exitCode, signal: child.signalCode || null };
    }

    return new Promise((resolve) => {
      const timer = globalThis.setTimeout(() => {
        // On timeout, check if process has exited and return actual state
        resolve({
          code: child.exitCode,
          signal: child.signalCode || null,
        });
      }, timeout);

      child.on('close', (code, signal) => {
        globalThis.clearTimeout(timer);
        resolve({ code, signal });
      });

      child.on('exit', (code, signal) => {
        globalThis.clearTimeout(timer);
        resolve({ code, signal });
      });
    });
  };

  const getOutput = () => ({
    stdout: stdoutData.trim(),
    stderr: stderrData.trim(),
  });

  return {
    process: child,
    stdout: new Promise((resolve) => {
      child.on('close', () => resolve(stdoutData.trim()));
    }),
    stderr: new Promise((resolve) => {
      child.on('close', () => resolve(stderrData.trim()));
    }),
    waitForOutput,
    waitForExit,
    getOutput,
  };
};

/**
 * Wait for daemon to be ready by checking socket availability
 */
export const waitForDaemonReady = async (
  env: Record<string, string>,
  timeout = 30000 // Increased from 10s to 30s as per Phase 1 task
): Promise<void> => {
  const startTime = Date.now();
  const intervalMs = 1000; // Check every second instead of 500ms
  let lastError: Error | null = null;

  while (Date.now() - startTime < timeout) {
    try {
      // Try multiple health checks to ensure daemon is fully ready
      const result = await execCLI(['list'], { timeout: 5000, env }); // Increased timeout for individual check

      if (result.exitCode === 0) {
        // Additional verification: try to get daemon status
        try {
          const statusResult = await execCLI(['list', '--format', 'json'], {
            timeout: 3000,
          });

          // If JSON parsing succeeds, daemon is definitely ready
          if (statusResult.exitCode === 0) {
            console.log(`Daemon became ready in ${Date.now() - startTime}ms`);
            return;
          }
        } catch {
          // Fall through to retry - daemon might be partially ready
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Log periodic progress for debugging
      const elapsed = Date.now() - startTime;
      if (elapsed % 5000 < intervalMs) {
        console.log(`Waiting for daemon readiness... ${elapsed}ms elapsed`);
      }
    }

    await sleep(intervalMs);
  }

  const elapsed = Date.now() - startTime;
  const errorDetails = lastError ? `: ${lastError.message}` : '';
  throw new Error(
    `Daemon did not become ready within ${timeout}ms (elapsed: ${elapsed}ms)${errorDetails}`
  );
};

/**
 * Create test configuration objects
 */
export const createTestConfig = (testDir: string) => ({
  testConfig: `
module.exports = {
  apps: [
    {
      name: "e2e-test-app",
      script: "${path.join(process.cwd(), 'tests/fixtures/test-process.js')}",
      cwd: "${testDir}",
      namespace: "e2e-test",
      max_memory_restart: "50M",
      env: {
        NODE_ENV: "test",
        TEST_APP: "e2e-test-app"
      }
    },
    {
      name: "e2e-test-app-2", 
      script: "${path.join(process.cwd(), 'tests/fixtures/test-process.js')}",
      cwd: "${testDir}",
      namespace: "e2e-test",
      max_memory_restart: "30M",
      env: {
        NODE_ENV: "test",
        TEST_APP: "e2e-test-app-2"
      }
    },
    {
      name: "e2e-worker",
      script: "${path.join(process.cwd(), 'tests/fixtures/test-process.js')}",
      cwd: "${testDir}",
      namespace: "workers",
      max_memory_restart: "20M",
      env: {
        NODE_ENV: "production",
        WORKER_ID: "worker-1"
      }
    }
  ]
};
`,

  stressConfig: `
module.exports = {
  apps: [
    ${Array.from(
      { length: 5 },
      (_, i) => `
    {
      name: "stress-app-${i + 1}",
      script: "${path.join(process.cwd(), 'tests/fixtures/test-process.js')}",
      cwd: "${testDir}",
      namespace: "stress-test",
      env: {
        NODE_ENV: "test",
        STRESS_ID: "stress-${i + 1}"
      }
    }`
    ).join(',')}
  ]
};
`,

  minimalConfig: `
module.exports = {
  apps: [
    {
      name: "minimal-app",
      script: "${path.join(process.cwd(), 'tests/fixtures/test-process.js')}",
      cwd: "${testDir}"
    }
  ]
};
`,
});

/**
 * Create test-specific execCLI wrapper function
 */
export const createTestExecCLI = (testEnv: Record<string, string>) => {
  return async (args: string[], options: CLIOptions = {}) => {
    return execCLI(args, {
      ...options,
      env: { ...testEnv, ...options.env },
    });
  };
};

/**
 * Coordinated daemon startup with resource contention management
 */
export const startDaemonWithCoordination = async (
  execCLI: (args: string[], options?: CLIOptions) => Promise<CLIResult>,
  configPath: string,
  options: {
    timeout?: number;
    maxRetries?: number;
    env?: Record<string, string>;
  } = {}
) => {
  const { timeout = CONCURRENT_DAEMON_TIMEOUT, maxRetries = 3, env } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      debugLog(
        'daemon-coordination',
        `Daemon startup attempt ${attempt}/${maxRetries}`,
        {
          configPath,
          timeout,
          env: env?.PROCMAN_SOCKET_PATH,
        }
      );

      // Add progressive backoff to reduce resource contention
      if (attempt > 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        debugLog('daemon-coordination', `Applying backoff: ${backoffMs}ms`);
        await sleep(backoffMs);
      }

      // Start daemon with extended timeout
      await execCLI(['load', configPath], { timeout });

      // Verify daemon is ready with additional checks
      await waitForDaemonReady(env || {}, timeout);

      debugLog(
        'daemon-coordination',
        `Daemon startup successful on attempt ${attempt}`
      );
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      debugLog(
        'daemon-coordination',
        `Daemon startup attempt ${attempt} failed`,
        {
          error: lastError.message,
          willRetry: attempt < maxRetries,
        }
      );

      if (attempt < maxRetries) {
        // Cleanup before retry
        try {
          await execCLI(['exit'], { timeout: 5000 });
        } catch (cleanupError) {
          debugLog('daemon-coordination', 'Cleanup error during retry', {
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          });
        }
      }
    }
  }

  throw new Error(
    `Failed to start daemon after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`
  );
};

/**
 * Setup test environment with unique socket path and temporary directories
 */
export const setupTestEnvironment = async () => {
  // Set up custom socket path for tests
  const testTempDir = path.join(os.tmpdir(), 'procman-e2e-test-' + Date.now());
  await fs.mkdir(testTempDir, { recursive: true });

  const testSocketPath = path.join(testTempDir, 'procman.sock');
  const testEnv = {
    PROCMAN_SOCKET_PATH: testSocketPath,
    HOME: os.tmpdir(),
    USERPROFILE: os.tmpdir(),
  };

  return { testTempDir, testSocketPath, testEnv };
};

/**
 * Create temporary test directory with config files
 */
export const setupTestDirectory = async () => {
  // Create temporary directory for test files
  const testDir = path.join(
    os.tmpdir(),
    'procman-cli-e2e-' +
      Date.now() +
      '-' +
      Math.random().toString(36).substr(2, 9)
  );
  await fs.mkdir(testDir, { recursive: true });

  // Create daemon directory to prevent socket path issues
  const daemonDir = path.join(os.tmpdir(), '.masuidrive-procman');
  await fs.mkdir(daemonDir, { recursive: true });

  const configs = createTestConfig(testDir);

  // Write configuration files
  const testConfigPath = path.join(testDir, 'test-config.cjs');
  const stressConfigPath = path.join(testDir, 'stress-config.cjs');
  const minimalConfigPath = path.join(testDir, 'minimal-config.cjs');

  await fs.writeFile(testConfigPath, configs.testConfig);
  await fs.writeFile(stressConfigPath, configs.stressConfig);
  await fs.writeFile(minimalConfigPath, configs.minimalConfig);

  return {
    testDir,
    testConfigPath,
    stressConfigPath,
    minimalConfigPath,
  };
};

/**
 * Cleanup test directory
 */
export const cleanupTestDirectory = async (testDir: string) => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to cleanup test directory:', error);
  }
};
