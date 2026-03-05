/**
 * Disposal Guard
 *
 * Utility class for preventing race conditions during disposal.
 */

/**
 * Utility class for preventing race conditions during disposal
 */
export class DisposalGuard {
  private disposing = false;
  private disposed = false;

  /**
   * Execute an operation with disposal protection
   */
  async executeWithGuard<T>(operation: () => Promise<T>): Promise<T> {
    if (this.disposed) {
      throw new Error('Object has been disposed');
    }

    if (this.disposing) {
      throw new Error('Object is being disposed');
    }

    return operation();
  }

  /**
   * Execute disposal with race condition protection
   */
  async executeDisposal(disposalFunc: () => Promise<void>): Promise<boolean> {
    if (this.disposed) {
      return false; // Already disposed
    }

    if (this.disposing) {
      return false; // Already disposing
    }

    this.disposing = true;

    try {
      await disposalFunc();
      this.disposed = true;
      return true;
    } catch (error) {
      this.disposing = false; // Reset on error
      throw error;
    }
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  isDisposing(): boolean {
    return this.disposing;
  }
}

/**
 * Create a new disposal guard instance
 */
export function createDisposalGuard(): DisposalGuard {
  return new DisposalGuard();
}
