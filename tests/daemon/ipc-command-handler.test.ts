/**
 * Tests for IPC Command Handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPCCommandHandler } from '../../src/daemon/ipc-command-handler';
import { ProcmanDaemon } from '../../src/daemon/procman-daemon';
import {
  CommandType,
  IPCMessage,
  LoadCommandPayload,
  StartCommandPayload,
  StopCommandPayload,
  RestartCommandPayload,
  ListCommandPayload,
  LogCommandPayload,
  ClearLogCommandPayload,
  ExitCommandPayload,
} from '../../src/shared/ipc';
import { ProcessInfo } from '../../src/shared/process';

// Mock ProcmanDaemon
vi.mock('../../src/daemon/procman-daemon');

const COMMAND_TYPES = {
  LOAD: 'load' as CommandType,
  START: 'start' as CommandType,
  STOP: 'stop' as CommandType,
  RESTART: 'restart' as CommandType,
  LIST: 'list' as CommandType,
  LOG: 'log' as CommandType,
  CLEAR_LOG: 'clear-log' as CommandType,
  EXIT: 'exit' as CommandType,
};

describe('IPCCommandHandler', () => {
  let handler: IPCCommandHandler;
  let mockDaemon: any;
  let mockProcessManager: any;
  let mockLogManager: any;

  beforeEach(() => {
    // Mock process.exit globally to prevent test interference
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Setup mocks
    mockProcessManager = {
      getProcessNames: vi.fn(() => ['app1', 'app2']),
      getProcessNamesByNamespace: vi.fn(() => ['app1']),
      startProcesses: vi.fn(() => [
        { name: 'app1', success: true },
        { name: 'app2', success: false, error: 'Failed to start' },
      ]),
      stopProcesses: vi.fn(() => [
        { name: 'app1', success: true },
        { name: 'app2', success: true },
      ]),
      restartProcesses: vi.fn(() => [{ name: 'app1', success: true }]),
    };

    mockLogManager = {
      readLogs: vi.fn(() => [
        { timestamp: Date.now(), type: 'stdout', message: 'test log' },
      ]),
      clearLogs: vi.fn(),
    };

    mockDaemon = {
      loadConfig: vi.fn(),
      getConfig: vi.fn(() => [{ name: 'app1' }, { name: 'app2' }]),
      getProcessManager: vi.fn(() => mockProcessManager),
      getLogManager: vi.fn(() => mockLogManager),
      getAllProcessStatuses: vi.fn(() => [
        {
          name: 'app1',
          namespace: 'default',
          status: 'online',
          pid: 1234,
          uptime: 60000,
          memory: 50000000,
          cpu: 2.5,
          restarts: 0,
        } as ProcessInfo,
      ]),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    handler = new IPCCommandHandler(mockDaemon as any);
  });

  describe('LOAD command', () => {
    it('should handle load command successfully', async () => {
      const message: IPCMessage<LoadCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.LOAD,
        payload: { configPath: '/path/to/config.js' },
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(mockDaemon.loadConfig).toHaveBeenCalledWith('/path/to/config.js');
      expect(response.success).toBe(true);
      expect(response.data).toEqual({
        config: { apps: [{ name: 'app1' }, { name: 'app2' }] },
        appsCount: 2,
      });
    });

    it('should handle load command errors', async () => {
      mockDaemon.loadConfig.mockRejectedValue(new Error('Invalid config'));

      const message: IPCMessage<LoadCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.LOAD,
        payload: { configPath: '/invalid/config.js' },
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.error?.message).toBe('Invalid config');
    });
  });

  describe('START command', () => {
    it('should start specific processes', async () => {
      const message: IPCMessage<StartCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.START,
        payload: { targets: ['app1', 'app2'] },
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(mockProcessManager.startProcesses).toHaveBeenCalledWith([
        'app1',
        'app2',
      ]);
      expect(response.success).toBe(true);
      expect(response.data).toEqual({
        started: ['app1'],
        alreadyRunning: [],
        failed: [{ name: 'app2', error: 'Failed to start' }],
      });
    });

    it('should start processes by namespace', async () => {
      const message: IPCMessage<StartCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.START,
        payload: { targets: ['production:*'] },
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(
        mockProcessManager.getProcessNamesByNamespace
      ).toHaveBeenCalledWith('production');
      expect(response.success).toBe(true);
    });

    it('should start all processes when no filter provided', async () => {
      const message: IPCMessage<StartCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.START,
        payload: {},
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(mockProcessManager.getProcessNames).toHaveBeenCalled();
      expect(mockProcessManager.startProcesses).toHaveBeenCalledWith([
        'app1',
        'app2',
      ]);
    });
  });

  describe('STOP command', () => {
    it('should stop specific processes', async () => {
      const message: IPCMessage<StopCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.STOP,
        payload: { targets: ['app1'] },
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(mockProcessManager.stopProcesses).toHaveBeenCalledWith(['app1']);
      expect(response.success).toBe(true);
      expect(response.data).toEqual({
        stopped: ['app1', 'app2'],
        alreadyStopped: [],
        failed: [],
      });
    });
  });

  describe('RESTART command', () => {
    it('should restart specific processes', async () => {
      const message: IPCMessage<RestartCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.RESTART,
        payload: { targets: ['app1'] },
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(mockProcessManager.restartProcesses).toHaveBeenCalledWith([
        'app1',
      ]);
      expect(response.success).toBe(true);
      expect(response.data).toEqual({
        restarted: ['app1'],
        failed: [],
      });
    });
  });

  describe('LIST command', () => {
    it('should list all processes', async () => {
      const message: IPCMessage<ListCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.LIST,
        payload: {},
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(mockDaemon.getAllProcessStatuses).toHaveBeenCalled();
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      // Type assertion for ListResponseData
      const listData = response.data as any;
      expect(listData.processes).toHaveLength(1);
      expect(listData.processes[0].name).toBe('app1');
    });
  });

  describe('LOG command', () => {
    it('should retrieve logs for a process', async () => {
      const message: IPCMessage<LogCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.LOG,
        payload: { target: 'app1', options: { lines: 50 } },
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(mockLogManager.readLogs).toHaveBeenCalledWith('app1', {
        lines: 50,
      });
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      // Type assertion for LogResponseData
      const logData = response.data as any;
      expect(logData.entries).toHaveLength(1);
    });

    it('should retrieve more logs with higher line count', async () => {
      const message: IPCMessage<LogCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.LOG,
        payload: { target: 'app1', options: { lines: 100 } },
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(mockLogManager.readLogs).toHaveBeenCalledWith('app1', {
        lines: 100,
      });
      expect(response.success).toBe(true);
    });
  });

  describe('CLEAR_LOG command', () => {
    it('should clear logs for specific processes', async () => {
      const message: IPCMessage<ClearLogCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.CLEAR_LOG,
        payload: { target: 'app1' },
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(mockLogManager.clearLogs).toHaveBeenCalledWith('app1');
      expect(response.success).toBe(true);
      expect(response.data).toEqual({
        cleared: ['app1'],
      });
    });

    it('should clear logs for all processes when none specified', async () => {
      const message: IPCMessage<ClearLogCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.CLEAR_LOG,
        payload: { target: '' },
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(mockLogManager.clearLogs).toHaveBeenCalledWith('app1');
      expect(mockLogManager.clearLogs).toHaveBeenCalledWith('app2');
      expect(response.success).toBe(true);
    });
  });

  describe('EXIT command', () => {
    it('should handle exit command', async () => {
      vi.useFakeTimers();

      const message: IPCMessage<ExitCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.EXIT,
        payload: {},
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(response.data).toEqual({
        processCount: 2,
      });

      // Advance timers to trigger shutdown
      vi.advanceTimersByTime(100);

      expect(mockDaemon.stop).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should handle unknown command types', async () => {
      const message: IPCMessage = {
        id: '123',
        type: 'UNKNOWN' as CommandType,
        payload: {},
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.error?.message).toContain('Unknown command type');
    });

    it('should handle missing process manager', async () => {
      mockDaemon.getProcessManager.mockReturnValue(null);

      const message: IPCMessage<StartCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.START,
        payload: {},
        timestamp: Date.now(),
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.error?.message).toBe('Process manager not initialized');
    });
  });

  describe('event emission', () => {
    it('should emit command events', async () => {
      const receivedSpy = vi.fn();
      const completedSpy = vi.fn();
      const errorSpy = vi.fn();

      handler.on('command:received', receivedSpy);
      handler.on('command:completed', completedSpy);
      handler.on('command:error', errorSpy);

      const message: IPCMessage<ListCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.LIST,
        payload: {},
        timestamp: Date.now(),
      };

      await handler.handleMessage(message);

      expect(receivedSpy).toHaveBeenCalledWith(COMMAND_TYPES.LIST, '123');
      expect(completedSpy).toHaveBeenCalledWith(COMMAND_TYPES.LIST, '123');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should emit error events on failure', async () => {
      const errorSpy = vi.fn();
      handler.on('command:error', errorSpy);

      mockDaemon.loadConfig.mockRejectedValue(new Error('Test error'));

      const message: IPCMessage<LoadCommandPayload> = {
        id: '123',
        type: COMMAND_TYPES.LOAD,
        payload: { configPath: '/test' },
        timestamp: Date.now(),
      };

      await handler.handleMessage(message);

      expect(errorSpy).toHaveBeenCalledWith(
        COMMAND_TYPES.LOAD,
        '123',
        expect.any(Error)
      );
    });
  });
});
