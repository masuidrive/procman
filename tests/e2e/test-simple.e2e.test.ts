import { describe, test, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  createTestExecCLI,
  setupTestEnvironment,
  setupTestDirectory,
  cleanupTestDirectory,
  cleanupDaemon,
  waitForDaemonReady,
} from './shared/cli-commands-shared';

describe('Simple E2E Test', () => {
  let testDir: any;
  let testSocketPath: string;
  let execCLI: any;
  let testEnv: any;

  test('basic load and status test', async () => {
    // Setup
    const { testSocketPath: socketPath, testEnv: env } =
      await setupTestEnvironment();
    testSocketPath = socketPath;
    testEnv = env;
    execCLI = createTestExecCLI(testEnv);

    const setupResult = await setupTestDirectory();
    testDir = setupResult.testDir;

    console.log('Test dir:', testDir);
    console.log('Socket path:', testSocketPath);

    // Create simple config
    const config = {
      apps: [
        {
          name: 'test-app',
          script: 'node',
          args: ['-e', 'setInterval(() => {}, 1000)'],
        },
      ],
    };

    const configPath = path.join(testDir, 'test-config.js');
    await fs.writeFile(
      configPath,
      `module.exports = ${JSON.stringify(config, null, 2)};`
    );

    console.log('Loading config...');

    // Load config
    const loadResult = await execCLI(['load', configPath]);
    console.log('Load result:', {
      exitCode: loadResult.exitCode,
      stdout: loadResult.stdout.slice(0, 200),
      stderr: loadResult.stderr.slice(0, 200),
    });

    if (loadResult.exitCode !== 0) {
      // Try waiting for daemon
      console.log('Waiting for daemon...');
      try {
        await waitForDaemonReady(testEnv);
        console.log('Daemon ready');
      } catch (e) {
        console.error('Daemon not ready:', e);
      }
    }

    // Check status
    console.log('Checking status...');
    const statusResult = await execCLI(['list']);
    console.log('Status result:', {
      exitCode: statusResult.exitCode,
      stdout: statusResult.stdout.slice(0, 200),
      stderr: statusResult.stderr.slice(0, 200),
    });

    expect(statusResult.exitCode).toBe(0);

    // Cleanup
    await cleanupDaemon(testEnv);
    await cleanupTestDirectory(testDir);
  }, 30000);
});
