/**
 * IPC Command Handler - IPCコマンドの処理実装
 *
 * ProcmanDaemonで受信したIPCコマンドを処理する責務を持つ。
 * 各コマンドの実装を提供し、適切なレスポンスを生成する。
 *
 * Process-related handlers are in ./process-command-handlers.ts
 * Log-related handlers are in ./log-command-handlers.ts
 */

import { EventEmitter } from 'events';
import { EventCleanupHelper } from '../utils/event-cleanup.js';
import { ConfigLoader } from '../config/config-loader.js';
import { ProcessManager } from '../process-manager/process-manager.js';
import { TaskManager } from '../process-manager/task-manager.js';
import { LogManager } from '../services/log-manager.js';
import { AppConfig } from '../shared/config.js';
import {
  CommandType,
  IPCMessage,
  IPCResponse,
  LoadCommandPayload,
  StartCommandPayload,
  StopCommandPayload,
  RestartCommandPayload,
  ListCommandPayload,
  LogCommandPayload,
  ClearLogCommandPayload,
  ExitCommandPayload,
} from '../shared/ipc.js';
import type {
  RunTaskCommandPayload,
  TaskStatusCommandPayload,
  TaskListCommandPayload,
  TaskKillCommandPayload,
  TaskLogCommandPayload,
} from '../shared/task.js';
import type { LogOptions } from '../shared/logs.js';
import { LOG_STREAM_EVENTS } from '../shared/constants-streaming.js';

import {
  handleLoadCommand,
  handleStartCommand,
  handleStopCommand,
  handleRestartCommand,
  handleListCommand,
  handleExitCommand,
} from './process-command-handlers.js';
import {
  handleLogCommand,
  handleClearLogCommand,
} from './log-command-handlers.js';
import {
  handleRunTaskCommand,
  handleTaskStatusCommand,
  handleTaskListCommand,
  handleTaskKillCommand,
  handleTaskLogCommand,
} from './task-command-handlers.js';

/**
 * Command type constants
 */
const COMMAND_TYPES = {
  LOAD: 'load' as CommandType,
  START: 'start' as CommandType,
  STOP: 'stop' as CommandType,
  RESTART: 'restart' as CommandType,
  LIST: 'list' as CommandType,
  LOG: 'log' as CommandType,
  CLEAR_LOG: 'clear-log' as CommandType,
  EXIT: 'exit' as CommandType,
  RUN_TASK: 'run-task' as CommandType,
  TASK_STATUS: 'task-status' as CommandType,
  TASK_LIST: 'task-list' as CommandType,
  TASK_KILL: 'task-kill' as CommandType,
  TASK_LOG: 'task-log' as CommandType,
};

/**
 * Daemon interface for command handler
 */
export interface DaemonInterface {
  getConfigLoader(): ConfigLoader | undefined;
  getProcessManager(): ProcessManager | undefined;
  getTaskManager(): TaskManager | undefined;
  getLogManager(): LogManager | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAllProcessStatuses(): Promise<any>;
  getConfig(): AppConfig[] | undefined;
  loadConfig(configFilePath: string): Promise<AppConfig[]>;
  stop(): Promise<void>;
}

/**
 * Command handler events
 */
export interface CommandHandlerEvents {
  'command:received': (command: CommandType, id: string) => void;
  'command:completed': (command: CommandType, id: string) => void;
  'command:error': (command: CommandType, id: string, error: Error) => void;
  [LOG_STREAM_EVENTS.START_LOG_STREAM]: (config: {
    messageId: string;
    target: string;
    options?: LogOptions;
    connectionId?: string;
  }) => void;
  [LOG_STREAM_EVENTS.STOP_LOG_STREAM]: (config: { sessionId: string }) => void;
}

/**
 * IPC command handler implementation
 */
export class IPCCommandHandler extends EventEmitter {
  // Add EventCleanupHelper for proper listener cleanup
  private readonly listenerCleanup = new EventCleanupHelper();

  constructor(private daemon: DaemonInterface) {
    super();

    // No initialization needed for EventCleanupHelper
  }

  /**
   * Private method to register and track listeners
   */
  private registerListener<T extends EventEmitter>(
    emitter: T,
    event: string | symbol,
    listener: (...args: unknown[]) => void
  ): void {
    this.listenerCleanup.track(emitter, event, listener);
  }

  /**
   * Handle incoming IPC message
   */
  async handleMessage(
    message: IPCMessage,
    connection?: { id?: string }
  ): Promise<IPCResponse> {
    this.emit('command:received', message.type, message.id);

    try {
      let response: IPCResponse;

      switch (message.type) {
        case COMMAND_TYPES.LOAD:
          response = await handleLoadCommand(
            this.daemon,
            message as IPCMessage<LoadCommandPayload>
          );
          break;

        case COMMAND_TYPES.START:
          response = await handleStartCommand(
            this.daemon,
            message as IPCMessage<StartCommandPayload>
          );
          break;

        case COMMAND_TYPES.STOP:
          response = await handleStopCommand(
            this.daemon,
            message as IPCMessage<StopCommandPayload>
          );
          break;

        case COMMAND_TYPES.RESTART:
          response = await handleRestartCommand(
            this.daemon,
            message as IPCMessage<RestartCommandPayload>
          );
          break;

        case COMMAND_TYPES.LIST:
          response = await handleListCommand(
            this.daemon,
            message as IPCMessage<ListCommandPayload>
          );
          break;

        case COMMAND_TYPES.LOG:
          response = await handleLogCommand(
            this.daemon,
            this,
            message as IPCMessage<LogCommandPayload>,
            connection
          );
          break;

        case COMMAND_TYPES.CLEAR_LOG:
          response = await handleClearLogCommand(
            this.daemon,
            message as IPCMessage<ClearLogCommandPayload>
          );
          break;

        case COMMAND_TYPES.EXIT:
          response = await handleExitCommand(
            this.daemon,
            message as IPCMessage<ExitCommandPayload>
          );
          break;

        case COMMAND_TYPES.RUN_TASK: {
          const taskManager = this.daemon.getTaskManager();
          if (!taskManager) throw new Error('TaskManager not initialized');
          response = await handleRunTaskCommand(
            taskManager,
            message as IPCMessage<RunTaskCommandPayload>
          );
          break;
        }

        case COMMAND_TYPES.TASK_STATUS: {
          const taskManager = this.daemon.getTaskManager();
          if (!taskManager) throw new Error('TaskManager not initialized');
          response = await handleTaskStatusCommand(
            taskManager,
            message as IPCMessage<TaskStatusCommandPayload>
          );
          break;
        }

        case COMMAND_TYPES.TASK_LIST: {
          const taskManager = this.daemon.getTaskManager();
          if (!taskManager) throw new Error('TaskManager not initialized');
          response = await handleTaskListCommand(
            taskManager,
            message as IPCMessage<TaskListCommandPayload>
          );
          break;
        }

        case COMMAND_TYPES.TASK_KILL: {
          const taskManager = this.daemon.getTaskManager();
          if (!taskManager) throw new Error('TaskManager not initialized');
          response = await handleTaskKillCommand(
            taskManager,
            message as IPCMessage<TaskKillCommandPayload>
          );
          break;
        }

        case COMMAND_TYPES.TASK_LOG: {
          const taskManager = this.daemon.getTaskManager();
          if (!taskManager) throw new Error('TaskManager not initialized');
          response = await handleTaskLogCommand(
            taskManager,
            message as IPCMessage<TaskLogCommandPayload>
          );
          break;
        }

        default:
          throw new Error(`Unknown command type: ${message.type}`);
      }

      this.emit('command:completed', message.type, message.id);
      return response;
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.emit('command:error', message.type, message.id, errorObj);

      return {
        id: message.id,
        requestId: message.id,
        type: message.type,
        timestamp: Date.now(),
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: errorObj.message,
        },
      };
    }
  }

  /**
   * Clean up all managed listeners
   */
  public async cleanup(): Promise<void> {
    // Clean up all managed listeners
    // Clean up all tracked listeners
    await this.listenerCleanup.dispose();

    // Clean up our own listeners
    this.removeAllListeners();

    // Listeners cleaned up by EventCleanupHelper
  }

  /**
   * Get statistics about listener management
   */
  public getListenerStats(): {
    managedListeners: number;
    ownListeners: number;
  } {
    const ownEvents = this.eventNames();
    let ownListenersCount = 0;

    for (const event of ownEvents) {
      ownListenersCount += this.listenerCount(event);
    }

    return {
      managedListeners: this.listenerCleanup.getListenerCount(),
      ownListeners: ownListenersCount,
    };
  }

  /**
   * Override EventEmitter methods for type safety
   */
  on<K extends keyof CommandHandlerEvents>(
    event: K,
    listener: CommandHandlerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof CommandHandlerEvents>(
    event: K,
    ...args: Parameters<CommandHandlerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
