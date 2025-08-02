/**
 * Unit tests for IPC communication type definitions
 */

import { describe, test, expect } from 'vitest';
import {
  // Types
  type IPCMessage,
  type CommandType,
  type IPCCommandMessage,
  type IPCSuccessResponse,
  type IPCErrorResponse,
  type IPCLogStreamMessage,
  type IPCConnectionStatus,
  type IPCLogStreamConfig,
  type LogStreamControl,
  type IPCConnectionConfig,
  type IPCClientConfig,
  type IPCServerConfig,

  // Type guards
  isIPCMessage,
  isIPCCommandMessage,
  isIPCResponse,
  isIPCSuccessResponse,
  isIPCErrorResponse,
  isIPCLogStreamMessage,
  isValidCommandType,

  // Helper functions
  generateMessageId,
  createIPCMessage,
  createIPCCommand,
  createIPCSuccessResponse,
  createIPCErrorResponse,
  createIPCLogStreamMessage,

  // Constants
  IPC_CONSTANTS,
  SUPPORTED_COMMANDS,
  SUPPORTED_CONNECTION_STATUSES,
} from '../../src/shared/ipc';

import type { ProcessInfo } from '../../src/shared/process';
import type { LogEntry } from '../../src/shared/logs';

describe('IPC Communication Types', () => {
  describe('IPCMessage interface', () => {
    test('should accept valid IPCMessage object', () => {
      const message: IPCMessage = {
        id: 'test-id',
        type: 'test-type',
        payload: { data: 'test' },
        timestamp: Date.now(),
      };

      expect(message).toBeDefined();
      expect(message.id).toBe('test-id');
      expect(message.type).toBe('test-type');
      expect(message.payload).toEqual({ data: 'test' });
      expect(typeof message.timestamp).toBe('number');
    });

    test('should handle any payload type', () => {
      const messages: IPCMessage[] = [
        {
          id: 'test-1',
          type: 'test',
          payload: null,
          timestamp: Date.now(),
        },
        {
          id: 'test-2',
          type: 'test',
          payload: 'string',
          timestamp: Date.now(),
        },
        {
          id: 'test-3',
          type: 'test',
          payload: 123,
          timestamp: Date.now(),
        },
        {
          id: 'test-4',
          type: 'test',
          payload: { complex: { nested: 'object' } },
          timestamp: Date.now(),
        },
      ];

      messages.forEach((message) => {
        expect(message).toBeDefined();
        expect(typeof message.id).toBe('string');
        expect(typeof message.type).toBe('string');
        expect(typeof message.timestamp).toBe('number');
      });
    });
  });

  describe('CommandType', () => {
    test('should include all required command types', () => {
      const expectedCommands: CommandType[] = [
        'load',
        'start',
        'stop',
        'restart',
        'list',
        'log',
        'clear-log',
        'exit',
      ];

      // Verify each expected command is included in SUPPORTED_COMMANDS
      expectedCommands.forEach((command) => {
        expect(SUPPORTED_COMMANDS).toContain(command);
      });

      // Verify exactly 8 commands
      expect(SUPPORTED_COMMANDS).toHaveLength(8);
    });

    test('should match ticket specification exactly', () => {
      const ticketCommands = [
        'load',
        'start',
        'stop',
        'restart',
        'list',
        'log',
        'clear-log',
        'exit',
      ];

      ticketCommands.forEach((command) => {
        expect(SUPPORTED_COMMANDS).toContain(command as CommandType);
      });
    });
  });

  describe('IPCCommandMessage interface', () => {
    test('should accept valid command message', () => {
      const commandMessage: IPCCommandMessage = {
        id: 'cmd-1',
        type: 'start',
        payload: { name: 'test-app' },
        timestamp: Date.now(),
      };

      expect(commandMessage).toBeDefined();
      expect(commandMessage.type).toBe('start');
      expect(commandMessage.payload).toEqual({ name: 'test-app' });
    });

    test('should work with all command types', () => {
      const commands: CommandType[] = [
        'load',
        'start',
        'stop',
        'restart',
        'list',
        'log',
        'clear-log',
        'exit',
      ];

      commands.forEach((command) => {
        const message: IPCCommandMessage = {
          id: `cmd-${command}`,
          type: command,
          payload: {},
          timestamp: Date.now(),
        };

        expect(message.type).toBe(command);
      });
    });
  });

  describe('IPCResponse interfaces', () => {
    test('should accept valid success response', () => {
      const response: IPCSuccessResponse = {
        id: 'resp-1',
        type: 'response',
        requestId: 'req-1',
        payload: {
          success: true,
          processes: [],
          totalCount: 0,
        } as any,
        timestamp: Date.now(),
      };

      expect(response).toBeDefined();
      expect(response.type).toBe('response');
      expect(response.requestId).toBe('req-1');
    });

    test('should accept valid error response', () => {
      const response: IPCErrorResponse = {
        id: 'err-1',
        type: 'error',
        requestId: 'req-1',
        payload: {
          code: 'PROCESS_NOT_FOUND',
          message: 'Process not found',
        },
        timestamp: Date.now(),
      };

      expect(response).toBeDefined();
      expect(response.type).toBe('error');
      expect(response.payload.code).toBe('PROCESS_NOT_FOUND');
    });

    test('should accept valid log stream message', () => {
      const logEntry: LogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message: 'test log',
        app: 'test-app',
        namespace: 'default',
        type: 'stdout',
      };

      const response: IPCLogStreamMessage = {
        id: 'log-1',
        type: 'log-stream',
        requestId: 'req-1',
        payload: {
          entry: logEntry,
          app: 'test-app',
          namespace: 'default',
          streamId: 'stream-1',
        },
        timestamp: Date.now(),
      };

      expect(response).toBeDefined();
      expect(response.type).toBe('log-stream');
      expect(response.payload.entry).toEqual(logEntry);
    });
  });

  describe('IPCConnectionStatus', () => {
    test('should include all required status values', () => {
      const expectedStatuses: IPCConnectionStatus[] = [
        'disconnected',
        'connecting',
        'connected',
        'error',
      ];

      expectedStatuses.forEach((status) => {
        expect(SUPPORTED_CONNECTION_STATUSES).toContain(status);
      });

      expect(SUPPORTED_CONNECTION_STATUSES).toHaveLength(4);
    });
  });

  describe('Configuration interfaces', () => {
    test('should accept valid IPC connection config', () => {
      const config: IPCConnectionConfig = {
        socketPath: '/tmp/test.sock',
        namedPipePath: '\\\\.\\pipe\\test',
        timeout: 5000,
        retryAttempts: 3,
        retryDelay: 1000,
      };

      expect(config).toBeDefined();
      expect(config.socketPath).toBe('/tmp/test.sock');
      expect(config.timeout).toBe(5000);
    });

    test('should accept valid IPC client config', () => {
      const config: IPCClientConfig = {
        socketPath: '/tmp/test.sock',
        timeout: 5000,
        autoReconnect: true,
        heartbeatInterval: 30000,
      };

      expect(config).toBeDefined();
      expect(config.autoReconnect).toBe(true);
      expect(config.heartbeatInterval).toBe(30000);
    });

    test('should accept valid IPC server config', () => {
      const config: IPCServerConfig = {
        socketPath: '/tmp/test.sock',
        timeout: 5000,
        maxConnections: 100,
        allowAnonymous: false,
      };

      expect(config).toBeDefined();
      expect(config.maxConnections).toBe(100);
      expect(config.allowAnonymous).toBe(false);
    });
  });

  describe('Log streaming interfaces', () => {
    test('should accept valid log stream config', () => {
      const config: IPCLogStreamConfig = {
        app: 'test-app',
        namespace: 'default',
        follow: true,
        lines: 100,
        filter: {
          level: ['info', 'error'],
          type: ['stdout'],
          since: Date.now() - 3600000,
          until: Date.now(),
        },
      };

      expect(config).toBeDefined();
      expect(config.follow).toBe(true);
      expect(config.filter?.level).toEqual(['info', 'error']);
    });

    test('should accept valid log stream control', () => {
      const control: LogStreamControl = {
        action: 'start',
        streamId: 'stream-1',
        config: {
          app: 'test-app',
          namespace: 'default',
          follow: true,
        },
      };

      expect(control).toBeDefined();
      expect(control.action).toBe('start');
      expect(control.streamId).toBe('stream-1');
    });
  });

  describe('Type guards', () => {
    describe('isIPCMessage', () => {
      test('should return true for valid IPCMessage', () => {
        const message = {
          id: 'test-id',
          type: 'test-type',
          payload: {},
          timestamp: Date.now(),
        };

        expect(isIPCMessage(message)).toBe(true);
      });

      test('should return false for invalid objects', () => {
        const invalidMessages = [
          null,
          undefined,
          {},
          { id: 'test' },
          { id: 'test', type: 'test' },
          { id: 'test', type: 'test', timestamp: Date.now() },
          { id: 123, type: 'test', payload: {}, timestamp: Date.now() },
          { id: 'test', type: 123, payload: {}, timestamp: Date.now() },
          { id: 'test', type: 'test', payload: {}, timestamp: 'invalid' },
        ];

        invalidMessages.forEach((message) => {
          expect(isIPCMessage(message)).toBe(false);
        });
      });
    });

    describe('isIPCCommandMessage', () => {
      test('should return true for valid command message', () => {
        const message = {
          id: 'test-id',
          type: 'start',
          payload: {},
          timestamp: Date.now(),
        };

        expect(isIPCCommandMessage(message)).toBe(true);
      });

      test('should return false for invalid command type', () => {
        const message = {
          id: 'test-id',
          type: 'invalid-command',
          payload: {},
          timestamp: Date.now(),
        };

        expect(isIPCCommandMessage(message)).toBe(false);
      });

      test('should work with all valid command types', () => {
        const commands = [
          'load',
          'start',
          'stop',
          'restart',
          'list',
          'log',
          'clear-log',
          'exit',
        ];

        commands.forEach((command) => {
          const message = {
            id: 'test-id',
            type: command,
            payload: {},
            timestamp: Date.now(),
          };

          expect(isIPCCommandMessage(message)).toBe(true);
        });
      });
    });

    describe('isIPCResponse', () => {
      test('should return true for valid response types', () => {
        const responseTypes = ['response', 'error', 'log-stream'];

        responseTypes.forEach((type) => {
          const message = {
            id: 'test-id',
            type,
            requestId: 'req-id',
            payload: {},
            timestamp: Date.now(),
          };

          expect(isIPCResponse(message)).toBe(true);
        });
      });

      test('should return false for invalid response', () => {
        const message = {
          id: 'test-id',
          type: 'invalid-response',
          requestId: 'req-id',
          payload: {},
          timestamp: Date.now(),
        };

        expect(isIPCResponse(message)).toBe(false);
      });

      test('should return false when requestId is missing', () => {
        const message = {
          id: 'test-id',
          type: 'response',
          payload: {},
          timestamp: Date.now(),
        };

        expect(isIPCResponse(message)).toBe(false);
      });
    });

    describe('isIPCSuccessResponse', () => {
      test('should return true for success response', () => {
        const message = {
          id: 'test-id',
          type: 'response',
          requestId: 'req-id',
          payload: {},
          timestamp: Date.now(),
        };

        expect(isIPCSuccessResponse(message)).toBe(true);
      });

      test('should return false for error response', () => {
        const message = {
          id: 'test-id',
          type: 'error',
          requestId: 'req-id',
          payload: {},
          timestamp: Date.now(),
        };

        expect(isIPCSuccessResponse(message)).toBe(false);
      });
    });

    describe('isIPCErrorResponse', () => {
      test('should return true for error response', () => {
        const message = {
          id: 'test-id',
          type: 'error',
          requestId: 'req-id',
          payload: {},
          timestamp: Date.now(),
        };

        expect(isIPCErrorResponse(message)).toBe(true);
      });

      test('should return false for success response', () => {
        const message = {
          id: 'test-id',
          type: 'response',
          requestId: 'req-id',
          payload: {},
          timestamp: Date.now(),
        };

        expect(isIPCErrorResponse(message)).toBe(false);
      });
    });

    describe('isIPCLogStreamMessage', () => {
      test('should return true for log stream message', () => {
        const message = {
          id: 'test-id',
          type: 'log-stream',
          requestId: 'req-id',
          payload: {},
          timestamp: Date.now(),
        };

        expect(isIPCLogStreamMessage(message)).toBe(true);
      });

      test('should return false for other response types', () => {
        const message = {
          id: 'test-id',
          type: 'response',
          requestId: 'req-id',
          payload: {},
          timestamp: Date.now(),
        };

        expect(isIPCLogStreamMessage(message)).toBe(false);
      });
    });

    describe('isValidCommandType', () => {
      test('should return true for valid command types', () => {
        const commands = [
          'load',
          'start',
          'stop',
          'restart',
          'list',
          'log',
          'clear-log',
          'exit',
        ];

        commands.forEach((command) => {
          expect(isValidCommandType(command)).toBe(true);
        });
      });

      test('should return false for invalid command types', () => {
        const invalidCommands = ['invalid', 'unknown', 'test', ''];

        invalidCommands.forEach((command) => {
          expect(isValidCommandType(command)).toBe(false);
        });
      });
    });
  });

  describe('Helper functions', () => {
    describe('generateMessageId', () => {
      test('should generate unique IDs', () => {
        const id1 = generateMessageId();
        const id2 = generateMessageId();

        expect(id1).not.toBe(id2);
        expect(typeof id1).toBe('string');
        expect(typeof id2).toBe('string');
        expect(id1.length).toBeGreaterThan(0);
        expect(id2.length).toBeGreaterThan(0);
      });

      test('should generate IDs with expected format', () => {
        const id = generateMessageId();

        // Should contain timestamp and random parts separated by dash
        expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
      });
    });

    describe('createIPCMessage', () => {
      test('should create valid IPC message', () => {
        const payload = { test: 'data' };
        const message = createIPCMessage('test-type', payload);

        expect(isIPCMessage(message)).toBe(true);
        expect(message.type).toBe('test-type');
        expect(message.payload).toBe(payload);
        expect(typeof message.id).toBe('string');
        expect(typeof message.timestamp).toBe('number');
      });

      test('should use provided ID when given', () => {
        const customId = 'custom-id';
        const message = createIPCMessage('test-type', {}, customId);

        expect(message.id).toBe(customId);
      });

      test('should generate ID when not provided', () => {
        const message = createIPCMessage('test-type', {});

        expect(typeof message.id).toBe('string');
        expect(message.id.length).toBeGreaterThan(0);
      });
    });

    describe('createIPCCommand', () => {
      test('should create valid command message', () => {
        const payload = { name: 'test-app' };
        const command = createIPCCommand('start', payload);

        expect(isIPCCommandMessage(command)).toBe(true);
        expect(command.type).toBe('start');
        expect(command.payload).toBe(payload);
      });

      test('should work with all command types', () => {
        const commands: CommandType[] = [
          'load',
          'start',
          'stop',
          'restart',
          'list',
          'log',
          'clear-log',
          'exit',
        ];

        commands.forEach((commandType) => {
          const command = createIPCCommand(commandType, {});

          expect(command.type).toBe(commandType);
          expect(isIPCCommandMessage(command)).toBe(true);
        });
      });
    });

    describe('createIPCSuccessResponse', () => {
      test('should create valid success response', () => {
        const payload = {
          success: true,
          processes: [],
          totalCount: 0,
        } as any;
        const response = createIPCSuccessResponse('req-1', payload);

        expect(isIPCSuccessResponse(response)).toBe(true);
        expect(response.type).toBe('response');
        expect(response.requestId).toBe('req-1');
        expect(response.payload).toBe(payload);
      });
    });

    describe('createIPCErrorResponse', () => {
      test('should create valid error response', () => {
        const response = createIPCErrorResponse(
          'req-1',
          'PROCESS_NOT_FOUND',
          'Process not found'
        );

        expect(isIPCErrorResponse(response)).toBe(true);
        expect(response.type).toBe('error');
        expect(response.requestId).toBe('req-1');
        expect(response.payload.code).toBe('PROCESS_NOT_FOUND');
        expect(response.payload.message).toBe('Process not found');
      });

      test('should include details when provided', () => {
        const details = { processName: 'test-app' };
        const response = createIPCErrorResponse(
          'req-1',
          'PROCESS_NOT_FOUND',
          'Process not found',
          details
        );

        expect(response.payload.details).toBe(details);
      });
    });

    describe('createIPCLogStreamMessage', () => {
      test('should create valid log stream message', () => {
        const logEntry: LogEntry = {
          timestamp: Date.now(),
          level: 'info',
          message: 'test log',
          app: 'test-app',
          namespace: 'default',
          type: 'stdout',
        };

        const message = createIPCLogStreamMessage(
          'req-1',
          logEntry,
          'test-app',
          'default',
          'stream-1'
        );

        expect(isIPCLogStreamMessage(message)).toBe(true);
        expect(message.type).toBe('log-stream');
        expect(message.requestId).toBe('req-1');
        expect(message.payload.entry).toBe(logEntry);
        expect(message.payload.app).toBe('test-app');
        expect(message.payload.namespace).toBe('default');
        expect(message.payload.streamId).toBe('stream-1');
      });
    });
  });

  describe('Constants', () => {
    describe('IPC_CONSTANTS', () => {
      test('should be frozen object', () => {
        expect(Object.isFrozen(IPC_CONSTANTS)).toBe(true);
      });

      test('should contain all required message types', () => {
        expect(IPC_CONSTANTS.MESSAGE_TYPES.COMMAND).toBe('command');
        expect(IPC_CONSTANTS.MESSAGE_TYPES.RESPONSE).toBe('response');
        expect(IPC_CONSTANTS.MESSAGE_TYPES.ERROR).toBe('error');
        expect(IPC_CONSTANTS.MESSAGE_TYPES.LOG_STREAM).toBe('log-stream');
      });

      test('should contain all command types', () => {
        expect(IPC_CONSTANTS.COMMANDS.LOAD).toBe('load');
        expect(IPC_CONSTANTS.COMMANDS.START).toBe('start');
        expect(IPC_CONSTANTS.COMMANDS.STOP).toBe('stop');
        expect(IPC_CONSTANTS.COMMANDS.RESTART).toBe('restart');
        expect(IPC_CONSTANTS.COMMANDS.LIST).toBe('list');
        expect(IPC_CONSTANTS.COMMANDS.LOG).toBe('log');
        expect(IPC_CONSTANTS.COMMANDS.CLEAR_LOG).toBe('clear-log');
        expect(IPC_CONSTANTS.COMMANDS.EXIT).toBe('exit');
      });

      test('should contain all connection statuses', () => {
        expect(IPC_CONSTANTS.CONNECTION_STATUS.DISCONNECTED).toBe(
          'disconnected'
        );
        expect(IPC_CONSTANTS.CONNECTION_STATUS.CONNECTING).toBe('connecting');
        expect(IPC_CONSTANTS.CONNECTION_STATUS.CONNECTED).toBe('connected');
        expect(IPC_CONSTANTS.CONNECTION_STATUS.ERROR).toBe('error');
      });

      test('should contain log stream actions', () => {
        expect(IPC_CONSTANTS.LOG_STREAM_ACTIONS.START).toBe('start');
        expect(IPC_CONSTANTS.LOG_STREAM_ACTIONS.STOP).toBe('stop');
        expect(IPC_CONSTANTS.LOG_STREAM_ACTIONS.PAUSE).toBe('pause');
        expect(IPC_CONSTANTS.LOG_STREAM_ACTIONS.RESUME).toBe('resume');
      });

      test('should contain default values', () => {
        expect(IPC_CONSTANTS.DEFAULTS.CONNECTION_TIMEOUT).toBe(5000);
        expect(IPC_CONSTANTS.DEFAULTS.RETRY_ATTEMPTS).toBe(3);
        expect(IPC_CONSTANTS.DEFAULTS.RETRY_DELAY).toBe(1000);
        expect(IPC_CONSTANTS.DEFAULTS.HEARTBEAT_INTERVAL).toBe(30000);
        expect(IPC_CONSTANTS.DEFAULTS.MAX_CONNECTIONS).toBe(100);
        expect(IPC_CONSTANTS.DEFAULTS.LOG_STREAM_BUFFER_SIZE).toBe(1000);
      });
    });

    describe('SUPPORTED_COMMANDS', () => {
      test('should be readonly array', () => {
        expect(Array.isArray(SUPPORTED_COMMANDS)).toBe(true);
        expect(SUPPORTED_COMMANDS.length).toBeGreaterThan(0);
      });

      test('should contain exactly 8 commands', () => {
        expect(SUPPORTED_COMMANDS).toHaveLength(8);
      });

      test('should match CommandType union', () => {
        const expectedCommands = [
          'load',
          'start',
          'stop',
          'restart',
          'list',
          'log',
          'clear-log',
          'exit',
        ];

        expect(SUPPORTED_COMMANDS).toEqual(expectedCommands);
      });
    });

    describe('SUPPORTED_CONNECTION_STATUSES', () => {
      test('should be readonly array', () => {
        expect(Array.isArray(SUPPORTED_CONNECTION_STATUSES)).toBe(true);
        expect(SUPPORTED_CONNECTION_STATUSES.length).toBeGreaterThan(0);
      });

      test('should contain exactly 4 statuses', () => {
        expect(SUPPORTED_CONNECTION_STATUSES).toHaveLength(4);
      });

      test('should match IPCConnectionStatus union', () => {
        const expectedStatuses = [
          'disconnected',
          'connecting',
          'connected',
          'error',
        ];

        expect(SUPPORTED_CONNECTION_STATUSES).toEqual(expectedStatuses);
      });
    });
  });

  describe('Integration with other modules', () => {
    test('should work with ProcessInfo from process module', () => {
      const processInfo: ProcessInfo = {
        name: 'test-app',
        namespace: 'default',
        status: 'online',
        pid: 1234,
        uptime: 60000,
        memory: 100,
        cpu: 50,
        restarts: 0,
      };

      const response = createIPCSuccessResponse('req-1', {
        success: true,
        startedProcesses: [processInfo],
        failedProcesses: [],
      } as any);

      const payload = response.payload as any;
      expect(payload.startedProcesses).toContain(processInfo);
    });

    test('should work with LogEntry from logs module', () => {
      const logEntry: LogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message: 'test message',
        app: 'test-app',
        namespace: 'default',
        type: 'stdout',
      };

      const streamMessage = createIPCLogStreamMessage(
        'req-1',
        logEntry,
        'test-app',
        'default',
        'stream-1'
      );

      expect(streamMessage.payload.entry).toBe(logEntry);
    });

    test('should work with ErrorCode from errors module', () => {
      const errorResponse = createIPCErrorResponse(
        'req-1',
        'PROCESS_NOT_FOUND',
        'Process not found'
      );

      expect(errorResponse.payload.code).toBe('PROCESS_NOT_FOUND');
    });
  });

  describe('Type consistency', () => {
    test('should maintain consistency between types and constants', () => {
      // CommandType should match IPC_CONSTANTS.COMMANDS
      const commandValues = Object.values(IPC_CONSTANTS.COMMANDS);
      const supportedCommands = [...SUPPORTED_COMMANDS];

      expect(supportedCommands.sort()).toEqual(commandValues.sort());
    });

    test('should maintain consistency between connection status types and constants', () => {
      // IPCConnectionStatus should match IPC_CONSTANTS.CONNECTION_STATUS
      const statusValues = Object.values(IPC_CONSTANTS.CONNECTION_STATUS);
      const supportedStatuses = [...SUPPORTED_CONNECTION_STATUSES];

      expect(supportedStatuses.sort()).toEqual(statusValues.sort());
    });
  });
});
