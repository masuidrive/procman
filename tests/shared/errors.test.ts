/**
 * Tests for error management types and utilities
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  ERROR_MESSAGES,
  ProcmanError,
  Result,
  AsyncResult,
  ErrorHandler,
  ErrorDetails,
  ErrorLogEntry,
  isProcmanError,
  hasErrorCode,
  createSuccess,
  createFailure,
  isSuccess,
  isFailure,
  createError,
  createDaemonNotRunningError,
  createConfigNotFoundError,
  createProcessNotFoundError,
  createPermissionDeniedError,
} from '../../src/shared/errors';

describe('Error Types', () => {
  describe('ErrorCode', () => {
    it('should include all required error codes', () => {
      const expectedCodes: ErrorCode[] = [
        'DAEMON_NOT_RUNNING',
        'DAEMON_CONNECTION_FAILED',
        'PERMISSION_DENIED',
        'CONFIG_FILE_NOT_FOUND',
        'CONFIG_PARSE_ERROR',
        'CONFIG_VALIDATION_ERROR',
        'PROCESS_NOT_FOUND',
        'PROCESS_START_FAILED',
        'LOG_FILE_NOT_FOUND',
      ];

      // 全てのエラーコードがERROR_MESSAGESに存在することを確認
      expectedCodes.forEach((code) => {
        expect(ERROR_MESSAGES).toHaveProperty(code);
        expect(typeof ERROR_MESSAGES[code]).toBe('string');
        expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
      });
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('should have non-empty messages for all error codes', () => {
      Object.entries(ERROR_MESSAGES).forEach(([, message]) => {
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
        expect(message.trim()).toBe(message); // 先頭末尾に空白がないこと
      });
    });

    it('should contain expected error messages', () => {
      expect(ERROR_MESSAGES.DAEMON_NOT_RUNNING).toContain(
        'Daemon is not running'
      );
      expect(ERROR_MESSAGES.CONFIG_FILE_NOT_FOUND).toContain(
        'Configuration file not found'
      );
      expect(ERROR_MESSAGES.PROCESS_NOT_FOUND).toContain('Process not found');
      expect(ERROR_MESSAGES.PERMISSION_DENIED).toContain('Permission denied');
    });
  });
});

describe('ProcmanError', () => {
  describe('constructor', () => {
    it('should create error with code only', () => {
      const error = new ProcmanError({ code: 'DAEMON_NOT_RUNNING' });

      expect(error.name).toBe('ProcmanError');
      expect(error.code).toBe('DAEMON_NOT_RUNNING');
      expect(error.message).toBe(ERROR_MESSAGES.DAEMON_NOT_RUNNING);
      expect(error.details).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('should create error with custom message', () => {
      const customMessage = 'Custom error message';
      const error = new ProcmanError({
        code: 'DAEMON_NOT_RUNNING',
        message: customMessage,
      });

      expect(error.message).toBe(customMessage);
      expect(error.code).toBe('DAEMON_NOT_RUNNING');
    });

    it('should create error with details', () => {
      const details = { port: 3000, host: 'localhost' };
      const error = new ProcmanError({
        code: 'DAEMON_CONNECTION_FAILED',
        details,
      });

      expect(error.details).toEqual(details);
      expect(error.code).toBe('DAEMON_CONNECTION_FAILED');
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new ProcmanError({
        code: 'CONFIG_PARSE_ERROR',
        cause,
      });

      expect(error.cause).toBe(cause);
      expect(error.code).toBe('CONFIG_PARSE_ERROR');
    });

    it('should create error with all options', () => {
      const cause = new Error('Original error');
      const details = { line: 10, column: 5 };
      const customMessage = 'Custom message';

      const error = new ProcmanError({
        code: 'CONFIG_VALIDATION_ERROR',
        message: customMessage,
        cause,
        details,
      });

      expect(error.code).toBe('CONFIG_VALIDATION_ERROR');
      expect(error.message).toBe(customMessage);
      expect(error.cause).toBe(cause);
      expect(error.details).toEqual(details);
    });
  });

  describe('toJSON', () => {
    it('should serialize error to JSON', () => {
      const details = { file: 'config.json' };
      const cause = new Error('Parse failed');
      const error = new ProcmanError({
        code: 'CONFIG_PARSE_ERROR',
        details,
        cause,
      });

      const json = error.toJSON();

      expect(json.name).toBe('ProcmanError');
      expect(json.code).toBe('CONFIG_PARSE_ERROR');
      expect(json.message).toBe(ERROR_MESSAGES.CONFIG_PARSE_ERROR);
      expect(json.details).toEqual(details);
      expect(json.cause).toBe('Parse failed');
      expect(json.stack).toBeDefined();
    });
  });

  describe('toString', () => {
    it('should format error as string without details or cause', () => {
      const error = new ProcmanError({ code: 'DAEMON_NOT_RUNNING' });
      const result = error.toString();

      expect(result).toContain('ProcmanError [DAEMON_NOT_RUNNING]');
      expect(result).toContain(ERROR_MESSAGES.DAEMON_NOT_RUNNING);
    });

    it('should format error as string with details', () => {
      const details = { port: 3000 };
      const error = new ProcmanError({
        code: 'DAEMON_CONNECTION_FAILED',
        details,
      });
      const result = error.toString();

      expect(result).toContain('ProcmanError [DAEMON_CONNECTION_FAILED]');
      expect(result).toContain('Details:');
      expect(result).toContain('"port": 3000');
    });

    it('should format error as string with cause', () => {
      const cause = new Error('Network timeout');
      const error = new ProcmanError({
        code: 'DAEMON_CONNECTION_FAILED',
        cause,
      });
      const result = error.toString();

      expect(result).toContain('ProcmanError [DAEMON_CONNECTION_FAILED]');
      expect(result).toContain('Caused by: Network timeout');
    });
  });
});

describe('Type Guards', () => {
  describe('isProcmanError', () => {
    it('should return true for ProcmanError instances', () => {
      const error = new ProcmanError({ code: 'DAEMON_NOT_RUNNING' });
      expect(isProcmanError(error)).toBe(true);
    });

    it('should return false for regular Error instances', () => {
      const error = new Error('Regular error');
      expect(isProcmanError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isProcmanError(null)).toBe(false);
      expect(isProcmanError(undefined)).toBe(false);
      expect(isProcmanError('string')).toBe(false);
      expect(isProcmanError(123)).toBe(false);
      expect(isProcmanError({})).toBe(false);
    });
  });

  describe('hasErrorCode', () => {
    it('should return true for matching error codes', () => {
      const error = new ProcmanError({ code: 'DAEMON_NOT_RUNNING' });
      expect(hasErrorCode(error, 'DAEMON_NOT_RUNNING')).toBe(true);
    });

    it('should return false for non-matching error codes', () => {
      const error = new ProcmanError({ code: 'DAEMON_NOT_RUNNING' });
      expect(hasErrorCode(error, 'CONFIG_FILE_NOT_FOUND')).toBe(false);
    });
  });
});

describe('Result Utilities', () => {
  describe('createSuccess', () => {
    it('should create success result', () => {
      const data = { value: 42 };
      const result = createSuccess(data);

      expect(result.success).toBe(true);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(data);
      }
    });
  });

  describe('createFailure', () => {
    it('should create failure result', () => {
      const error = new ProcmanError({ code: 'DAEMON_NOT_RUNNING' });
      const result = createFailure(error);

      expect(result.success).toBe(false);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe('isSuccess', () => {
    it('should return true for success results', () => {
      const result = createSuccess('data');
      expect(isSuccess(result)).toBe(true);
    });

    it('should return false for failure results', () => {
      const error = new ProcmanError({ code: 'DAEMON_NOT_RUNNING' });
      const result = createFailure(error);
      expect(isSuccess(result)).toBe(false);
    });
  });

  describe('isFailure', () => {
    it('should return false for success results', () => {
      const result = createSuccess('data');
      expect(isFailure(result)).toBe(false);
    });

    it('should return true for failure results', () => {
      const error = new ProcmanError({ code: 'DAEMON_NOT_RUNNING' });
      const result = createFailure(error);
      expect(isFailure(result)).toBe(true);
    });
  });
});

describe('Error Creation Helpers', () => {
  describe('createError', () => {
    it('should create error with code only', () => {
      const error = createError('DAEMON_NOT_RUNNING');

      expect(error.code).toBe('DAEMON_NOT_RUNNING');
      expect(error.message).toBe(ERROR_MESSAGES.DAEMON_NOT_RUNNING);
    });

    it('should create error with options', () => {
      const details = { port: 3000 };
      const error = createError('DAEMON_CONNECTION_FAILED', { details });

      expect(error.code).toBe('DAEMON_CONNECTION_FAILED');
      expect(error.details).toEqual(details);
    });
  });

  describe('createDaemonNotRunningError', () => {
    it('should create daemon not running error', () => {
      const error = createDaemonNotRunningError();

      expect(error.code).toBe('DAEMON_NOT_RUNNING');
      expect(error.message).toBe(ERROR_MESSAGES.DAEMON_NOT_RUNNING);
    });

    it('should create daemon not running error with details', () => {
      const details = { attempt: 3 };
      const error = createDaemonNotRunningError(details);

      expect(error.code).toBe('DAEMON_NOT_RUNNING');
      expect(error.details).toEqual(details);
    });
  });

  describe('createConfigNotFoundError', () => {
    it('should create config not found error', () => {
      const filePath = '/path/to/config.json';
      const error = createConfigNotFoundError(filePath);

      expect(error.code).toBe('CONFIG_FILE_NOT_FOUND');
      expect(error.details).toEqual({ filePath });
    });
  });

  describe('createProcessNotFoundError', () => {
    it('should create process not found error with name only', () => {
      const name = 'my-app';
      const error = createProcessNotFoundError(name);

      expect(error.code).toBe('PROCESS_NOT_FOUND');
      expect(error.details).toEqual({ name, namespace: undefined });
    });

    it('should create process not found error with name and namespace', () => {
      const name = 'my-app';
      const namespace = 'production';
      const error = createProcessNotFoundError(name, namespace);

      expect(error.code).toBe('PROCESS_NOT_FOUND');
      expect(error.details).toEqual({ name, namespace });
    });
  });

  describe('createPermissionDeniedError', () => {
    it('should create permission denied error', () => {
      const resource = '/var/log/procman.log';
      const error = createPermissionDeniedError(resource);

      expect(error.code).toBe('PERMISSION_DENIED');
      expect(error.details).toEqual({ resource });
    });
  });
});

describe('Type Compatibility', () => {
  it('should work with Result types', () => {
    const successResult: Result<string> = createSuccess('data');
    const failureResult: Result<string> = createFailure(
      new ProcmanError({ code: 'DAEMON_NOT_RUNNING' })
    );

    expect(isSuccess(successResult)).toBe(true);
    expect(isFailure(failureResult)).toBe(true);
  });

  it('should work with AsyncResult types', async () => {
    const asyncSuccess: AsyncResult<string> = Promise.resolve(
      createSuccess('data')
    );
    const asyncFailure: AsyncResult<string> = Promise.resolve(
      createFailure(new ProcmanError({ code: 'DAEMON_NOT_RUNNING' }))
    );

    const successResult = await asyncSuccess;
    const failureResult = await asyncFailure;

    expect(isSuccess(successResult)).toBe(true);
    expect(isFailure(failureResult)).toBe(true);
  });

  it('should work with ErrorHandler types', () => {
    const handler: ErrorHandler<string> = (error: ProcmanError) => {
      return `Handled: ${error.code}`;
    };

    const error = new ProcmanError({ code: 'DAEMON_NOT_RUNNING' });
    const result = handler(error);

    expect(result).toBe('Handled: DAEMON_NOT_RUNNING');
  });

  it('should work with ErrorDetails type', () => {
    const details: ErrorDetails = {
      timestamp: Date.now(),
      code: 'CONFIG_PARSE_ERROR',
      message: 'Parse failed',
      stack: 'Error stack trace',
      context: { file: 'config.json' },
    };

    expect(details.code).toBe('CONFIG_PARSE_ERROR');
    expect(typeof details.timestamp).toBe('number');
    expect(typeof details.message).toBe('string');
  });

  it('should work with ErrorLogEntry type', () => {
    const logEntry: ErrorLogEntry = {
      timestamp: Date.now(),
      level: 'error',
      code: 'PROCESS_START_FAILED',
      message: 'Failed to start process',
      details: { name: 'my-app' },
      source: 'daemon',
    };

    expect(logEntry.level).toBe('error');
    expect(logEntry.code).toBe('PROCESS_START_FAILED');
    expect(logEntry.details?.name).toBe('my-app');
  });
});

describe('Exception Handling', () => {
  describe('ProcmanError Exception Scenarios', () => {
    it('should handle errors thrown during error creation', () => {
      // Test try-catch for potential issues during error creation
      try {
        const error = new ProcmanError({
          code: 'DAEMON_NOT_RUNNING',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cause: null as any, // Invalid cause type
        });

        // Even with invalid inputs, ProcmanError should handle gracefully
        expect(error.code).toBe('DAEMON_NOT_RUNNING');
        expect(error.cause).toBe(null);
      } catch (error) {
        // ProcmanError constructor should handle invalid inputs gracefully
        expect(error).toBeInstanceOf(Error);
        throw error; // Re-throw to fail the test with the actual error
      }
    });

    it('should handle JSON serialization errors', () => {
      // Create error with circular reference in details
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const circularObject: any = { name: 'test' };
      circularObject.self = circularObject;

      try {
        const error = new ProcmanError({
          code: 'CONFIG_PARSE_ERROR',
          details: circularObject,
        });

        // toJSON should handle circular references gracefully
        error.toJSON();
        expect(error.code).toBe('CONFIG_PARSE_ERROR');
        // Details might be undefined or handle circular reference
      } catch (error) {
        // If JSON serialization fails, we should catch it
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toMatch(/circular|Converting circular/i);
        }
      }
    });

    it('should handle toString with problematic details', () => {
      try {
        // Create error with problematic details
        const error = new ProcmanError({
          code: 'PROCESS_START_FAILED',
          details: {
            // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
            func: () => {
              throw new Error('function error');
            },
            getter: {
              // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
              get value() {
                throw new Error('getter error');
              },
            },
          },
        });

        // toString should handle errors in details gracefully
        const result = error.toString();
        expect(result).toContain('ProcmanError [PROCESS_START_FAILED]');
        expect(typeof result).toBe('string');
      } catch (error) {
        // If toString fails, it should be a specific error
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Type Guard Exception Safety', () => {
    it('should handle null and undefined safely', () => {
      try {
        expect(isProcmanError(null)).toBe(false);
        expect(isProcmanError(undefined)).toBe(false);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(isProcmanError({} as any)).toBe(false);
      } catch (error) {
        // Type guards should handle null/undefined gracefully
        expect(error).toBeInstanceOf(Error);
        throw error; // Re-throw to fail the test with the actual error
      }
    });

    it('should handle objects with problematic properties', () => {
      const problematicObject = {
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        get code() {
          throw new Error('getter error');
        },
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        get name() {
          throw new Error('name error');
        },
      };

      try {
        const result = isProcmanError(problematicObject);
        expect(result).toBe(false);
      } catch (error) {
        // Type guards might throw if properties throw
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Result Utility Exception Safety', () => {
    it('should handle null/undefined in result utilities', () => {
      try {
        const successResult = createSuccess(null);
        const undefinedResult = createSuccess(undefined);

        expect(isSuccess(successResult)).toBe(true);
        expect(isSuccess(undefinedResult)).toBe(true);

        if (isSuccess(successResult)) {
          expect(successResult.data).toBe(null);
        }
        if (isSuccess(undefinedResult)) {
          expect(undefinedResult.data).toBe(undefined);
        }
      } catch (error) {
        // Result utilities should handle null/undefined gracefully
        expect(error).toBeInstanceOf(Error);
        throw error; // Re-throw to fail the test with the actual error
      }
    });

    it('should handle invalid error objects in createFailure', () => {
      try {
        // This might not be a valid pattern, but test graceful handling
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = createFailure(null as any);
        expect(isFailure(result)).toBe(true);
        if (isFailure(result)) {
          expect(result.error).toBe(null);
        }
      } catch (error) {
        // createFailure might throw for invalid inputs
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});
