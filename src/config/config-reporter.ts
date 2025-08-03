/**
 * Configuration Reporter
 *
 * Handles reporting logic for procman configuration validation.
 * Provides detailed validation reports and error tracking.
 */

import * as path from 'path';
import { ProcmanConfig } from '../shared/config';
import { ProcmanError } from '../shared/errors';

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
 * Configuration validation report
 */
export interface ValidationReport {
  /** Whether validation passed */
  success: boolean;
  /** Configuration file path */
  filePath: string;
  /** Total number of apps */
  appCount: number;
  /** List of validation issues */
  issues: ValidationIssue[];
  /** Summary statistics */
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  /** Apps summary */
  apps: Array<{
    name: string;
    script: string;
    memoryLimit?: string;
    hasEnvVars: boolean;
    hasLogFiles: boolean;
  }>;
}

/**
 * Enhanced validation error with suggestions
 */
export interface EnhancedValidationError extends ProcmanError {
  suggestions: string[];
  validationIssues: ValidationIssue[];
}

/**
 * Configuration reporter options
 */
export interface ConfigReporterOptions {
  /** Whether to include detailed suggestions (default: true) */
  includeSuggestions?: boolean;
  /** Maximum number of issues to collect (default: 100) */
  maxIssues?: number;
}

/**
 * Configuration reporter class
 * Responsible for generating validation reports and error messages
 */
export class ConfigReporter {
  private includeSuggestions: boolean;
  private maxIssues: number;
  private validationIssues: ValidationIssue[] = [];
  private lastReport: ValidationReport | null = null;

  constructor(options: ConfigReporterOptions = {}) {
    this.includeSuggestions = options.includeSuggestions !== false;
    this.maxIssues = options.maxIssues || 100;
  }

  /**
   * Generate validation report for configuration
   * @param config Validated configuration (or null if validation failed)
   * @param filePath Path to configuration file
   * @param issues Array of validation issues
   * @returns Validation report
   */
  generateReport(
    config: ProcmanConfig | null,
    filePath: string,
    issues: ValidationIssue[] = []
  ): ValidationReport {
    const absolutePath = path.resolve(filePath);
    this.validationIssues = [...issues];

    const report: ValidationReport = {
      success: config !== null,
      filePath: absolutePath,
      appCount: config?.apps.length || 0,
      issues: [...this.validationIssues],
      summary: this.calculateSummary(this.validationIssues),
      apps: [],
    };

    if (config) {
      // Generate app summaries
      report.apps = config.apps.map((app) => ({
        name: app.name,
        script: app.script,
        memoryLimit: app.max_memory_restart,
        hasEnvVars: !!app.env && Object.keys(app.env).length > 0,
        hasLogFiles: !!(app.log_file || app.out_file || app.error_file),
      }));
    }

    this.lastReport = report;
    return report;
  }

  /**
   * Generate report from validation attempt
   * @param filePath Path to configuration file
   * @param validationFunction Function that performs validation
   * @returns Validation report
   */
  async generateReportFromValidation(
    filePath: string,
    validationFunction: () => Promise<ProcmanConfig>
  ): Promise<ValidationReport> {
    const absolutePath = path.resolve(filePath);
    this.validationIssues = [];

    const report: ValidationReport = {
      success: false,
      filePath: absolutePath,
      appCount: 0,
      issues: [],
      summary: { errors: 0, warnings: 0, infos: 0 },
      apps: [],
    };

    try {
      const config = await validationFunction();

      // Generate app summaries
      report.appCount = config.apps.length;
      report.apps = config.apps.map((app) => ({
        name: app.name,
        script: app.script,
        memoryLimit: app.max_memory_restart,
        hasEnvVars: !!app.env && Object.keys(app.env).length > 0,
        hasLogFiles: !!(app.log_file || app.out_file || app.error_file),
      }));

      report.success = true;
    } catch (error) {
      // Add error to issues
      if (error instanceof ProcmanError) {
        this.addValidationIssue({
          severity: 'error',
          category: 'structure',
          message: error.message,
        });
      } else {
        this.addValidationIssue({
          severity: 'error',
          category: 'structure',
          message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    // Add collected issues to report
    report.issues = [...this.validationIssues];

    // Calculate summary
    report.summary = this.calculateSummary(report.issues);

    this.lastReport = report;
    return report;
  }

  /**
   * Add validation issue to collection
   * @param issue Validation issue to add
   */
  addValidationIssue(issue: ValidationIssue): void {
    if (this.validationIssues.length < this.maxIssues) {
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
   * Get last validation report
   * @returns Last validation report or null
   */
  getLastReport(): ValidationReport | null {
    return this.lastReport;
  }

  /**
   * Calculate summary statistics from issues
   * @param issues Array of validation issues
   * @returns Summary object with counts
   */
  calculateSummary(issues: ValidationIssue[]): {
    errors: number;
    warnings: number;
    infos: number;
  } {
    const summary = { errors: 0, warnings: 0, infos: 0 };

    for (const issue of issues) {
      switch (issue.severity) {
        case 'error':
          summary.errors++;
          break;
        case 'warning':
          summary.warnings++;
          break;
        case 'info':
          summary.infos++;
          break;
      }
    }

    return summary;
  }

  /**
   * Create enhanced validation error with suggestions
   * @param originalError Original error
   * @param issues Validation issues
   * @returns Enhanced validation error
   */
  createEnhancedValidationError(
    originalError: ProcmanError,
    issues: ValidationIssue[] = []
  ): EnhancedValidationError {
    const suggestions = this.includeSuggestions
      ? this.generateSuggestions(
          originalError.code,
          originalError.details?.field as string
        )
      : [];

    const enhancedError = originalError as EnhancedValidationError;
    enhancedError.suggestions = suggestions;
    enhancedError.validationIssues = [...issues];

    return enhancedError;
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

      case 'CONFIG_FILE_ERROR':
        suggestions.push('Ensure the configuration file exists');
        suggestions.push('Check file permissions for read access');
        suggestions.push('Verify the file has .js extension');
        break;

      default:
        suggestions.push('Check the configuration documentation');
        suggestions.push('Verify all required fields are present');
    }

    return suggestions;
  }

  /**
   * Format validation report as human-readable text
   * @param report Validation report to format
   * @returns Formatted report text
   */
  formatReport(report: ValidationReport): string {
    const lines: string[] = [];

    lines.push(`Configuration Validation Report`);
    lines.push(`==============================`);
    lines.push(`File: ${report.filePath}`);
    lines.push(`Status: ${report.success ? 'VALID' : 'INVALID'}`);
    lines.push(`Apps: ${report.appCount}`);
    lines.push('');

    if (
      report.summary.errors > 0 ||
      report.summary.warnings > 0 ||
      report.summary.infos > 0
    ) {
      lines.push(
        `Summary: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.infos} info`
      );
      lines.push('');
    }

    if (report.issues.length > 0) {
      lines.push('Issues:');
      lines.push('-------');

      for (const issue of report.issues) {
        const location = issue.location
          ? ` (app[${issue.location.appIndex}]${issue.location.field ? `.${issue.location.field}` : ''})`
          : '';

        lines.push(
          `[${issue.severity.toUpperCase()}] ${issue.message}${location}`
        );

        if (issue.suggestion && this.includeSuggestions) {
          lines.push(`  Suggestion: ${issue.suggestion}`);
        }
        lines.push('');
      }
    }

    if (report.success && report.apps.length > 0) {
      lines.push('Apps:');
      lines.push('-----');

      for (const app of report.apps) {
        lines.push(`• ${app.name}: ${app.script}`);

        const details: string[] = [];
        if (app.memoryLimit) details.push(`memory: ${app.memoryLimit}`);
        if (app.hasEnvVars) details.push('env vars');
        if (app.hasLogFiles) details.push('log files');

        if (details.length > 0) {
          lines.push(`  (${details.join(', ')})`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Format validation report as JSON
   * @param report Validation report to format
   * @param pretty Whether to pretty-print JSON (default: false)
   * @returns JSON string
   */
  formatReportAsJson(
    report: ValidationReport,
    pretty: boolean = false
  ): string {
    return JSON.stringify(report, null, pretty ? 2 : undefined);
  }

  /**
   * Set whether to include suggestions in reports
   * @param include Whether to include suggestions
   */
  setIncludeSuggestions(include: boolean): void {
    this.includeSuggestions = include;
  }

  /**
   * Get whether suggestions are included in reports
   * @returns True if suggestions are included
   */
  isIncludingSuggestions(): boolean {
    return this.includeSuggestions;
  }

  /**
   * Set maximum number of issues to collect
   * @param maxIssues Maximum number of issues
   */
  setMaxIssues(maxIssues: number): void {
    this.maxIssues = Math.max(1, maxIssues);
  }

  /**
   * Get maximum number of issues to collect
   * @returns Maximum number of issues
   */
  getMaxIssues(): number {
    return this.maxIssues;
  }
}

/**
 * Create a new configuration reporter instance
 * @param options Reporter options
 * @returns ConfigReporter instance
 */
export function createConfigReporter(
  options?: ConfigReporterOptions
): ConfigReporter {
  return new ConfigReporter(options);
}
