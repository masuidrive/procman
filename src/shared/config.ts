/**
 * Configuration file type definitions for procman
 *
 * This file contains type definitions for application configuration, project configuration,
 * configuration validation, and memory size parsing utilities.
 */

import { FilePath } from './types';
import { DEFAULT_NAMESPACE, MEMORY_MULTIPLIERS } from './constants';

/**
 * Application configuration interface
 * Defines the structure for individual application settings in procman.config.js
 */
export interface AppConfig {
  /** Application name (must be unique within namespace) */
  name: string;
  /** Script file path to execute */
  script: string;
  /** Namespace for the application (optional, defaults to 'default') */
  namespace?: string;
  /** Command line arguments for the script (optional) */
  args?: string;
  /** Working directory for the application (optional) */
  cwd?: string;
  /** Description or note about the application (optional) */
  note?: string;
  /** Environment variables for the application (optional) */
  env?: Record<string, string>;
  /** Memory limit for automatic restart (e.g., "300M", "1G") (optional) */
  max_memory_restart?: string;
  /** Custom log file path (optional) */
  log_file?: string;
  /** Custom stdout log file path (optional) */
  out_file?: string;
  /** Custom stderr log file path (optional) */
  error_file?: string;
}

/**
 * Project configuration interface
 * Defines the structure for the entire procman.config.js file
 */
export interface ProcmanConfig {
  /** Array of application configurations */
  apps: AppConfig[];
}

/**
 * Configuration validation result
 * Used to provide detailed validation feedback
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** Array of validation errors */
  errors: string[];
  /** Array of validation warnings */
  warnings: string[];
}

/**
 * Memory size parsing result
 * Used to represent parsed memory size values
 */
export interface MemoryParseResult {
  /** Whether parsing was successful */
  success: boolean;
  /** Parsed value in bytes (only valid if success is true) */
  bytes?: number;
  /** Error message (only valid if success is false) */
  error?: string;
}

/**
 * Type guard to check if an object is a valid AppConfig
 */
export function isAppConfig(obj: unknown): obj is AppConfig {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const config = obj as Record<string, unknown>;

  // Required fields
  if (typeof config.name !== 'string' || config.name.trim() === '') {
    return false;
  }

  if (typeof config.script !== 'string' || config.script.trim() === '') {
    return false;
  }

  // Optional fields validation
  if (config.namespace !== undefined && typeof config.namespace !== 'string') {
    return false;
  }

  if (config.args !== undefined && typeof config.args !== 'string') {
    return false;
  }

  if (config.cwd !== undefined && typeof config.cwd !== 'string') {
    return false;
  }

  if (config.note !== undefined && typeof config.note !== 'string') {
    return false;
  }

  if (config.env !== undefined) {
    if (typeof config.env !== 'object' || config.env === null) {
      return false;
    }
    // Check that all env values are strings
    for (const [key, value] of Object.entries(config.env)) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        return false;
      }
    }
  }

  if (
    config.max_memory_restart !== undefined &&
    typeof config.max_memory_restart !== 'string'
  ) {
    return false;
  }

  if (config.log_file !== undefined && typeof config.log_file !== 'string') {
    return false;
  }

  if (config.out_file !== undefined && typeof config.out_file !== 'string') {
    return false;
  }

  if (
    config.error_file !== undefined &&
    typeof config.error_file !== 'string'
  ) {
    return false;
  }

  return true;
}

/**
 * Type guard to check if an object is a valid ProcmanConfig
 */
export function isProcmanConfig(obj: unknown): obj is ProcmanConfig {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const config = obj as Record<string, unknown>;

  if (!Array.isArray(config.apps)) {
    return false;
  }

  // Validate each app config
  return config.apps.every(isAppConfig);
}

/**
 * Validates an AppConfig object and returns detailed validation result
 */
export function validateAppConfig(config: unknown): ConfigValidationResult {
  const result: ConfigValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  if (!isAppConfig(config)) {
    result.valid = false;
    result.errors.push('Invalid AppConfig structure');
    return result;
  }

  // Additional validations
  if (config.name.includes('/') || config.name.includes('\\')) {
    result.errors.push('Application name cannot contain path separators');
    result.valid = false;
  }

  if (config.namespace && config.namespace.includes('/')) {
    result.errors.push('Namespace cannot contain path separators');
    result.valid = false;
  }

  if (config.max_memory_restart) {
    const memoryResult = parseMemorySize(config.max_memory_restart);
    if (!memoryResult.success) {
      result.errors.push(`Invalid memory size format: ${memoryResult.error}`);
      result.valid = false;
    }
  }

  // Warnings
  if (!config.namespace) {
    result.warnings.push(
      `Application '${config.name}' will use default namespace`
    );
  }

  if (!config.cwd) {
    result.warnings.push(
      `Application '${config.name}' will use current working directory`
    );
  }

  return result;
}

/**
 * Validates a ProcmanConfig object and returns detailed validation result
 */
export function validateProcmanConfig(config: unknown): ConfigValidationResult {
  const result: ConfigValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  if (!isProcmanConfig(config)) {
    result.valid = false;
    result.errors.push('Invalid ProcmanConfig structure');
    return result;
  }

  if (config.apps.length === 0) {
    result.valid = false;
    result.errors.push('Configuration must contain at least one application');
    return result;
  }

  // Check for duplicate app names within namespaces
  const appsByNamespace = new Map<string, Set<string>>();

  for (const app of config.apps) {
    const namespace = app.namespace || DEFAULT_NAMESPACE;

    if (!appsByNamespace.has(namespace)) {
      appsByNamespace.set(namespace, new Set());
    }

    const namesInNamespace = appsByNamespace.get(namespace)!;

    if (namesInNamespace.has(app.name)) {
      result.errors.push(
        `Duplicate application name '${app.name}' in namespace '${namespace}'`
      );
      result.valid = false;
    } else {
      namesInNamespace.add(app.name);
    }

    // Validate individual app config
    const appValidation = validateAppConfig(app);
    result.errors.push(...appValidation.errors);
    result.warnings.push(...appValidation.warnings);

    if (!appValidation.valid) {
      result.valid = false;
    }
  }

  return result;
}

/**
 * Parses a memory size string (e.g., "300M", "1G") into bytes
 */
export function parseMemorySize(memoryStr: string): MemoryParseResult {
  if (typeof memoryStr !== 'string') {
    return {
      success: false,
      error: 'Memory size must be a string',
    };
  }

  const trimmed = memoryStr.trim();
  if (trimmed === '') {
    return {
      success: false,
      error: 'Memory size cannot be empty',
    };
  }

  // Match pattern: optional minus sign, number followed by optional unit
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)([KMGkmg]?)$/);
  if (!match) {
    return {
      success: false,
      error:
        'Invalid memory size format. Expected format: number[KMGkmg] (e.g., "300M", "1G")',
    };
  }

  const [, numberStr, unit] = match;
  const number = parseFloat(numberStr);

  if (isNaN(number) || number < 0) {
    return {
      success: false,
      error: 'Memory size must be a non-negative number',
    };
  }

  const multiplier =
    MEMORY_MULTIPLIERS[unit as keyof typeof MEMORY_MULTIPLIERS];
  const bytes = Math.floor(number * multiplier);

  return {
    success: true,
    bytes,
  };
}

/**
 * Formats bytes to human-readable memory size string
 */
export function formatMemorySize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}K`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))}M`;
  }

  return `${Math.round(bytes / (1024 * 1024 * 1024))}G`;
}

/**
 * Creates a default AppConfig with required fields
 */
export function createDefaultAppConfig(
  name: string,
  script: string
): AppConfig {
  return {
    name,
    script,
    namespace: DEFAULT_NAMESPACE,
  };
}

/**
 * Creates a default ProcmanConfig with an empty apps array
 */
export function createDefaultProcmanConfig(): ProcmanConfig {
  return {
    apps: [],
  };
}

/**
 * Merges partial app config with default values
 */
export function mergeAppConfig(
  base: AppConfig,
  partial: Partial<AppConfig>
): AppConfig {
  return {
    ...base,
    ...partial,
    // Ensure env is properly merged
    env: partial.env ? { ...base.env, ...partial.env } : base.env,
  };
}

/**
 * Configuration-related constants
 */
export const CONFIG_CONSTANTS = {
  /** Maximum number of applications per namespace */
  MAX_APPS_PER_NAMESPACE: 100,
  /** Maximum memory size in bytes (100GB) */
  MAX_MEMORY_SIZE: 100 * 1024 * 1024 * 1024,
  /** Minimum memory size in bytes (1MB) */
  MIN_MEMORY_SIZE: 1024 * 1024,
  /** Default memory limit if not specified */
  DEFAULT_MEMORY_LIMIT: '300M',
  /** Supported config file extensions */
  SUPPORTED_CONFIG_EXTENSIONS: ['.js', '.json', '.ts'] as const,
} as const;

/**
 * Type definitions for configuration-related utilities
 */
export type ConfigFileExtension =
  (typeof CONFIG_CONSTANTS.SUPPORTED_CONFIG_EXTENSIONS)[number];

/**
 * Configuration loading options
 */
export interface ConfigLoadOptions {
  /** Path to configuration file */
  configPath: FilePath;
  /** Whether to validate the configuration */
  validate?: boolean;
  /** Whether to allow partial configurations */
  allowPartial?: boolean;
  /** Default namespace to use for apps without explicit namespace */
  defaultNamespace?: string;
}

/**
 * Configuration loading result
 */
export interface ConfigLoadResult {
  /** Whether loading was successful */
  success: boolean;
  /** Loaded configuration (only if success is true) */
  config?: ProcmanConfig;
  /** Loading error (only if success is false) */
  error?: string;
  /** Validation result */
  validation?: ConfigValidationResult;
  /** Path to the loaded configuration file */
  filePath?: FilePath;
}
