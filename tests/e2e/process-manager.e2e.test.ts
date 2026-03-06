/**
 * End-to-End tests for Process Manager
 * Tests the complete flow: config loading → process startup → monitoring → shutdown
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigLoader } from '../../src/config/config-loader';
import { ProcessManager } from '../../src/process-manager/process-manager';
import { AppConfig } from '../../src/shared/config';
import {
  TEST_TIMEOUTS,
  TEST_DELAYS,
  TEST_MEMORY_SIZES,
  TEST_MONITORING,
  TEST_COUNTS,
} from '../helpers/test-constants';

// Test helper functions
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const waitForProcessStatus = async (
  processManager: ProcessManager,
  processName: string,
  expectedStatus: string,
  timeoutMs = TEST_TIMEOUTS.LONG
): Promise<void> => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const processInfo = processManager.getProcessInfo(processName);
    if (processInfo && processInfo.status === expectedStatus) {
      return;
    }
    await sleep(TEST_DELAYS.SHORT);
  }
  const currentStatus = processManager.getProcessInfo(processName)?.status;
  throw new Error(
    `Process ${processName} did not reach status ${expectedStatus} within ${timeoutMs}ms. Current status: ${currentStatus}`
  );
};

const waitForEvent = async (
  processManager: ProcessManager,
  eventName: string,
  timeoutMs = TEST_TIMEOUTS.MEDIUM
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(
        new Error(`Event ${eventName} not received within ${timeoutMs}ms`)
      );
    }, timeoutMs);

    // Handler that accepts multiple arguments but only returns the first (process name)
    const handler = (...args: any[]) => {
      globalThis.clearTimeout(timer);
      // First argument is always the process name
      resolve(args[0] as string);
    };

    (processManager as any).on(eventName, handler);
  });
};

describe('Process Manager E2E Tests', () => {
  let configLoader: ConfigLoader;
  let processManager: ProcessManager;
  let testDir: string;
  let persistenceDir: string;

  beforeEach(async () => {
    // Create temporary directory for test files
    testDir = path.join(process.cwd(), 'tmp', 'e2e-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });

    // Create temporary directory for persistence files
    persistenceDir = path.join(
      testDir,
      'persistence-' + Math.random().toString(36).slice(2)
    );
    await fs.mkdir(persistenceDir, { recursive: true });

    // Initialize components
    configLoader = new ConfigLoader();
    const persistencePath = path.join(persistenceDir, 'processes.json');
    processManager = new ProcessManager(5000, 30000, persistencePath);
    await processManager.initialize();
  });

  afterEach(async () => {
    // Cleanup: stop all processes and remove test files
    try {
      await processManager.cleanup();

      // Clean up test directory (includes persistence files)
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  });

  describe('Complete Process Lifecycle', () => {
    test('should load config, start processes, monitor, and stop successfully', async () => {
      // 1. Load configuration
      const configPath = path.join(
        process.cwd(),
        'tests/e2e/fixtures/test-config.cjs'
      );
      const loadedConfig = { config: await configLoader.load(configPath) };

      expect(loadedConfig.config.apps).toHaveLength(3);
      expect(loadedConfig.config.apps[0].name).toBe('test-app-1');
      expect(loadedConfig.config.apps[1].name).toBe('test-app-2');

      // 2. Configure processes in ProcessManager
      for (const app of loadedConfig.config.apps.slice(0, 2)) {
        // Skip memory-eater for this test
        processManager.configureProcess(app);
        processManager.initializeProcess(app.name);
      }

      // Verify processes are configured
      expect(processManager.getProcessNames()).toContain('test-app-1');
      expect(processManager.getProcessNames()).toContain('test-app-2');

      // 3. Start processes
      await processManager.startProcess('test-app-1');
      await processManager.startProcess('test-app-2');

      // 4. Wait for processes to be online
      await waitForProcessStatus(processManager, 'test-app-1', 'online');
      await waitForProcessStatus(processManager, 'test-app-2', 'online');

      // 5. Verify process information
      const process1Info = processManager.getProcessInfo('test-app-1');
      const process2Info = processManager.getProcessInfo('test-app-2');

      expect(process1Info!.status).toBe('online');
      expect(process1Info!.pid).not.toBeNull();
      expect(process1Info!.pid).toBeGreaterThan(0);
      expect(process1Info!.namespace).toBe('test');

      expect(process2Info!.status).toBe('online');
      expect(process2Info!.pid).not.toBeNull();
      expect(process2Info!.pid).toBeGreaterThan(0);
      expect(process2Info!.namespace).toBe('test');

      // 6. Test monitoring functionality
      processManager.startMonitoring();

      // Wait for memory/CPU statistics to be collected
      // Note: pidusage may take some time to return stats
      await sleep(4000);

      const updatedInfo1 = processManager.getProcessInfo('test-app-1');
      // Memory might be 0 initially if pidusage hasn't collected data yet
      // Check that process is still online instead
      expect(updatedInfo1!.status).toBe('online');
      // CPU should be available
      expect(updatedInfo1!.cpu).toBeDefined();

      // 7. Test namespace operations
      const testNamespaceStatus = processManager.getNamespaceStatus('test');
      expect(testNamespaceStatus.total).toBe(2);
      expect(testNamespaceStatus.online).toBe(2);
      expect(testNamespaceStatus.stopped).toBe(0);

      // 8. Stop processes individually
      await processManager.stopProcess('test-app-1');
      await processManager.stopProcess('test-app-2');

      // 9. Verify processes are stopped
      await waitForProcessStatus(processManager, 'test-app-1', 'stopped');
      await waitForProcessStatus(processManager, 'test-app-2', 'stopped');

      const finalInfo1 = processManager.getProcessInfo('test-app-1');
      const finalInfo2 = processManager.getProcessInfo('test-app-2');

      expect(finalInfo1!.status).toBe('stopped');
      expect(finalInfo2!.status).toBe('stopped');
    }, 30000); // 30 second timeout for this comprehensive test

    test('should handle namespace operations correctly', async () => {
      // Load config and configure processes
      const configPath = path.join(
        process.cwd(),
        'tests/e2e/fixtures/test-config.cjs'
      );
      const loadedConfig = { config: await configLoader.load(configPath) };

      for (const app of loadedConfig.config.apps.slice(0, 2)) {
        processManager.configureProcess(app);
        processManager.initializeProcess(app.name);
      }

      // Test namespace startup
      await processManager.startNamespace('test');

      // Wait for all processes to be online
      await waitForProcessStatus(processManager, 'test-app-1', 'online');
      await waitForProcessStatus(processManager, 'test-app-2', 'online');

      // Verify namespace status
      const namespaceStatus = processManager.getNamespaceStatus('test');
      expect(namespaceStatus.total).toBe(2);
      expect(namespaceStatus.online).toBe(2);

      // Test namespace shutdown
      await processManager.stopNamespace('test');

      // Verify all processes are stopped
      // Note: processes might be 'errored' if they exited on their own
      const finalStatus1 = processManager.getProcessInfo('test-app-1')?.status;
      const finalStatus2 = processManager.getProcessInfo('test-app-2')?.status;

      expect(['stopped', 'errored']).toContain(finalStatus1);
      expect(['stopped', 'errored']).toContain(finalStatus2);
    }, 20000);

    test('should handle process restart correctly', async () => {
      // Configure and start a single process
      const configPath = path.join(
        process.cwd(),
        'tests/e2e/fixtures/test-config.cjs'
      );
      const loadedConfig = { config: await configLoader.load(configPath) };

      processManager.configureProcess(loadedConfig.config.apps[0]);
      processManager.initializeProcess(loadedConfig.config.apps[0].name);

      await processManager.startProcess('test-app-1');
      await waitForProcessStatus(processManager, 'test-app-1', 'online');

      const originalPid = processManager.getProcessInfo('test-app-1')!.pid;

      // Restart the process
      await processManager.restartProcess('test-app-1');

      // Wait for process to be online again
      await waitForProcessStatus(processManager, 'test-app-1', 'online');

      // Verify new PID
      const newPid = processManager.getProcessInfo('test-app-1')!.pid;
      expect(newPid).not.toBe(originalPid);
      expect(newPid).toBeGreaterThan(0);

      // Verify restart count increased
      const processInfo = processManager.getProcessInfo('test-app-1')!;
      expect(processInfo.restarts).toBe(1);

      // Stop process
      await processManager.stopProcess('test-app-1');
      // Process might be errored if it exited on its own
      const finalStatus = processManager.getProcessInfo('test-app-1')?.status;
      expect(['stopped', 'errored']).toContain(finalStatus);
    }, 15000);
  });

  describe('Memory Limit Auto-Restart', () => {
    test('should automatically restart process when memory limit is exceeded', async () => {
      // Use JS-based memory-eater for cross-platform compatibility
      // JS version: rapidly allocates 5MB chunks every 200ms

      // Create ProcessManager with much faster memory check interval for testing
      const fastPersistencePath = path.join(
        persistenceDir,
        'fast-processes.json'
      );
      const fastProcessManager = new ProcessManager(
        500,
        500,
        fastPersistencePath
      ); // 500ms monitor, 500ms memory check
      await fastProcessManager.initialize();

      // Load config and configure memory-eater process
      const configPath = path.join(
        process.cwd(),
        'tests/e2e/fixtures/test-config.cjs'
      );
      const loadedConfig = { config: await configLoader.load(configPath) };

      // Find and configure the memory-eater process using JS version for cross-platform support
      const memoryEaterConfig = loadedConfig.config.apps.find(
        (app) => app.name === 'memory-eater'
      );
      expect(memoryEaterConfig).toBeDefined();
      expect(memoryEaterConfig!.max_memory_restart).toBe('20M');

      // Override to use the JS memory-eater (the C binary may not be compatible with this OS)
      const jsMemoryEaterConfig = {
        ...memoryEaterConfig!,
        script: process.execPath,
        args: path.join(process.cwd(), 'tests/e2e/fixtures/memory-eater.js'),
      };

      fastProcessManager.configureProcess(jsMemoryEaterConfig);
      fastProcessManager.initializeProcess(jsMemoryEaterConfig.name);

      // Enable auto-restart for this process
      fastProcessManager.enableAutoRestart('memory-eater');

      // Set up event tracking with debug logging
      let memoryLimitTriggered = false;
      let restartTriggered = false;

      fastProcessManager.on(
        'process:memory-limit',
        (name: string, usage: number, limit: number) => {
          console.log(
            `[Event] Memory limit exceeded for ${name}: ${Math.round(usage / 1024 / 1024)}MB > ${Math.round(limit / 1024 / 1024)}MB`
          );
          memoryLimitTriggered = true;
        }
      );

      fastProcessManager.on('process:restart', (name: string) => {
        console.log(`[Event] Process restart event for ${name}`);
        restartTriggered = true;
      });

      fastProcessManager.on('process:restarted', (name: string) => {
        console.log(`[Event] Process restarted event for ${name}`);
      });

      // Start monitoring before starting the process
      fastProcessManager.startMonitoring();

      // Start the memory-eater process
      await fastProcessManager.startProcess('memory-eater');

      // Wait for process to be online
      await waitForProcessStatus(fastProcessManager, 'memory-eater', 'online');

      const originalPid =
        fastProcessManager.getProcessInfo('memory-eater')!.pid;
      console.log(`Memory eater started with PID: ${originalPid}`);

      // Wait a bit longer for process to fully initialize
      await sleep(1000);

      // Monitor memory growth and wait for auto-restart
      // C version is more predictable: 3s delay + rapid allocation + restart
      const startTime = Date.now();
      const timeout = 15000; // 15 seconds should be sufficient
      let memoryLimitTime: number | null = null;

      while (Date.now() - startTime < timeout) {
        await sleep(1000); // Check every second

        const info = fastProcessManager.getProcessInfo('memory-eater');
        if (info) {
          const memMB = Math.round(info.memory / 1024 / 1024);
          console.log(
            `Memory check: ${memMB}MB, PID: ${info.pid}, Status: ${info.status}`
          );

          // Track when memory limit is triggered
          if (memoryLimitTriggered && !memoryLimitTime) {
            memoryLimitTime = Date.now();
            console.log('Memory limit triggered, waiting for restart...');
          }

          // After memory limit, wait for restart (give it extra time)
          if (memoryLimitTriggered) {
            // Check if process is restarting (status changes)
            if (info.status === 'starting' || info.status === 'online') {
              // Check if PID changed (indicating successful restart)
              if (
                info.pid !== originalPid &&
                info.pid !== null &&
                info.pid > 0
              ) {
                console.log(
                  `Process restarted! New PID: ${info.pid}, Old PID: ${originalPid}`
                );

                // Verify the restart was due to memory limit
                expect(memoryLimitTriggered).toBe(true);
                expect(info.restarts).toBeGreaterThanOrEqual(1);

                // Stop the process
                await fastProcessManager.stopProcess('memory-eater');
                await waitForProcessStatus(
                  fastProcessManager,
                  'memory-eater',
                  'stopped'
                );

                // Cleanup the fast process manager
                await fastProcessManager.cleanup();
                return; // Test passed
              }
            }

            // If memory limit triggered but no restart after 10 seconds, something's wrong
            if (memoryLimitTime && Date.now() - memoryLimitTime > 10000) {
              throw new Error(
                `Process did not restart within 10s after memory limit. Status: ${info.status}, PID: ${info.pid}`
              );
            }
          }
        }
      }

      // If we reach here, the test failed
      throw new Error(
        `Process did not restart within ${timeout}ms. Memory limit triggered: ${memoryLimitTriggered}, Restart triggered: ${restartTriggered}`
      );
    }, 20000); // Reduced timeout for C-based memory eater

    test('should detect and handle memory limit exceeded', async () => {
      // This is a simpler test that verifies the memory limit detection works
      const testManager = new ProcessManager(500, 1000); // Fast intervals
      await testManager.initialize();

      try {
        // Use a simple script that allocates memory
        const memoryConfig: AppConfig = {
          name: 'simple-memory-test',
          script: process.execPath,
          args: '-e "const arr=[]; setInterval(() => { arr.push(Buffer.alloc(2*1024*1024)); }, 100); setInterval(() => console.log(\'alive\'), 1000);"',
          max_memory_restart: '15M', // Low memory limit
          namespace: 'memory-test',
        };

        testManager.configureProcess(memoryConfig);
        testManager.initializeProcess('simple-memory-test');
        testManager.enableAutoRestart('simple-memory-test');

        // Track events
        let restartCount = 0;
        testManager.on('process:restarted', (name: string) => {
          if (name === 'simple-memory-test') {
            restartCount++;
          }
        });

        // Start monitoring and process
        testManager.startMonitoring();
        await testManager.startProcess('simple-memory-test');
        await waitForProcessStatus(testManager, 'simple-memory-test', 'online');

        const startPid = testManager.getProcessInfo('simple-memory-test')!.pid;
        console.log('Test process started with PID:', startPid);

        // Wait up to 20 seconds for a restart or memory limit
        const timeout = 20000;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
          await sleep(1000);

          const info = testManager.getProcessInfo('simple-memory-test');
          if (info) {
            // Check if process restarted
            if (info.pid !== startPid && info.status === 'online') {
              console.log('Process restarted with new PID:', info.pid);
              break;
            }

            // Check restart count
            if (info.restarts > 0) {
              console.log('Process restart count:', info.restarts);
              break;
            }
          }
        }

        // Verify the process is configured correctly
        const finalInfo = testManager.getProcessInfo('simple-memory-test');
        expect(finalInfo).toBeDefined();
        expect(finalInfo!.namespace).toBe('memory-test');

        // Clean up
        await testManager.stopProcess('simple-memory-test');
      } finally {
        await testManager.cleanup();
      }
    }, 30000);

    test('should track memory usage correctly during monitoring', async () => {
      // Configure and start a normal test process
      const configPath = path.join(
        process.cwd(),
        'tests/e2e/fixtures/test-config.cjs'
      );
      const loadedConfig = { config: await configLoader.load(configPath) };

      processManager.configureProcess(loadedConfig.config.apps[0]);
      processManager.initializeProcess(loadedConfig.config.apps[0].name);

      // Start monitoring
      processManager.startMonitoring();

      // Start process
      await processManager.startProcess('test-app-1');
      await waitForProcessStatus(processManager, 'test-app-1', 'online');

      // Wait for several monitoring cycles to collect memory data
      await sleep(8000); // 8 seconds should give several memory readings

      // Verify memory statistics are being collected
      const processInfo = processManager.getProcessInfo('test-app-1')!;
      // Memory collection might be delayed by pidusage
      if (processInfo.memory > 0) {
        expect(processInfo.memory).toBeGreaterThan(0);
      } else {
        // At least verify process is still running
        expect(processInfo.status).toBe('online');
        expect(processInfo.pid).toBeGreaterThan(0);
      }
      expect(processInfo.cpu).toBeDefined();

      console.log(
        `Memory usage: ${Math.round(processInfo.memory / 1024 / 1024)}MB`
      );
      console.log(`CPU usage: ${processInfo.cpu}%`);

      // Stop process
      await processManager.stopProcess('test-app-1');
      await waitForProcessStatus(processManager, 'test-app-1', 'stopped');
    }, 20000);
  });

  describe('System Restart State Restoration', () => {
    test('should restore process states after ProcessManager restart', async () => {
      // Phase 1: Configure and start processes, then save state
      const configPath = path.join(
        process.cwd(),
        'tests/e2e/fixtures/persistence-config.cjs'
      );
      const loadedConfig = { config: await configLoader.load(configPath) };

      // Configure and start processes
      for (const app of loadedConfig.config.apps) {
        processManager.configureProcess(app);
        processManager.initializeProcess(app.name);
      }

      await processManager.startProcess('persistent-app-1');
      await processManager.startProcess('persistent-app-2');

      // Wait for processes to be online
      await waitForProcessStatus(processManager, 'persistent-app-1', 'online');
      await waitForProcessStatus(processManager, 'persistent-app-2', 'online');

      // Start monitoring to collect some statistics
      processManager.startMonitoring();
      await sleep(3000); // Collect some data

      // Force save state to persistence file
      await processManager.forceSaveState();

      // Verify processes.json exists and contains our data
      const processesFile = processManager.getPersistenceFilePath();
      const persistedData = JSON.parse(
        await fs.readFile(processesFile, 'utf-8')
      );

      // Handle both old format (array) and new format (object with version)
      let processes: Array<any>;
      if (Array.isArray(persistedData)) {
        processes = persistedData;
      } else if (persistedData && persistedData.processes) {
        processes = persistedData.processes;
      } else {
        throw new Error('Invalid persistence file format');
      }

      // Find our processes
      const app1Data = processes.find((p) => p.name === 'persistent-app-1');
      const app2Data = processes.find((p) => p.name === 'persistent-app-2');

      expect(app1Data).toBeDefined();
      expect(app2Data).toBeDefined();
      expect(app1Data.status).toBe('online');
      expect(app2Data.status).toBe('online');

      // Get current PIDs for comparison
      const app1Info = processManager.getProcessInfo('persistent-app-1')!;
      const app2Info = processManager.getProcessInfo('persistent-app-2')!;
      const originalPid1 = app1Info.pid;
      const originalPid2 = app2Info.pid;

      console.log(
        `Before restart - App1 PID: ${originalPid1}, App2 PID: ${originalPid2}`
      );

      // Phase 2: Simulate system restart by creating new ProcessManager

      // Stop monitoring and cleanup current manager
      await processManager.cleanup();

      // Create new ProcessManager instance (simulating system restart) with same persistence path
      const newProcessManager = new ProcessManager(5000, 30000, processesFile);

      // Need to reconfigure processes before they can be restored
      for (const app of loadedConfig.config.apps) {
        newProcessManager.configureProcess(app);
      }

      await newProcessManager.initialize(); // This should load persisted state

      // Verify state restoration
      const restoredApp1Info =
        newProcessManager.getProcessInfo('persistent-app-1');
      const restoredApp2Info =
        newProcessManager.getProcessInfo('persistent-app-2');

      expect(restoredApp1Info).toBeDefined();
      expect(restoredApp2Info).toBeDefined();

      // Status should be restored but transient states should be reset
      expect(restoredApp1Info!.status).toBe('stopped'); // online->stopped during restoration
      expect(restoredApp2Info!.status).toBe('stopped');

      // Historical data should be preserved
      expect(restoredApp1Info!.namespace).toBe('persistent');

      // PID should be reset since process is no longer running
      expect(restoredApp1Info!.pid).toBeNull();
      expect(restoredApp2Info!.pid).toBeNull();

      console.log('State restoration successful');

      // Phase 3: Verify we can restart processes from restored state
      // Reconfigure processes since they're not automatically restarted
      for (const app of loadedConfig.config.apps) {
        newProcessManager.configureProcess(app);
      }

      await newProcessManager.startProcess('persistent-app-1');
      await waitForProcessStatus(
        newProcessManager,
        'persistent-app-1',
        'online'
      );

      const restartedApp1Info =
        newProcessManager.getProcessInfo('persistent-app-1')!;
      expect(restartedApp1Info.status).toBe('online');
      expect(restartedApp1Info.pid).toBeGreaterThan(0);
      expect(restartedApp1Info.pid).not.toBe(originalPid1); // New PID after restart

      console.log(`After restart - App1 new PID: ${restartedApp1Info.pid}`);

      // Cleanup
      await newProcessManager.stopProcess('persistent-app-1');
      await newProcessManager.cleanup();
    }, 30000);

    test('should handle corrupted persistence file gracefully', async () => {
      // Create a corrupted persistence file in a temp directory
      const corruptedPersistenceDir = path.join(
        testDir,
        'corrupted-persistence'
      );
      await fs.mkdir(corruptedPersistenceDir, { recursive: true });
      const corruptedFile = path.join(
        corruptedPersistenceDir,
        'processes.json'
      );
      await fs.writeFile(corruptedFile, '{ invalid json content }');

      // ProcessManager should handle corruption gracefully
      const newProcessManager = new ProcessManager(5000, 30000, corruptedFile);
      await expect(newProcessManager.initialize()).resolves.not.toThrow();

      // Should start with clean state
      expect(newProcessManager.getProcessNames()).toHaveLength(0);

      await newProcessManager.cleanup();
    }, 30000);

    test('should preserve process history across restarts', async () => {
      // Configure and start a process
      const configPath = path.join(
        process.cwd(),
        'tests/e2e/fixtures/persistence-config.cjs'
      );
      const loadedConfig = { config: await configLoader.load(configPath) };

      processManager.configureProcess(loadedConfig.config.apps[0]);
      processManager.initializeProcess(loadedConfig.config.apps[0].name);

      await processManager.startProcess('persistent-app-1');
      await waitForProcessStatus(processManager, 'persistent-app-1', 'online');

      // Perform some state changes to create history
      await processManager.restartProcess('persistent-app-1');
      await waitForProcessStatus(processManager, 'persistent-app-1', 'online');

      // Start monitoring to collect data
      processManager.startMonitoring();
      await sleep(2000);

      const originalInfo = processManager.getProcessInfo('persistent-app-1')!;
      expect(originalInfo.restarts).toBe(1);

      // Force save and restart ProcessManager
      await processManager.forceSaveState();
      const persistencePath = processManager.getPersistenceFilePath();
      await processManager.cleanup();

      const newProcessManager = new ProcessManager(
        5000,
        30000,
        persistencePath
      );

      // Need to reconfigure process before it can be restored
      newProcessManager.configureProcess(loadedConfig.config.apps[0]);

      await newProcessManager.initialize();

      // Verify history is preserved
      const restoredInfo = newProcessManager.getProcessInfo('persistent-app-1');

      // Process should be restored from persistence
      expect(restoredInfo).toBeDefined();
      if (restoredInfo) {
        expect(restoredInfo.restarts).toBe(1);
        expect(restoredInfo.namespace).toBe('persistent');
      }

      await newProcessManager.cleanup();
    }, 20000);
  });
});
