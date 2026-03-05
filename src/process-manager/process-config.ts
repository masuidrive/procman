/**
 * Process configuration types and conversion utilities
 *
 * This module contains the ProcessConfig interface and helper functions
 * for converting AppConfig to ProcessConfig.
 */

import { AppConfig, parseMemorySize } from '../shared/config.js';

/**
 * Process configuration interface
 */
export interface ProcessConfig {
  /** Process name */
  name: string;
  /** Script path to execute */
  script: string;
  /** Namespace for grouping */
  namespace: string;
  /** Command line arguments */
  args: string[];
  /** Working directory */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Number of instances to start */
  instances: number;
  /** Enable automatic restart */
  autorestart: boolean;
  /** Enable file watching */
  watch: boolean;
  /** Memory limit in bytes for auto-restart */
  max_memory_restart?: number;
  /** Maximum number of restarts */
  max_restarts: number;
  /** Minimum uptime before considering restart */
  min_uptime: number;
  /** Delay between restarts */
  restart_delay: number;
  /** Optional note or description */
  note?: string;
}

/**
 * Validate an AppConfig object at the boundary
 */
export function validateAppConfig(appConfig: AppConfig): void {
  // t_wada boundary principle: validate inputs at boundaries
  if (appConfig == null) {
    throw new Error('App configuration cannot be null or undefined');
  }

  if (typeof appConfig !== 'object') {
    throw new Error('App configuration must be an object');
  }

  if (!appConfig.name || typeof appConfig.name !== 'string') {
    throw new Error('App configuration must have a valid name');
  }

  // Validate process name contains only safe characters
  const namePattern = /^[a-zA-Z0-9_-]+$/;
  if (!namePattern.test(appConfig.name.trim())) {
    throw new Error(
      `Invalid process name: "${appConfig.name}". Name must contain only alphanumeric characters, hyphens, and underscores`
    );
  }
}

/**
 * Convert AppConfig to ProcessConfig
 */
export function convertAppConfigToProcessConfig(
  appConfig: AppConfig
): ProcessConfig {
  // Parse memory limit if specified
  let max_memory_restart: number | undefined;
  if (appConfig.max_memory_restart) {
    const result = parseMemorySize(appConfig.max_memory_restart);
    if (result.success && result.value) {
      max_memory_restart = result.value;
    }
  }

  const processConfig: ProcessConfig = {
    name: appConfig.name,
    script: appConfig.script,
    cwd: appConfig.cwd || process.cwd(),
    args: appConfig.args
      ? appConfig.args.split(' ').filter((arg) => arg.length > 0)
      : [],
    namespace: appConfig.namespace || 'default',
    instances: 1, // AppConfig doesn't have instances
    autorestart: true, // Default to true for auto-restart
    watch: false, // AppConfig doesn't have watch
    max_memory_restart,
    max_restarts: 10, // Default max restarts
    min_uptime: 1000, // Default min uptime
    restart_delay: 1000, // Default restart delay
    note: appConfig.note,
    env: {},
  };

  // Process environment variables (remove undefined values)
  if (appConfig.env) {
    for (const [key, value] of Object.entries(appConfig.env)) {
      if (value !== undefined) {
        processConfig.env![key] = value;
      }
    }
  }

  return processConfig;
}
