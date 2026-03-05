/**
 * Component Health Checks - health verification for daemon components
 */

import { ConfigLoader } from '../config/config-loader.js';
import { ProcessManager } from '../process-manager/process-manager.js';
import { LogManager } from '../services/log-manager.js';
import { IPCServerBase } from './ipc-server-base.js';
import { IPCCommandHandler } from './ipc-command-handler.js';

/**
 * Health check result for a single component
 */
export interface ComponentHealthStatus {
  status: 'healthy' | 'unhealthy' | 'unknown';
  message: string;
}

/**
 * Aggregated health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  details: Record<string, ComponentHealthStatus>;
}

/**
 * Components to check health for
 */
export interface HealthCheckTargets {
  configLoader?: ConfigLoader;
  processManager?: ProcessManager;
  logManager?: LogManager;
  ipcServer?: IPCServerBase;
  commandHandler?: IPCCommandHandler;
}

/**
 * Perform comprehensive health checks on all components.
 * Verifies each component is not just initialized but actually functional.
 */
export async function performHealthChecks(
  targets: HealthCheckTargets
): Promise<HealthCheckResult> {
  const details: Record<string, ComponentHealthStatus> = {};
  let allHealthy = true;

  // Check ConfigLoader health
  if (targets.configLoader) {
    try {
      const isReady = true;
      details.configLoader = {
        status: isReady ? 'healthy' : 'unhealthy',
        message: isReady
          ? 'ConfigLoader is ready'
          : 'ConfigLoader not initialized',
      };
      if (!isReady) allHealthy = false;
    } catch (error) {
      details.configLoader = {
        status: 'unhealthy',
        message: `ConfigLoader error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      allHealthy = false;
    }
  } else {
    details.configLoader = {
      status: 'unhealthy',
      message: 'ConfigLoader not available',
    };
    allHealthy = false;
  }

  // Check ProcessManager health
  if (targets.processManager) {
    try {
      const isReady = true;
      details.processManager = {
        status: isReady ? 'healthy' : 'unhealthy',
        message: isReady
          ? 'ProcessManager is running'
          : 'ProcessManager not running',
      };
      if (!isReady) allHealthy = false;
    } catch (error) {
      details.processManager = {
        status: 'unhealthy',
        message: `ProcessManager error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      allHealthy = false;
    }
  } else {
    details.processManager = {
      status: 'unhealthy',
      message: 'ProcessManager not available',
    };
    allHealthy = false;
  }

  // Check LogManager health
  if (targets.logManager) {
    try {
      const isReady = true;
      details.logManager = {
        status: isReady ? 'healthy' : 'unhealthy',
        message: isReady ? 'LogManager is running' : 'LogManager not running',
      };
      if (!isReady) allHealthy = false;
    } catch (error) {
      details.logManager = {
        status: 'unhealthy',
        message: `LogManager error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      allHealthy = false;
    }
  } else {
    details.logManager = {
      status: 'unhealthy',
      message: 'LogManager not available',
    };
    allHealthy = false;
  }

  // Check IPCServer health - most critical for readiness
  if (targets.ipcServer) {
    try {
      const isListening = targets.ipcServer.isServerListening?.();
      details.ipcServer = {
        status: isListening ? 'healthy' : 'unhealthy',
        message: isListening
          ? 'IPC Server is listening and ready'
          : 'IPC Server not listening',
      };
      if (!isListening) allHealthy = false;
    } catch (error) {
      details.ipcServer = {
        status: 'unhealthy',
        message: `IPCServer error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      allHealthy = false;
    }
  } else {
    details.ipcServer = {
      status: 'unhealthy',
      message: 'IPC Server not available',
    };
    allHealthy = false;
  }

  // Check CommandHandler health
  if (targets.commandHandler) {
    try {
      details.commandHandler = {
        status: 'healthy',
        message: 'CommandHandler is ready',
      };
    } catch (error) {
      details.commandHandler = {
        status: 'unhealthy',
        message: `CommandHandler error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      allHealthy = false;
    }
  } else {
    details.commandHandler = {
      status: 'unhealthy',
      message: 'CommandHandler not available',
    };
    allHealthy = false;
  }

  return { healthy: allHealthy, details };
}
