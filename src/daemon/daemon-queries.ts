/**
 * Daemon query and status methods
 *
 * Provides functions for querying daemon state, health status,
 * component access, configuration management, and process statuses.
 */

import { ConfigLoader } from '../config/config-loader.js';
import { ProcessManager } from '../process-manager/process-manager.js';
import { LogManager } from '../services/log-manager.js';
import { IPCServerBase } from './ipc-server-base.js';
import { AppConfig } from '../shared/config.js';
import type { DaemonContext } from './daemon-types.js';

/**
 * Check if daemon is ready to handle requests.
 * Performs comprehensive health checks on all components.
 */
export async function queryIsReady(ctx: DaemonContext): Promise<boolean> {
  if (!ctx.stateManager.isRunning()) {
    return false;
  }

  try {
    const healthCheck = await ctx.componentManager.performHealthChecks();
    return healthCheck.healthy;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

/**
 * Get detailed health status of all components
 */
export async function queryHealthStatus(ctx: DaemonContext): Promise<{
  ready: boolean;
  components: Record<
    string,
    { status: 'healthy' | 'unhealthy' | 'unknown'; message: string }
  >;
  memory?: ReturnType<
    import('../utils/memory/memory-monitor.js').MemoryMonitor['getHealthInfo']
  >;
}> {
  const healthCheck = await ctx.componentManager.performHealthChecks();
  const memoryHealthInfo = ctx.memoryMonitor.getHealthInfo();

  return {
    ready: healthCheck.healthy && ctx.stateManager.isRunning(),
    components: healthCheck.details,
    memory: memoryHealthInfo,
  };
}

/**
 * Load configuration and apply it
 */
export async function queryLoadConfig(
  ctx: DaemonContext,
  configFilePath: string
): Promise<AppConfig[]> {
  const configLoader =
    ctx.componentManager.getComponent<ConfigLoader>('configLoader');
  const processManager =
    ctx.componentManager.getComponent<ProcessManager>('processManager');
  const logManager =
    ctx.componentManager.getComponent<LogManager>('logManager');

  if (!configLoader) {
    throw new Error('ConfigLoader not initialized');
  }
  if (!processManager) {
    throw new Error('ProcessManager not initialized');
  }

  ctx.configFilePath = configFilePath;
  const config = await configLoader.load(configFilePath);
  ctx.currentConfig = config.apps;

  // Stop all existing processes
  const allProcesses = processManager.getAllProcessInfo();
  if (allProcesses.length > 0) {
    const processNames = allProcesses.map((p) => p.name);
    await processManager.stopProcesses(processNames);
  }

  // Configure new processes
  for (const app of config.apps) {
    processManager.configureProcess(app);

    // Setup log manager for this app if log files are configured
    if (logManager && (app.log_file || app.out_file || app.error_file)) {
      logManager.setupAppLogs(app.name, {
        logFile: app.log_file,
        outFile: app.out_file,
        errorFile: app.error_file,
        namespace: app.namespace,
      });
    }
  }

  return config.apps;
}

/**
 * Get component instances by type
 */
export function getConfigLoader(ctx: DaemonContext): ConfigLoader | undefined {
  return ctx.componentManager.getComponent<ConfigLoader>('configLoader');
}

export function getProcessManager(
  ctx: DaemonContext
): ProcessManager | undefined {
  return ctx.componentManager.getComponent<ProcessManager>('processManager');
}

export function getLogManager(ctx: DaemonContext): LogManager | undefined {
  return ctx.componentManager.getComponent<LogManager>('logManager');
}

export function getIPCServer(ctx: DaemonContext): IPCServerBase | undefined {
  return ctx.componentManager.getComponent<IPCServerBase>('ipcServer');
}

/**
 * Get all process statuses
 */
export async function queryAllProcessStatuses(ctx: DaemonContext) {
  const processManager = getProcessManager(ctx);
  if (!processManager) {
    return [];
  }

  const processInfos = processManager.getAllProcessInfo();

  const statusPromises = processInfos.map(async (info) => {
    // Get process stats from monitor
    const stats = await processManager.monitor.getProcessStats(info.name);

    return {
      name: info.name,
      namespace: info.namespace || 'default',
      pid: info.pid,
      status: info.status,
      uptime: info.uptime,
      memory: stats?.memory || 0,
      cpu: stats?.cpu || 0,
      restarts: info.restarts,
    };
  });

  return Promise.all(statusPromises);
}
