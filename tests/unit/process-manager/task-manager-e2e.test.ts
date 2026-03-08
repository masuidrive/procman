/**
 * E2E-style tests for TaskManager
 *
 * Tests the complete flow: run → status → log → kill
 */

import { describe, test, expect, afterEach } from 'vitest';
import { TaskManager } from '../../../src/process-manager/task-manager.js';

describe('TaskManager E2E Flow', () => {
  let taskManager: TaskManager;

  afterEach(async () => {
    await taskManager?.dispose();
  });

  test('run → status → log → kill flow', async () => {
    taskManager = new TaskManager();

    // 1. Run a long-running task
    const info = taskManager.runTask({
      command: 'for i in 1 2 3 4 5; do echo "line $i"; sleep 0.2; done; sleep 60',
      name: 'e2e-test',
    });

    expect(info.id).toMatch(/^task-/);
    expect(info.status).toBe('running');
    expect(info.name).toBe('e2e-test');

    // 2. Check status
    const status = taskManager.getTask(info.id);
    expect(status).not.toBeNull();
    expect(status!.status).toBe('running');
    expect(status!.pid).toBeGreaterThan(0);

    // 3. Wait for some log output
    const log = await taskManager.getTaskLog(info.id, {
      waitLines: 3,
      timeout: 5000,
    });

    expect(log).not.toBeNull();
    expect(log!.timed_out).toBe(false);
    expect(log!.output.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(3);

    // 4. Kill the task
    const killed = taskManager.killTask(info.id);
    expect(killed).toBe(true);

    // 5. Wait for exit
    const exitLog = await taskManager.getTaskLog(info.id, {
      waitExit: true,
      timeout: 5000,
    });

    expect(exitLog).not.toBeNull();
    expect(exitLog!.status).not.toBe('running');
  });

  test('successful task: run → wait-exit → verify exit code', async () => {
    taskManager = new TaskManager();

    const info = taskManager.runTask({
      command: 'echo "hello"; echo "world"; exit 0',
    });

    const log = await taskManager.getTaskLog(info.id, {
      waitExit: true,
      timeout: 5000,
    });

    expect(log!.timed_out).toBe(false);
    expect(log!.exit_code).toBe(0);
    expect(log!.status).toBe('exited');
    expect(log!.output).toContain('hello');
    expect(log!.output).toContain('world');
  });

  test('failing task: run → wait-exit → verify error code', async () => {
    taskManager = new TaskManager();

    const info = taskManager.runTask({
      command: 'echo "error output" >&2; exit 1',
    });

    const log = await taskManager.getTaskLog(info.id, {
      waitExit: true,
      timeout: 5000,
    });

    expect(log!.timed_out).toBe(false);
    expect(log!.exit_code).toBe(1);
    expect(log!.status).toBe('errored');
    expect(log!.output).toContain('error output');
  });

  test('wait-match flow: run → wait for pattern → verify match', async () => {
    taskManager = new TaskManager();

    const info = taskManager.runTask({
      command: 'echo "booting..."; echo "Server listening on port 8080"; echo "ready"',
    });

    const log = await taskManager.getTaskLog(info.id, {
      waitMatch: 'listening on port \\d+',
      timeout: 5000,
    });

    expect(log!.timed_out).toBe(false);
    expect(log!.matched).toMatch(/listening on port \d+/);
    expect(log!.matched_line).toBeGreaterThan(0);
  });

  test('multiple concurrent tasks', async () => {
    taskManager = new TaskManager();

    const task1 = taskManager.runTask({ command: 'echo "task1"; exit 0' });
    const task2 = taskManager.runTask({ command: 'echo "task2"; exit 0' });
    const task3 = taskManager.runTask({ command: 'echo "task3"; exit 1' });

    // All should be in list
    expect(taskManager.getAllTasks()).toHaveLength(3);

    // Wait for all to exit
    const [log1, log2, log3] = await Promise.all([
      taskManager.getTaskLog(task1.id, { waitExit: true, timeout: 5000 }),
      taskManager.getTaskLog(task2.id, { waitExit: true, timeout: 5000 }),
      taskManager.getTaskLog(task3.id, { waitExit: true, timeout: 5000 }),
    ]);

    expect(log1!.exit_code).toBe(0);
    expect(log2!.exit_code).toBe(0);
    expect(log3!.exit_code).toBe(1);

    expect(log1!.output).toContain('task1');
    expect(log2!.output).toContain('task2');
    expect(log3!.output).toContain('task3');
  });

  test('timeout flow: run → wait with short timeout → verify timed_out', async () => {
    taskManager = new TaskManager();

    const info = taskManager.runTask({ command: 'sleep 60' });

    const log = await taskManager.getTaskLog(info.id, {
      waitMatch: 'NEVER_APPEARS',
      timeout: 500,
    });

    expect(log!.timed_out).toBe(true);
    expect(log!.status).toBe('running');
    expect(log!.matched).toBeNull();
  });
});
