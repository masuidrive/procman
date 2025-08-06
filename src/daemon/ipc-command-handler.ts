/**
 * IPC Command Handler - IPCコマンドの処理実装
 *
 * ProcmanDaemonで受信したIPCコマンドを処理する責務を持つ。
 * 各コマンドの実装を提供し、適切なレスポンスを生成する。
 */

import { EventEmitter } from 'events';
import { ConfigLoader } from '../config/config-loader.js';
import { ProcessManager } from '../process-manager/process-manager.js';
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
  LoadResponseData,
  StartResponseData,
  StopResponseData,
  RestartResponseData,
  ListResponseData,
  LogResponseData,
  ClearLogResponseData,
  ExitResponseData,
} from '../shared/ipc.js';
import { LogOptions } from '../shared/logs.js';

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
};

/**
 * Timing constants
 */
const TIMING_CONSTANTS = {
  EXIT_SHUTDOWN_DELAY_MS: 100,
} as const;

/**
 * Daemon interface for command handler
 */
export interface DaemonInterface {
  getConfigLoader(): ConfigLoader | undefined;
  getProcessManager(): ProcessManager | undefined;
  getLogManager(): LogManager | undefined;
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
}

/**
 * IPC command handler implementation
 */
export class IPCCommandHandler extends EventEmitter {
  constructor(private daemon: DaemonInterface) {
    super();
  }

  /**
   * Handle incoming IPC message
   */
  async handleMessage(message: IPCMessage): Promise<IPCResponse> {
    this.emit('command:received', message.type, message.id);

    try {
      let response: IPCResponse;

      switch (message.type) {
        case COMMAND_TYPES.LOAD:
          response = await this.handleLoadCommand(
            message as IPCMessage<LoadCommandPayload>
          );
          break;

        case COMMAND_TYPES.START:
          response = await this.handleStartCommand(
            message as IPCMessage<StartCommandPayload>
          );
          break;

        case COMMAND_TYPES.STOP:
          response = await this.handleStopCommand(
            message as IPCMessage<StopCommandPayload>
          );
          break;

        case COMMAND_TYPES.RESTART:
          response = await this.handleRestartCommand(
            message as IPCMessage<RestartCommandPayload>
          );
          break;

        case COMMAND_TYPES.LIST:
          response = await this.handleListCommand(
            message as IPCMessage<ListCommandPayload>
          );
          break;

        case COMMAND_TYPES.LOG:
          response = await this.handleLogCommand(
            message as IPCMessage<LogCommandPayload>
          );
          break;

        case COMMAND_TYPES.CLEAR_LOG:
          response = await this.handleClearLogCommand(
            message as IPCMessage<ClearLogCommandPayload>
          );
          break;

        case COMMAND_TYPES.EXIT:
          response = await this.handleExitCommand(
            message as IPCMessage<ExitCommandPayload>
          );
          break;

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
   * Handle LOAD command
   */
  private async handleLoadCommand(
    message: IPCMessage<LoadCommandPayload>
  ): Promise<IPCResponse<LoadResponseData>> {
    const { configPath } = message.payload;

    await this.daemon.loadConfig(configPath);

    const config = this.daemon.getConfig();
    const response: LoadResponseData = {
      config: { apps: config || [] },
      appsCount: config?.length || 0,
    };

    return {
      id: message.id,
      requestId: message.id,
      type: COMMAND_TYPES.LOAD,
      timestamp: Date.now(),
      success: true,
      data: response,
    };
  }

  /**
   * Handle START command
   */
  private async handleStartCommand(
    message: IPCMessage<StartCommandPayload>
  ): Promise<IPCResponse<StartResponseData>> {
    const { targets } = message.payload;
    const processManager = this.daemon.getProcessManager();

    if (!processManager) {
      throw new Error('Process manager not initialized');
    }

    // Determine which processes to start
    let targetProcesses: string[] = [];
    if (targets && targets.length > 0) {
      // Check if targets are namespace patterns (e.g., "namespace:*")
      targetProcesses = targets.flatMap((target) => {
        if (target.includes(':')) {
          const [namespace] = target.split(':');
          return processManager.getProcessNamesByNamespace(namespace);
        }
        return target;
      });
    } else {
      // Start all processes
      targetProcesses = processManager.getProcessNames();
    }

    if (targetProcesses.length === 0) {
      throw new Error('No processes found to start');
    }

    // Start processes
    const batchResults = await processManager.startProcesses(targetProcesses);

    // Count successes and failures
    const started = batchResults.filter((r) => r.success).map((r) => r.name);
    const alreadyRunning: string[] = [];
    const failed = batchResults
      .filter((r) => !r.success)
      .map((r) => ({
        name: r.name,
        error: r.error || 'Unknown error',
      }));

    const response: StartResponseData = {
      started,
      alreadyRunning,
      failed,
    };

    return {
      id: message.id,
      requestId: message.id,
      type: COMMAND_TYPES.START,
      timestamp: Date.now(),
      success: true,
      data: response,
    };
  }

  /**
   * Handle STOP command
   */
  private async handleStopCommand(
    message: IPCMessage<StopCommandPayload>
  ): Promise<IPCResponse<StopResponseData>> {
    const { targets } = message.payload;
    const processManager = this.daemon.getProcessManager();

    if (!processManager) {
      throw new Error('Process manager not initialized');
    }

    // Determine which processes to stop
    let targetProcesses: string[] = [];
    if (targets && targets.length > 0) {
      targetProcesses = targets.flatMap((target) => {
        if (target.includes(':')) {
          const [namespace] = target.split(':');
          return processManager.getProcessNamesByNamespace(namespace);
        }
        return target;
      });
    } else {
      // Stop all processes
      targetProcesses = processManager.getProcessNames();
    }

    if (targetProcesses.length === 0) {
      throw new Error('No processes found to stop');
    }

    // Stop processes
    const batchResults = await processManager.stopProcesses(targetProcesses);

    // Count successes and failures
    const stopped = batchResults.filter((r) => r.success).map((r) => r.name);
    const alreadyStopped: string[] = [];
    const failed = batchResults
      .filter((r) => !r.success)
      .map((r) => ({
        name: r.name,
        error: r.error || 'Unknown error',
      }));

    const response: StopResponseData = {
      stopped,
      alreadyStopped,
      failed,
    };

    return {
      id: message.id,
      requestId: message.id,
      type: COMMAND_TYPES.STOP,
      timestamp: Date.now(),
      success: true,
      data: response,
    };
  }

  /**
   * Handle RESTART command
   */
  private async handleRestartCommand(
    message: IPCMessage<RestartCommandPayload>
  ): Promise<IPCResponse<RestartResponseData>> {
    const { targets } = message.payload;
    const processManager = this.daemon.getProcessManager();

    if (!processManager) {
      throw new Error('Process manager not initialized');
    }

    // Determine which processes to restart
    let targetProcesses: string[] = [];
    if (targets && targets.length > 0) {
      targetProcesses = targets.flatMap((target) => {
        if (target.includes(':')) {
          const [namespace] = target.split(':');
          return processManager.getProcessNamesByNamespace(namespace);
        }
        return target;
      });
    } else {
      // Restart all processes
      targetProcesses = processManager.getProcessNames();
    }

    if (targetProcesses.length === 0) {
      throw new Error('No processes found to restart');
    }

    // Restart processes
    const batchResults = await processManager.restartProcesses(targetProcesses);

    // Count successes and failures
    const restarted = batchResults.filter((r) => r.success).map((r) => r.name);
    const failed = batchResults
      .filter((r) => !r.success)
      .map((r) => ({
        name: r.name,
        error: r.error || 'Unknown error',
      }));

    const response: RestartResponseData = {
      restarted,
      failed,
    };

    return {
      id: message.id,
      requestId: message.id,
      type: COMMAND_TYPES.RESTART,
      timestamp: Date.now(),
      success: true,
      data: response,
    };
  }

  /**
   * Handle LIST command
   */
  private async handleListCommand(
    message: IPCMessage<ListCommandPayload>
  ): Promise<IPCResponse<ListResponseData>> {
    const processes = await this.daemon.getAllProcessStatuses();

    const response: ListResponseData = {
      configFile: '<unknown>',
      daemonUptime: process.uptime(),
      processes,
    };

    return {
      id: message.id,
      requestId: message.id,
      type: COMMAND_TYPES.LIST,
      timestamp: Date.now(),
      success: true,
      data: response,
    };
  }

  /**
   * Handle LOG command
   */
  private async handleLogCommand(
    message: IPCMessage<LogCommandPayload>
  ): Promise<IPCResponse<LogResponseData>> {
    const { target, options } = message.payload;
    const logManager = this.daemon.getLogManager();

    if (!logManager) {
      throw new Error('Log manager not initialized');
    }

    // For streaming logs, we'll need to implement a different approach
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const follow = (options as any)?.follow;
    if (follow) {
      throw new Error('Log streaming not yet implemented');
    }

    const logOptions: LogOptions = {
      lines: options?.lines || 100,
    };

    const logs = await logManager.readLogs(target, logOptions);

    const response: LogResponseData = {
      entries: logs,
      total: logs.length,
    };

    return {
      id: message.id,
      requestId: message.id,
      type: COMMAND_TYPES.LOG,
      timestamp: Date.now(),
      success: true,
      data: response,
    };
  }

  /**
   * Handle CLEAR_LOG command
   */
  private async handleClearLogCommand(
    message: IPCMessage<ClearLogCommandPayload>
  ): Promise<IPCResponse<ClearLogResponseData>> {
    const { target } = message.payload;
    const logManager = this.daemon.getLogManager();
    const processManager = this.daemon.getProcessManager();

    if (!logManager) {
      throw new Error('Log manager not initialized');
    }

    // Determine which logs to clear
    let targetProcesses: string[] = [];
    if (target) {
      if (target.includes(':')) {
        const [namespace] = target.split(':');
        targetProcesses =
          processManager?.getProcessNamesByNamespace(namespace) || [];
      } else {
        targetProcesses = [target];
      }
    } else {
      targetProcesses = processManager?.getProcessNames() || [];
    }

    if (targetProcesses.length === 0) {
      throw new Error('No processes found to clear logs');
    }

    // Clear logs for each process
    for (const processName of targetProcesses) {
      await logManager.clearLogs(processName);
    }

    const response: ClearLogResponseData = {
      cleared: targetProcesses,
    };

    return {
      id: message.id,
      requestId: message.id,
      type: COMMAND_TYPES.CLEAR_LOG,
      timestamp: Date.now(),
      success: true,
      data: response,
    };
  }

  /**
   * Handle EXIT command
   */
  private async handleExitCommand(
    message: IPCMessage<ExitCommandPayload>
  ): Promise<IPCResponse<ExitResponseData>> {
    const processManager = this.daemon.getProcessManager();
    const processCount = processManager?.getProcessNames().length || 0;

    const response: ExitResponseData = {
      processCount,
    };

    // Schedule daemon shutdown after sending response
    setTimeout(() => {
      this.daemon
        .stop()
        .then(() => {
          process.exit(0);
        })
        .catch((error) => {
          console.error('Error during daemon shutdown:', error);
          process.exit(1);
        });
    }, TIMING_CONSTANTS.EXIT_SHUTDOWN_DELAY_MS);

    return {
      id: message.id,
      requestId: message.id,
      type: COMMAND_TYPES.EXIT,
      timestamp: Date.now(),
      success: true,
      data: response,
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
