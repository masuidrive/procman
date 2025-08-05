/**
 * Mutex implementation for process operations
 *
 * This utility provides mutual exclusion for asynchronous operations
 * to prevent race conditions when multiple operations are performed
 * on the same process concurrently.
 */

/**
 * Mutex for managing exclusive access to resources
 */
export class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  /**
   * Acquire the mutex lock
   * @returns Promise that resolves when lock is acquired
   */
  public async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release the mutex lock
   */
  public release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        // Keep locked and pass to next waiter
        next();
      }
    } else {
      this.locked = false;
    }
  }

  /**
   * Check if mutex is currently locked
   */
  public isLocked(): boolean {
    return this.locked;
  }

  /**
   * Get the number of waiters in queue
   */
  public getQueueLength(): number {
    return this.queue.length;
  }
}

/**
 * KeyedMutex for managing exclusive access to multiple resources by key
 */
export class KeyedMutex<K = string> {
  private mutexes = new Map<K, Mutex>();

  /**
   * Acquire mutex for a specific key
   * @param key The key to lock
   * @returns Promise that resolves when lock is acquired
   */
  public async acquire(key: K): Promise<void> {
    let mutex = this.mutexes.get(key);
    if (!mutex) {
      mutex = new Mutex();
      this.mutexes.set(key, mutex);
    }
    await mutex.acquire();
  }

  /**
   * Release mutex for a specific key
   * @param key The key to unlock
   */
  public release(key: K): void {
    const mutex = this.mutexes.get(key);
    if (mutex) {
      mutex.release();
      // Clean up if no one is waiting
      if (!mutex.isLocked() && mutex.getQueueLength() === 0) {
        this.mutexes.delete(key);
      }
    }
  }

  /**
   * Check if a specific key is locked
   * @param key The key to check
   */
  public isLocked(key: K): boolean {
    const mutex = this.mutexes.get(key);
    return mutex ? mutex.isLocked() : false;
  }

  /**
   * Get all currently locked keys
   */
  public getLockedKeys(): K[] {
    const locked: K[] = [];
    for (const [key, mutex] of this.mutexes) {
      if (mutex.isLocked()) {
        locked.push(key);
      }
    }
    return locked;
  }

  /**
   * Clear all mutexes (use with caution)
   */
  public clear(): void {
    this.mutexes.clear();
  }
}

/**
 * Decorator for wrapping async methods with mutex
 * @param keyExtractor Function to extract mutex key from method arguments
 */

export function withMutex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutexKey: string | ((args: any[]) => string)
): MethodDecorator {
  const keyedMutex = new KeyedMutex<string>();

  return function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...args: any[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
      const key = typeof mutexKey === 'function' ? mutexKey(args) : mutexKey;

      await keyedMutex.acquire(key);
      try {
        return await originalMethod.apply(this, args);
      } finally {
        keyedMutex.release(key);
      }
    };

    return descriptor;
  };
}

/**
 * Helper to run an async operation with mutex protection
 * @param mutex The mutex to use
 * @param operation The async operation to run
 * @returns Result of the operation
 */
export async function withLock<T>(
  mutex: Mutex,
  operation: () => Promise<T>
): Promise<T> {
  await mutex.acquire();
  try {
    return await operation();
  } finally {
    mutex.release();
  }
}

/**
 * Helper to run an async operation with keyed mutex protection
 * @param keyedMutex The keyed mutex to use
 * @param key The key to lock
 * @param operation The async operation to run
 * @returns Result of the operation
 */
export async function withKeyedLock<K, T>(
  keyedMutex: KeyedMutex<K>,
  key: K,
  operation: () => Promise<T>
): Promise<T> {
  await keyedMutex.acquire(key);
  try {
    return await operation();
  } finally {
    keyedMutex.release(key);
  }
}
