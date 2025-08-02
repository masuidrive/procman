/**
 * Unit tests for log management type definitions
 */

import { describe, test, expect } from 'vitest';
import {
  // Types
  type LogEntry,
  type LogOptions,
  type LogFormat,

  // Type guards
  isLogEntry,
} from '../../src/shared/logs';

describe('Log Management Types', () => {
  describe('LogEntry interface', () => {
    test('should accept valid log entry', () => {
      const logEntry: LogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message: 'Test log message',
        app: 'test-app',
        namespace: 'default',
        type: 'stdout',
      };

      expect(logEntry).toBeDefined();
      expect(typeof logEntry.timestamp).toBe('number');
      expect(logEntry.level).toBe('info');
      expect(logEntry.message).toBe('Test log message');
      expect(logEntry.app).toBe('test-app');
      expect(logEntry.namespace).toBe('default');
      expect(logEntry.type).toBe('stdout');
    });

    test('should accept all log levels', () => {
      const levels: Array<'info' | 'warn' | 'error'> = [
        'info',
        'warn',
        'error',
      ];

      levels.forEach((level) => {
        const entry: LogEntry = {
          timestamp: Date.now(),
          level,
          message: `Test ${level} message`,
          app: 'test-app',
          namespace: 'default',
          type: 'stdout',
        };

        expect(entry.level).toBe(level);
      });
    });

    test('should accept all log types', () => {
      const types: Array<'stdout' | 'stderr'> = ['stdout', 'stderr'];

      types.forEach((type) => {
        const entry: LogEntry = {
          timestamp: Date.now(),
          level: 'info',
          message: 'Test message',
          app: 'test-app',
          namespace: 'default',
          type,
        };

        expect(entry.type).toBe(type);
      });
    });
  });

  describe('LogOptions interface', () => {
    test('should accept valid log options', () => {
      const options: LogOptions = {
        lines: 100,
        human: true,
        stream: false,
        level: ['info', 'error'],
        type: ['stdout'],
        since: Date.now() - 3600000,
        until: Date.now(),
      };

      expect(options.lines).toBe(100);
      expect(options.human).toBe(true);
      expect(options.stream).toBe(false);
      expect(options.level).toEqual(['info', 'error']);
      expect(options.type).toEqual(['stdout']);
      expect(typeof options.since).toBe('number');
      expect(typeof options.until).toBe('number');
    });

    test('should accept partial options', () => {
      const minimalOptions: LogOptions = {};
      const partialOptions: LogOptions = {
        lines: 50,
        human: true,
      };

      expect(minimalOptions).toEqual({});
      expect(partialOptions.lines).toBe(50);
      expect(partialOptions.human).toBe(true);
      expect(partialOptions.stream).toBeUndefined();
    });
  });

  describe('LogFormat type', () => {
    test('should accept valid log formats', () => {
      const formats: LogFormat[] = [
        'basic',
        'json',
        'csv',
        'pretty',
        'raw',
        'compact',
      ];

      formats.forEach((format) => {
        expect(format).toBeDefined();
        expect(typeof format).toBe('string');
      });
    });
  });

  describe('Type guards', () => {
    describe('isLogEntry', () => {
      test('should return true for valid log entry', () => {
        const validEntry = {
          timestamp: Date.now(),
          level: 'info',
          message: 'Test message',
          app: 'test-app',
          namespace: 'default',
          type: 'stdout',
        };

        expect(isLogEntry(validEntry)).toBe(true);
      });

      test('should return false for invalid objects', () => {
        expect(isLogEntry(null)).toBe(false);
        expect(isLogEntry(undefined)).toBe(false);
        expect(isLogEntry('string')).toBe(false);
        expect(isLogEntry(123)).toBe(false);
        expect(isLogEntry({})).toBe(false);

        // Missing required fields
        expect(isLogEntry({ timestamp: Date.now() })).toBe(false);
        expect(
          isLogEntry({
            timestamp: Date.now(),
            level: 'info',
          })
        ).toBe(false);

        // Invalid field types
        expect(
          isLogEntry({
            timestamp: 'not-a-number',
            level: 'info',
            message: 'Test',
            app: 'test-app',
            namespace: 'default',
            type: 'stdout',
          })
        ).toBe(false);

        // Invalid enum values
        expect(
          isLogEntry({
            timestamp: Date.now(),
            level: 'debug', // invalid level
            message: 'Test',
            app: 'test-app',
            namespace: 'default',
            type: 'stdout',
          })
        ).toBe(false);

        expect(
          isLogEntry({
            timestamp: Date.now(),
            level: 'info',
            message: 'Test',
            app: 'test-app',
            namespace: 'default',
            type: 'file', // invalid type
          })
        ).toBe(false);
      });
    });
  });
});
