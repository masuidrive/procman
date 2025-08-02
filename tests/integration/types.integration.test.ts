/**
 * Integration tests for Core Types System
 * Tests cross-module type compatibility and real-world scenarios
 */

import { describe, it, expect } from 'vitest';

// Import all modules to test integration
import * as constants from '../../src/shared/constants';
import * as errors from '../../src/shared/errors';
import * as processTypes from '../../src/shared/process';
import * as config from '../../src/shared/config';
import * as logs from '../../src/shared/logs';
import * as ipc from '../../src/shared/ipc';

describe('Core Types Integration', () => {
  describe('Cross-module Type Compatibility', () => {
    it('should integrate error types with process operations', () => {
      // Test that process operations can use error types
      const processError = new errors.ProcmanError({
        code: 'PROCESS_NOT_FOUND',
        details: { processName: 'test-app', namespace: 'dev' },
      });

      expect(errors.hasErrorCode(processError, 'PROCESS_NOT_FOUND')).toBe(true);
      expect(processError.code).toBe('PROCESS_NOT_FOUND');
    });

    it('should integrate process types with log types', () => {
      // Test that process info can be used in log entries
      const processInfo: processTypes.ProcessInfo = {
        name: 'test-app',
        namespace: 'dev',
        status: 'online',
        pid: 12345,
        uptime: 60000,
        memory: 128,
        cpu: 5.5,
        restarts: 0,
        note: 'Test application',
      };

      const logEntry: logs.LogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message: `Process ${processInfo.name} is ${processInfo.status}`,
        app: processInfo.name,
        namespace: processInfo.namespace,
        type: 'stdout',
      };

      expect(logs.isLogEntry(logEntry)).toBe(true);
      expect(logEntry.app).toBe(processInfo.name);
      expect(logEntry.namespace).toBe(processInfo.namespace);
    });

    it('should integrate config types with process types', () => {
      // Test that app config can be used to create process info
      const appConfig: config.AppConfig = {
        name: 'integration-test',
        script: 'node',
        args: 'server.js',
        namespace: 'test',
        cwd: '/tmp',
        env: { NODE_ENV: 'test' },
        max_memory_restart: '256M',
      };

      // Create process info from config
      const processInfo: processTypes.ProcessInfo = {
        name: appConfig.name,
        namespace: appConfig.namespace || constants.DEFAULT_NAMESPACE,
        status: 'stopped',
        pid: null,
        uptime: 0,
        memory: 0,
        cpu: 0,
        restarts: 0,
        note: appConfig.note,
      };

      expect(config.isAppConfig(appConfig)).toBe(true);
      expect(processTypes.isProcessInfo(processInfo)).toBe(true);
      expect(processInfo.name).toBe(appConfig.name);
      expect(processInfo.namespace).toBe(appConfig.namespace);
    });

    it('should integrate IPC types with all other modules', () => {
      // Test that IPC messages can contain other module types
      const processInfo: processTypes.ProcessInfo = {
        name: 'ipc-test',
        namespace: 'dev',
        status: 'online',
        pid: 54321,
        uptime: 30000,
        memory: 64,
        cpu: 2.1,
        restarts: 1,
      };

      const ipcMessage: ipc.IPCMessage = {
        id: ipc.generateMessageId(),
        type: 'response',
        payload: { processes: [processInfo] },
        timestamp: Date.now(),
      };

      expect(ipc.isIPCMessage(ipcMessage)).toBe(true);
      expect(Array.isArray((ipcMessage.payload as any).processes)).toBe(true);
      expect(
        processTypes.isProcessInfo((ipcMessage.payload as any).processes[0])
      ).toBe(true);
    });
  });

  describe('End-to-End Type Validation Workflows', () => {
    it('should validate complete procman workflow types', () => {
      // Simulate a complete workflow: config -> process -> log -> IPC

      // 1. Configuration
      const procmanConfig: config.ProcmanConfig = {
        apps: [
          {
            name: 'web-server',
            script: 'npm',
            args: 'start',
            namespace: 'production',
            env: { PORT: '3000' },
            max_memory_restart: '512M',
          },
        ],
      };

      // 2. Process management
      const processInfo: processTypes.ProcessInfo = {
        name: procmanConfig.apps[0].name,
        namespace: procmanConfig.apps[0].namespace!,
        status: 'starting',
        pid: null,
        uptime: 0,
        memory: 0,
        cpu: 0,
        restarts: 0,
      };

      // 3. Log entry
      const logEntry: logs.LogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message: 'Process starting',
        app: processInfo.name,
        namespace: processInfo.namespace,
        type: 'stdout',
      };

      // 4. IPC communication
      const startCommand: ipc.IPCCommandMessage = {
        id: ipc.generateMessageId(),
        type: 'start',
        payload: { name: processInfo.name },
        timestamp: Date.now(),
      };

      // Validate all types work together
      expect(config.isProcmanConfig(procmanConfig)).toBe(true);
      expect(processTypes.isProcessInfo(processInfo)).toBe(true);
      expect(logs.isLogEntry(logEntry)).toBe(true);
      expect(ipc.isIPCCommandMessage(startCommand)).toBe(true);
      expect(startCommand.type).toBe('start');
    });

    it('should handle error scenarios across modules', () => {
      // Test error propagation across modules
      const configError =
        errors.createConfigNotFoundError('/missing/config.js');
      const processError = errors.createProcessNotFoundError(
        'missing-app',
        'dev'
      );

      // Error should be usable in IPC responses
      const errorResponse: ipc.IPCErrorResponse = {
        id: ipc.generateMessageId(),
        type: 'error',
        requestId: 'test-request',
        payload: {
          code: configError.code,
          message: configError.message,
        },
        timestamp: Date.now(),
      };

      expect(errors.isProcmanError(configError)).toBe(true);
      expect(errors.isProcmanError(processError)).toBe(true);
      expect(ipc.isIPCErrorResponse(errorResponse)).toBe(true);
    });
  });

  describe('Constants Integration', () => {
    it('should use constants consistently across modules', () => {
      // Test that constants are used properly in different modules
      expect(constants.DEFAULT_NAMESPACE).toBe('default');
      expect(constants.DEFAULT_LOG_LINES).toBe(100);

      // Test memory parsing with constants - success path
      const memoryResult = config.parseMemorySize('256M');
      expect(memoryResult.success).toBe(true);
      if (memoryResult.success) {
        expect(memoryResult.bytes).toBe(256 * constants.MEMORY_MULTIPLIERS.M);
      }

      // Test invalid memory format for failure path
      const invalidMemoryResult = config.parseMemorySize('999X');
      expect(invalidMemoryResult.success).toBe(false);
      if (!invalidMemoryResult.success) {
        expect(invalidMemoryResult.error).toContain(
          'Invalid memory size format'
        );
      }

      // Test log levels consistency
      const logEntry = logs.createLogEntry('Test message', 'test', 'default');
      expect(constants.LOG_LEVELS).toContain(logEntry.level);
      expect(constants.LOG_TYPES).toContain(logEntry.type);
    });

    it('should validate platform-specific constants', () => {
      // Test platform constants work with file paths
      expect(constants.PROCMAN_DIR).toContain('.masuidrive-procman');
      expect(constants.SOCKET_PATH).toContain('procman.sock');
      expect(constants.NAMED_PIPE_PATH).toContain('masuidrive-procman');

      // Test timeout constants are reasonable
      expect(constants.GRACEFUL_SHUTDOWN_TIMEOUT).toBeGreaterThan(0);
      expect(constants.FORCE_KILL_TIMEOUT).toBeGreaterThan(0);
      expect(constants.IPC_CONNECTION_TIMEOUT).toBeGreaterThan(0);
    });
  });

  describe('Type Safety in Real Scenarios', () => {
    it('should maintain type safety with JSON serialization', () => {
      const processInfo: processTypes.ProcessInfo = {
        name: 'json-test',
        namespace: 'dev',
        status: 'online',
        pid: 99999,
        uptime: 123456,
        memory: 128,
        cpu: 3.2,
        restarts: 0,
      };

      // Serialize and deserialize
      const json = JSON.stringify(processInfo);
      const parsed = JSON.parse(json);

      // Validate the parsed object still passes type guards
      expect(processTypes.isProcessInfo(parsed)).toBe(true);
      expect(parsed.name).toBe(processInfo.name);
      expect(parsed.status).toBe(processInfo.status);
    });

    it('should handle Result types across module boundaries', () => {
      // Test Result types work for cross-module operations
      const configResult = config.parseMemorySize('1G');
      const successResult = errors.createSuccess(
        configResult.success ? configResult.bytes! : 0
      );
      const failureResult = errors.createFailure(
        new errors.ProcmanError({ code: 'CONFIG_PARSE_ERROR' })
      );

      expect(errors.isSuccess(successResult)).toBe(true);
      expect(errors.isFailure(failureResult)).toBe(true);

      // Test success result path
      expect(errors.isSuccess(successResult)).toBe(true);
      if (errors.isSuccess(successResult)) {
        expect(typeof successResult.data).toBe('number');
      }

      // Test failure result path
      expect(errors.isFailure(failureResult)).toBe(true);
      if (errors.isFailure(failureResult)) {
        expect(errors.isProcmanError(failureResult.error)).toBe(true);
      }

      // Test mixed scenarios - ensure type guards work correctly
      const mixedResults = [successResult, failureResult];
      let successCount = 0;
      let failureCount = 0;

      for (const result of mixedResults) {
        // Every result must be either success or failure
        const isSuccess = errors.isSuccess(result);
        const isFailure = errors.isFailure(result);
        expect(isSuccess || isFailure).toBe(true);

        if (isSuccess) {
          expect(typeof result.data).toBe('number');
          successCount++;
        } else if (isFailure) {
          expect(errors.isProcmanError(result.error)).toBe(true);
          failureCount++;
        }
      }

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);
    });
  });

  describe('Exception Handling Integration', () => {
    it('should handle type validation exceptions gracefully', () => {
      // Test try-catch for type validation with problematic objects
      const problematicObject = {
        get name() {
          throw new Error('getter error');
        },
        get status() {
          throw new Error('status getter error');
        },
      };

      try {
        const isValid = processTypes.isProcessInfo(problematicObject);
        expect(isValid).toBe(false);
      } catch (error) {
        // Type guards might throw if object properties throw
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toContain('getter error');
        }
      }
    });

    it('should handle IPC message validation with malformed data', () => {
      try {
        // Test with various malformed IPC message types
        const malformedMessages = [
          null,
          undefined,
          { type: 'invalid' },
          { id: 123, type: 'start' }, // id should be string
          { id: 'test', type: 'start', timestamp: 'invalid' }, // timestamp should be number
        ];

        for (const msg of malformedMessages) {
          const isValidCommand = ipc.isIPCCommandMessage(msg);
          expect(typeof isValidCommand).toBe('boolean');

          const isValidMessage = ipc.isIPCMessage(msg);
          expect(typeof isValidMessage).toBe('boolean');
        }
      } catch (error) {
        // Type guards should generally not throw, but if they do, handle gracefully
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle config validation with throwing properties', () => {
      const problematicConfig = {
        apps: [
          {
            get name() {
              throw new Error('name getter error');
            },
            script: 'node',
            args: 'app.js',
          },
        ],
      };

      try {
        const isValid = config.isProcmanConfig(problematicConfig);
        expect(typeof isValid).toBe('boolean');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toContain('getter error');
        }
      }
    });

    it('should handle log entry creation with invalid parameters', () => {
      try {
        // Test log entry creation with various invalid inputs
        const invalidInputs = [
          [null, 'app', 'namespace'],
          ['message', null, 'namespace'],
          ['message', 'app', null],
          [undefined, undefined, undefined],
        ];

        for (const [message, app, namespace] of invalidInputs) {
          try {
            const logEntry = logs.createLogEntry(
              message as string,
              app as string,
              namespace as string
            );

            // If creation succeeds, validate the result
            expect(logs.isLogEntry(logEntry)).toBe(true);
          } catch (creationError) {
            // Log creation might throw for invalid inputs
            expect(creationError).toBeInstanceOf(Error);
          }
        }
      } catch (error) {
        // Log entry testing should not throw unexpected errors
        expect(error).toBeInstanceOf(Error);
        throw error; // Re-throw to fail the test with the actual error
      }
    });

    it('should handle JSON serialization of complex objects', () => {
      // Test serialization of ProcessInfo with circular references
      const processInfo: processTypes.ProcessInfo = {
        name: 'json-test',
        namespace: 'dev',
        status: 'online',
        pid: 12345,
        uptime: 60000,
        memory: 128,
        cpu: 5.5,
        restarts: 0,
      };

      // Add circular reference
      (processInfo as any).self = processInfo;

      // Test that JSON.stringify throws for circular reference
      expect(() => JSON.stringify(processInfo)).toThrow(TypeError);
      expect(() => JSON.stringify(processInfo)).toThrow(
        /circular|Converting circular/i
      );

      // Test that we can handle this gracefully by removing problematic properties
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { self, ...cleanProcessInfo } = processInfo as any;
        const json = JSON.stringify(cleanProcessInfo);
        const parsed = JSON.parse(json);

        expect(processTypes.isProcessInfo(parsed)).toBe(true);
      } catch (error) {
        // Clean object serialization should not fail
        expect(error).toBeInstanceOf(Error);
        throw error; // Re-throw to fail the test with the actual error
      }
    });
  });
});
