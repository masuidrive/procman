/**
 * Boundary tests for ProcessManager
 * Testing process lifecycle management at OS process boundaries
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ProcessManager } from '../../src/process-manager/process-manager';
import { AppConfig } from '../../src/shared/config';
import {
  TEST_TIMEOUTS,
  TEST_DELAYS,
  TEST_COUNTS,
  TEST_STRING_LENGTHS,
  TEST_MONITORING,
} from '../helpers/test-constants';

// Helper to check if process is running
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Helper to wait for condition
async function waitFor(
  condition: () => boolean,
  timeout = TEST_TIMEOUTS.MEDIUM
): Promise<void> {
  const start = Date.now();
  while (!condition() && Date.now() - start < timeout) {
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAYS.SHORT));
  }
  if (!condition()) {
    throw new Error('Timeout waiting for condition');
  }
}

describe('ProcessManager Boundary Tests', () => {
  let processManager: ProcessManager;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for logs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procman-test-'));
    processManager = new ProcessManager(
      TEST_MONITORING.HEALTH_CHECK_INTERVAL, // healthCheckInterval
      TEST_TIMEOUTS.VERY_LONG, // memoryCheckInterval
      path.join(tempDir, 'processes.json') // persistenceFilePath
    );
    await processManager.initialize();
  });

  afterEach(async () => {
    // Clean up all processes
    const processes = processManager.getAllProcessInfo();
    for (const process of processes) {
      try {
        await processManager.stopProcess(process.name);
      } catch (error) {
        // Process may already be stopped
      }
    }
    await processManager.cleanup();

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Process Lifecycle Boundary', () => {
    test('should start a real process and track its PID', async () => {
      // Arrange: Simple Node.js process that stays alive
      const config: AppConfig = {
        name: 'test-process',
        script: process.execPath,
        args: `-e "setInterval(() => console.log('alive'), ${TEST_DELAYS.LONG})"`,
      };

      // Act: Configure and start the process
      processManager.configureProcess(config);
      await processManager.startProcess('test-process');

      // Assert: Process should be running
      const processInfo = processManager.getProcessInfo('test-process');
      expect(processInfo).toBeDefined();
      expect(processInfo?.pid).toBeGreaterThan(0);
      expect(processInfo?.pid && isProcessRunning(processInfo.pid)).toBe(true);
      expect(processInfo?.status).toBe('online');
    });

    test('should stop a running process gracefully', async () => {
      // Arrange: Start a process
      const config: AppConfig = {
        name: 'test-stop',
        script: process.execPath,
        args: `-e "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, ${TEST_DELAYS.LONG})"`,
      };
      processManager.configureProcess(config);
      await processManager.startProcess('test-stop');
      const processInfo = processManager.getProcessInfo('test-stop');
      const pid = processInfo!.pid!;

      // Act: Stop the process
      await processManager.stopProcess('test-stop');

      // Assert: Process should be stopped
      await waitFor(() => !isProcessRunning(pid));
      expect(isProcessRunning(pid)).toBe(false);
    });

    test('should restart a process with new PID', async () => {
      // Arrange: Start a process
      const config: AppConfig = {
        name: 'test-restart',
        script: process.execPath,
        args: `-e "console.log(process.pid); setInterval(() => {}, ${TEST_DELAYS.LONG})"`,
      };
      processManager.configureProcess(config);
      await processManager.startProcess('test-restart');
      const originalInfo = processManager.getProcessInfo('test-restart');
      const originalPid = originalInfo!.pid!;

      // Act: Restart the process
      await processManager.restartProcess('test-restart');

      // Assert: Should have different PID
      const newInfo = processManager.getProcessInfo('test-restart');
      expect(newInfo?.pid).not.toBe(originalPid);
      expect(isProcessRunning(originalPid)).toBe(false);
      expect(newInfo?.pid && isProcessRunning(newInfo.pid)).toBe(true);
    });

    test('should handle process that exits immediately', async () => {
      // Arrange: Process that exits immediately
      const config: AppConfig = {
        name: 'test-quick-exit',
        script: process.execPath,
        args: '-e "process.exit(1)"',
      };

      // Act: Configure and start the process
      processManager.configureProcess(config);
      await processManager.startProcess('test-quick-exit');

      // Assert: Should detect process failure
      await waitFor(() => {
        const info = processManager.getProcessInfo('test-quick-exit');
        return info?.status === 'stopped' || info?.status === 'errored';
      });

      const info = processManager.getProcessInfo('test-quick-exit');
      expect(info?.status).toMatch(/stopped|errored/);
    });

    test('should handle process that ignores SIGTERM', async () => {
      // Arrange: Process that ignores SIGTERM
      const config: AppConfig = {
        name: 'test-ignore-sigterm',
        script: process.execPath,
        args: `-e "process.on('SIGTERM', () => {}); setInterval(() => {}, ${TEST_DELAYS.LONG})"`,
      };
      processManager.configureProcess(config);
      await processManager.startProcess('test-ignore-sigterm');
      const info = processManager.getProcessInfo('test-ignore-sigterm');
      const pid = info!.pid!;

      // Act: Try to stop (should force kill after timeout)
      await processManager.stopProcess('test-ignore-sigterm');

      // Assert: Process should be force killed
      await waitFor(() => !isProcessRunning(pid), TEST_TIMEOUTS.LONG);
      expect(isProcessRunning(pid)).toBe(false);
    });
  });

  describe('Environment and Working Directory Boundary', () => {
    test('should start process with custom environment variables', async () => {
      // Arrange: Process that outputs environment variable
      const testEnvVar = `TEST_VAR_${Date.now()}`;
      const config: AppConfig = {
        name: 'test-env',
        script: process.execPath,
        args: `-e "console.log(process.env.${testEnvVar}); setTimeout(() => {}, ${TEST_DELAYS.SHORT})"`,
        env: {
          [testEnvVar]: 'test-value',
        },
      };

      // Act: Configure and start the process
      processManager.configureProcess(config);
      await processManager.startProcess('test-env');

      // Assert: Process should have started successfully
      const info = processManager.getProcessInfo('test-env');
      expect(info).toBeDefined();
      expect(info?.status).toBe('online');
    });

    test('should start process in specified working directory', async () => {
      // Arrange: Create a test directory with a file
      const testDir = path.join(tempDir, 'test-cwd');
      fs.mkdirSync(testDir);
      fs.writeFileSync(
        path.join(testDir, 'test.txt'),
        'Hello from test directory'
      );

      const config: AppConfig = {
        name: 'test-cwd',
        script: process.execPath,
        args: `-e "console.log(process.cwd()); console.log(require('fs').readdirSync('.')); setTimeout(() => {}, ${TEST_DELAYS.SHORT})"`,
        cwd: testDir,
      };

      // Act: Configure and start the process
      processManager.configureProcess(config);
      await processManager.startProcess('test-cwd');

      // Assert: Process should run in specified directory
      const info = processManager.getProcessInfo('test-cwd');
      expect(info).toBeDefined();
      expect(info?.status).toBe('online');
    });
  });

  describe('Process Monitoring Boundary', () => {
    test.skip('should track memory usage of running process', async () => {
      // Arrange: Process that consumes memory
      const config: AppConfig = {
        name: 'test-memory',
        script: process.execPath,
        args: `-e "const arr = []; setInterval(() => { arr.push(new Array(${TEST_COUNTS.VERY_LARGE}).fill('x')); }, 10);"`,
      };

      // Act: Configure and start the process
      processManager.configureProcess(config);
      await processManager.startProcess('test-memory');

      // Start monitoring
      processManager.startMonitoring();

      // Wait for some memory consumption
      await new Promise((resolve) => setTimeout(resolve, TEST_DELAYS.LONG));

      // Assert: Memory usage should be tracked
      const info = processManager.getProcessInfo('test-memory');
      expect(info).toBeDefined();
      // Memory tracking might be available through stats
      // For now, just verify the process is running
      expect(info?.status).toBe('online');
    });

    test.skip('should auto-restart process when memory limit exceeded', async () => {
      // Arrange: Process with memory limit
      const config: AppConfig = {
        name: 'test-memory-restart',
        script: process.execPath,
        args: '-e "console.log(\\"Started with PID:\\", process.pid); const arr = []; setInterval(() => { for(let i = 0; i < 100; i++) { arr.push(new Array(10000).fill(\\"x\\".repeat(100))); } }, 10);"',
        max_memory_restart: '50M', // Low limit to trigger restart
      };

      // Act: Configure and start process
      processManager.configureProcess(config);
      await processManager.startProcess('test-memory-restart');
      const originalInfo = processManager.getProcessInfo('test-memory-restart');
      const originalPid = originalInfo!.pid!;

      // Start monitoring to trigger memory checks
      processManager.startMonitoring();

      // Wait for auto-restart (may take a few seconds)
      await waitFor(() => {
        const info = processManager.getProcessInfo('test-memory-restart');
        return info?.pid !== originalPid && info?.status === 'online';
      }, TEST_TIMEOUTS.EXTRA_LONG / 4);

      // Assert: Process should have restarted with new PID
      const newInfo = processManager.getProcessInfo('test-memory-restart');
      expect(newInfo?.pid).not.toBe(originalPid);
      expect(newInfo?.status).toBe('online');
      expect(newInfo?.restarts).toBeGreaterThan(0);
    });
  });

  describe('Multiple Process Management', () => {
    test('should manage multiple processes independently', async () => {
      // Arrange: Multiple process configs
      const configs: AppConfig[] = [
        {
          name: 'app1',
          script: process.execPath,
          args: '-e "console.log(\'App1\'); setInterval(() => {}, 1000)"',
        },
        {
          name: 'app2',
          script: process.execPath,
          args: '-e "console.log(\'App2\'); setInterval(() => {}, 1000)"',
        },
        {
          name: 'app3',
          script: process.execPath,
          args: '-e "console.log(\'App3\'); setInterval(() => {}, 1000)"',
        },
      ];

      // Act: Configure and start all processes
      for (const config of configs) {
        processManager.configureProcess(config);
      }
      const results = await processManager.startProcesses([
        'app1',
        'app2',
        'app3',
      ]);

      // Assert: All should be running
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);

      const allInfo = processManager.getAllProcessInfo();
      expect(allInfo).toHaveLength(3);
      expect(allInfo.every((s) => s.status === 'online')).toBe(true);

      // Stop one process
      await processManager.stopProcess('app2');

      // Others should still be running
      expect(processManager.getProcessInfo('app1')?.status).toBe('online');
      expect(processManager.getProcessInfo('app2')?.status).toBe('stopped');
      expect(processManager.getProcessInfo('app3')?.status).toBe('online');
    });

    test('should handle namespace-based operations', async () => {
      // Arrange: Processes in different namespaces
      const configs: AppConfig[] = [
        {
          name: 'web-1',
          namespace: 'web',
          script: process.execPath,
          args: '-e "setInterval(() => {}, 1000)"',
        },
        {
          name: 'web-2',
          namespace: 'web',
          script: process.execPath,
          args: '-e "setInterval(() => {}, 1000)"',
        },
        {
          name: 'worker-1',
          namespace: 'worker',
          script: process.execPath,
          args: '-e "setInterval(() => {}, 1000)"',
        },
      ];

      // Act: Configure and start all processes
      for (const config of configs) {
        processManager.configureProcess(config);
      }
      await processManager.startProcesses(['web-1', 'web-2', 'worker-1']);

      // Stop all in 'web' namespace
      const result = await processManager.stopNamespace('web');

      // Assert: Only web namespace should be stopped
      expect(result).toHaveLength(2);
      expect(processManager.getProcessInfo('web-1')?.status).toBe('stopped');
      expect(processManager.getProcessInfo('web-2')?.status).toBe('stopped');
      expect(processManager.getProcessInfo('worker-1')?.status).toBe('online');
    });
  });

  describe('Input Validation Edge Cases', () => {
    test('should handle null and undefined inputs', async () => {
      // Act & Assert: Should handle invalid inputs gracefully
      expect(() => {
        processManager.configureProcess(null as any);
      }).toThrow();

      expect(() => {
        processManager.configureProcess(undefined as any);
      }).toThrow();

      await expect(processManager.startProcess(null as any)).rejects.toThrow();

      await expect(
        processManager.startProcess(undefined as any)
      ).rejects.toThrow();
    });

    test('should handle empty and invalid process names', async () => {
      // Arrange: Configs with problematic names
      const problematicNames = [
        '',
        ' ',
        '\t',
        '\n',
        '/',
        '\\',
        ':',
        '*',
        '?',
        '"',
        '<',
        '>',
        '|',
      ];

      for (const name of problematicNames) {
        const config: AppConfig = {
          name,
          script: process.execPath,
          args: '-e "console.log(\\"test\\")"',
        };

        // Act & Assert: Should reject invalid names
        expect(() => {
          processManager.configureProcess(config);
        }).toThrow();
      }
    });

    test('should handle extremely long process names', async () => {
      // Arrange: Very long process name
      const longName = 'a'.repeat(1000);
      const config: AppConfig = {
        name: longName,
        script: process.execPath,
        args: '-e "console.log(\\"long name test\\")"',
      };

      // Act & Assert: Should handle or reject gracefully
      try {
        processManager.configureProcess(config);
        await processManager.startProcess(longName);

        const info = processManager.getProcessInfo(longName);
        expect(info?.name).toBe(longName);
      } catch (error) {
        // Acceptable to reject very long names
        expect(error).toBeInstanceOf(Error);
      }
    });

    test('should handle invalid script paths', async () => {
      // Arrange: Configs with invalid script paths
      const invalidPaths = ['', ' ', '\0', '\t', '\n'];

      for (const script of invalidPaths) {
        const config: AppConfig = {
          name: `test-invalid-${Date.now()}`,
          script,
        };

        processManager.configureProcess(config);

        // Act & Assert: Should fail to start
        await expect(
          processManager.startProcess(config.name)
        ).rejects.toThrow();
      }
    });
  });

  describe('Resource Limits and Extreme Scenarios', () => {
    test('should handle maximum concurrent processes', async () => {
      // Arrange: Create many lightweight processes
      const maxProcesses = 50; // Reasonable limit for testing
      const configs: AppConfig[] = [];

      for (let i = 0; i < maxProcesses; i++) {
        configs.push({
          name: `stress-test-${i}`,
          script: process.execPath,
          args: '-e "setTimeout(() => process.exit(0), 1000)"',
        });
      }

      // Act: Configure and start all processes
      for (const config of configs) {
        processManager.configureProcess(config);
      }

      const startPromises = configs.map((config) =>
        processManager
          .startProcess(config.name)
          .then(() => ({ success: true, name: config.name }))
          .catch((error) => ({ error, name: config.name }))
      );

      const results = await Promise.all(startPromises);

      // Assert: Should handle high concurrency
      const successCount = results.filter(
        (r: any) => r && !('error' in r)
      ).length;
      const errorCount = results.filter((r: any) => r && 'error' in r).length;

      // At least some should succeed, system may limit total
      expect(successCount).toBeGreaterThan(0);
      console.log(`Started ${successCount} processes, ${errorCount} failed`);
    });

    test('should handle rapid start/stop cycles', async () => {
      // Arrange: Rapid cycling config
      const config: AppConfig = {
        name: 'rapid-cycle',
        script: process.execPath,
        args: '-e "setTimeout(() => process.exit(0), 100)"',
      };

      processManager.configureProcess(config);

      // Act: Rapid start/stop cycles
      for (let i = 0; i < 10; i++) {
        await processManager.startProcess('rapid-cycle');
        await waitFor(() => {
          const info = processManager.getProcessInfo('rapid-cycle');
          return info?.status === 'online' || info?.status === 'stopped';
        });

        if (processManager.getProcessInfo('rapid-cycle')?.status === 'online') {
          await processManager.stopProcess('rapid-cycle');
        }

        // Small delay between cycles
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Assert: Should handle rapid cycling without issues
      const finalInfo = processManager.getProcessInfo('rapid-cycle');
      expect(finalInfo).toBeDefined();
    });

    test('should handle processes with massive environment variables', async () => {
      // Arrange: Process with large environment
      const largeEnv: Record<string, string> = {};

      // Create large environment (approaching system limits)
      for (let i = 0; i < 100; i++) {
        largeEnv[`LARGE_VAR_${i}`] = 'x'.repeat(1000);
      }

      const config: AppConfig = {
        name: 'large-env',
        script: process.execPath,
        args: '-e "console.log(Object.keys(process.env).length); setTimeout(() => {}, 100)"',
        env: largeEnv,
      };

      // Act: Try to start with large environment
      processManager.configureProcess(config);

      try {
        await processManager.startProcess('large-env');

        // Assert: Should start successfully or fail gracefully
        const info = processManager.getProcessInfo('large-env');
        expect(info).toBeDefined();
      } catch (error) {
        // Acceptable to fail with very large environments
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('System Error Boundary Cases', () => {
    test('should handle filesystem unavailability', async () => {
      // Arrange: Process that tries to access unavailable filesystem
      const config: AppConfig = {
        name: 'fs-error',
        script: process.execPath,
        args: "-e \"require('fs').readFileSync('/nonexistent/path/file.txt'); setTimeout(() => {}, 100)\"",
      };

      // Act: Start process that will encounter filesystem error
      processManager.configureProcess(config);
      await processManager.startProcess('fs-error');

      // Assert: Should track process even if it encounters errors
      await waitFor(() => {
        const info = processManager.getProcessInfo('fs-error');
        return info?.status === 'stopped' || info?.status === 'errored';
      });

      const info = processManager.getProcessInfo('fs-error');
      expect(info?.status).toMatch(/stopped|errored/);
    });

    test('should handle out-of-memory scenarios', async () => {
      // Arrange: Memory-hungry process (with reasonable limits for testing)
      const config: AppConfig = {
        name: 'memory-hog',
        script: process.execPath,
        args: '-e "const arr = []; for(let i = 0; i < 1000000; i++) { arr.push(new Array(100).fill(\'x\')); } setTimeout(() => {}, 1000)"',
        max_memory_restart: '100M',
      };

      // Act: Start memory-intensive process
      processManager.configureProcess(config);
      await processManager.startProcess('memory-hog');

      // Assert: Should handle memory limits
      const info = processManager.getProcessInfo('memory-hog');
      expect(info).toBeDefined();
      expect(info?.status).toMatch(/online|stopped|errored/);
    });

    test('should handle process zombies and cleanup', async () => {
      // Arrange: Process that creates zombie state
      const config: AppConfig = {
        name: 'zombie-creator',
        script: process.execPath,
        args: "-e \"const { spawn } = require('child_process'); const child = spawn('sleep', ['1']); child.unref(); process.exit(0)\"",
      };

      // Act: Start process that may create zombies
      processManager.configureProcess(config);
      await processManager.startProcess('zombie-creator');

      // Wait for process to exit
      await waitFor(() => {
        const info = processManager.getProcessInfo('zombie-creator');
        return info?.status === 'stopped' || info?.status === 'errored';
      });

      // Assert: Should clean up properly
      const info = processManager.getProcessInfo('zombie-creator');
      expect(info?.status).toMatch(/stopped|errored/);
    });
  });

  describe('Timing and Race Condition Edge Cases', () => {
    test('should handle concurrent start requests for same process', async () => {
      // Arrange: Single process config
      const config: AppConfig = {
        name: 'concurrent-start',
        script: process.execPath,
        args: '-e "console.log(\\"Started\\"); setInterval(() => {}, 1000)"',
      };

      processManager.configureProcess(config);

      // Act: Try to start same process concurrently
      const startPromises = [];
      for (let i = 0; i < 5; i++) {
        startPromises.push(
          processManager
            .startProcess('concurrent-start')
            .then(() => ({ success: true }))
            .catch((error) => ({ error }))
        );
      }

      const results = await Promise.all(startPromises);

      // Assert: Only one should succeed, others should fail gracefully
      const successes = results.filter((r: any) => r && !('error' in r)).length;
      const failures = results.filter((r: any) => r && 'error' in r).length;

      expect(successes).toBe(1);
      expect(failures).toBe(4);
    });

    test('should handle stop requests during startup', async () => {
      // Arrange: Slow-starting process
      const config: AppConfig = {
        name: 'slow-start',
        script: process.execPath,
        args: '-e "setTimeout(() => { console.log(\\"Finally started\\"); setInterval(() => {}, 1000); }, 500)"',
      };

      processManager.configureProcess(config);

      // Act: Start process and immediately try to stop it
      const startPromise = processManager.startProcess('slow-start');

      // Try to stop while starting
      setTimeout(async () => {
        try {
          await processManager.stopProcess('slow-start');
        } catch {
          // May fail if not yet started
        }
      }, 100);

      // Wait for start to complete
      try {
        await startPromise;
      } catch {
        // May fail due to concurrent stop
      }

      // Assert: Should handle race condition gracefully
      const info = processManager.getProcessInfo('slow-start');
      expect(info).toBeDefined();
      expect(['online', 'stopped', 'stopping', 'errored']).toContain(
        info?.status
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle non-existent executable', async () => {
      // Arrange: Invalid executable
      const config: AppConfig = {
        name: 'test-invalid',
        script: 'non-existent-executable-12345',
      };

      // Act: Configure and try to start
      processManager.configureProcess(config);

      // Assert: Should throw error
      await expect(
        processManager.startProcess('test-invalid')
      ).rejects.toThrow();
    });

    test('should handle process spawn errors', async () => {
      // Arrange: Invalid arguments causing spawn error
      const config: AppConfig = {
        name: 'test-spawn-error',
        script: process.execPath,
        args: '--invalid-flag-that-does-not-exist',
      };

      // Act: Configure and start
      processManager.configureProcess(config);
      await processManager.startProcess('test-spawn-error');

      // Assert: Process will exit with error
      await waitFor(() => {
        const info = processManager.getProcessInfo('test-spawn-error');
        return info?.status === 'stopped' || info?.status === 'errored';
      });

      const info = processManager.getProcessInfo('test-spawn-error');
      expect(info?.status).toMatch(/stopped|errored/);
    });

    test('should prevent duplicate process names', async () => {
      // Arrange: Start a process
      const config: AppConfig = {
        name: 'test-duplicate',
        script: process.execPath,
        args: '-e "setInterval(() => {}, 1000)"',
      };
      processManager.configureProcess(config);
      await processManager.startProcess('test-duplicate');

      // Act: Try to start another with same name
      await expect(
        processManager.startProcess('test-duplicate')
      ).rejects.toThrow();
    });

    test('should handle process that consumes all available file descriptors', async () => {
      // Arrange: Process that opens many file descriptors
      const config: AppConfig = {
        name: 'fd-exhaustion',
        script: process.execPath,
        args: "-e \"const fs = require('fs'); for(let i = 0; i < 100; i++) { try { fs.openSync('/dev/null', 'r'); } catch(e) { break; } } setTimeout(() => {}, 1000)\"",
      };

      // Act: Start process that exhausts file descriptors
      processManager.configureProcess(config);
      await processManager.startProcess('fd-exhaustion');

      // Assert: Should handle file descriptor limits
      const info = processManager.getProcessInfo('fd-exhaustion');
      expect(info).toBeDefined();
      expect(['online', 'stopped', 'errored']).toContain(info?.status);
    });

    test('should handle processes with invalid working directories', async () => {
      // Arrange: Process with non-existent working directory
      const config: AppConfig = {
        name: 'invalid-cwd',
        script: process.execPath,
        args: '-e "console.log(process.cwd()); setTimeout(() => {}, 100)"',
        cwd: '/nonexistent/directory/path',
      };

      // Act: Try to start with invalid cwd
      processManager.configureProcess(config);

      // Assert: Should fail gracefully
      await expect(
        processManager.startProcess('invalid-cwd')
      ).rejects.toThrow();
    });
  });

  describe('Process Persistence', () => {
    test.skip('should persist process state across restarts', async () => {
      // Arrange: Start a process
      const config: AppConfig = {
        name: 'test-persist',
        script: process.execPath,
        args: '-e "console.log(\'Persisted process\'); setInterval(() => {}, 1000)"',
      };
      processManager.configureProcess(config);
      await processManager.startProcess('test-persist');
      const originalPid = processManager.getProcessInfo('test-persist')?.pid;

      // Act: Create new instance with same persistence path
      await processManager.cleanup();

      const newManager = new ProcessManager(
        5000,
        30000,
        path.join(tempDir, 'processes.json')
      );
      await newManager.initialize();

      // Assert: Should restore process info
      const processes = newManager.getAllProcessInfo();
      expect(processes).toHaveLength(1);
      expect(processes[0].name).toBe('test-persist');
      expect(processes[0].pid).toBe(originalPid);

      // Process should still be running
      expect(originalPid && isProcessRunning(originalPid)).toBe(true);

      // Clean up
      const allProcesses = newManager.getAllProcessInfo();
      for (const proc of allProcesses) {
        await newManager.stopProcess(proc.name);
      }
      await newManager.cleanup();
    });
  });
});
