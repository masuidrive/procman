/**
 * CLI Signal Handler - CLIプロセスのシグナル処理専門クラス
 *
 * t_wadaとUncle Bobの教えに従い、Single Responsibility Principleを適用。
 * CLIプロセスのグレースフルシャットダウンを管理する。
 */

export type AsyncCleanupFunction = () => Promise<void>;

/**
 * CLI Signal Handler
 *
 * CLIプロセスのシグナル処理を管理し、適切なクリーンアップを実行する。
 * デーモンのSignalHandlerとは異なり、CLIの短期実行プロセスに特化。
 */
export class CLISignalHandler {
  private isShuttingDown = false;
  private forceExitTimeout?: ReturnType<typeof setTimeout>;
  private asyncCleanupFn?: AsyncCleanupFunction;

  private sigintHandler?: (...args: any[]) => void;
  private sigtermHandler?: (...args: any[]) => void;

  /**
   * Setup signal handlers with optional cleanup function
   * @param asyncCleanup - Optional async cleanup function to call before exit
   */
  setup(asyncCleanup?: AsyncCleanupFunction): void {
    this.asyncCleanupFn = asyncCleanup;
    this.setupSignalHandlers();
  }

  /**
   * Clean up signal handlers and timeouts
   */
  cleanup(): void {
    // Remove signal listeners
    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = undefined;
    }
    if (this.sigtermHandler) {
      process.removeListener('SIGTERM', this.sigtermHandler);
      this.sigtermHandler = undefined;
    }

    // Clear timeout
    if (this.forceExitTimeout) {
      clearTimeout(this.forceExitTimeout);
      this.forceExitTimeout = undefined;
    }
  }

  /**
   * Check if currently shutting down
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Setup SIGINT and SIGTERM handlers
   */
  private setupSignalHandlers(): void {
    const handleSignal = async (signal: string): Promise<void> => {
      if (this.isShuttingDown) {
        // Already shutting down, ignore subsequent signals
        return;
      }

      this.isShuttingDown = true;
      console.log(`\\nReceived ${signal}, shutting down...`);

      // Set force exit timeout (CLI should exit quickly)
      this.forceExitTimeout = setTimeout(() => {
        console.error('CLI cleanup timeout exceeded, forcing exit...');
        process.exit(1);
      }, 2000); // 2 seconds timeout for CLI

      try {
        // Execute async cleanup if provided
        if (this.asyncCleanupFn) {
          await this.asyncCleanupFn();
        }

        // Clean up signal handlers
        this.cleanup();

        // Exit successfully
        process.exit(0);
      } catch (error) {
        console.error('Error during cleanup:', error);
        this.cleanup();
        process.exit(1);
      }
    };

    // Setup SIGINT handler (Ctrl+C)
    this.sigintHandler = (): void => {
      handleSignal('SIGINT').catch((error) => {
        console.error('Error in SIGINT handler:', error);
        process.exit(1);
      });
    };
    process.on('SIGINT', this.sigintHandler);

    // Setup SIGTERM handler
    this.sigtermHandler = (): void => {
      handleSignal('SIGTERM').catch((error) => {
        console.error('Error in SIGTERM handler:', error);
        process.exit(1);
      });
    };
    process.on('SIGTERM', this.sigtermHandler);
  }
}

// Global instance for CLI signal handling
let globalCliSignalHandler: CLISignalHandler | null = null;

/**
 * Setup global CLI signal handling
 * @param asyncCleanup - Optional async cleanup function
 */
export function setupGlobalCLISignalHandling(
  asyncCleanup?: AsyncCleanupFunction
): void {
  if (!globalCliSignalHandler) {
    globalCliSignalHandler = new CLISignalHandler();
  }
  globalCliSignalHandler.setup(asyncCleanup);
}

/**
 * Cleanup global CLI signal handling
 */
export function cleanupGlobalCLISignalHandling(): void {
  if (globalCliSignalHandler) {
    globalCliSignalHandler.cleanup();
    globalCliSignalHandler = null;
  }
}

/**
 * Check if global CLI signal handler is shutting down
 */
export function isGlobalCLIShuttingDown(): boolean {
  return globalCliSignalHandler?.isShutdownInProgress() ?? false;
}
