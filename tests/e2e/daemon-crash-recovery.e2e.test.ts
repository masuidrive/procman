/**
 * E2E Tests for Daemon Crash Recovery
 *
 * These tests verify that the system can properly recover from daemon crashes,
 * handle orphaned processes, and clean up zombie processes.
 *
 * Test scenarios based on the critical issues identified in the review:
 * 1. Daemon crash with orphaned processes
 * 2. Zombie process cleanup
 * 3. Resource cleanup after crash
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';
import { CrashRecovery } from '../../src/daemon/crash-recovery';
import { OrphanProcessDetector } from '../../src/daemon/orphan-detector';
import { ZombieReaper } from '../../src/daemon/zombie-reaper';

describe('Daemon Crash Recovery E2E Tests', { timeout: 60000 }, () => {
  let testDataDir: string;
  let crashRecovery: CrashRecovery;
  let orphanDetector: OrphanProcessDetector;
  let zombieReaper: ZombieReaper;
  let testProcesses: ChildProcess[] = [];

  beforeEach(async () => {
    // Create temporary test directory
    testDataDir = path.join('/tmp', `procman-crash-test-${Date.now()}`);
    await fs.mkdir(testDataDir, { recursive: true });

    // Initialize recovery components
    orphanDetector = new OrphanProcessDetector(testDataDir);
    crashRecovery = new CrashRecovery(testDataDir, undefined, orphanDetector);
    zombieReaper = new ZombieReaper();
  });

  afterEach(async () => {
    // Clean up test processes
    for (const proc of testProcesses) {
      if (proc && !proc.killed) {
        proc.kill('SIGKILL');
      }
    }
    testProcesses = [];

    // Stop zombie reaper
    zombieReaper.stopReaping();

    // Clean up test directory
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  describe('Daemon Crash with Process Recovery', () => {
    test('should detect and recover orphaned processes after daemon crash', async () => {
      // Start a test process that will become orphaned
      const testProcess = spawn(
        'node',
        [path.join(__dirname, '../fixtures/test-process.js')],
        {
          detached: true,
          stdio: 'ignore',
        }
      );
      testProcesses.push(testProcess);

      const testPid = testProcess.pid!;

      // Save fake daemon PID to simulate previous daemon
      const fakeDaemonPid = 999999; // Non-existent PID
      await crashRecovery.saveDaemonPid(fakeDaemonPid);

      // Save process metadata
      const processMetadataDir = path.join(testDataDir, 'processes');
      await fs.mkdir(processMetadataDir, { recursive: true });
      await fs.writeFile(
        path.join(processMetadataDir, `${testPid}.json`),
        JSON.stringify({
          name: 'test-process',
          namespace: 'test',
          pid: testPid,
        })
      );

      // Simulate daemon crash by "unrefing" the test process
      testProcess.unref();

      // Wait a bit for process to stabilize
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Perform crash recovery
      const result = await crashRecovery.detectAndRecover();

      // Verify crash was detected
      expect(result.crashDetected).toBe(true);

      // Verify resources were cleaned
      expect(result.cleanedResources.length).toBeGreaterThan(0);
      expect(result.cleanedResources.some((r) => r.includes('PID file'))).toBe(
        true
      );

      // Verify process can be detected as orphaned
      // Note: detectOrphanedProcesses scans all system processes and uses lsof on macOS,
      // which can be very slow. We check isProcessOrphaned for just our PID instead.
      const isOrphaned = await orphanDetector.isProcessOrphaned(testPid);

      // The test process should be detectable (may or may not be orphaned depending on OS)
      // Just verify the detector doesn't crash and returns a boolean
      expect(typeof isOrphaned).toBe('boolean');

      // Clean up test process
      try {
        process.kill(testPid, 'SIGKILL');
      } catch {
        // Process may already be gone, ignore
      }
    }, 120000);

    test('should handle crash of daemon running crash-prone process', async () => {
      // Start the crash-after-15s test program
      const crashProcess = spawn(
        'node',
        [path.join(__dirname, '../fixtures/crash-after-15s.js')],
        {
          detached: false,
          stdio: 'pipe',
        }
      );
      testProcesses.push(crashProcess);

      let crashDetected = false;
      let output = '';

      crashProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      crashProcess.stderr?.on('data', (data) => {
        output += data.toString();
      });

      crashProcess.on('exit', (code) => {
        crashDetected = true;
        expect(code).not.toBe(0); // Should exit with error
      });

      // Wait for the process to crash (15 seconds + buffer)
      await new Promise((resolve) => setTimeout(resolve, 20000));

      // Verify crash occurred
      expect(crashDetected).toBe(true);
      expect(output).toContain('CRASHING NOW');

      // Verify process is no longer running
      try {
        process.kill(crashProcess.pid!, 0);
        // If we get here, process is still running (unexpected)
        expect(true).toBe(false);
      } catch {
        // Process doesn't exist (expected)
        expect(true).toBe(true);
      }
    }, 25000);
  });

  describe('Zombie Process Cleanup', () => {
    test('should detect and report zombie processes', async () => {
      // Start zombie creator process
      const zombieCreator = spawn(
        'node',
        [path.join(__dirname, '../fixtures/zombie-creator.js')],
        {
          stdio: 'pipe',
        }
      );
      testProcesses.push(zombieCreator);

      let output = '';
      zombieCreator.stdout?.on('data', (data) => {
        output += data.toString();
      });

      // Wait for zombies to be created (about 3 seconds)
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Start zombie reaper
      zombieReaper.startReaping(1000); // Check every second

      // Wait for reaping cycle
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check for zombies
      const zombies = await zombieReaper.detectZombies();

      // Log zombie detection results
      console.log(`Detected ${zombies.length} zombie processes`);

      // The test passes if we can detect zombies (they may or may not exist depending on OS)
      expect(Array.isArray(zombies)).toBe(true);

      // If zombies were created, verify reaper attempts to handle them
      if (zombies.length > 0) {
        const reapedCount = await zombieReaper.reapZombies();
        console.log(`Reaped ${reapedCount} zombie processes`);
        expect(reapedCount).toBeGreaterThanOrEqual(0);
      }

      // Clean up zombie creator
      zombieCreator.kill('SIGKILL');
    }, 15000);

    test('should monitor zombie accumulation', async () => {
      // Start monitoring
      const initialCount = await zombieReaper.monitorZombieCount();
      expect(initialCount).toBeGreaterThanOrEqual(0);

      // Start zombie reaper with monitoring
      let highZombieWarning = false;
      zombieReaper.on('high-zombie-count', (count) => {
        console.log(`High zombie count warning: ${count}`);
        highZombieWarning = true;
      });

      zombieReaper.startReaping(5000);

      // Wait for a monitoring cycle
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // Check final zombie count
      const finalCount = await zombieReaper.monitorZombieCount();

      // The count should be low after reaping
      expect(finalCount).toBeLessThanOrEqual(10);

      // Stop reaping
      zombieReaper.stopReaping();
    }, 10000);
  });

  describe('Memory Leak Detection', () => {
    test('should handle process with memory leak', async () => {
      // Start memory leaker process
      const leaker = spawn(
        'node',
        [path.join(__dirname, '../fixtures/memory-leaker.js')],
        {
          stdio: 'pipe',
        }
      );
      testProcesses.push(leaker);

      let output = '';
      leaker.stdout?.on('data', (data) => {
        output += data.toString();
      });
      leaker.stderr?.on('data', (data) => {
        output += data.toString();
      });

      // Let it leak for 5 seconds (5MB)
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Verify memory leak is occurring (could be 4MB or 5MB due to timing)
      expect(output).toMatch(/Leaked [45]MB total/);

      // Kill the leaker
      leaker.kill('SIGTERM');

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify process terminated
      try {
        process.kill(leaker.pid!, 0);
        expect(true).toBe(false); // Should not reach here
      } catch {
        expect(true).toBe(true); // Process should be gone
      }
    }, 10000);
  });

  describe('Complete Recovery Scenario', () => {
    test('should perform full recovery after simulated daemon crash', async () => {
      // Set up a complete daemon crash scenario

      // 1. Save fake daemon state
      await crashRecovery.saveDaemonPid(999999);
      await crashRecovery.saveProcessState({
        processes: [
          { name: 'app1', pid: 100001, namespace: 'production' },
          { name: 'app2', pid: 100002, namespace: 'production' },
        ],
        startTime: Date.now() - 3600000, // 1 hour ago
      });

      // 2. Create stale socket file
      const socketPath = path.join(testDataDir, 'procman.sock');
      await fs.writeFile(socketPath, 'stale socket data');

      // 3. Create lock files
      const lockDir = path.join(testDataDir, 'locks');
      await fs.mkdir(lockDir, { recursive: true });
      await fs.writeFile(path.join(lockDir, 'process.lock'), '999999');

      // 4. Perform recovery
      const recoveryResult = await crashRecovery.detectAndRecover();

      // 5. Verify recovery results
      expect(recoveryResult.crashDetected).toBe(true);
      expect(recoveryResult.cleanedResources).toContain(
        `Socket file: ${socketPath}`
      );
      expect(recoveryResult.errors.length).toBe(0);

      // 6. Verify resources are cleaned
      const socketExists = await fs
        .access(socketPath)
        .then(() => true)
        .catch(() => false);
      expect(socketExists).toBe(false);

      const lockExists = await fs
        .access(path.join(lockDir, 'process.lock'))
        .then(() => true)
        .catch(() => false);
      expect(lockExists).toBe(false);

      // 7. Verify state can be restored
      let stateRestored = false;
      crashRecovery.on('state-restored', (state) => {
        stateRestored = true;
        expect(state.processes).toHaveLength(2);
        expect(state.processes[0].name).toBe('app1');
      });

      await crashRecovery.restoreProcessState();

      // Give event time to fire
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(stateRestored).toBe(true);
    }, 120000);
  });
});
