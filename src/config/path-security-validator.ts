/**
 * Path Security Validator
 *
 * Standalone functions for validating file path security
 * to prevent path traversal and injection attacks.
 */

import * as path from 'path';
import { ProcmanError, createError } from '../shared/errors.js';
import type { ValidationIssue } from './validation-types.js';

/**
 * Sanitize file path to prevent path traversal attacks
 * @param filePath File path to sanitize
 * @returns Sanitized file path
 * @throws ProcmanError if path is potentially malicious
 */
export function sanitizeFilePath(filePath: string): string {
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
export function validatePathWithinProject(
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
 * Validate script path for security issues
 * @param scriptPath Script path to validate
 * @param appIndex App index for error reporting
 * @returns A ValidationIssue if a warning is found, or null
 */
export function validateScriptPathSecurity(
  scriptPath: string,
  appIndex: number
): ValidationIssue | null {
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
      return {
        severity: 'warning',
        category: 'security',
        message: `Script "${scriptPath}" contains potentially dangerous patterns`,
        location: { appIndex, field: 'script', value: scriptPath },
        suggestion: 'Review script for security implications',
      };
    }
  }

  return null;
}

/**
 * Validate file path for security issues
 * @param filePath File path to validate
 * @param appIndex App index for error reporting
 * @param fieldName Field name for error reporting
 * @param projectRoot Project root path for boundary validation
 * @throws ProcmanError if path has security issues
 */
export function validatePathSecurity(
  filePath: string,
  appIndex: number,
  fieldName: string,
  projectRoot: string
): void {
  try {
    sanitizeFilePath(filePath);

    // For relative paths, ensure they don't escape project boundaries
    if (!path.isAbsolute(filePath)) {
      validatePathWithinProject(filePath, projectRoot);
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
