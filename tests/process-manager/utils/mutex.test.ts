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
    console.log('DEBUG: Starting withLock test');
    let sharedValue = 0;
    const operations: Promise<number>[] = [];

    // Simulate concurrent operations
    for (let i = 0; i < 5; i++) {
      console.log(`DEBUG: Creating operation ${i}`);
      operations.push(
        withLock(mutex, async () => {
          console.log(`DEBUG: Operation started, sharedValue=${sharedValue}`);
          const current = sharedValue;
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 10));
          sharedValue = current + 1;
          console.log(`DEBUG: Operation completed, sharedValue=${sharedValue}`);
          return sharedValue;
        })
      );
    }

    console.log('DEBUG: Waiting for all operations...');
    const results = await Promise.all(operations);
    console.log('DEBUG: All operations completed');

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
    console.log('DEBUG: Starting withKeyedLock test');
    const results: number[] = [];

    // Concurrent operations on same key
    const promises = [1, 2, 3].map(async (n) => {
      console.log(`DEBUG: Creating operation ${n}`);
      return withKeyedLock(keyedMutex, 'shared', async () => {
        console.log(`DEBUG: Operation ${n} started`);
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(n);
        console.log(`DEBUG: Operation ${n} completed`);
        return n;
      });
    });

    console.log('DEBUG: Waiting for all withKeyedLock operations...');
    const values = await Promise.all(promises);
    console.log('DEBUG: All withKeyedLock operations completed');

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
    console.log('DEBUG: Starting prevent concurrent operations test');
    const keyedMutex = new KeyedMutex<string>();
    const operationLog: string[] = [];

    // Simulate concurrent start/stop operations
    const startOperation = withKeyedLock(keyedMutex, 'process1', async () => {
      console.log('DEBUG: start-begin');
      operationLog.push('start-begin');
      await new Promise((resolve) => setTimeout(resolve, 50));
      operationLog.push('start-end');
      console.log('DEBUG: start-end');
    });

    const stopOperation = withKeyedLock(keyedMutex, 'process1', async () => {
      console.log('DEBUG: stop-begin');
      operationLog.push('stop-begin');
      await new Promise((resolve) => setTimeout(resolve, 30));
      operationLog.push('stop-end');
      console.log('DEBUG: stop-end');
    });

    const restartOperation = withKeyedLock(keyedMutex, 'process1', async () => {
      console.log('DEBUG: restart-begin');
      operationLog.push('restart-begin');
      await new Promise((resolve) => setTimeout(resolve, 20));
      operationLog.push('restart-end');
      console.log('DEBUG: restart-end');
    });

    console.log('DEBUG: Waiting for all concurrent operations...');
    await Promise.all([startOperation, stopOperation, restartOperation]);
    console.log('DEBUG: All concurrent operations completed');

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
    console.log('DEBUG: Starting concurrent different processes test');
    const keyedMutex = new KeyedMutex<string>();
    const startTimes: Record<string, number> = {};
    const endTimes: Record<string, number> = {};

    const operations = ['process1', 'process2', 'process3'].map(
      async (processName) => {
        console.log(`DEBUG: Creating operation for ${processName}`);
        return withKeyedLock(keyedMutex, processName, async () => {
          console.log(`DEBUG: ${processName} started`);
          startTimes[processName] = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 50));
          endTimes[processName] = Date.now();
          console.log(`DEBUG: ${processName} ended`);
        });
      }
    );

    console.log('DEBUG: Waiting for all different process operations...');
    await Promise.all(operations);
    console.log('DEBUG: All different process operations completed');

    // All operations should have overlapped (run concurrently)
    const allStarted = Math.max(...Object.values(startTimes));
    const firstEnded = Math.min(...Object.values(endTimes));

    console.log(`DEBUG: allStarted=${allStarted}, firstEnded=${firstEnded}`);

    // If they ran concurrently, the last to start should start before the first to end
    expect(allStarted).toBeLessThan(firstEnded);
  }, 45000);
});
