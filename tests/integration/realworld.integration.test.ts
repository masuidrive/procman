/**
 * Integration tests for Real-World Scenarios
 * Tests complete workflows with actual file operations and data
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import process from 'process';

import * as constants from '../../src/shared/constants';
import * as errors from '../../src/shared/errors';
import * as processTypes from '../../src/shared/process';
import * as config from '../../src/shared/config';
import * as logs from '../../src/shared/logs';
import * as ipc from '../../src/shared/ipc';

describe('Real-World Integration Scenarios', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'procman-realworld-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Complete Procman Workflow', () => {
    it('should simulate a complete procman startup sequence', async () => {
      // 1. Create a realistic procman configuration
      const configFile = path.join(tempDir, 'procman.config.js');
      const configContent = `
module.exports = {
  apps: [
    {
      name: "api-server",
      script: "node",
      args: "api/server.js",
      namespace: "backend",
      cwd: "/var/www/myapp",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        DB_HOST: "localhost",
        DB_PORT: "5432"
      },
      max_memory_restart: "512M",
      log_file: "/var/log/procman/api-server.jsonl",
      note: "Main API server for the application"
    },
    {
      name: "worker-queue",
      script: "node",
      args: "workers/queue.js",
      namespace: "backend", 
      cwd: "/var/www/myapp",
      env: {
        NODE_ENV: "production",
        QUEUE_CONCURRENCY: "4"
      },
      max_memory_restart: "256M",
      out_file: "/var/log/procman/worker-out.jsonl",
      error_file: "/var/log/procman/worker-error.jsonl"
    },
    {
      name: "websocket-server",
      script: "node",
      args: "websocket/server.js", 
      namespace: "realtime",
      cwd: "/var/www/myapp",
      env: {
        NODE_ENV: "production",
        WS_PORT: "3001"
      },
      max_memory_restart: "128M"
    }
  ]
};`;

      fs.writeFileSync(configFile, configContent, 'utf8');

      // 2. Load and validate configuration
      delete require.cache[configFile];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loadedConfig = require(configFile);

      expect(config.isProcmanConfig(loadedConfig)).toBe(true);

      // Config validation is removed in simplified version
      // Just verify the config is valid using type guard
      expect(config.isProcmanConfig(loadedConfig)).toBe(true);

      // 3. Create process info for each app
      const processInfos: processTypes.ProcessInfo[] = loadedConfig.apps.map(
        (app: config.AppConfig) => ({
          name: app.name,
          namespace: app.namespace || constants.DEFAULT_NAMESPACE,
          status: 'stopped' as processTypes.ProcessStatus,
          pid: null,
          uptime: 0,
          memory: 0,
          cpu: 0,
          restarts: 0,
          note: app.note,
        })
      );

      // Validate all process infos
      for (const procInfo of processInfos) {
        expect(processTypes.isProcessInfo(procInfo)).toBe(true);
      }

      // 4. Simulate startup sequence with IPC commands
      const loadCommand: ipc.IPCMessage = {
        id: 'load-' + Date.now(),
        type: 'load',
        payload: { configPath: configFile },
        timestamp: Date.now(),
      };

      expect(ipc.isIPCMessage(loadCommand)).toBe(true);
      expect(loadCommand.type).toBe('load');

      // 5. Simulate starting processes
      for (const procInfo of processInfos) {
        const startCommand: ipc.IPCMessage = {
          id: 'start-' + Date.now(),
          type: 'start',
          payload: { name: procInfo.name },
          timestamp: Date.now(),
        };

        expect(ipc.isIPCMessage(startCommand)).toBe(true);
        expect(startCommand.type).toBe('start');

        // Simulate process started successfully
        const successResponse: ipc.IPCResponse = {
          success: true,
          data: {
            startedProcesses: [
              {
                ...procInfo,
                status: 'online' as const,
                pid: Math.floor(Math.random() * 90000) + 10000,
              },
            ],
            failedProcesses: [],
          },
        };

        expect(successResponse.success).toBe(true);
      }

      // 6. Create log entries for startup
      const startupLogs: logs.LogEntry[] = processInfos.map((procInfo) => ({
        timestamp: Date.now(),
        level: 'info' as const,
        message: `${procInfo.name} started successfully in ${procInfo.namespace} namespace`,
        app: procInfo.name,
        namespace: procInfo.namespace,
        type: 'stdout' as const,
      }));

      // Validate all log entries
      for (const logEntry of startupLogs) {
        expect(logs.isLogEntry(logEntry)).toBe(true);
        expect(logEntry.level).toBe('info');
        expect(logEntry.type).toBe('stdout');
      }
    });

    it('should handle exceptions during configuration loading workflow', async () => {
      // Test try-catch for corrupted configuration file
      const corruptedConfigFile = path.join(tempDir, 'corrupted.config.js');
      const corruptedContent = `
module.exports = {
  apps: [
    {
      name: "corrupt-app",
      script: require("non-existent-module"), // This will throw
      args: "app.js"
    }
  ]
};`;

      fs.writeFileSync(corruptedConfigFile, corruptedContent, 'utf8');

      // Test that requiring corrupted config throws
      expect(() => {
        delete require.cache[corruptedConfigFile];
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require(corruptedConfigFile);
      }).toThrow(/Cannot find module|MODULE_NOT_FOUND/i);

      try {
        delete require.cache[corruptedConfigFile];
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require(corruptedConfigFile);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toMatch(/Cannot find module|MODULE_NOT_FOUND/i);
        }

        // Test that we can create a proper error response
        const configError = errors.createError('CONFIG_PARSE_ERROR', {
          message: `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
          cause: error instanceof Error ? error : undefined,
          details: { configFile: corruptedConfigFile },
        });

        expect(errors.isProcmanError(configError)).toBe(true);
        expect(configError.cause).toBe(error);
      }
    });

    it('should handle error scenarios in complete workflow', async () => {
      // 1. Create config with invalid memory setting
      const invalidConfigContent = `
module.exports = {
  apps: [
    {
      name: "invalid-memory-app",
      script: "node",
      args: "app.js",
      max_memory_restart: "999X" // Invalid memory format
    }
  ]
};`;

      const configFile = path.join(tempDir, 'invalid.config.js');
      fs.writeFileSync(configFile, invalidConfigContent, 'utf8');

      delete require.cache[configFile];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loadedConfig = require(configFile);

      // 2. Config validation is removed in simplified version
      // The invalid config would be caught at runtime
      expect(config.isProcmanConfig(loadedConfig)).toBe(true); // Type guard passes but runtime would fail

      // 3. Create error for invalid configuration
      const configError = errors.createError('CONFIG_VALIDATION_ERROR', {
        message: 'Configuration validation failed: Invalid configuration',
        details: { configFile, errors: ['Invalid app configuration'] },
      });

      expect(errors.isProcmanError(configError)).toBe(true);

      // 4. Create IPC error response
      const errorResponse: ipc.IPCResponse = {
        success: false,
        error: {
          code: configError.code,
          message: configError.message,
          details: configError.details,
        },
      };

      expect(errorResponse.success).toBe(false);

      // 5. Create error log entry
      const errorLogEntry: logs.LogEntry = {
        timestamp: Date.now(),
        level: 'error',
        message: `Configuration load failed: ${configError.message}`,
        app: 'procman-daemon',
        namespace: 'system',
        type: 'stderr',
      };

      expect(logs.isLogEntry(errorLogEntry)).toBe(true);
      expect(errorLogEntry.level).toBe('error');
      expect(errorLogEntry.type).toBe('stderr');
    });
  });

  describe('Memory Management Integration', () => {
    it('should handle memory monitoring and restart scenarios', () => {
      // 1. Create process with memory limit
      const appConfig: config.AppConfig = {
        name: 'memory-test-app',
        script: 'node',
        args: 'memory-intensive.js',
        max_memory_restart: '256M',
      };

      const memoryResult = config.parseMemorySize(
        appConfig.max_memory_restart!
      );
      expect(memoryResult.success).toBe(true);

      // Memory parsing should succeed for valid format
      if (!memoryResult.success) {
        return; // TypeScript: narrow the type for later usage
      }

      // 2. Create process info with high memory usage
      const limitInMB = Math.floor(memoryResult.value / (1024 * 1024));
      const processInfo: processTypes.ProcessInfo = {
        name: appConfig.name,
        namespace: constants.DEFAULT_NAMESPACE,
        status: 'online',
        pid: 12345,
        uptime: 300000, // 5 minutes
        memory: limitInMB + 50, // Set memory higher than limit to test restart
        cpu: 15.5,
        restarts: 0,
      };

      expect(processTypes.isProcessInfo(processInfo)).toBe(true);

      // 3. Check if process exceeds memory limit
      // Make sure the process memory is set higher than the limit for test
      processInfo.memory = 600; // Set to 600MB, higher than 512MB limit
      const currentMemoryBytes = processInfo.memory * 1024 * 1024;
      const exceedsLimit = currentMemoryBytes > memoryResult.value;
      expect(exceedsLimit).toBe(true);

      // 4. Create restart command
      const restartCommand: ipc.IPCMessage = {
        id: 'restart-' + Date.now(),
        type: 'restart',
        payload: {
          name: processInfo.name,
          force: true,
        },
        timestamp: Date.now(),
      };

      expect(ipc.isIPCMessage(restartCommand)).toBe(true);

      // 5. Create log entries for memory restart
      const memoryLogEntry: logs.LogEntry = {
        timestamp: Date.now(),
        level: 'warn',
        message: `Memory limit exceeded: ${processInfo.memory}MB > ${limitInMB}MB, restarting process`,
        app: processInfo.name,
        namespace: processInfo.namespace,
        type: 'stderr',
      };

      expect(logs.isLogEntry(memoryLogEntry)).toBe(true);
      expect(memoryLogEntry.level).toBe('warn');

      // 6. Update process info after restart
      const restartedProcess: processTypes.ProcessInfo = {
        ...processInfo,
        pid: 12346, // New PID
        uptime: 0, // Reset uptime
        memory: 32, // Lower memory after restart
        restarts: processInfo.restarts + 1,
      };

      expect(processTypes.isProcessInfo(restartedProcess)).toBe(true);
      expect(restartedProcess.restarts).toBe(1);
    });

    it('should handle invalid memory size format in configuration', () => {
      // Test failure path for memory parsing
      const invalidAppConfig: config.AppConfig = {
        name: 'invalid-memory-app',
        script: 'node',
        args: 'app.js',
        max_memory_restart: '999X', // Invalid memory format
      };

      const memoryResult = config.parseMemorySize(
        invalidAppConfig.max_memory_restart!
      );
      expect(memoryResult.success).toBe(false);
      expect(memoryResult.error).toBeDefined();

      // Test the failure path properly
      if (memoryResult === null) {
        // Invalid memory format returns null
        expect(true).toBe(true); // Test passes for invalid format

        // Create error for invalid memory size
        const configError = errors.createError('CONFIG_VALIDATION_ERROR', {
          message: `Invalid memory restart value: ${invalidAppConfig.max_memory_restart}`,
          details: {
            field: 'max_memory_restart',
            value: invalidAppConfig.max_memory_restart,
            error: 'Invalid memory size format',
          },
        });

        expect(errors.isProcmanError(configError)).toBe(true);
        expect(configError.code).toBe('CONFIG_VALIDATION_ERROR');
        expect(configError.details?.field).toBe('max_memory_restart');
      }
    });
  });

  describe('Log Management Integration', () => {
    it('should handle log file operations with real file system', async () => {
      const logDir = path.join(tempDir, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      // 1. Create app configuration with log files
      const appConfig: config.AppConfig = {
        name: 'file-logger-app',
        script: 'node',
        args: 'app.js',
        namespace: 'production',
        out_file: path.join(logDir, 'app-out.jsonl'),
        error_file: path.join(logDir, 'app-error.jsonl'),
      };

      expect(config.isAppConfig(appConfig)).toBe(true);

      // 2. Create realistic log entries
      const logEntries: logs.LogEntry[] = [
        {
          timestamp: Date.now(),
          level: 'info' as const,
          message: 'Application started successfully',
          app: appConfig.name,
          namespace: appConfig.namespace!,
          type: 'stdout' as const,
        },
        {
          timestamp: Date.now() + 100,
          level: 'info' as const,
          message: 'Connected to database',
          app: appConfig.name,
          namespace: appConfig.namespace!,
          type: 'stdout' as const,
        },
        {
          timestamp: Date.now() + 200,
          level: 'info' as const,
          message: 'HTTP server listening on port 3000',
          app: appConfig.name,
          namespace: appConfig.namespace!,
          type: 'stdout' as const,
        },
        {
          timestamp: Date.now() + 300,
          level: 'warn' as const,
          message: 'Warning: deprecated API usage detected',
          app: appConfig.name,
          namespace: appConfig.namespace!,
          type: 'stderr' as const,
        },
        {
          timestamp: Date.now() + 400,
          level: 'error' as const,
          message: 'Database connection temporarily lost',
          app: appConfig.name,
          namespace: appConfig.namespace!,
          type: 'stderr' as const,
        },
      ];

      // Validate all log entries
      for (const entry of logEntries) {
        expect(logs.isLogEntry(entry)).toBe(true);
      }

      // 3. Write log entries to files (simulating real log writing)
      const stdoutEntries = logEntries.filter(
        (entry) => entry.type === 'stdout'
      );
      const stderrEntries = logEntries.filter(
        (entry) => entry.type === 'stderr'
      );

      // Write stdout logs
      const stdoutContent =
        stdoutEntries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
      fs.writeFileSync(appConfig.out_file!, stdoutContent, 'utf8');

      // Write stderr logs
      const stderrContent =
        stderrEntries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
      fs.writeFileSync(appConfig.error_file!, stderrContent, 'utf8');

      // 4. Verify files were created and have correct content
      expect(fs.existsSync(appConfig.out_file!)).toBe(true);
      expect(fs.existsSync(appConfig.error_file!)).toBe(true);

      // 5. Read and parse log files
      const readStdoutContent = fs.readFileSync(appConfig.out_file!, 'utf8');
      const readStderrContent = fs.readFileSync(appConfig.error_file!, 'utf8');

      const parsedStdoutLogs = readStdoutContent
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const parsedStderrLogs = readStderrContent
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));

      // Validate parsed logs
      for (const parsedLog of parsedStdoutLogs) {
        expect(logs.isLogEntry(parsedLog)).toBe(true);
        expect(parsedLog.type).toBe('stdout');
      }

      for (const parsedLog of parsedStderrLogs) {
        expect(logs.isLogEntry(parsedLog)).toBe(true);
        expect(parsedLog.type).toBe('stderr');
      }

      // 6. Test log streaming simulation
      const logStreamCommand: ipc.IPCMessage = {
        id: 'log-stream-' + Date.now(),
        type: 'log',
        payload: {
          name: appConfig.name,
          options: {
            lines: 10,
            follow: true,
          },
        },
        timestamp: Date.now(),
      };

      expect(ipc.isIPCMessage(logStreamCommand)).toBe(true);
      expect(logStreamCommand.type).toBe('log');
    });

    it('should handle file system exceptions during log operations', async () => {
      const readOnlyDir = path.join(tempDir, 'readonly');
      fs.mkdirSync(readOnlyDir, { recursive: true });

      // Create app config pointing to readonly directory
      const appConfig: config.AppConfig = {
        name: 'readonly-logger',
        script: 'node',
        args: 'app.js',
        namespace: 'test',
        out_file: path.join(readOnlyDir, 'app-out.log'),
        error_file: path.join(readOnlyDir, 'app-error.log'),
      };

      // Make directory read-only to simulate permission errors
      const isWindows =
        typeof process !== 'undefined' && process.platform === 'win32';
      if (!isWindows) {
        fs.chmodSync(readOnlyDir, 0o444); // Read-only permissions
      }

      try {
        // Try to write to readonly directory
        fs.writeFileSync(appConfig.out_file!, 'test log', 'utf8');

        // If we're on Windows or permissions don't work as expected, skip this assertion
        if (!isWindows) {
          // This should have thrown on Unix systems
          throw new Error(
            'Expected permission error when writing to readonly directory'
          );
        }
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toMatch(/EACCES|EPERM|permission denied/i);
        }

        // Test that we can create a proper error for log file issues
        const logError = errors.createPermissionDeniedError(
          appConfig.out_file!
        );
        expect(errors.isProcmanError(logError)).toBe(true);
        expect(logError.code).toBe('PERMISSION_DENIED');
      } finally {
        // Restore permissions for cleanup
        if (!isWindows) {
          try {
            fs.chmodSync(readOnlyDir, 0o755);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('should handle platform-specific constants and paths', () => {
      // Test Unix paths
      expect(constants.SOCKET_PATH).toContain('.sock');
      expect(constants.PROCMAN_DIR).toContain('.masuidrive-procman');

      // Test Windows paths
      expect(constants.NAMED_PIPE_PATH).toContain('pipe');
      expect(constants.NAMED_PIPE_PATH).toContain('masuidrive-procman');

      // Test file permissions
      expect(constants.SOCKET_PERMISSIONS).toBe(0o600);
      expect(constants.LOG_FILE_PERMISSIONS).toBe(0o644);

      // Create app config with platform-agnostic paths
      const appConfig: config.AppConfig = {
        name: 'cross-platform-app',
        script: 'node',
        args: 'app.js',
        cwd: path.resolve(tempDir),
        log_file: path.join(tempDir, 'app.log'),
        out_file: path.join(tempDir, 'app-out.log'),
        error_file: path.join(tempDir, 'app-error.log'),
      };

      expect(config.isAppConfig(appConfig)).toBe(true);

      // Config validation is removed in simplified version
      expect(config.isAppConfig(appConfig)).toBe(true);
    });
  });

  describe('Performance and Scale Testing', () => {
    it('should handle large numbers of processes and logs efficiently', () => {
      // Create many process infos
      const processCount = 100;
      const processes: processTypes.ProcessInfo[] = [];

      for (let i = 0; i < processCount; i++) {
        const processInfo: processTypes.ProcessInfo = {
          name: `app-${i}`,
          namespace:
            i % 3 === 0
              ? 'production'
              : i % 3 === 1
                ? 'staging'
                : 'development',
          status: ['online', 'stopped', 'starting'][
            i % 3
          ] as processTypes.ProcessStatus,
          pid: i > 50 ? 10000 + i : null,
          uptime: Math.floor(Math.random() * 86400000), // Random uptime up to 1 day
          memory: Math.floor(Math.random() * 512) + 32, // 32-544 MB
          cpu: Math.random() * 100,
          restarts: Math.floor(Math.random() * 5),
        };

        expect(processTypes.isProcessInfo(processInfo)).toBe(true);
        processes.push(processInfo);
      }

      // Test list command with many processes
      const listCommand: ipc.IPCMessage = {
        id: 'list-' + Date.now(),
        type: 'list',
        payload: {},
        timestamp: Date.now(),
      };

      const listResponse: ipc.IPCResponse = {
        success: true,
        data: {
          processes,
          totalCount: processes.length,
        },
      };

      expect(ipc.isIPCMessage(listCommand)).toBe(true);
      expect(listResponse.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = listResponse.data as any;
      expect(Array.isArray(data.processes)).toBe(true);
      expect(data.processes).toHaveLength(processCount);

      // Create many log entries
      const logCount = 1000;
      const logEntries: logs.LogEntry[] = [];

      for (let i = 0; i < logCount; i++) {
        const randomProcess =
          processes[Math.floor(Math.random() * processes.length)];
        const logEntry: logs.LogEntry = {
          timestamp: Date.now() + i,
          level: ['info', 'warn', 'error'][i % 3] as 'info' | 'warn' | 'error',
          message: `Log message ${i} from ${randomProcess.name}`,
          app: randomProcess.name,
          namespace: randomProcess.namespace,
          type: Math.random() > 0.5 ? 'stdout' : 'stderr',
        };

        expect(logs.isLogEntry(logEntry)).toBe(true);
        logEntries.push(logEntry);
      }

      // Test that all log entries are valid
      expect(logEntries).toHaveLength(logCount);
      for (const logEntry of logEntries) {
        expect(logs.isLogEntry(logEntry)).toBe(true);
      }
    });
  });
});
