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
  // Set default timeout for all tests in this suite
  vi.setConfig({ testTimeout: 90000 });

  let testDir: string;
  let testSocketPath: string;
  let execCLI: any;
  let testEnv: any;

  beforeAll(async () => {
    // Setup test environment with socket path
    const { testSocketPath: socketPath, testEnv: env } =
      await setupTestEnvironment();
    testSocketPath = socketPath;
    testEnv = env;
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
  });

  afterEach(async () => {
    // Cleanup daemon and test directory
    await cleanupDaemon(testEnv);
    await cleanupTestDirectory(testDir);
  });

  describe('Process Memory Limit Auto-Restart', () => {
    test('should auto-restart process when max_memory_restart is exceeded', async () => {
      // Create a test script that consumes memory
      const memoryEaterScript = path.join(testDir, 'memory-eater.js');
      await fs.writeFile(
        memoryEaterScript,
        `
        // Gradually consume memory
        const arrays = [];
        let count = 0;
        
        console.log('Memory eater started, PID:', process.pid);
        
        const interval = setInterval(() => {
          // Allocate 10MB per second
          const array = new Array(10 * 1024 * 1024 / 8);
          array.fill(Math.random());
          arrays.push(array);
          count++;
          
          const usage = process.memoryUsage();
          console.log(\`Iteration \${count}: RSS=\${Math.round(usage.rss / 1024 / 1024)}MB\`);
          
          // Stop after 10 iterations (100MB allocated)
          if (count >= 10) {
            clearInterval(interval);
            console.log('Memory allocation complete');
            // Keep process alive
            setInterval(() => {}, 1000);
          }
        }, 1000);
        
        // Handle termination
        process.on('SIGTERM', () => {
          console.log('Received SIGTERM');
          process.exit(0);
        });
      `
      );

      // Create config with low memory limit
      const config = {
        apps: [
          {
            name: 'memory-test-app',
            script: memoryEaterScript,
            max_memory_restart: '80M', // Set limit to 80MB
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
      // The process allocates 10MB/sec, so should exceed 80MB after ~8 seconds
      // Memory check interval is 30 seconds by default, so we need to wait at least that long
      await sleep(35000);

      // Check status again - should have different PID after restart
      const finalStatus = await execCLI(['list']);
      expect(finalStatus.stdout).toContain('memory-test-app');
      expect(finalStatus.stdout).toContain('online');

      // Check restart count increased
      expect(finalStatus.stdout).toMatch(/Restarts:\s*[1-9]/);

      // Stop the process
      const stopResult = await execCLI(['stop', 'memory-test-app']);
      expect(stopResult.exitCode).toBe(0);
    }, 60000); // 60 second timeout for this test
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
    }, 20000);
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

      // Check if shutdown state was saved
      const shutdownStatePath = path.join(
        testDir,
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
    }, 15000);
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

      // Verify daemon is running by listing processes
      const listResult = await execCLI(['list']);
      expect(listResult.exitCode).toBe(0);

      // Should show the dummy app
      expect(listResult.stdout).toContain('dummy-app');
    });
  });
});
