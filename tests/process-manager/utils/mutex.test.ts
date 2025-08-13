/**
 * Unit tests for Mutex utilities
 */

import { describe, beforeEach, it, expect } from 'vitest';
import {
  Mutex,
  KeyedMutex,
  withLock,
  withKeyedLock,
} from '../../../src/process-manager/utils/mutex';

// Node.js global types
declare const setTimeout: (
  callback: (...args: unknown[]) => void,
  ms: number
) => unknown;

describe('Mutex', () => {
  let mutex: Mutex;

  beforeEach(() => {
    mutex = new Mutex();
  });

  it('should allow single acquisition', async () => {
    await mutex.acquire();
    expect(mutex.isLocked()).toBe(true);

    mutex.release();
    expect(mutex.isLocked()).toBe(false);
  });

  it('should queue multiple acquisitions', async () => {
    // First acquisition
    await mutex.acquire();
    expect(mutex.isLocked()).toBe(true);

    // Track order of acquisitions
    const order: number[] = [];

    // Second acquisition (will be queued)
    const promise2 = mutex.acquire().then(() => {
      order.push(2);
    });

    // Third acquisition (will be queued)
    const promise3 = mutex.acquire().then(() => {
      order.push(3);
    });

    // Verify queue length
    expect(mutex.getQueueLength()).toBe(2);

    // Release for second
    order.push(1);
    mutex.release();
    await promise2;

    // Release for third
    mutex.release();
    await promise3;

    // Release the final lock
    mutex.release();

    // Verify order
    expect(order).toEqual([1, 2, 3]);
    expect(mutex.isLocked()).toBe(false);
  });

  it('should handle concurrent access with withLock', async () => {
    const startTime = Date.now();
    console.log(`DEBUG: Starting withLock test at ${new Date().toISOString()}`);
    console.log(`DEBUG: CI environment: ${process.env.CI || 'false'}`);
    console.log(`DEBUG: Node.js version: ${process.version}`);

    let sharedValue = 0;
    const operations: Promise<number>[] = [];

    // Simulate concurrent operations
    for (let i = 0; i < 5; i++) {
      const operationStart = Date.now();
      console.log(
        `DEBUG: Creating operation ${i} at ${Date.now() - startTime}ms`
      );
      operations.push(
        withLock(mutex, async () => {
          const lockStart = Date.now();
          console.log(
            `DEBUG: Operation ${i} acquired lock at ${lockStart - startTime}ms, sharedValue=${sharedValue}`
          );
          const current = sharedValue;
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 10));
          sharedValue = current + 1;
          const lockEnd = Date.now();
          console.log(
            `DEBUG: Operation ${i} completed at ${lockEnd - startTime}ms, sharedValue=${sharedValue}, duration=${lockEnd - lockStart}ms`
          );
          return sharedValue;
        })
      );
      console.log(
        `DEBUG: Operation ${i} promise created in ${Date.now() - operationStart}ms`
      );
    }

    console.log(
      `DEBUG: All operations created at ${Date.now() - startTime}ms, waiting for completion...`
    );
    const results = await Promise.all(operations);
    const endTime = Date.now();
    console.log(
      `DEBUG: All operations completed at ${endTime - startTime}ms (total duration: ${endTime - startTime}ms)`
    );

    // Without mutex, this could be less than 5 due to race conditions
    expect(sharedValue).toBe(5);
    expect(results).toEqual([1, 2, 3, 4, 5]);
  }, 45000);
});

describe('KeyedMutex', () => {
  let keyedMutex: KeyedMutex<string>;

  beforeEach(() => {
    keyedMutex = new KeyedMutex<string>();
  });

  it('should allow independent locks for different keys', async () => {
    await keyedMutex.acquire('key1');
    await keyedMutex.acquire('key2');

    expect(keyedMutex.isLocked('key1')).toBe(true);
    expect(keyedMutex.isLocked('key2')).toBe(true);
    expect(keyedMutex.isLocked('key3')).toBe(false);

    keyedMutex.release('key1');
    expect(keyedMutex.isLocked('key1')).toBe(false);
    expect(keyedMutex.isLocked('key2')).toBe(true);

    keyedMutex.release('key2');
    expect(keyedMutex.isLocked('key2')).toBe(false);
  });

  it('should queue operations on same key', async () => {
    const order: string[] = [];

    await keyedMutex.acquire('key1');

    const promise1 = keyedMutex.acquire('key1').then(() => {
      order.push('second');
    });

    const promise2 = keyedMutex.acquire('key1').then(() => {
      order.push('third');
    });

    // Different key should not be blocked
    await keyedMutex.acquire('key2');
    order.push('key2');
    keyedMutex.release('key2');

    order.push('first');
    keyedMutex.release('key1');
    await promise1;

    keyedMutex.release('key1');
    await promise2;

    expect(order).toEqual(['key2', 'first', 'second', 'third']);
  });

  it('should cleanup unused mutexes', async () => {
    await keyedMutex.acquire('temp');
    keyedMutex.release('temp');

    // After release with no queue, mutex should be cleaned up
    expect(keyedMutex.isLocked('temp')).toBe(false);
    expect(keyedMutex.getLockedKeys()).toEqual([]);
  });

  it('should track locked keys', async () => {
    await keyedMutex.acquire('key1');
    await keyedMutex.acquire('key2');
    await keyedMutex.acquire('key3');
    keyedMutex.release('key2');

    const lockedKeys = keyedMutex.getLockedKeys();
    expect(lockedKeys).toContain('key1');
    expect(lockedKeys).toContain('key3');
    expect(lockedKeys).not.toContain('key2');
  });

  it('should handle withKeyedLock helper', async () => {
    const startTime = Date.now();
    console.log(
      `DEBUG: Starting withKeyedLock test at ${new Date().toISOString()}`
    );
    const results: number[] = [];

    // Concurrent operations on same key
    const promises = [1, 2, 3].map(async (n) => {
      const operationStart = Date.now();
      console.log(
        `DEBUG: Creating operation ${n} at ${operationStart - startTime}ms`
      );
      return withKeyedLock(keyedMutex, 'shared', async () => {
        const lockStart = Date.now();
        console.log(
          `DEBUG: Operation ${n} started at ${lockStart - startTime}ms`
        );
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(n);
        const lockEnd = Date.now();
        console.log(
          `DEBUG: Operation ${n} completed at ${lockEnd - startTime}ms, duration=${lockEnd - lockStart}ms`
        );
        return n;
      });
    });

    console.log(
      `DEBUG: All withKeyedLock operations created at ${Date.now() - startTime}ms, waiting for completion...`
    );
    const values = await Promise.all(promises);
    const endTime = Date.now();
    console.log(
      `DEBUG: All withKeyedLock operations completed at ${endTime - startTime}ms (total duration: ${endTime - startTime}ms)`
    );

    // Results should be in order due to mutex
    expect(results).toEqual([1, 2, 3]);
    expect(values).toEqual([1, 2, 3]);
  }, 45000);

  it('should clear all mutexes', () => {
    keyedMutex.acquire('key1');
    keyedMutex.acquire('key2');

    expect(keyedMutex.getLockedKeys().length).toBe(2);

    keyedMutex.clear();

    expect(keyedMutex.getLockedKeys().length).toBe(0);
    expect(keyedMutex.isLocked('key1')).toBe(false);
    expect(keyedMutex.isLocked('key2')).toBe(false);
  });
});

describe('Mutex integration with ProcessLifecycleManager', () => {
  it('should prevent concurrent operations on same process', async () => {
    const testStartTime = Date.now();
    console.log(
      `DEBUG: Starting prevent concurrent operations test at ${new Date().toISOString()}`
    );
    const keyedMutex = new KeyedMutex<string>();
    const operationLog: string[] = [];

    // Simulate concurrent start/stop operations
    const startOperation = withKeyedLock(keyedMutex, 'process1', async () => {
      const lockStartTime = Date.now();
      console.log(`DEBUG: start-begin at ${lockStartTime - testStartTime}ms`);
      operationLog.push('start-begin');
      await new Promise((resolve) => setTimeout(resolve, 50));
      const lockEndTime = Date.now();
      operationLog.push('start-end');
      console.log(
        `DEBUG: start-end at ${lockEndTime - testStartTime}ms, duration=${lockEndTime - lockStartTime}ms`
      );
    });

    const stopOperation = withKeyedLock(keyedMutex, 'process1', async () => {
      const lockStartTime = Date.now();
      console.log(`DEBUG: stop-begin at ${lockStartTime - testStartTime}ms`);
      operationLog.push('stop-begin');
      await new Promise((resolve) => setTimeout(resolve, 30));
      const lockEndTime = Date.now();
      operationLog.push('stop-end');
      console.log(
        `DEBUG: stop-end at ${lockEndTime - testStartTime}ms, duration=${lockEndTime - lockStartTime}ms`
      );
    });

    const restartOperation = withKeyedLock(keyedMutex, 'process1', async () => {
      const lockStartTime = Date.now();
      console.log(`DEBUG: restart-begin at ${lockStartTime - testStartTime}ms`);
      operationLog.push('restart-begin');
      await new Promise((resolve) => setTimeout(resolve, 20));
      const lockEndTime = Date.now();
      operationLog.push('restart-end');
      console.log(
        `DEBUG: restart-end at ${lockEndTime - testStartTime}ms, duration=${lockEndTime - lockStartTime}ms`
      );
    });

    console.log(
      `DEBUG: All operations created at ${Date.now() - testStartTime}ms, waiting for completion...`
    );
    await Promise.all([startOperation, stopOperation, restartOperation]);
    const testEndTime = Date.now();
    console.log(
      `DEBUG: All concurrent operations completed at ${testEndTime - testStartTime}ms (total duration: ${testEndTime - testStartTime}ms)`
    );

    // Operations should not interleave
    expect(operationLog).toEqual([
      'start-begin',
      'start-end',
      'stop-begin',
      'stop-end',
      'restart-begin',
      'restart-end',
    ]);
  }, 45000);

  it('should allow concurrent operations on different processes', async () => {
    const testStartTime = Date.now();
    console.log(
      `DEBUG: Starting concurrent different processes test at ${new Date().toISOString()}`
    );
    const keyedMutex = new KeyedMutex<string>();
    const startTimes: Record<string, number> = {};
    const endTimes: Record<string, number> = {};

    const operations = ['process1', 'process2', 'process3'].map(
      async (processName) => {
        const operationCreateTime = Date.now();
        console.log(
          `DEBUG: Creating operation for ${processName} at ${operationCreateTime - testStartTime}ms`
        );
        return withKeyedLock(keyedMutex, processName, async () => {
          const lockStartTime = Date.now();
          console.log(
            `DEBUG: ${processName} started at ${lockStartTime - testStartTime}ms`
          );
          startTimes[processName] = lockStartTime;
          await new Promise((resolve) => setTimeout(resolve, 50));
          const lockEndTime = Date.now();
          endTimes[processName] = lockEndTime;
          console.log(
            `DEBUG: ${processName} ended at ${lockEndTime - testStartTime}ms, duration=${lockEndTime - lockStartTime}ms`
          );
        });
      }
    );

    console.log(
      `DEBUG: All operations created at ${Date.now() - testStartTime}ms, waiting for completion...`
    );
    await Promise.all(operations);
    const testEndTime = Date.now();
    console.log(
      `DEBUG: All different process operations completed at ${testEndTime - testStartTime}ms (total duration: ${testEndTime - testStartTime}ms)`
    );

    // All operations should have overlapped (run concurrently)
    const allStarted = Math.max(...Object.values(startTimes));
    const firstEnded = Math.min(...Object.values(endTimes));

    console.log(
      `DEBUG: allStarted=${allStarted}, firstEnded=${firstEnded}, testStartTime=${testStartTime}`
    );
    console.log(
      `DEBUG: Relative allStarted=${allStarted - testStartTime}ms, firstEnded=${firstEnded - testStartTime}ms`
    );

    // If they ran concurrently, the last to start should start before the first to end
    expect(allStarted).toBeLessThan(firstEnded);
  }, 45000);
});
