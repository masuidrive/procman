/**
 * Task Command Handlers - タスク関連IPCコマンドの処理実装
 *
 * run-task, task-status, task-list, task-kill, task-log コマンドのハンドラー
 */

import { TaskManager } from '../process-manager/task-manager.js';
import type { IPCMessage, IPCResponse } from '../shared/ipc.js';
import type {
  RunTaskCommandPayload,
  TaskStatusCommandPayload,
  TaskListCommandPayload,
  TaskKillCommandPayload,
  TaskLogCommandPayload,
  RunTaskResponseData,
  TaskStatusResponseData,
  TaskListResponseData,
  TaskKillResponseData,
  TaskLogResponseData,
} from '../shared/task.js';

/**
 * Handle RUN-TASK command
 */
export async function handleRunTaskCommand(
  taskManager: TaskManager,
  message: IPCMessage<RunTaskCommandPayload>
): Promise<IPCResponse<RunTaskResponseData>> {
  const { command, name, cwd, env } = message.payload;

  const task = taskManager.runTask({ command, name, cwd, env });

  return {
    id: message.id,
    requestId: message.id,
    type: 'run-task',
    timestamp: Date.now(),
    success: true,
    data: { task },
  };
}

/**
 * Handle TASK-STATUS command
 */
export async function handleTaskStatusCommand(
  taskManager: TaskManager,
  message: IPCMessage<TaskStatusCommandPayload>
): Promise<IPCResponse<TaskStatusResponseData>> {
  const task = taskManager.getTask(message.payload.id);

  if (!task) {
    return {
      id: message.id,
      requestId: message.id,
      type: 'task-status',
      timestamp: Date.now(),
      success: false,
      error: {
        code: 'PROCESS_NOT_FOUND',
        message: `Task not found: ${message.payload.id}`,
      },
    };
  }

  return {
    id: message.id,
    requestId: message.id,
    type: 'task-status',
    timestamp: Date.now(),
    success: true,
    data: { task },
  };
}

/**
 * Handle TASK-LIST command
 */
export async function handleTaskListCommand(
  taskManager: TaskManager,
  message: IPCMessage<TaskListCommandPayload>
): Promise<IPCResponse<TaskListResponseData>> {
  const tasks = taskManager.getAllTasks();

  return {
    id: message.id,
    requestId: message.id,
    type: 'task-list',
    timestamp: Date.now(),
    success: true,
    data: { tasks },
  };
}

/**
 * Handle TASK-KILL command
 */
export async function handleTaskKillCommand(
  taskManager: TaskManager,
  message: IPCMessage<TaskKillCommandPayload>
): Promise<IPCResponse<TaskKillResponseData>> {
  const { id, signal } = message.payload;
  // eslint-disable-next-line no-undef
  const killed = taskManager.killTask(id, signal as NodeJS.Signals | undefined);

  return {
    id: message.id,
    requestId: message.id,
    type: 'task-kill',
    timestamp: Date.now(),
    success: true,
    data: { id, killed },
  };
}

/**
 * Handle TASK-LOG command
 */
export async function handleTaskLogCommand(
  taskManager: TaskManager,
  message: IPCMessage<TaskLogCommandPayload>
): Promise<IPCResponse<TaskLogResponseData>> {
  const { id, wait } = message.payload;
  const log = await taskManager.getTaskLog(id, wait);

  if (!log) {
    return {
      id: message.id,
      requestId: message.id,
      type: 'task-log',
      timestamp: Date.now(),
      success: false,
      error: {
        code: 'PROCESS_NOT_FOUND',
        message: `Task not found: ${id}`,
      },
    };
  }

  return {
    id: message.id,
    requestId: message.id,
    type: 'task-log',
    timestamp: Date.now(),
    success: true,
    data: { log },
  };
}
