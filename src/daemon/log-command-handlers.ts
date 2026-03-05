/**
 * Log Command Handlers - ログ関連IPCコマンドの処理実装
 *
 * log, clear-logコマンドのハンドラーを提供する。
 */

import { EventEmitter } from 'events';
import {
  CommandType,
  IPCMessage,
  IPCResponse,
  LogCommandPayload,
  ClearLogCommandPayload,
  LogResponseData,
  ClearLogResponseData,
} from '../shared/ipc.js';
import { LogOptions } from '../shared/logs.js';
import { LOG_STREAM_EVENTS } from '../shared/constants-streaming.js';
import { DaemonInterface } from './ipc-command-handler.js';

/**
 * Command type constants (log-related)
 */
const COMMAND_TYPES = {
  LOG: 'log' as CommandType,
  CLEAR_LOG: 'clear-log' as CommandType,
};

/**
 * Handle LOG command
 */
export async function handleLogCommand(
  daemon: DaemonInterface,
  emitter: EventEmitter,
  message: IPCMessage<LogCommandPayload>,
  connection?: { id?: string }
): Promise<IPCResponse<LogResponseData>> {
  const { target, options } = message.payload;
  const logManager = daemon.getLogManager();

  if (!logManager) {
    throw new Error('Log manager not initialized');
  }

  // Check if streaming is requested
  const follow = options?.follow;

  if (follow) {
    // ストリーミングモードの場合、接続情報を保存してストリーミングを開始
    // 注: 実際のストリーミングはIPCサーバー側で処理する必要がある
    // ここでは通常のレスポンスを返し、別途ストリーミングイベントを送信する

    // ストリーミング開始のマーカーを含むレスポンスを返す
    const response: LogResponseData = {
      entries: [],
      total: 0,
      streaming: true, // ストリーミングモードであることを示すフラグ
    };

    // ストリーミングの設定をイベントとして発行
    // これにより、IPCサーバーがストリーミングを開始できる
    emitter.emit(LOG_STREAM_EVENTS.START_LOG_STREAM, {
      messageId: message.id,
      target,
      options,
      connectionId: connection?.id, // Pass connection ID for specific client streaming
    });

    return {
      id: message.id,
      requestId: message.id,
      type: COMMAND_TYPES.LOG,
      timestamp: Date.now(),
      success: true,
      data: response,
    };
  }

  // 通常モード（非ストリーミング）
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
export async function handleClearLogCommand(
  daemon: DaemonInterface,
  message: IPCMessage<ClearLogCommandPayload>
): Promise<IPCResponse<ClearLogResponseData>> {
  const { target } = message.payload;
  const logManager = daemon.getLogManager();
  const processManager = daemon.getProcessManager();

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
