/**
 * IPC Client Utility for CLI Commands
 *
 * Provides a unified interface for CLI commands to communicate with the daemon
 * through IPC (Inter-Process Communication).
 */

import { IPCFactory } from '../../daemon/ipc-factory.js';
import { IPCClientBase } from '../../daemon/ipc-client-base.js';
import {
  CommandType,
  IPCResponse,
  IPCCommandPayloadMap,
  ResponseData,
} from '../../shared/ipc.js';
import {
  ERROR_MESSAGES,
  ErrorCode,
  ProcmanError,
} from '../../shared/errors.js';
import chalk from 'chalk';
import { displayDebugInfo, isVerboseMode } from './error-handler.js';

/**
 * CLI IPC Client
 * Manages IPC connection and communication with the daemon
 */
export class CLIIPCClient {
  private client: IPCClientBase | null = null;
  private isConnected = false;

  /**
   * Connect to the daemon
   * @param timeout Connection timeout in milliseconds (default: 5000)
   */
  async connect(timeout = 5000): Promise<void> {
    try {
      // Create IPC client using factory
      this.client = IPCFactory.createClient({
        path: IPCFactory.getDefaultIPCPath(),
        timeout,
        requestTimeout: timeout,
        reconnect: false, // CLI commands should not auto-reconnect
      });

      if (isVerboseMode()) {
        displayDebugInfo('IPC Connection Attempt', {
          path: IPCFactory.getDefaultIPCPath(),
          timeout,
        });
      }

      // Connect to daemon
      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      this.handleConnectionError(error);
    }
  }

  /**
   * Send a command to the daemon and wait for response
   * @param command The command type to send
   * @param payload The command payload
   * @returns The response from the daemon
   */
  async sendCommand<T extends CommandType>(
    command: T,
    payload?: IPCCommandPayloadMap[T]
  ): Promise<IPCResponse<ResponseData>> {
    if (!this.client || !this.isConnected) {
      throw new ProcmanError({
        code: 'DAEMON_NOT_RUNNING',
        message: ERROR_MESSAGES.DAEMON_NOT_RUNNING,
      });
    }

    try {
      // Send command message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await this.client.sendCommand(
        command,
        payload || ({} as any),
        5000
      );

      if (!response.success && response.error) {
        // Handle error response
        this.handleErrorResponse(response.error);
      }

      return response;
    } catch (error) {
      this.handleCommandError(error);
      throw error; // Re-throw after handling
    }
  }

  /**
   * Disconnect from the daemon
   */
  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.disconnect();
      } catch (error) {
        // Ignore disconnect errors
        console.error(chalk.yellow('Warning: Error during disconnect:'), error);
      } finally {
        this.isConnected = false;
        this.client = null;
      }
    }
  }

  /**
   * Check if client is connected
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get the underlying IPC client for event handling
   * Used for streaming operations that need direct event access
   */
  getInternalClient(): IPCClientBase | null {
    return this.client;
  }

  /**
   * Handle connection errors
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleConnectionError(error: any): never {
    if (isVerboseMode()) {
      displayDebugInfo('IPC Connection Error', error);
    }

    if (error?.code === 'ECONNREFUSED') {
      throw new ProcmanError({
        code: 'DAEMON_NOT_RUNNING' as ErrorCode,
        message: 'Cannot connect to daemon. Is it running?',
      });
    } else if (error?.code === 'EACCES' || error?.code === 'EPERM') {
      throw new ProcmanError({
        code: 'PERMISSION_DENIED' as ErrorCode,
        message: 'Permission denied to connect to daemon socket',
      });
    } else if (error?.message?.includes('timeout')) {
      throw new ProcmanError({
        code: 'IPC_TIMEOUT' as ErrorCode,
        message: 'Connection to daemon timed out',
      });
    } else {
      throw new ProcmanError({
        code: 'DAEMON_CONNECTION_FAILED' as ErrorCode,
        message: error?.message || 'Failed to connect to daemon',
      });
    }
  }

  /**
   * Handle command execution errors
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleCommandError(error: any): void {
    if (error instanceof ProcmanError) {
      console.error(chalk.red('Error:'), error.message);
    } else if (error?.code === 'ETIMEDOUT') {
      console.error(chalk.red('Error:'), 'Request timed out');
    } else {
      console.error(
        chalk.red('Error:'),
        'Command execution failed:',
        error?.message || error
      );
    }
  }

  /**
   * Handle error response from daemon
   */
  private handleErrorResponse(error: {
    code?: string;
    message: string;
  }): never {
    const errorCode = (error.code as ErrorCode) || 'COMMAND_EXECUTION_ERROR';
    const errorMessage = ERROR_MESSAGES[errorCode] || error.message;

    console.error(chalk.red('Error:'), errorMessage);
    throw new ProcmanError({
      code: errorCode,
      message: errorMessage,
    });
  }
}

/**
 * Create a new CLI IPC client instance
 */
export function createCLIClient(): CLIIPCClient {
  return new CLIIPCClient();
}

/**
 * Execute a command with automatic connection management
 * @param command The command type
 * @param payload The command payload
 * @param options Execution options
 */
export async function executeCommand<T extends CommandType>(
  command: T,
  payload?: IPCCommandPayloadMap[T],
  options?: { timeout?: number }
): Promise<IPCResponse<ResponseData>> {
  const client = createCLIClient();

  try {
    await client.connect(options?.timeout);
    const response = await client.sendCommand(command, payload);
    return response;
  } finally {
    await client.disconnect();
  }
}

/**
 * Parse namespace:target format
 * @param target Target string (e.g., "app:worker")
 * @returns Parsed namespace and name
 */
export function parseTarget(target: string): {
  namespace?: string;
  name: string;
} {
  const parts = target.split(':');
  if (parts.length === 2) {
    return { namespace: parts[0], name: parts[1] };
  }
  return { name: target };
}

/**
 * Format process info for display
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatProcessInfo(info: any): string {
  const status =
    info.status === 'running'
      ? chalk.green(info.status)
      : info.status === 'stopped'
        ? chalk.red(info.status)
        : chalk.yellow(info.status);

  return `${chalk.bold(info.name)} (${status})`;
}
