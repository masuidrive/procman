/**
 * Log command implementation
 *
 * This command displays logs from processes managed by the daemon.
 */

import chalk from 'chalk';
import {
  executeCommand,
  createCLIClient,
  type CLIIPCClient,
} from '../utils/ipc-client.js';
import { handleCLIError } from '../utils/error-utils.js';
import type {
  LogResponseData,
  IPCLogStreamMessage,
  IPCResponse,
} from '../../shared/ipc.js';
import type { LogEntry } from '../../shared/logs.js';
import {
  LOG_STREAM_EVENTS,
  STREAM_MESSAGE_TYPES,
} from '../../shared/constants-streaming.js';

export interface LogCommandOptions {
  namespace?: string;
  lines?: number;
  human?: boolean;
  stream?: boolean;
}

export async function execute(
  args: string[],
  options: LogCommandOptions
): Promise<void> {
  try {
    // Get target from args
    const target = args[0];

    if (!target) {
      console.error(chalk.red('Error:'), 'Target process name is required');
      console.error(
        chalk.yellow('Usage:'),
        'procman log <target> [--lines <n>] [--human] [--stream]'
      );
      process.exit(1);
    }

    // Prepare log options
    const logOptions = {
      lines: options.lines,
      human: options.human,
      stream: options.stream,
    };

    if (options.stream) {
      // Streaming mode - establish persistent connection
      await handleStreamingLogs(target, options);
    } else {
      // Normal mode - fetch logs once
      const response = await executeCommand('log', {
        target,
        options: logOptions,
      });

      if (response.success) {
        const data = response.data as LogResponseData;
        if (data?.entries && data.entries.length > 0) {
          displayLogs(data.entries, options.human || false);
        } else {
          console.log(chalk.yellow('No logs found for:'), target);
        }
      } else {
        console.error(
          chalk.red('Error:'),
          response.error?.message || 'Failed to fetch logs'
        );
        process.exit(1);
      }
    }
  } catch (error) {
    handleCLIError(error, 'Failed to execute log command');
  }
}

/**
 * Handle streaming logs with persistent connection
 */
async function handleStreamingLogs(
  target: string,
  options: LogCommandOptions
): Promise<void> {
  const client = createCLIClient();

  try {
    printStreamingHeader(target);
    await client.connect();

    const response = await startStreamingRequest(client, target, options);
    validateStreamingResponse(response);

    const messageHandler = createMessageHandler(options);
    const internalClient = client.getInternalClient();

    if (internalClient) {
      setupStreamingListeners(client, messageHandler);
      await waitForStreamingShutdown(client, messageHandler);
    }
  } finally {
    await client.disconnect();
  }
}

/**
 * Print streaming header information
 */
function printStreamingHeader(target: string): void {
  console.log(chalk.blue('Streaming logs for:'), target);
  console.log(chalk.gray('Press Ctrl+C to stop streaming...\n'));
}

/**
 * Start streaming request to server
 */
async function startStreamingRequest(
  client: CLIIPCClient,
  target: string,
  options: LogCommandOptions
): Promise<IPCResponse> {
  return client.sendCommand('log', {
    target,
    options: {
      follow: true,
      lines: options.lines,
    },
  });
}

/**
 * Validate streaming response from server
 */
function validateStreamingResponse(response: IPCResponse): void {
  if (!response.success) {
    console.error(
      chalk.red('Error:'),
      response.error?.message || 'Failed to start log streaming'
    );
    process.exit(1);
  }

  const logData = response.data as LogResponseData;
  if (!logData?.streaming) {
    console.error(
      chalk.red('Error:'),
      'Streaming mode not supported by server'
    );
    process.exit(1);
  }
}

/**
 * Create message handler for streaming logs
 */
function createMessageHandler(
  options: LogCommandOptions
): (data: unknown) => void {
  return (data: unknown): void => {
    const message = parseStreamMessage(data);
    if (message && isValidStreamMessage(message)) {
      displayLogs([message.payload.entry], options.human || false);
    }
  };
}

/**
 * Parse stream message from various data formats
 */
function parseStreamMessage(data: unknown): IPCLogStreamMessage | null {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  } else if (data && typeof data === 'object') {
    return data as IPCLogStreamMessage;
  }
  return null;
}

/**
 * Check if message is a valid stream message
 */
function isValidStreamMessage(message: IPCLogStreamMessage): boolean {
  return (
    message.type === STREAM_MESSAGE_TYPES.LOG_STREAM && !!message.payload?.entry
  );
}

/**
 * Setup streaming event listeners
 */
function setupStreamingListeners(
  client: CLIIPCClient,
  messageHandler: (data: unknown) => void
): void {
  const internalClient = client.getInternalClient();
  if (!internalClient) return;

  // Listen for multiple event types to ensure compatibility
  internalClient.on(LOG_STREAM_EVENTS.MESSAGE, messageHandler);

  internalClient.on(LOG_STREAM_EVENTS.DATA, (data: Buffer) => {
    processRawData(data, messageHandler);
  });

  // Also listen for log-stream event (backward compatibility)
  internalClient.on(LOG_STREAM_EVENTS.LOG_STREAM, messageHandler);
}

/**
 * Process raw data from socket
 */
function processRawData(
  data: Buffer,
  messageHandler: (data: unknown) => void
): void {
  const messages = data.toString().split('\n');
  for (const msg of messages) {
    if (msg.trim()) {
      messageHandler(msg);
    }
  }
}

/**
 * Wait for streaming shutdown signal
 */
async function waitForStreamingShutdown(
  client: CLIIPCClient,
  messageHandler: (data: unknown) => void
): Promise<void> {
  return new Promise((resolve) => {
    const cleanup = () => {
      console.log(chalk.yellow('\nStopping log stream...'));
      removeStreamingListeners(client, messageHandler);
      resolve(undefined);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
}

/**
 * Remove all streaming event listeners
 */
function removeStreamingListeners(
  client: CLIIPCClient,
  messageHandler: (data: unknown) => void
): void {
  const internalClient = client.getInternalClient();
  if (!internalClient) return;

  internalClient.removeListener(LOG_STREAM_EVENTS.MESSAGE, messageHandler);
  internalClient.removeListener(LOG_STREAM_EVENTS.DATA, messageHandler);
  internalClient.removeListener(LOG_STREAM_EVENTS.LOG_STREAM, messageHandler);
}

/**
 * Display logs in the specified format
 */
function displayLogs(entries: LogEntry[], human: boolean): void {
  if (human) {
    // Human-readable format with colors
    for (const entry of entries) {
      const timestamp = new Date(entry.timestamp).toLocaleString();
      const level =
        entry.level === 'error'
          ? chalk.red(entry.level.toUpperCase())
          : entry.level === 'warn'
            ? chalk.yellow(entry.level.toUpperCase())
            : chalk.blue(entry.level.toUpperCase());

      const app = chalk.cyan(`[${entry.app}]`);
      const type = entry.type === 'stderr' ? chalk.red('stderr') : 'stdout';

      console.log(
        `${chalk.gray(timestamp)} ${level} ${app} (${type}): ${entry.message}`
      );
    }
  } else {
    // JSON format (default)
    for (const entry of entries) {
      console.log(JSON.stringify(entry));
    }
  }
}

/**
 * Handle streaming log message
 */
export function handleLogStreamMessage(message: IPCLogStreamMessage): void {
  if (message.payload?.entry) {
    displayLogs([message.payload.entry], true);
  }
}
