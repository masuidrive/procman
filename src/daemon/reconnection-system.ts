/**
 * Simple Reconnection System with Exponential Backoff
 *
 * Provides basic exponential backoff reconnection strategy for IPC connections.
 */

import { EventEmitter } from 'events';
import { SimpleDisposableBase, SimpleTimeout } from './simple-resource-manager';

/**
 * Reconnection options
 */
export interface ReconnectionOptions {
  /** Initial delay in milliseconds */
  initialDelay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Maximum number of reconnection attempts */
  maxAttempts?: number;
  /** Backoff multiplier for exponential strategy */
  backoffMultiplier?: number;
  /** Enable automatic reconnection */
  autoReconnect?: boolean;
}

/**
 * Reconnection attempt result
 */
export interface ReconnectionAttempt {
  attempt: number;
  timestamp: number;
  delay: number;
  success: boolean;
  error?: Error;
}

/**
 * Simple Reconnection System
 */
export class ReconnectionSystem extends SimpleDisposableBase {
  private readonly options: Required<ReconnectionOptions>;
  private currentAttempt = 0;
  private reconnectionTimer: SimpleTimeout | null = null;
  private isReconnecting = false;
  private eventEmitter = new EventEmitter();

  constructor(options: ReconnectionOptions = {}) {
    super();

    this.options = {
      initialDelay: options.initialDelay ?? 1000,
      maxDelay: options.maxDelay ?? 30000,
      maxAttempts: options.maxAttempts ?? 5,
      backoffMultiplier: options.backoffMultiplier ?? 2,
      autoReconnect: options.autoReconnect ?? true,
    };
  }

  /**
   * Start reconnection process
   */
  async startReconnection(connectionFunc: () => Promise<void>): Promise<void> {
    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;
    this.currentAttempt = 0;

    this.emit('reconnectionStarted');

    return this.attemptReconnection(connectionFunc);
  }

  /**
   * Stop reconnection process
   */
  async stopReconnection(): Promise<void> {
    this.isReconnecting = false;

    if (this.reconnectionTimer) {
      await this.reconnectionTimer.dispose();
      this.reconnectionTimer = null;
    }

    this.emit('reconnectionStopped');
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  private async attemptReconnection(
    connectionFunc: () => Promise<void>
  ): Promise<void> {
    if (!this.isReconnecting) {
      return;
    }

    if (this.currentAttempt >= this.options.maxAttempts) {
      this.handleMaxAttemptsReached();
      return;
    }

    this.currentAttempt++;
    const delay = this.calculateDelay();
    const startTime = Date.now();

    const attempt: ReconnectionAttempt = {
      attempt: this.currentAttempt,
      timestamp: startTime,
      delay,
      success: false,
    };

    this.emit('attemptStarted', attempt);

    // Wait for the calculated delay
    if (delay > 0) {
      await this.wait(delay);
    }

    if (!this.isReconnecting) {
      return;
    }

    try {
      await connectionFunc();

      // Connection successful
      attempt.success = true;
      this.isReconnecting = false;
      this.currentAttempt = 0;

      this.emit('attemptSucceeded', attempt);
      this.emit('reconnectionSucceeded');
    } catch (error) {
      // Connection failed
      attempt.error = error as Error;
      this.emit('attemptFailed', attempt);

      // Schedule next attempt
      this.scheduleNextAttempt(connectionFunc);
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateDelay(): number {
    if (this.currentAttempt === 1) {
      return 0; // First attempt should be immediate
    }

    const delay =
      this.options.initialDelay *
      Math.pow(this.options.backoffMultiplier, this.currentAttempt - 2);

    return Math.min(delay, this.options.maxDelay);
  }

  /**
   * Schedule next reconnection attempt
   */
  private scheduleNextAttempt(connectionFunc: () => Promise<void>): void {
    if (!this.isReconnecting) {
      return;
    }

    this.reconnectionTimer = this.setTimeout(() => {
      this.reconnectionTimer = null;
      this.attemptReconnection(connectionFunc);
    }, 100); // Small delay before next attempt
  }

  /**
   * Handle max attempts reached
   */
  private handleMaxAttemptsReached(): void {
    this.isReconnecting = false;
    this.emit('maxAttemptsReached', this.currentAttempt);
    this.emit('reconnectionFailed');
  }

  /**
   * Wait for specified time
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  /**
   * Get current reconnection status
   */
  isReconnectingActive(): boolean {
    return this.isReconnecting;
  }

  /**
   * Get current attempt number
   */
  getCurrentAttempt(): number {
    return this.currentAttempt;
  }

  /**
   * Reset reconnection state
   */
  async reset(): Promise<void> {
    await this.stopReconnection();
    this.currentAttempt = 0;
  }

  /**
   * Implement disposal core for DisposableBase
   */
  protected disposeCore(): void {
    // Stop reconnection process (non-blocking)
    this.stopReconnection().catch(() => {
      /* ignore */
    });

    // Clear event listeners
    this.eventEmitter.removeAllListeners();
  }

  /**
   * Get resource usage statistics
   */
  getResourceStats(): {
    isReconnecting: boolean;
    currentAttempt: number;
    hasActiveTimer: boolean;
    maxAttempts: number;
    totalResources: number;
  } {
    const resourceCount = this.resources.getResourceCount();
    return {
      isReconnecting: this.isReconnecting,
      currentAttempt: this.currentAttempt,
      hasActiveTimer: !!this.reconnectionTimer,
      maxAttempts: this.options.maxAttempts,
      totalResources:
        resourceCount.timeouts +
        resourceCount.intervals +
        resourceCount.listeners,
    };
  }

  /**
   * EventEmitter implementation methods
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  once(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventEmitter.once(event, listener);
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string | symbol, ...args: any[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  removeListener(
    event: string | symbol,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void
  ): this {
    this.eventEmitter.removeListener(event, listener);
    return this;
  }

  removeAllListeners(event?: string | symbol): this {
    this.eventEmitter.removeAllListeners(event);
    return this;
  }

  setMaxListeners(n: number): this {
    this.eventEmitter.setMaxListeners(n);
    return this;
  }

  getMaxListeners(): number {
    return this.eventEmitter.getMaxListeners();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listeners(event: string | symbol): ((...args: any[]) => void)[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.eventEmitter.listeners(event) as ((...args: any[]) => void)[];
  }

  listenerCount(event: string | symbol): number {
    return this.eventEmitter.listenerCount(event);
  }
}

/**
 * Create a simple reconnection system instance
 */
export function createReconnectionSystem(
  options: ReconnectionOptions = {}
): ReconnectionSystem {
  return new ReconnectionSystem(options);
}
