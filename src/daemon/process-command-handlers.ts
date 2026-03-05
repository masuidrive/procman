/**
 * Process Command Handlers - プロセス関連IPCコマンドの処理実装
 *
 * start, stop, restart, list, load, exitコマンドのハンドラーを提供する。
 */

import { ProcessManager } from '../process-manager/process-manager.js';
import {
  CommandType,
  IPCMessage,
  IPCResponse,
  LoadCommandPayload,
  StartCommandPayload,
  StopCommandPayload,
  RestartCommandPayload,
  ListCommandPayload,
  ExitCommandPayload,
  LoadResponseData,
  StartResponseData,
  StopResponseData,
  RestartResponseData,
  ListResponseData,
  ExitResponseData,
} from '../shared/ipc.js';
import { DaemonInterface } from './ipc-command-handler.js';

/** Typed result from batch process operations */
interface BatchResult {
  name: string;
  success: boolean;
  error?: string;
}

/**
 * Command type constants (process-related)
 */
const COMMAND_TYPES = {
  LOAD: 'load' as CommandType,
  START: 'start' as CommandType,
  STOP: 'stop' as CommandType,
  RESTART: 'restart' as CommandType,
  LIST: 'list' as CommandType,
  EXIT: 'exit' as CommandType,
};

/**
 * Timing constants
 */
const TIMING_CONSTANTS = {
  EXIT_SHUTDOWN_DELAY_MS: 100,
} as const;

/**
 * Helper to resolve target processes from targets array
 */
function resolveTargetProcesses(
  processManager: ProcessManager,
  targets: string[] | undefined,
  errorLabel: string
): string[] {
  let targetProcesses: string[] = [];
  if (targets && targets.length > 0) {
    targetProcesses = targets.flatMap((target) => {
      if (target.includes(':')) {
        const [namespace] = target.split(':');
        return processManager.getProcessNamesByNamespace(namespace);
      }
      return target;
    });
  } else {
    targetProcesses = processManager.getProcessNames();
  }

  if (targetProcesses.length === 0) {
    throw new Error(`No processes found to ${errorLabel}`);
  }

  return targetProcesses;
}

/**
 * Handle LOAD command
 */
export async function handleLoadCommand(
  daemon: DaemonInterface,
  message: IPCMessage<LoadCommandPayload>
): Promise<IPCResponse<LoadResponseData>> {
  const { configPath } = message.payload;

  await daemon.loadConfig(configPath);

  const config = daemon.getConfig();
  const response: LoadResponseData = {
    config: { apps: config || [] },
    appsCount: config?.length || 0,
  };

  return {
    id: message.id,
    requestId: message.id,
    type: COMMAND_TYPES.LOAD,
    timestamp: Date.now(),
    success: true,
    data: response,
  };
}

/**
 * Handle START command
 */
export async function handleStartCommand(
  daemon: DaemonInterface,
  message: IPCMessage<StartCommandPayload>
): Promise<IPCResponse<StartResponseData>> {
  const { targets } = message.payload;
  const processManager = daemon.getProcessManager();

  if (!processManager) {
    throw new Error('Process manager not initialized');
  }

  const targetProcesses = resolveTargetProcesses(
    processManager,
    targets,
    'start'
  );

  // Start processes
  const batchResults = await processManager.startProcesses(targetProcesses);

  // Count successes and failures
  const started = batchResults
    .filter((r: BatchResult) => r.success)
    .map((r: BatchResult) => r.name);
  const alreadyRunning: string[] = [];
  const failed = batchResults
    .filter((r: BatchResult) => !r.success)
    .map((r: BatchResult) => ({
      name: r.name,
      error: r.error || 'Unknown error',
    }));

  const response: StartResponseData = {
    started,
    alreadyRunning,
    failed,
  };

  return {
    id: message.id,
    requestId: message.id,
    type: COMMAND_TYPES.START,
    timestamp: Date.now(),
    success: true,
    data: response,
  };
}

/**
 * Handle STOP command
 */
export async function handleStopCommand(
  daemon: DaemonInterface,
  message: IPCMessage<StopCommandPayload>
): Promise<IPCResponse<StopResponseData>> {
  const { targets } = message.payload;
  const processManager = daemon.getProcessManager();

  if (!processManager) {
    throw new Error('Process manager not initialized');
  }

  const targetProcesses = resolveTargetProcesses(
    processManager,
    targets,
    'stop'
  );

  // Stop processes
  const batchResults = await processManager.stopProcesses(targetProcesses);

  // Count successes and failures
  const stopped = batchResults
    .filter((r: BatchResult) => r.success)
    .map((r: BatchResult) => r.name);
  const alreadyStopped: string[] = [];
  const failed = batchResults
    .filter((r: BatchResult) => !r.success)
    .map((r: BatchResult) => ({
      name: r.name,
      error: r.error || 'Unknown error',
    }));

  const response: StopResponseData = {
    stopped,
    alreadyStopped,
    failed,
  };

  return {
    id: message.id,
    requestId: message.id,
    type: COMMAND_TYPES.STOP,
    timestamp: Date.now(),
    success: true,
    data: response,
  };
}

/**
 * Handle RESTART command
 */
export async function handleRestartCommand(
  daemon: DaemonInterface,
  message: IPCMessage<RestartCommandPayload>
): Promise<IPCResponse<RestartResponseData>> {
  const { targets } = message.payload;
  const processManager = daemon.getProcessManager();

  if (!processManager) {
    throw new Error('Process manager not initialized');
  }

  const targetProcesses = resolveTargetProcesses(
    processManager,
    targets,
    'restart'
  );

  // Restart processes
  const batchResults = await processManager.restartProcesses(targetProcesses);

  // Count successes and failures
  const restarted = batchResults
    .filter((r: BatchResult) => r.success)
    .map((r: BatchResult) => r.name);
  const failed = batchResults
    .filter((r: BatchResult) => !r.success)
    .map((r: BatchResult) => ({
      name: r.name,
      error: r.error || 'Unknown error',
    }));

  const response: RestartResponseData = {
    restarted,
    failed,
  };

  return {
    id: message.id,
    requestId: message.id,
    type: COMMAND_TYPES.RESTART,
    timestamp: Date.now(),
    success: true,
    data: response,
  };
}

/**
 * Handle LIST command
 */
export async function handleListCommand(
  daemon: DaemonInterface,
  message: IPCMessage<ListCommandPayload>
): Promise<IPCResponse<ListResponseData>> {
  const processes = await daemon.getAllProcessStatuses();

  const response: ListResponseData = {
    configFile: '<unknown>',
    daemonUptime: process.uptime(),
    processes,
  };

  return {
    id: message.id,
    requestId: message.id,
    type: COMMAND_TYPES.LIST,
    timestamp: Date.now(),
    success: true,
    data: response,
  };
}

/**
 * Handle EXIT command
 */
export async function handleExitCommand(
  daemon: DaemonInterface,
  message: IPCMessage<ExitCommandPayload>
): Promise<IPCResponse<ExitResponseData>> {
  const processManager = daemon.getProcessManager();
  const processCount = processManager?.getProcessNames().length || 0;

  const response: ExitResponseData = {
    processCount,
  };

  // Schedule daemon shutdown after sending response
  setTimeout(() => {
    daemon
      .stop()
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        console.error('Error during daemon shutdown:', error);
        process.exit(1);
      });
  }, TIMING_CONSTANTS.EXIT_SHUTDOWN_DELAY_MS);

  return {
    id: message.id,
    requestId: message.id,
    type: COMMAND_TYPES.EXIT,
    timestamp: Date.now(),
    success: true,
    data: response,
  };
}
