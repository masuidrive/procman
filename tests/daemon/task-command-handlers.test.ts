/**
 * Tests for Task Command Handlers
 */

import { describe, test, expect, afterEach } from 'vitest';
import { TaskManager } from '../../src/process-manager/task-manager.js';
import {
  handleRunTaskCommand,
  handleTaskStatusCommand,
  handleTaskListCommand,
  handleTaskKillCommand,
  handleTaskLogCommand,
} from '../../src/daemon/task-command-handlers.js';
import type { IPCMessage } from '../../src/shared/ipc.js';

function makeMessage<T>(type: string, payload: T): IPCMessage<T> {
  return {
    id: 'msg-001',
    type: type as IPCMessage<T>['type'],
    timestamp: Date.now(),
    payload,
  };
}

describe('Task Command Handlers', () => {
  let taskManager: TaskManager;

  afterEach(async () => {
    await taskManager?.dispose();
  });

  describe('handleRunTaskCommand', () => {
    test('should start a task and return task info', async () => {
      taskManager = new TaskManager();
      const msg = makeMessage('run-task', {
        command: 'echo hello',
        name: 'test-run',
      });

      const res = await handleRunTaskCommand(taskManager, msg);

      expect(res.success).toBe(true);
      expect(res.data!.task.id).toMatch(/^task-/);
      expect(res.data!.task.command).toBe('echo hello');
      expect(res.data!.task.name).toBe('test-run');
      expect(res.data!.task.status).toBe('running');
      expect(res.requestId).toBe('msg-001');
    });
  });

  describe('handleTaskStatusCommand', () => {
    test('should return task info for existing task', async () => {
      taskManager = new TaskManager();
      const task = taskManager.runTask({ command: 'echo test' });

      const msg = makeMessage('task-status', { id: task.id });
      const res = await handleTaskStatusCommand(taskManager, msg);

      expect(res.success).toBe(true);
      expect(res.data!.task.id).toBe(task.id);
    });

    test('should return error for unknown task', async () => {
      taskManager = new TaskManager();
      const msg = makeMessage('task-status', { id: 'nonexistent' });
      const res = await handleTaskStatusCommand(taskManager, msg);

      expect(res.success).toBe(false);
      expect(res.error!.code).toBe('PROCESS_NOT_FOUND');
    });
  });

  describe('handleTaskListCommand', () => {
    test('should return all tasks', async () => {
      taskManager = new TaskManager();
      taskManager.runTask({ command: 'echo 1' });
      taskManager.runTask({ command: 'echo 2' });

      const msg = makeMessage('task-list', {});
      const res = await handleTaskListCommand(taskManager, msg);

      expect(res.success).toBe(true);
      expect(res.data!.tasks).toHaveLength(2);
    });

    test('should return empty list when no tasks', async () => {
      taskManager = new TaskManager();
      const msg = makeMessage('task-list', {});
      const res = await handleTaskListCommand(taskManager, msg);

      expect(res.success).toBe(true);
      expect(res.data!.tasks).toHaveLength(0);
    });
  });

  describe('handleTaskKillCommand', () => {
    test('should kill a running task', async () => {
      taskManager = new TaskManager();
      const task = taskManager.runTask({ command: 'sleep 60' });
      await new Promise((r) => setTimeout(r, 200));

      const msg = makeMessage('task-kill', { id: task.id });
      const res = await handleTaskKillCommand(taskManager, msg);

      expect(res.success).toBe(true);
      expect(res.data!.killed).toBe(true);
      expect(res.data!.id).toBe(task.id);
    });

    test('should return killed=false for unknown task', async () => {
      taskManager = new TaskManager();
      const msg = makeMessage('task-kill', { id: 'nonexistent' });
      const res = await handleTaskKillCommand(taskManager, msg);

      expect(res.success).toBe(true);
      expect(res.data!.killed).toBe(false);
    });
  });

  describe('handleTaskLogCommand', () => {
    test('should return log output', async () => {
      taskManager = new TaskManager();
      const task = taskManager.runTask({ command: 'echo "handler test"' });

      const msg = makeMessage('task-log', {
        id: task.id,
        wait: { waitExit: true, timeout: 5000 },
      });
      const res = await handleTaskLogCommand(taskManager, msg);

      expect(res.success).toBe(true);
      expect(res.data!.log.output).toContain('handler test');
    });

    test('should return error for unknown task', async () => {
      taskManager = new TaskManager();
      const msg = makeMessage('task-log', { id: 'nonexistent' });
      const res = await handleTaskLogCommand(taskManager, msg);

      expect(res.success).toBe(false);
      expect(res.error!.code).toBe('PROCESS_NOT_FOUND');
    });
  });
});
