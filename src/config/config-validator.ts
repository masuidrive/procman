/**
 * Configuration Validator
 *
 * Handles validation logic for procman configuration files.
 * Provides comprehensive validation with detailed error reporting and suggestions.
 */

import * as path from 'path';
import { ProcmanConfig, parseMemorySize } from '../shared/config';
import { ProcmanError, createError } from '../shared/errors';

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

/**
 * Configuration validator class
 * Responsible for validating procman configuration structure and content
 */
export class ConfigValidator {
  private projectRoot: string;
  private collectIssues: boolean;
  private validationIssues: ValidationIssue[] = [];

  constructor(options: ConfigValidatorOptions = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.collectIssues = options.collectIssues || false;
  }

  /**
   * Validate configuration structure and content
   * @param config Configuration object to validate
   * @throws ProcmanError if validation fails
   */
  validateConfig(config: unknown): asserts config is ProcmanConfig {
    this.validationIssues = []; // Reset issues for new validation

    // Enhanced type guards with better error messages
    if (!this.isValidConfigObject(config)) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: this.getConfigTypeErrorMessage(config),
      });
    }

    const configObj = config;

    // Validate apps array exists
    if (!('apps' in configObj)) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: 'Configuration must contain an "apps" array',
      });
    }

    // Validate apps is an array
    if (!Array.isArray(configObj.apps)) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: 'Configuration "apps" property must be an array',
      });
    }

    // Validate apps array is not empty
    if (configObj.apps.length === 0) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: 'Configuration "apps" array cannot be empty',
      });
    }

    // Track app names to check for duplicates
    const appNames = new Set<string>();

    // Validate each app configuration
    configObj.apps.forEach((app: unknown, index: number) => {
      this.validateAppConfig(app, index, appNames);
    });
  }

  /**
   * Validate individual app configuration
   * @param app App configuration to validate
   * @param index Index in the apps array (for error reporting)
   * @param appNames Set to track duplicate names
   * @throws ProcmanError if validation fails
   */
  validateAppConfig(app: unknown, index: number, appNames: Set<string>): void {
    // Basic structure check
    if (!app || typeof app !== 'object') {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `App configuration at index ${index} must be an object`,
        details: { appIndex: index },
      });
    }

    const appConfig = app as Record<string, unknown>;

    // Validate required fields
    this.validateRequiredField(appConfig, 'name', 'string', index);
    this.validateRequiredField(appConfig, 'script', 'string', index);

    // Get name for duplicate checking
    const appName = appConfig.name as string;

    // Validate name format (must be non-empty and valid identifier)
    if (!appName.trim()) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `App configuration at index ${index}: name cannot be empty`,
        details: { appIndex: index, field: 'name' },
      });
    }

    // Check for valid app name format (alphanumeric, dash, underscore)
    if (!/^[a-zA-Z0-9_-]+$/.test(appName)) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `App configuration at index ${index}: name "${appName}" contains invalid characters. Only alphanumeric, dash, and underscore are allowed`,
        details: { appIndex: index, field: 'name', value: appName },
      });
    }

    // Check for duplicate names
    if (appNames.has(appName)) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `App configuration at index ${index}: duplicate app name "${appName}"`,
        details: { appIndex: index, field: 'name', value: appName },
      });
    }
    appNames.add(appName);

    // Validate script is non-empty
    const script = appConfig.script as string;
    if (!script.trim()) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `App configuration at index ${index}: script cannot be empty`,
        details: { appIndex: index, field: 'script' },
      });
    }

    // Validate optional fields
    this.validateOptionalField(appConfig, 'namespace', 'string', index);
    this.validateOptionalField(appConfig, 'args', 'string', index);
    this.validateOptionalField(appConfig, 'cwd', 'string', index);
    this.validateOptionalField(appConfig, 'note', 'string', index);
    this.validateOptionalField(appConfig, 'out_log', 'string', index);
    this.validateOptionalField(appConfig, 'error_log', 'string', index);
    this.validateOptionalField(appConfig, 'merge_logs', 'boolean', index);
    this.validateOptionalField(
      appConfig,
      'max_memory_restart',
      'string',
      index
    );

    // Validate env object if present
    if ('env' in appConfig && appConfig.env !== undefined) {
      this.validateEnvObject(appConfig.env, index);
    }

    // Validate memory size if present
    if ('max_memory_restart' in appConfig && appConfig.max_memory_restart) {
      this.validateMemorySize(appConfig.max_memory_restart as string, index);
    }

    // Validate script path security
    this.validateScriptPathSecurity(script, index);
    this.validatePathSecurity(script, index, 'script');

    // Validate file paths for security
    if ('cwd' in appConfig && appConfig.cwd) {
      this.validatePathSecurity(appConfig.cwd as string, index, 'cwd');
    }
    if ('out_log' in appConfig && appConfig.out_log) {
      this.validatePathSecurity(appConfig.out_log as string, index, 'out_log');
    }
    if ('error_log' in appConfig && appConfig.error_log) {
      this.validatePathSecurity(
        appConfig.error_log as string,
        index,
        'error_log'
      );
    }
    if ('log_file' in appConfig && appConfig.log_file) {
      this.validatePathSecurity(
        appConfig.log_file as string,
        index,
        'log_file'
      );
    }
  }

  /**
   * Validate required field exists and has correct type
   * @param obj Object to validate
   * @param field Field name
   * @param expectedType Expected type
   * @param appIndex App index for error reporting
   * @throws ProcmanError if validation fails
   */
  private validateRequiredField(
    obj: Record<string, unknown>,
    field: string,
    expectedType: string,
    appIndex: number
  ): void {
    if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `App configuration at index ${appIndex}: missing required field "${field}"`,
        details: { appIndex, field },
      });
    }

    if (typeof obj[field] !== expectedType) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `App configuration at index ${appIndex}: field "${field}" must be of type ${expectedType}, got ${typeof obj[field]}`,
        details: { appIndex, field, value: String(obj[field]) },
      });
    }
  }

  /**
   * Validate optional field has correct type if present
   * @param obj Object to validate
   * @param field Field name
   * @param expectedType Expected type
   * @param appIndex App index for error reporting
   * @throws ProcmanError if validation fails
   */
  private validateOptionalField(
    obj: Record<string, unknown>,
    field: string,
    expectedType: string,
    appIndex: number
  ): void {
    if (field in obj && obj[field] !== undefined && obj[field] !== null) {
      if (typeof obj[field] !== expectedType) {
        throw createError('CONFIG_VALIDATION_ERROR', {
          message: `App configuration at index ${appIndex}: field "${field}" must be of type ${expectedType}, got ${typeof obj[field]}`,
          details: { appIndex, field, value: String(obj[field]) },
        });
      }
    }
  }

  /**
   * Validate environment variables object
   * @param env Environment variables object
   * @param appIndex App index for error reporting
   * @throws ProcmanError if validation fails
   */
  private validateEnvObject(env: unknown, appIndex: number): void {
    if (env === null || env === undefined) {
      return; // Allow null/undefined
    }

    if (typeof env !== 'object' || Array.isArray(env)) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `App configuration at index ${appIndex}: env must be an object`,
        details: { appIndex, field: 'env' },
      });
    }

    const envObj = env as Record<string, unknown>;
    for (const [key, value] of Object.entries(envObj)) {
      // Validate environment variable name
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
        throw createError('CONFIG_VALIDATION_ERROR', {
          message: `App configuration at index ${appIndex}: Invalid environment variable name "${key}". Use uppercase letters, numbers, and underscores only.`,
          details: { appIndex, field: 'env', value: key },
        });
      }

      // Validate environment variable value (must be string for portability)
      if (typeof value !== 'string') {
        throw createError('CONFIG_VALIDATION_ERROR', {
          message: `App configuration at index ${appIndex}: env["${key}"] must be a string, got ${typeof value}`,
          details: { appIndex, field: 'env', value: key },
        });
      }
    }
  }

  /**
   * Validate memory size format and convert to bytes
   * @param memorySize Memory size string (e.g., "300M", "1G")
   * @param appIndex App index for error reporting
   * @throws ProcmanError if validation fails
   */
  validateMemorySize(memorySize: string, appIndex: number): void {
    const result = parseMemorySize(memorySize);

    if (!result.success) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `App configuration at index ${appIndex}: invalid memory size format "${memorySize}": ${result.error}`,
        details: { appIndex, field: 'max_memory_restart', value: memorySize },
      });
    }

    const bytes = result.value!;

    // Reject very small memory limits (less than 1MB)
    if (bytes < 1024 * 1024) {
      // Less than 1MB
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `App configuration at index ${appIndex}: Memory limit "${memorySize}" below minimum limit (1MB)`,
        details: { appIndex, field: 'max_memory_restart', value: memorySize },
      });
    }

    // Reject very large memory limits (more than 64GB)
    if (bytes > 64 * 1024 * 1024 * 1024) {
      // More than 64GB
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `App configuration at index ${appIndex}: Memory limit "${memorySize}" exceeds maximum limit (64GB)`,
        details: { appIndex, field: 'max_memory_restart', value: memorySize },
      });
    }
  }

  /**
   * Validate script path for security issues
   * @param scriptPath Script path to validate
   * @param appIndex App index for error reporting
   */
  private validateScriptPathSecurity(
    scriptPath: string,
    appIndex: number
  ): void {
    // Check for potentially dangerous script patterns
    const dangerousPatterns = [
      /^\s*sudo\s+/i, // sudo commands
      /^\s*su\s+/i, // su commands
      /[|&;`$(){}]/, // Shell injection characters
      /\beval\b/i, // eval functions
      /\bexec\b/i, // exec functions
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(scriptPath)) {
        this.addValidationIssue({
          severity: 'warning',
          category: 'security',
          message: `Script "${scriptPath}" contains potentially dangerous patterns`,
          location: { appIndex, field: 'script', value: scriptPath },
          suggestion: 'Review script for security implications',
        });
        break;
      }
    }
  }

  /**
   * Validate file path for security issues
   * @param filePath File path to validate
   * @param appIndex App index for error reporting
   * @param fieldName Field name for error reporting
   */
  private validatePathSecurity(
    filePath: string,
    appIndex: number,
    fieldName: string
  ): void {
    try {
      this.sanitizeFilePath(filePath);

      // For relative paths, ensure they don't escape project boundaries
      if (!path.isAbsolute(filePath)) {
        this.validatePathWithinProject(filePath, this.projectRoot);
      }
    } catch (error) {
      if (
        error instanceof ProcmanError &&
        error.code === 'CONFIG_SECURITY_ERROR'
      ) {
        throw createError('CONFIG_VALIDATION_ERROR', {
          message: `App configuration at index ${appIndex}: ${error.message}`,
          details: { appIndex, field: fieldName, value: filePath },
        });
      }
      throw error;
    }
  }

  /**
   * Add validation issue to collection (if enabled)
   * @param issue Validation issue to add
   */
  private addValidationIssue(issue: ValidationIssue): void {
    if (this.collectIssues) {
      this.validationIssues.push(issue);
    }
  }

  /**
   * Get collected validation issues
   * @returns Array of validation issues
   */
  getValidationIssues(): ValidationIssue[] {
    return [...this.validationIssues];
  }

  /**
   * Clear collected validation issues
   */
  clearValidationIssues(): void {
    this.validationIssues = [];
  }

  /**
   * Sanitize file path to prevent path traversal attacks
   * @param filePath File path to sanitize
   * @returns Sanitized file path
   * @throws ProcmanError if path is potentially malicious
   */
  private sanitizeFilePath(filePath: string): string {
    if (typeof filePath !== 'string') {
      throw createError('CONFIG_SECURITY_ERROR', {
        message: 'File path must be a string',
      });
    }

    const trimmedPath = filePath.trim();

    if (trimmedPath === '') {
      throw createError('CONFIG_SECURITY_ERROR', {
        message: 'File path cannot be empty',
      });
    }

    // Check for null bytes (directory traversal attack)
    if (trimmedPath.includes('\0')) {
      throw createError('CONFIG_SECURITY_ERROR', {
        message: 'File path contains null bytes',
      });
    }

    // Check for suspicious characters
    const suspiciousChars = ['<', '>', '|', '*', '?'];
    for (const char of suspiciousChars) {
      if (trimmedPath.includes(char)) {
        throw createError('CONFIG_SECURITY_ERROR', {
          message: `File path contains suspicious character: ${char}`,
        });
      }
    }

    // Normalize the path to resolve . and .. segments
    const normalizedPath = path.normalize(trimmedPath);

    // Additional check after normalization
    if (normalizedPath !== trimmedPath && normalizedPath.includes('..')) {
      throw createError('CONFIG_SECURITY_ERROR', {
        message: 'Normalized path contains directory traversal patterns',
      });
    }

    return normalizedPath;
  }

  /**
   * Validate that a path stays within the project boundaries
   * @param filePath File path to validate (relative)
   * @param basePath Base path to resolve against
   * @returns Resolved absolute path
   * @throws ProcmanError if path escapes project boundaries
   */
  private validatePathWithinProject(
    filePath: string,
    basePath: string
  ): string {
    // Only validate relative paths - absolute paths are allowed as explicit admin choice
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // Block relative paths with .. that could escape project
    if (filePath.includes('..')) {
      throw createError('CONFIG_SECURITY_ERROR', {
        message: `Path traversal attack detected: ${filePath}`,
      });
    }

    const resolvedPath = path.resolve(basePath, filePath);
    const normalizedRoot = path.normalize(basePath);

    if (!path.normalize(resolvedPath).startsWith(normalizedRoot)) {
      throw createError('CONFIG_SECURITY_ERROR', {
        message: `Path traversal attack detected - path is outside of the project root: ${filePath}`,
      });
    }

    return resolvedPath;
  }

  /**
   * Generate suggestions for validation errors
   * @param errorCode Error code
   * @param field Field name (optional)
   * @returns Array of suggestions
   */
  generateSuggestions(errorCode: string, field?: string): string[] {
    const suggestions: string[] = [];

    switch (errorCode) {
      case 'CONFIG_VALIDATION_ERROR':
        if (field === 'name') {
          suggestions.push(
            'Use only alphanumeric characters, dashes, and underscores'
          );
          suggestions.push('Ensure the name is unique across all apps');
        } else if (field === 'script') {
          suggestions.push('Provide the full command to execute');
          suggestions.push('Use absolute paths for executables if needed');
        } else if (field === 'max_memory_restart') {
          suggestions.push('Use format like "300M", "1G", or "512000K"');
          suggestions.push('Ensure the unit (K/M/G) is specified');
        }
        break;

      case 'CONFIG_SECURITY_ERROR':
        suggestions.push('Use relative paths within the project directory');
        suggestions.push('Avoid ".." in paths to prevent directory traversal');
        suggestions.push('Use absolute paths only when explicitly needed');
        break;

      default:
        suggestions.push('Check the configuration documentation');
        suggestions.push('Verify all required fields are present');
    }

    return suggestions;
  }

  /**
   * Enhanced type guard for configuration objects
   * @param config Unknown input to validate
   * @returns Type predicate indicating if config is a valid object
   */
  private isValidConfigObject(
    config: unknown
  ): config is Record<string, unknown> {
    return (
      config !== null &&
      config !== undefined &&
      typeof config === 'object' &&
      !Array.isArray(config) &&
      // Check for common invalid objects
      !(config instanceof Date) &&
      !(config instanceof RegExp) &&
      !(config instanceof Error)
    );
  }

  /**
   * Generate detailed error message for invalid config types
   * @param config Invalid config to analyze
   * @returns Descriptive error message
   */
  private getConfigTypeErrorMessage(config: unknown): string {
    if (config === null) {
      return 'Configuration cannot be null. Expected an object with an "apps" array.';
    }
    if (config === undefined) {
      return 'Configuration is undefined. Expected an object with an "apps" array.';
    }
    if (Array.isArray(config)) {
      return 'Configuration cannot be an array. Expected an object with an "apps" property.';
    }
    if (typeof config === 'string') {
      return `Configuration cannot be a string ('${config.slice(0, 50)}${config.length > 50 ? '...' : ''}'). Expected an object.`;
    }
    if (typeof config === 'number') {
      return `Configuration cannot be a number (${config}). Expected an object.`;
    }
    if (typeof config === 'boolean') {
      return `Configuration cannot be a boolean (${config}). Expected an object.`;
    }
    if (config instanceof Date) {
      return `Configuration cannot be a Date object (${config.toISOString()}). Expected a plain object.`;
    }
    if (config instanceof Error) {
      return `Configuration cannot be an Error object (${config.message}). Expected a plain object.`;
    }
    if (typeof config === 'function') {
      return 'Configuration cannot be a function. Expected an object.';
    }

    return `Configuration must be a plain object, got ${typeof config}.`;
  }
}

/**
 * Create a new configuration validator instance
 * @param options Validator options
 * @returns ConfigValidator instance
 */
export function createConfigValidator(
  options?: ConfigValidatorOptions
): ConfigValidator {
  return new ConfigValidator(options);
}
