/**
 * Resource Management Type Definitions
 *
 * Provides interfaces for the Disposable pattern and tracked resources.
 */

/**
 * Represents a resource that can be disposed
 */
export interface IDisposable {
  dispose(): Promise<void> | void;
  isDisposed(): boolean;
}

/**
 * Represents a trackable resource with metadata
 */
export interface TrackedResource {
  id: string;
  type: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
  dispose(): Promise<void> | void;
}
