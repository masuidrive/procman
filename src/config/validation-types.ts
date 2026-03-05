/**
 * Validation Types
 *
 * Type definitions for configuration validation.
 */

/**
 * Validation issue severity levels
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Validation issue details
 */
export interface ValidationIssue {
  /** Issue severity level */
  severity: ValidationSeverity;
  /** Issue category */
  category: 'structure' | 'security' | 'performance' | 'compatibility';
  /** Issue message */
  message: string;
  /** Location of the issue */
  location?: {
    appIndex?: number;
    field?: string;
    value?: string;
  };
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Configuration validator options
 */
export interface ConfigValidatorOptions {
  /** Project root path for security validation */
  projectRoot?: string;
  /** Whether to collect validation issues for reporting (default: false) */
  collectIssues?: boolean;
}
