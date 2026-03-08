import { describe, test, expect, afterEach } from 'vitest';
import { TaskManager } from '../../../src/process-manager/task-manager.js';

describe('TaskManager', () => {
  let taskManager: TaskManager;

  afterEach(async () => {
    await taskManager?.dispose();
  });

  describe('runTask', () => {
    test('should start a task and return TaskInfo', () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({ command: 'echo hello' });

      expect(info.id).toMatch(/^task-[a-z0-9]{6}$/);
      expect(info.command).toBe('echo hello');
      expect(info.status).toBe('running');
      expect(info.started_at).toBeGreaterThan(0);
      expect(info.exit_code).toBeNull();
      expect(info.finished_at).toBeNull();
    });

    test('should accept optional name', () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({
        command: 'echo test',
        name: 'my-task',
      });

      expect(info.name).toBe('my-task');
    });

    test('should track exit code on success', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({ command: 'echo done' });

      // Wait for process to exit
      const log = await taskManager.getTaskLog(info.id, {
        waitExit: true,
        timeout: 5000,
      });

      expect(log).not.toBeNull();
      expect(log!.exit_code).toBe(0);
      expect(log!.status).toBe('exited');

      const updated = taskManager.getTask(info.id);
      expect(updated!.status).toBe('exited');
      expect(updated!.exit_code).toBe(0);
      expect(updated!.duration_ms).toBeGreaterThanOrEqual(0);
      expect(updated!.finished_at).toBeGreaterThan(0);
    });

    test('should track exit code on failure', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({ command: 'exit 42' });

      const log = await taskManager.getTaskLog(info.id, {
        waitExit: true,
        timeout: 5000,
      });

      expect(log).not.toBeNull();
      expect(log!.exit_code).toBe(42);
      expect(log!.status).toBe('errored');
    });
  });

  describe('getTask', () => {
    test('should return null for unknown ID', () => {
      taskManager = new TaskManager();
      expect(taskManager.getTask('nonexistent')).toBeNull();
    });

    test('should return a copy of task info', () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({ command: 'sleep 10' });
      const retrieved = taskManager.getTask(info.id);

      expect(retrieved).toEqual(info);
      expect(retrieved).not.toBe(info); // Different object
    });
  });

  describe('getAllTasks', () => {
    test('should return all tasks', () => {
      taskManager = new TaskManager();
      taskManager.runTask({ command: 'echo 1' });
      taskManager.runTask({ command: 'echo 2' });

      const tasks = taskManager.getAllTasks();
      expect(tasks).toHaveLength(2);
    });

    test('should return empty array when no tasks', () => {
      taskManager = new TaskManager();
      expect(taskManager.getAllTasks()).toEqual([]);
    });
  });

  describe('killTask', () => {
    test('should kill a running task', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({ command: 'sleep 60' });

      // Give process time to start
      await new Promise((r) => setTimeout(r, 200));

      const killed = taskManager.killTask(info.id);
      expect(killed).toBe(true);

      // Wait for exit
      const log = await taskManager.getTaskLog(info.id, {
        waitExit: true,
        timeout: 5000,
      });
      expect(log!.status).not.toBe('running');
    });

    test('should return false for unknown task', () => {
      taskManager = new TaskManager();
      expect(taskManager.killTask('nonexistent')).toBe(false);
    });

    test('should return false for already exited task', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({ command: 'echo done' });

      await taskManager.getTaskLog(info.id, {
        waitExit: true,
        timeout: 5000,
      });

      expect(taskManager.killTask(info.id)).toBe(false);
    });
  });

  describe('getTaskLog', () => {
    test('should capture stdout', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({ command: 'echo "hello world"' });

      const log = await taskManager.getTaskLog(info.id, {
        waitExit: true,
        timeout: 5000,
      });

      expect(log).not.toBeNull();
      expect(log!.output).toContain('hello world');
    });

    test('should capture stderr', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({
        command: 'echo "error msg" >&2',
      });

      const log = await taskManager.getTaskLog(info.id, {
        waitExit: true,
        timeout: 5000,
      });

      expect(log!.output).toContain('error msg');
    });

    test('should return null for unknown task', async () => {
      taskManager = new TaskManager();
      const log = await taskManager.getTaskLog('nonexistent');
      expect(log).toBeNull();
    });

    test('should return current output without wait options', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({ command: 'echo immediate' });

      // Wait for output
      await new Promise((r) => setTimeout(r, 500));

      const log = await taskManager.getTaskLog(info.id);
      expect(log).not.toBeNull();
      expect(log!.timed_out).toBe(false);
    });
  });

  describe('wait-lines', () => {
    test('should wait until N lines are output', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({
        command: 'for i in 1 2 3 4 5; do echo "line $i"; done',
      });

      const log = await taskManager.getTaskLog(info.id, {
        waitLines: 3,
        timeout: 5000,
      });

      expect(log!.timed_out).toBe(false);
      expect(log!.output.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('wait-match', () => {
    test('should wait for regex match', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({
        command: 'echo "starting..."; echo "READY on port 3000"; echo "done"',
      });

      const log = await taskManager.getTaskLog(info.id, {
        waitMatch: 'READY.*port \\d+',
        timeout: 5000,
      });

      expect(log!.timed_out).toBe(false);
      expect(log!.matched).toMatch(/READY.*port \d+/);
      expect(log!.matched_line).toBeGreaterThan(0);
    });

    test('should return null matched when pattern not found', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({ command: 'echo "no match here"' });

      const log = await taskManager.getTaskLog(info.id, {
        waitMatch: 'WILL_NOT_MATCH',
        timeout: 1000,
      });

      // Process exits before match, so timed_out may be false
      expect(log!.matched).toBeNull();
    });
  });

  describe('wait-exit', () => {
    test('should wait for process exit', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({ command: 'sleep 0.5 && echo done' });

      const log = await taskManager.getTaskLog(info.id, {
        waitExit: true,
        timeout: 5000,
      });

      expect(log!.timed_out).toBe(false);
      expect(log!.status).not.toBe('running');
      expect(log!.exit_code).toBe(0);
    });
  });

  describe('timeout', () => {
    test('should timeout when condition not met', async () => {
      taskManager = new TaskManager();
      const info = taskManager.runTask({ command: 'sleep 60' });

      const log = await taskManager.getTaskLog(info.id, {
        waitMatch: 'WILL_NEVER_APPEAR',
        timeout: 500,
      });

      expect(log!.timed_out).toBe(true);
      expect(log!.status).toBe('running');
    });
  });

  describe('dispose', () => {
    test('should kill all running tasks', async () => {
      taskManager = new TaskManager();
      const info1 = taskManager.runTask({ command: 'sleep 60' });
      const info2 = taskManager.runTask({ command: 'sleep 60' });

      await new Promise((r) => setTimeout(r, 200));

      await taskManager.dispose();

      // After dispose, tasks map is cleared
      expect(taskManager.getTask(info1.id)).toBeNull();
      expect(taskManager.getTask(info2.id)).toBeNull();
    });
  });
});
