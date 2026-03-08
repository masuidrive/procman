/**
 * Component Daemon Interface - creates the daemon interface used by IPCCommandHandler
 */

import { ConfigLoader } from '../config/config-loader.js';
import { ProcessManager } from '../process-manager/process-manager.js';
import { TaskManager } from '../process-manager/task-manager.js';
import { LogManager } from '../services/log-manager.js';

/**
 * Dependencies needed to create the daemon interface
 */
export interface DaemonInterfaceDeps {
  getConfigLoader: () => ConfigLoader;
  getProcessManager: () => ProcessManager;
  getTaskManager?: () => TaskManager | undefined;
  getLogManager: () => LogManager;
  cleanupAll: () => Promise<void>;
}

/**
 * Create a daemon interface object for the IPCCommandHandler.
 * This provides the command handler with access to daemon functionality.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createDaemonInterface(deps: DaemonInterfaceDeps) {
  return {
    getConfigLoader: () => deps.getConfigLoader(),
    getProcessManager: () => deps.getProcessManager(),
    getTaskManager: () => deps.getTaskManager?.(),
    getLogManager: () => deps.getLogManager(),
    getAllProcessStatuses: async () => {
      const processManager = deps.getProcessManager();
      const processInfos = processManager.getAllProcessInfo();

      const statusPromises = processInfos.map(async (processInfo) => {
        const info = processInfo;
        if (!info) return null;

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

      const results = await Promise.all(statusPromises);
      return results.filter((result) => result !== null);
    },
    getConfig: () => {
      return undefined;
    },
    loadConfig: async (configFilePath: string) => {
      const configLoader = deps.getConfigLoader();
      const processManager = deps.getProcessManager();
      const logManager = deps.getLogManager();

      const config = await configLoader.load(configFilePath);

      const allProcesses = processManager.getAllProcessInfo();
      if (allProcesses.length > 0) {
        const processNames = allProcesses
          .map((processInfo) => {
            const info = processInfo;
            return info?.name || '';
          })
          .filter((name) => name !== '');
        await processManager.stopProcesses(processNames);
      }

      for (const app of config.apps) {
        processManager.configureProcess(app);

        if (logManager && (app.log_file || app.out_file || app.error_file)) {
          await logManager.setupAppLogs(app.name, {
            logFile: app.log_file,
            outFile: app.out_file,
            errorFile: app.error_file,
            namespace: app.namespace,
          });
        }
      }

      return config.apps;
    },
    stop: async () => {
      await deps.cleanupAll();
    },
  };
}
