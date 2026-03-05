/**
 * Component Registration - component wrapping and lifecycle management
 */

import { Component } from './component-manager-types.js';

/**
 * Create a Component wrapper around an arbitrary instance.
 * Handles detecting start/stop methods and initialization timeout.
 */
export function createComponentWrapper(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any
): Component {
  return {
    name,
    initialize: async () => {
      console.log(`Initializing component: ${name}`);
      if (instance == null) {
        throw new Error(`Component ${name} instance is null or undefined`);
      }
      let startMethod = null;
      if (
        name === 'processManager' &&
        instance.startMonitoring &&
        typeof instance.startMonitoring === 'function'
      ) {
        startMethod = instance.startMonitoring.bind(instance);
      } else if (instance.start && typeof instance.start === 'function') {
        startMethod = instance.start.bind(instance);
      }

      if (startMethod) {
        const initStartTime = Date.now();

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                `Component ${name} initialization timed out after 30 seconds`
              )
            );
          }, 30000);
        });

        try {
          const startPromise = Promise.resolve(startMethod());
          await Promise.race([startPromise, timeoutPromise]);
          const initTime = Date.now() - initStartTime;
          console.log(
            `Component ${name} initialization completed in ${initTime}ms`
          );
        } catch (error) {
          console.error(`Component ${name} initialization failed:`, error);
          throw error;
        }
      } else {
        console.log(`Component ${name} has no start() method - assuming ready`);
      }
    },
    cleanup: async () => {
      console.log(`Cleaning up component: ${name}`);
      if (instance.stop && typeof instance.stop === 'function') {
        await instance.stop();
      } else if (instance.cleanup && typeof instance.cleanup === 'function') {
        await instance.cleanup();
      }
      console.log(`Component ${name} cleanup completed`);
    },
    isInitialized: () => {
      if (instance.isRunning && typeof instance.isRunning === 'function') {
        return instance.isRunning();
      }
      return true;
    },
  };
}

/**
 * Convert AppConfig to ProcessConfig format
 */
export function convertAppConfigToProcessConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appConfig: any,
  appName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return {
    name: appName,
    script: appConfig.script || appConfig.exec || 'node',
    namespace: appConfig.namespace || 'default',
    args: appConfig.args || [],
    cwd: appConfig.cwd || process.cwd(),
    env: { ...process.env, ...appConfig.env },
    instances: appConfig.instances || 1,
    autorestart: appConfig.autorestart ?? true,
    watch: appConfig.watch ?? false,
    max_memory_restart: appConfig.max_memory_restart || undefined,
    max_restarts: appConfig.max_restarts || 15,
    min_uptime: appConfig.min_uptime || 1000,
    restart_delay: appConfig.restart_delay || 0,
    note: appConfig.note || undefined,
  };
}
