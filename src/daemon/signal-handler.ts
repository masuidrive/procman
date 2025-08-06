/**
 * Signal Handler - シグナルハンドリングの専門クラス
 *
 * プロセスシグナルの処理を管理し、グレースフルシャットダウンを実装する。
 * Single Responsibility Principle に従ってシグナル処理のみに特化。
 */

import { EventEmitter } from 'events';

/**
 * Events emitted by SignalHandler
 */
export interface SignalHandlerEvents {
  gracefulShutdown: (signal: string) => void;
  forceShutdown: (signal: string) => void;
  uncaughtException: (error: Error) => void;
  unhandledRejection: (reason: unknown) => void;
}

/**
 * Shutdown timing constants
 */
const SHUTDOWN_CONSTANTS = {
  GRACEFUL_TIMEOUT_MS: 30000,
  FORCE_TIMEOUT_MS: 5000,
} as const;

/**
 * Signal handler class
 *
 * Manages process signals and implements graceful shutdown with timeouts.
 * Provides proper cleanup and error handling for daemon processes.
 */
export class SignalHandler extends EventEmitter {
  private isShuttingDown = false;
  private shutdownTimeout?: ReturnType<typeof setTimeout>;
  private forceTimeout?: ReturnType<typeof setTimeout>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private registeredHandlers: Map<string, (...args: any[]) => void> = new Map();

  /**
   * Set up all signal handlers
   */
  setupHandlers(): void {
    this.setupGracefulShutdownHandlers();
    this.setupErrorHandlers();
  }

  /**
   * Clean up all signal handlers
   */
  cleanupHandlers(): void {
    for (const [signal, handler] of this.registeredHandlers) {
      process.removeListener(signal, handler);
    }
    this.registeredHandlers.clear();

    // Clear any pending timeouts
    if (this.shutdownTimeout) {
      clearTimeout(this.shutdownTimeout);
      this.shutdownTimeout = undefined;
    }
    if (this.forceTimeout) {
      clearTimeout(this.forceTimeout);
      this.forceTimeout = undefined;
    }
  }

  /**
   * Check if currently shutting down
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Force immediate shutdown
   */
  forceShutdown(): void {
    this.cleanupHandlers();
    process.exit(1);
  }

  /**
   * Set up graceful shutdown signal handlers
   */
  private setupGracefulShutdownHandlers(): void {
    const gracefulShutdown = (signal: string) => {
      if (this.isShuttingDown) {
        console.log(`Received ${signal} during shutdown, ignoring...`);
        return;
      }

      this.isShuttingDown = true;
      console.log(`Received ${signal}, initiating graceful shutdown...`);

      // Set up force shutdown timeout
      this.forceTimeout = setTimeout(() => {
        console.log('Graceful shutdown timeout exceeded, forcing exit...');
        this.emit('forceShutdown', signal);
        this.forceShutdown();
      }, SHUTDOWN_CONSTANTS.GRACEFUL_TIMEOUT_MS);

      // Emit graceful shutdown event
      this.emit('gracefulShutdown', signal);
    };

    // Handle SIGTERM (typical daemon termination)
    const sigtermHandler = () => gracefulShutdown('SIGTERM');
    process.on('SIGTERM', sigtermHandler);
    this.registeredHandlers.set('SIGTERM', sigtermHandler);

    // Handle SIGINT (Ctrl+C in development)
    const sigintHandler = () => gracefulShutdown('SIGINT');
    process.on('SIGINT', sigintHandler);
    this.registeredHandlers.set('SIGINT', sigintHandler);
  }

  /**
   * Set up error handlers
   */
  private setupErrorHandlers(): void {
    // Handle uncaught exceptions
    const uncaughtExceptionHandler = (error: Error) => {
      console.error('Uncaught exception:', error);
      this.emit('uncaughtException', error);

      if (!this.isShuttingDown) {
        this.isShuttingDown = true;

        // Try graceful shutdown with shorter timeout
        this.shutdownTimeout = setTimeout(() => {
          console.error(
            'Graceful shutdown after exception failed, forcing exit...'
          );
          process.exit(1);
        }, SHUTDOWN_CONSTANTS.FORCE_TIMEOUT_MS);

        this.emit('gracefulShutdown', 'uncaughtException');
      }
    };
    process.on('uncaughtException', uncaughtExceptionHandler);
    this.registeredHandlers.set('uncaughtException', uncaughtExceptionHandler);

    // Handle unhandled promise rejections
    const unhandledRejectionHandler = (reason: unknown) => {
      console.error('Unhandled promise rejection:', reason);
      this.emit('unhandledRejection', reason);

      // Convert to Error if needed
      const error =
        reason instanceof Error
          ? reason
          : new Error(`Unhandled rejection: ${String(reason)}`);

      // Treat as uncaught exception
      uncaughtExceptionHandler(error);
    };
    process.on('unhandledRejection', unhandledRejectionHandler);
    this.registeredHandlers.set(
      'unhandledRejection',
      unhandledRejectionHandler
    );
  }

  /**
   * Override EventEmitter methods for type safety
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit<K extends keyof SignalHandlerEvents>(event: K, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof SignalHandlerEvents>(
    event: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void
  ): this {
    return super.on(event, listener);
  }
}
