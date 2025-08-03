/**
 * Unit tests for IPC communication type definitions
 */

import { describe, test, expect } from 'vitest';
import {
  // Types
  type IPCMessage,
  type CommandType,
  type IPCResponse,
  type IPCLogStreamPayload,

  // Type guards
  isIPCMessage,
  isValidCommandType,

  // Utility functions
  generateMessageId,
} from '../../src/shared/ipc';

import type { LogEntry } from '../../src/shared/logs';

describe('IPC Communication Types', () => {
  describe('IPCMessage interface', () => {
    test('should accept valid IPCMessage object', () => {
      const message: IPCMessage = {
        id: 'test-id',
        type: 'load',
        payload: { configPath: '/path/to/config.js' },
        timestamp: Date.now(),
      };

      expect(message).toBeDefined();
      expect(message.id).toBe('test-id');
      expect(message.type).toBe('load');
      expect(message.payload).toEqual({ configPath: '/path/to/config.js' });
      expect(typeof message.timestamp).toBe('number');
    });

    test('should handle different command payloads', () => {
      const messages: IPCMessage[] = [
        {
          id: 'test-1',
          type: 'load',
          payload: { configPath: '/path/to/config.js' },
          timestamp: Date.now(),
        },
        {
          id: 'test-2',
          type: 'start',
          payload: { targets: ['app1', 'app2'] },
          timestamp: Date.now(),
        },
        {
          id: 'test-3',
          type: 'list',
          payload: {},
          timestamp: Date.now(),
        },
        {
          id: 'test-4',
          type: 'log',
          payload: { target: 'app1', options: { lines: 100 } },
          timestamp: Date.now(),
        },
      ];

      messages.forEach((message) => {
        expect(message).toBeDefined();
        expect(typeof message.id).toBe('string');
        expect(isValidCommandType(message.type)).toBe(true);
        expect(typeof message.timestamp).toBe('number');
      });
    });
  });

  describe('CommandType type', () => {
    test('should accept valid command types', () => {
      const validCommands: CommandType[] = [
        'load',
        'start',
        'stop',
        'restart',
        'list',
        'log',
        'clear-log',
        'exit',
      ];

      validCommands.forEach((command) => {
        expect(command).toBeDefined();
        expect(typeof command).toBe('string');
      });
    });
  });

  describe('IPCResponse interface', () => {
    test('should accept successful response', () => {
      const response: IPCResponse = {
        id: generateMessageId(),
        requestId: 'test-request-id',
        type: 'response',
        timestamp: Date.now(),
        success: true,
        data: {
          configFile: '/path/to/config.js',
          daemonUptime: 12345,
          processes: [],
        },
      };

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.error).toBeUndefined();
    });

    test('should accept error response', () => {
      const response: IPCResponse = {
        id: generateMessageId(),
        requestId: 'test-request-id',
        type: 'response',
        timestamp: Date.now(),
        success: false,
        error: {
          code: 'PROCESS_NOT_FOUND',
          message: 'Process not found',
          details: { processName: 'test' },
        },
      };

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('PROCESS_NOT_FOUND');
      expect(response.error?.message).toBe('Process not found');
      expect(response.error?.details).toEqual({ processName: 'test' });
    });
  });

  describe('IPCLogStreamPayload interface', () => {
    test('should accept valid log stream payload', () => {
      const logEntry: LogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message: 'Test log message',
        app: 'test-app',
        namespace: 'default',
        type: 'stdout',
      };

      const payload: IPCLogStreamPayload = {
        entry: logEntry,
        app: 'test-app',
        namespace: 'default',
      };

      expect(payload.entry).toEqual(logEntry);
      expect(payload.app).toBe('test-app');
      expect(payload.namespace).toBe('default');
    });
  });

  describe('Type guards', () => {
    describe('isIPCMessage', () => {
      test('should return true for valid IPCMessage', () => {
        const validMessage = {
          id: 'test-id',
          type: 'load',
          payload: { configPath: '/path/to/config.js' },
          timestamp: Date.now(),
        };

        expect(isIPCMessage(validMessage)).toBe(true);
      });

      test('should return false for invalid objects', () => {
        expect(isIPCMessage(null)).toBe(false);
        expect(isIPCMessage(undefined)).toBe(false);
        expect(isIPCMessage('string')).toBe(false);
        expect(isIPCMessage(123)).toBe(false);
        expect(isIPCMessage({})).toBe(false);
        expect(isIPCMessage({ id: 'test' })).toBe(false);
        expect(isIPCMessage({ id: 'test', type: 'test' })).toBe(false);
        expect(
          isIPCMessage({ id: 'test', type: 'test', timestamp: Date.now() })
        ).toBe(false);
        expect(
          isIPCMessage({
            id: 123,
            type: 'load',
            payload: {},
            timestamp: Date.now(),
          })
        ).toBe(false);
        expect(
          isIPCMessage({
            id: 'test',
            type: 123,
            payload: {},
            timestamp: Date.now(),
          })
        ).toBe(false);
        expect(
          isIPCMessage({
            id: 'test',
            type: 'test',
            payload: {},
            timestamp: 'not-a-number',
          })
        ).toBe(false);
      });
    });

    describe('isValidCommandType', () => {
      test('should return true for valid command types', () => {
        const validCommands = [
          'load',
          'start',
          'stop',
          'restart',
          'list',
          'log',
          'clear-log',
          'exit',
        ];

        validCommands.forEach((command) => {
          expect(isValidCommandType(command)).toBe(true);
        });
      });

      test('should return false for invalid command types', () => {
        expect(isValidCommandType('')).toBe(false);
        expect(isValidCommandType('invalid')).toBe(false);
        expect(isValidCommandType('LOAD')).toBe(false);
        expect(isValidCommandType('Start')).toBe(false);
        expect(isValidCommandType('stop-all')).toBe(false);
      });
    });
  });

  describe('Type compatibility', () => {
    test('should work with imported types', () => {
      // This test ensures that our IPC types work correctly with other module types
      const logEntry: LogEntry = {
        timestamp: Date.now(),
        level: 'error',
        message: 'Test error',
        app: 'test-app',
        namespace: 'test',
        type: 'stderr',
      };

      const logStreamPayload: IPCLogStreamPayload = {
        entry: logEntry,
        app: 'test-app',
        namespace: 'test',
      };

      expect(logStreamPayload.entry.level).toBe('error');
      expect(logStreamPayload.entry.type).toBe('stderr');
    });
  });
});
