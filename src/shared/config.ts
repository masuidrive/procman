/**
 * Configuration Type Definitions
 *
 * This module defines basic types for configuration management in the procman system.
 */

import { MEMORY_MULTIPLIERS } from './constants.js';

// =============================================================================
// Application Configuration Interface
// =============================================================================

/**
 * Configuration for a single application
 */
export interface AppConfig {
  /** Application name */
  name: string;
  /** Script path to execute */
  script: string;
  /** Namespace for grouping */
  namespace?: string;
  /** Command line arguments */
  args?: string;
  /** Working directory */
  cwd?: string;
  /** Note or description */
  note?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Memory limit for auto-restart */
  max_memory_restart?: string;
  /** Log file path */
  log_file?: string;
  /** Standard output file path */
  out_file?: string;
  /** Error output file path */
  error_file?: string;
}

// =============================================================================
// Project Configuration Interface
// =============================================================================

/**
 * Root configuration containing all applications
 */
export interface ProcmanConfig {
  /** Array of application configurations */
  apps: AppConfig[];
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if an object is an AppConfig
 * Note: This performs basic structural validation. Full validation should be done by ConfigLoader.
 */
export function isAppConfig(obj: unknown): obj is AppConfig {
  if (typeof obj !== 'object' || obj === null) return false;

  const config = obj as Record<string, unknown>;

  // Check required fields
  if (typeof config.name !== 'string' || !config.name.trim()) return false;
  if (typeof config.script !== 'string' || !config.script.trim()) return false;

  // Check optional string fields
  if (config.namespace !== undefined && typeof config.namespace !== 'string')
    return false;
  if (config.args !== undefined && typeof config.args !== 'string')
    return false;
  if (config.cwd !== undefined && typeof config.cwd !== 'string') return false;
  if (config.note !== undefined && typeof config.note !== 'string')
    return false;
  if (
    config.max_memory_restart !== undefined &&
    typeof config.max_memory_restart !== 'string'
  )
    return false;
  if (config.log_file !== undefined && typeof config.log_file !== 'string')
    return false;
  if (config.out_file !== undefined && typeof config.out_file !== 'string')
    return false;
  if (config.error_file !== undefined && typeof config.error_file !== 'string')
    return false;

  // Check env object
  if (config.env !== undefined) {
    if (typeof config.env !== 'object' || config.env === null) return false;
    const env = config.env as Record<string, unknown>;
    for (const value of Object.values(env)) {
      if (typeof value !== 'string') return false;
    }
  }

  return true;
}

/**
 * Type guard to check if an object is a ProcmanConfig
 * Note: This performs basic structural validation. Full validation should be done by ConfigLoader.
 */
export function isProcmanConfig(obj: unknown): obj is ProcmanConfig {
  if (typeof obj !== 'object' || obj === null) return false;

  const config = obj as Record<string, unknown>;

  if (!Array.isArray(config.apps)) return false;

  return config.apps.every((app: unknown) => isAppConfig(app));
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Result of memory size parsing
 */
export interface MemoryParseResult {
  /** Whether parsing was successful */
  success: boolean;
  /** Parsed value in bytes (only if success is true) */
  value?: number;
  /** Error message (only if success is false) */
  error?: string;
}

/**
 * Parse memory size string to bytes
 * @param memoryString Memory size string (e.g., "512M", "1G")
 * @returns Structured result with success/failure information
 */
export function parseMemorySize(memoryString: string): MemoryParseResult {
  if (typeof memoryString !== 'string') {
    return {
      success: false,
      error: 'Memory size must be a string',
    };
  }

  const match = memoryString.match(/^(\d+(?:\.\d+)?)\s*([KkMmGg]?)$/);
  if (!match) {
    return {
      success: false,
      error: 'Invalid format. Expected: number[KMG] (e.g., "300M", "1G")',
    };
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || '';
  const multiplier =
    MEMORY_MULTIPLIERS[unit as keyof typeof MEMORY_MULTIPLIERS] || 1;

  return {
    success: true,
    value: Math.floor(value * multiplier),
  };
}
