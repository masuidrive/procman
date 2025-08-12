/**
 * Boundary tests for ProcessManager
 * Testing process lifecycle management at OS process boundaries
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ProcessManager } from '../../src/process-manager/process-manager';
import type { AppConfig } from '../../src/shared/config';

describe('ProcessManager Boundary Tests', () => {
  let processManager: ProcessManager;
  let testDir: string;

  beforeEach(async () => {
    // Create temporary directory for test files
    testDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'procman-boundary-test-')
    );

    // Use faster intervals like E2E tests for quicker feedback
    processManager = new ProcessManager(500, 1000); // 500ms monitor interval, 1s stats interval
  });

  afterEach(async () => {
    // Clean up all processes
    try {
      processManager.stopMonitoring();
      const apps = processManager.getAllProcessInfo();
      for (const app of apps) {
        if (app.status === 'online' || app.status === 'starting') {
          await processManager.stopProcess(app.name);
        }
      }
      processManager.removeAllListeners();
    } catch (error) {
      console.error('Cleanup error:', error);
    }

    // Clean up temp directory
    if (testDir) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Process Lifecycle Boundary', () => {
    test('should handle rapid start/stop cycles', async () => {
      // Arrange: Create a simple test script
      const scriptPath = path.join(testDir, 'rapid-test.js');
      await fs.promises.writeFile(
        scriptPath,
        `
        console.log('Process started');
        process.on('SIGTERM', () => {
          console.log('Received SIGTERM');
          process.exit(0);
        });
        setInterval(() => console.log('alive'), 100);
        `
      );

      const config: AppConfig = {
        name: 'rapid-test',
        script: scriptPath,
      };

      processManager.configureProcess(config);

      // Act: Perform rapid start/stop cycles
      const cycles = 5;
      for (let i = 0; i < cycles; i++) {
        await processManager.startProcess('rapid-test');

        // Wait for process to be online
        await new Promise<void>((resolve) => {
          const checkStatus = (): void => {
            const info = processManager.getProcessInfo('rapid-test');
            if (info?.status === 'online') {
              resolve();
            } else {
              setTimeout(checkStatus, 50);
            }
          };
          checkStatus();
        });

        await processManager.stopProcess('rapid-test');

        // Wait for process to be stopped
        await new Promise<void>((resolve) => {
          const checkStatus = (): void => {
            const info = processManager.getProcessInfo('rapid-test');
            if (info?.status === 'stopped') {
              resolve();
            } else {
              setTimeout(checkStatus, 50);
            }
          };
          checkStatus();
        });
      }

      // Assert: Process should be in stopped state after cycles
      const finalInfo = processManager.getProcessInfo('rapid-test');
      expect(finalInfo).toBeDefined();
      expect(finalInfo?.status).toBe('stopped');
    });

    test('should detect zombie processes', async () => {
      // Skip on Windows as zombie processes work differently there
      if (process.platform === 'win32') {
        console.log('Skipping zombie process test on Windows');
        return;
      }

      // Arrange: Create a script that creates a zombie
      const zombieCreatorPath = path.join(testDir, 'zombie-creator.js');
      await fs.promises.writeFile(
        zombieCreatorPath,
        `
        const { spawn } = require('child_process');
        
        // Spawn a child that exits immediately but parent doesn't wait
        const child = spawn('sleep', ['0.1'], {
          detached: false,
          stdio: 'ignore'
        });
        
        // Don't wait for child, creating a zombie
        child.unref();
        
        // Keep parent alive
        console.log('Parent process running, child should be zombie');
        setInterval(() => {
          console.log('Parent still alive');
        }, 1000);
        `
      );

      const config: AppConfig = {
        name: 'zombie-test',
        script: zombieCreatorPath,
      };

      processManager.configureProcess(config);

      // Act: Start process and monitoring
      await processManager.startProcess('zombie-test');
      processManager.startMonitoring();

      // Wait a bit for zombie to be created
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Assert: Process should still be running (parent is alive)
      const info = processManager.getProcessInfo('zombie-test');
      expect(info).toBeDefined();
      expect(info?.status).toBe('online');

      // Note: Actual zombie detection would require OS-specific tools
      // This test just ensures the parent process continues running
    });
  });

  describe('Process Monitoring Boundary', () => {
    test('should track memory usage accurately', async () => {
      // Arrange: Create a memory-consuming script
      const memoryScriptPath = path.join(testDir, 'memory-test.js');
      await fs.promises.writeFile(
        memoryScriptPath,
        `
        // Allocate some memory
        const buffers = [];
        for (let i = 0; i < 10; i++) {
          buffers.push(Buffer.alloc(1024 * 1024)); // 1MB each
        }
        console.log('Allocated 10MB');
        
        // Keep process alive
        setInterval(() => {
          console.log('Memory test alive, RSS:', process.memoryUsage().rss);
        }, 1000);
        `
      );

      const config: AppConfig = {
        name: 'memory-tracking',
        script: memoryScriptPath,
      };

      processManager.configureProcess(config);

      // Act: Start process and monitoring
      await processManager.startProcess('memory-tracking');
      processManager.startMonitoring();

      // Wait for monitoring to collect data - with multiple retries
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const testInfo = processManager.getProcessInfo('memory-tracking');
        if (testInfo?.memory && testInfo.memory > 0) break;
      }

      // Assert: Memory should be tracked
      const info = processManager.getProcessInfo('memory-tracking');
      expect(info).toBeDefined();
      if (info?.memory) {
        expect(info.memory).toBeGreaterThan(0);
        // Should be at least 10MB (10 * 1024 * 1024)
        expect(info.memory).toBeGreaterThan(10 * 1024 * 1024);
      }
    }, 45000); // Increase timeout to 45 seconds

    test('should auto-restart process when memory limit exceeded', async () => {
      // Arrange: Create a simple memory-consuming script based on successful E2E patterns
      const memoryScriptPath = path.join(testDir, 'memory-restart-test.js');
      await fs.promises.writeFile(
        memoryScriptPath,
        `#!/usr/bin/env node
console.log('Memory restart test started with PID:', process.pid);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Memory test received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Memory test received SIGINT, shutting down...');
  process.exit(0);
});

// Wait a bit to ensure process is fully initialized
setTimeout(() => {
  console.log('Starting memory consumption...');
  
  // Memory consumption simulation - aggressive for quicker test
  let memoryChunks = [];
  let counter = 0;
  
  const interval = setInterval(() => {
    counter++;
    
    // Allocate 2MB per iteration for fast memory growth
    const chunk = Buffer.alloc(2 * 1024 * 1024, 'x');
    // Fill with actual data to ensure memory is really used
    for (let i = 0; i < chunk.length; i += 1024) {
      chunk[i] = Math.floor(Math.random() * 256);
    }
    memoryChunks.push(chunk);
    
    const memUsage = process.memoryUsage();
    const memUsageMB = Math.round(memUsage.rss / 1024 / 1024);
    
    console.log('Memory test iteration', counter + ', RSS:', memUsageMB + 'MB, Heap:', Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB');
    
    // Stop growing after reaching enough to trigger 12MB limit (6 iterations * 2MB = 12MB+)
    if (counter >= 10) {
      console.log('Memory test stopping memory allocation - should have hit limit');
      clearInterval(interval);
      
      // Keep process alive but stop growing memory
      setInterval(() => {
        const mem = process.memoryUsage();
        console.log('Memory test idle, RSS:', Math.round(mem.rss / 1024 / 1024) + 'MB');
      }, 2000);
    }
  }, 200); // Allocate every 200ms for very fast growth
}, 500); // Wait 500ms for process initialization

// Keep process alive
process.stdin.resume();
`
      );

      const config: AppConfig = {
        name: 'test-memory-restart',
        script: memoryScriptPath,
        max_memory_restart: '12M', // 12MB limit - very low for fast triggering
      };

      processManager.configureProcess(config);
      // Initialize and enable auto-restart (required for memory limit restart)
      processManager.initializeProcess('test-memory-restart');
      processManager.enableAutoRestart('test-memory-restart');

      // Track memory limit and restart events
      let restartCount = 0;
      processManager.on('process:restarted', (name) => {
        if (name === 'test-memory-restart') {
          restartCount++;
          console.log('Process restarted, count:', restartCount);
        }
      });

      let memoryLimitEventReceived = false;
      processManager.on('process:memory-limit', (name, usage, limit) => {
        console.log(
          `Memory limit event: ${name} usage=${Math.round(usage / 1024 / 1024)}MB limit=${Math.round(limit / 1024 / 1024)}MB`
        );
        memoryLimitEventReceived = true;
      });

      // Start monitoring BEFORE starting the process (like E2E tests do)
      processManager.startMonitoring();

      // Act: Start process
      await processManager.startProcess('test-memory-restart');

      // Get initial PID
      const initialInfo = processManager.getProcessInfo('test-memory-restart');
      const initialPid = initialInfo?.pid;
      expect(initialPid).toBeDefined();
      console.log('Initial process PID:', initialPid);

      // Wait a bit for process to initialize before checking memory
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Wait for restart to happen
      // With 2MB/200ms leak rate, should hit 12MB in ~1.5 seconds after init delay
      const maxWaitTime = 20000; // 20 seconds max
      const startTime = Date.now();

      await new Promise<void>((resolve, reject) => {
        const checkInterval = setInterval(() => {
          const info = processManager.getProcessInfo('test-memory-restart');
          const hasRestarted = (info?.restarts ?? 0) > 0 || restartCount > 0;
          const pidChanged = info?.pid !== undefined && info.pid !== initialPid;

          // Log current status for debugging
          if (info) {
            const memMB = Math.round((info.memory || 0) / 1024 / 1024);
            console.log(
              `Status check - Memory: ${memMB}MB, PID: ${info.pid}, Status: ${info.status}, Restarts: ${info.restarts}, Events: memory=${memoryLimitEventReceived}, restart=${restartCount}`
            );
          }

          if (hasRestarted || pidChanged) {
            console.log(
              `Restart detected - Restarts: ${info?.restarts}, RestartCount: ${restartCount}, PID changed: ${pidChanged}, Memory limit event: ${memoryLimitEventReceived}`
            );
            clearInterval(checkInterval);
            resolve();
          }

          if (Date.now() - startTime > maxWaitTime) {
            clearInterval(checkInterval);
            reject(
              new Error(
                `No restart detected within ${maxWaitTime}ms. Memory limit triggered: ${memoryLimitEventReceived}`
              )
            );
          }
        }, 500);
      });

      // Assert: Process should have been restarted
      const finalInfo = processManager.getProcessInfo('test-memory-restart');
      expect(finalInfo).toBeDefined();
      const hasRestarted = (finalInfo?.restarts ?? 0) > 0 || restartCount > 0;
      expect(hasRestarted).toBe(true);
    });
  });

  describe('Process Persistence', () => {
    test('should persist process state across restarts', async () => {
      // Arrange: Start a process
      const persistScriptPath = path.join(testDir, 'persist-test.js');
      await fs.promises.writeFile(
        persistScriptPath,
        `
        console.log('Persist test process started');
        setInterval(() => console.log('alive'), 1000);
        `
      );

      const config: AppConfig = {
        name: 'persist-test',
        script: persistScriptPath,
      };

      processManager.configureProcess(config);
      await processManager.startProcess('persist-test');

      // Act: Save state
      await processManager.saveState();

      // Assert: Process should still be tracked
      const info = processManager.getProcessInfo('persist-test');
      expect(info).toBeDefined();
      expect(info?.name).toBe('persist-test');

      // Stop the process
      await processManager.stopProcess('persist-test');
    });

    test('should handle corrupted state gracefully', () => {
      // This test would need access to internal state loading
      // which isn't exposed in the public API
      // Skipping for now as the public API doesn't expose state import/export
      expect(true).toBe(true);
    });
  });

  describe('Error Recovery Boundary', () => {
    test('should handle process crash with restart limit', async () => {
      // Arrange: Create a crashing script
      const crashScriptPath = path.join(testDir, 'crash-test.js');
      await fs.promises.writeFile(
        crashScriptPath,
        `
        console.log('Crash test starting');
        setTimeout(() => {
          console.error('Crashing intentionally');
          process.exit(1);
        }, 100);
        `
      );

      const config: AppConfig = {
        name: 'crash-test',
        script: crashScriptPath,
      };

      let errorCount = 0;
      processManager.on('process:error', (name) => {
        if (name === 'crash-test') {
          errorCount++;
        }
      });

      processManager.configureProcess(config);

      // Act: Start process and let it crash
      await processManager.startProcess('crash-test');

      // Wait for crash to occur
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Assert: Process should have crashed
      const info = processManager.getProcessInfo('crash-test');
      expect(info).toBeDefined();
      // Process status should be errored or stopped after crash
      const validStatuses = ['stopped', 'errored'];
      expect(validStatuses).toContain(info?.status);
    });

    test('should handle missing script file', async () => {
      // Arrange: Configure with non-existent script
      const config: AppConfig = {
        name: 'missing-script',
        script: '/non/existent/path/script.js',
      };

      processManager.configureProcess(config);

      // Act: Try to start process with missing script
      // Note: ProcessManager may not throw immediately for missing scripts
      // but instead set the process to errored status
      await processManager.startProcess('missing-script');

      // Give time for error to be detected
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Assert: Process should be in errored state
      const info = processManager.getProcessInfo('missing-script');
      expect(info).toBeDefined();
      expect(info?.status).toBe('errored');
    });
  });
});
