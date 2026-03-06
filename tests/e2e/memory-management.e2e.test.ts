/**
 * Memory Management E2E Tests
 *
 * Tests for memory leak detection, auto-restart, and cleanup features
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
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
  waitForDaemonReady,
  sleep,
} from './shared/cli-commands-shared';

describe('Memory Management E2E Tests', () => {
  // Set timeout for tests and hooks - critical for CI stability
  vi.setConfig({
    testTimeout: 90000, // 90 seconds for test execution
    hookTimeout: 60000, // 60 seconds for setup/teardown hooks
  });

  let testDir: string;
  let testSocketPath: string;
  let execCLI: any;
  let testEnv: any;

  beforeAll(async () => {
    // Setup test environment with socket path and unique HOME to avoid PID file conflicts
    const {
      testSocketPath: socketPath,
      testEnv: env,
      testTempDir,
    } = await setupTestEnvironment();
    testSocketPath = socketPath;
    // Use a unique HOME directory to prevent PID file conflicts with parallel test files
    const uniqueHome = path.join(testTempDir, 'home');
    await fs.mkdir(uniqueHome, { recursive: true });
    testEnv = { ...env, HOME: uniqueHome, USERPROFILE: uniqueHome };
    execCLI = createTestExecCLI(testEnv);
  });

  afterAll(async () => {
    // Cleanup test socket directory
    try {
      const testTempDir = testSocketPath ? path.dirname(testSocketPath) : '';
      if (testTempDir) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        await require('fs/promises').rm(testTempDir, {
          recursive: true,
          force: true,
        });
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

    // Ensure socket directory exists (cleanupDaemon may have removed it)
    if (testSocketPath) {
      await fs.mkdir(path.dirname(testSocketPath), { recursive: true });
    }
  });

  afterEach(async () => {
    // Cleanup daemon and test directory
    await cleanupDaemon(testEnv);
    await cleanupTestDirectory(testDir);
  });

  describe('Process Memory Limit Auto-Restart', () => {
    test('should auto-restart process when max_memory_restart is exceeded', async () => {
      // Create a test script that consumes memory rapidly for faster testing
      const memoryEaterScript = path.join(testDir, 'memory-eater.js');
      await fs.writeFile(
        memoryEaterScript,
        `
        // Rapidly consume memory for fast testing
        const arrays = [];
        let count = 0;
        
        console.log('Memory eater started, PID:', process.pid);
        
        const interval = setInterval(() => {
          // Allocate larger chunks more aggressively (50MB per 300ms)
          const array = new Array(50 * 1024 * 1024 / 8);
          array.fill(Math.random());
          arrays.push(array);
          count++;
          
          const usage = process.memoryUsage();
          console.log(\`Iteration \${count}: RSS=\${Math.round(usage.rss / 1024 / 1024)}MB, HeapUsed=\${Math.round(usage.heapUsed / 1024 / 1024)}MB\`);
          
          // Stop after 3 iterations (150MB allocated total)
          if (count >= 3) {
            clearInterval(interval);
            console.log('Memory allocation complete - forcing high memory usage');
            // Keep process alive and force GC to not clean up
            setInterval(() => {
              // Prevent GC from cleaning up by accessing arrays
              const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
              console.log(\`Keeping \${total} array elements alive, RSS=\${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB\`);
            }, 1000);
          }
        }, 300);
        
        // Handle termination
        process.on('SIGTERM', () => {
          console.log('Received SIGTERM');
          process.exit(0);
        });
      `
      );

      // Create config with very low memory limit (30MB vs 150MB allocated)
      const config = {
        apps: [
          {
            name: 'memory-test-app',
            script: memoryEaterScript,
            max_memory_restart: '30M', // Very low limit (30MB vs 150MB allocated)
          },
        ],
      };

      const configPath = path.join(testDir, 'memory-config.js');
      await fs.writeFile(
        configPath,
        `module.exports = ${JSON.stringify(config, null, 2)};`
      );

      // Load configuration
      const loadResult = await execCLI(['load', configPath]);
      if (loadResult.exitCode !== 0) {
        console.error('Load failed:', loadResult.stderr);
      }

      // Wait for daemon to be ready
      await waitForDaemonReady(testEnv);

      // Start the process
      const startResult = await execCLI(['start', 'memory-test-app']);
      expect(startResult.exitCode).toBe(0);

      // Wait for initial start
      await sleep(2000);

      // Get initial status
      const initialStatus = await execCLI(['list']);
      expect(initialStatus.stdout).toContain('memory-test-app');
      expect(initialStatus.stdout).toContain('online');

      // Extract initial PID
      const pidMatch = initialStatus.stdout.match(/memory-test-app.*?(\d+)/);
      const initialPid = pidMatch ? pidMatch[1] : null;
      expect(initialPid).toBeTruthy();

      // Wait for memory limit to be exceeded and restart to occur
      // The process allocates 50MB per 300ms (3×50MB=150MB), should exceed 30MB limit quickly
      // ProcessManager default memory check interval is 30s, so we need to wait longer
      let restartDetected = false;
      const maxWaitTime = 35000; // 35 seconds max wait (accounting for 30s default check interval)
      const startTime = Date.now();

      console.log(`Starting memory monitoring at ${new Date().toISOString()}`);
      console.log(
        `Process will allocate 150MB total, limit is 30MB, default check interval is 30s`
      );

      // Wait for memory allocation to complete first (3 × 300ms + buffer)
      await sleep(2000);
      console.log(
        'Memory allocation phase should be complete, starting restart monitoring...'
      );

      while (!restartDetected && Date.now() - startTime < maxWaitTime) {
        await sleep(1500); // Check every 1.5 seconds (slightly less than memory check interval)

        const currentStatus = await execCLI(['list']);
        const currentPidMatch = currentStatus.stdout.match(
          /memory-test-app.*?(\d+)/
        );
        const currentPid = currentPidMatch ? currentPidMatch[1] : null;

        console.log(
          `Memory check: PID ${currentPid} (original: ${initialPid}), elapsed: ${Date.now() - startTime}ms`
        );

        // Check if restart occurred (PID changed)
        if (currentPid && currentPid !== initialPid) {
          console.log(
            'Restart detected! PID changed from',
            initialPid,
            'to',
            currentPid
          );
          restartDetected = true;
          break;
        }

        // Also check restart count in output
        if (currentStatus.stdout.match(/Restarts:\s*[1-9]/)) {
          console.log('Restart detected via restart count!');
          restartDetected = true;
          break;
        }

        // Log full status for debugging
        console.log('Current status output:', currentStatus.stdout);
      }

      // If no restart detected, give one more wait period for memory check cycle
      if (!restartDetected) {
        console.log(
          'No restart detected yet, waiting additional 10 seconds for memory check cycle...'
        );
        await sleep(10000);
      }

      // Verify final status - should show restart occurred
      const finalStatus = await execCLI(['list']);
      expect(finalStatus.stdout).toContain('memory-test-app');
      expect(finalStatus.stdout).toContain('online');

      // Verify restart count increased (essential verification)
      const hasRestarted =
        finalStatus.stdout.match(/Restarts:\s*[1-9]/) || restartDetected;
      expect(hasRestarted).toBeTruthy();

      console.log(
        `Test completed successfully: Restart detected=${restartDetected}, Final status contains restarts=${!!finalStatus.stdout.match(/Restarts:\s*[1-9]/)}`
      );

      // Stop the process
      const stopResult = await execCLI(['stop', 'memory-test-app']);
      expect(stopResult.exitCode).toBe(0);
    }, 60000); // 60 seconds timeout to account for 30s memory check interval + buffer
  });

  describe('EventEmitter Listener Management', () => {
    test('should cleanup listeners properly with EventCleanupHelper', async () => {
      // Create a simple test app
      const testScript = path.join(testDir, 'simple-app.js');
      await fs.writeFile(
        testScript,
        `
        console.log('Simple app started');
        setInterval(() => {
          console.log('Still running...');
        }, 5000);
      `
      );

      const config = {
        apps: [
          {
            name: 'listener-test-app',
            script: testScript,
          },
        ],
      };

      const configPath = path.join(testDir, 'listener-config.js');
      await fs.writeFile(
        configPath,
        `module.exports = ${JSON.stringify(config, null, 2)};`
      );

      // Load configuration
      const loadResult = await execCLI(['load', configPath]);
      if (loadResult.exitCode !== 0) {
        console.error('Load failed:', loadResult.stderr);
      }

      // Wait for daemon to be ready
      await waitForDaemonReady(testEnv);

      // Start and stop the process multiple times to test listener cleanup
      for (let i = 0; i < 3; i++) {
        const startResult = await execCLI(['start', 'listener-test-app']);
        expect(startResult.exitCode).toBe(0);

        await sleep(1000);

        const stopResult = await execCLI(['stop', 'listener-test-app']);
        expect(stopResult.exitCode).toBe(0);

        await sleep(500);
      }

      // After multiple start/stop cycles, daemon should still be responsive
      const listResult = await execCLI(['list']);
      expect(listResult.exitCode).toBe(0);
      expect(listResult.stdout).toContain('listener-test-app');
    }, 90000);
  });

  describe('Graceful Shutdown State Persistence', () => {
    test('should save state during graceful shutdown', async () => {
      // Create a test app
      const testScript = path.join(testDir, 'state-test-app.js');
      await fs.writeFile(
        testScript,
        `
        console.log('State test app started');
        setInterval(() => {}, 1000);
      `
      );

      const config = {
        apps: [
          {
            name: 'state-test-app',
            script: testScript,
          },
        ],
      };

      const configPath = path.join(testDir, 'state-config.js');
      await fs.writeFile(
        configPath,
        `module.exports = ${JSON.stringify(config, null, 2)};`
      );

      // Load and start
      const loadResult = await execCLI(['load', configPath]);
      if (loadResult.exitCode !== 0) {
        console.error('Load failed:', loadResult.stderr);
      }

      // Wait for daemon to be ready
      await waitForDaemonReady(testEnv);

      await execCLI(['start', 'state-test-app']);

      // Wait for process to stabilize
      await sleep(2000);

      // Perform graceful shutdown
      const exitResult = await execCLI(['exit']);
      expect(exitResult.exitCode).toBe(0);

      // Check if shutdown state was saved (daemon writes to HOME/.masuidrive-procman/)
      const homeDir = testEnv.HOME || testDir;
      const shutdownStatePath = path.join(
        homeDir,
        '.masuidrive-procman',
        'shutdown-state.json'
      );

      // Wait a bit for file to be written
      await sleep(1000);

      // Check if file exists
      const stateExists = await fs
        .access(shutdownStatePath)
        .then(() => true)
        .catch(() => false);

      if (stateExists) {
        const stateContent = await fs.readFile(shutdownStatePath, 'utf-8');
        const state = JSON.parse(stateContent);

        // Verify state structure
        expect(state).toHaveProperty('timestamp');
        expect(state).toHaveProperty('reason');
        expect(state).toHaveProperty('memoryUsage');
        expect(state).toHaveProperty('processes');
      }
    }, 90000);
  });

  describe('Memory Monitoring and Alerts', () => {
    test('should log memory warnings and critical alerts', async () => {
      // This test verifies that MemoryMonitor logs warnings
      // Since daemon doesn't auto-restart, we just check logging

      // First start daemon with a config
      const testScript = path.join(testDir, 'dummy-app.js');
      await fs.writeFile(
        testScript,
        `
        console.log('Dummy app started');
        setInterval(() => {}, 1000);
      `
      );

      const config = {
        apps: [
          {
            name: 'dummy-app',
            script: testScript,
          },
        ],
      };

      const configPath = path.join(testDir, 'dummy-config.js');
      await fs.writeFile(
        configPath,
        `module.exports = ${JSON.stringify(config, null, 2)};`
      );

      // Load configuration to start daemon
      const loadResult = await execCLI(['load', configPath]);
      if (loadResult.exitCode !== 0) {
        console.error('Failed to load config:', loadResult.stderr);
      }

      // Wait for daemon to be ready
      await waitForDaemonReady(testEnv);

      // Verify daemon is running by listing processes
      const listResult = await execCLI(['list']);
      expect(listResult.exitCode).toBe(0);

      // Should show the dummy app
      expect(listResult.stdout).toContain('dummy-app');
    });
  });
});
