/**
 * Configuration Normalizer
 *
 * Handles normalization logic for procman configuration files.
 * Applies default values, normalizes paths, and expands environment variables.
 */

import * as path from 'path';
import { ProcmanConfig, AppConfig } from '../shared/config.js';

/**
 * Normalized configuration after applying defaults and path normalization
 */
export interface NormalizedConfig {
  apps: AppConfig[];
  _metadata: {
    originalPath: string;
    normalizedPath: string;
    normalizedAt: number;
    defaultsApplied: string[];
  };
}

/**
 * Configuration normalizer options
 */
export interface ConfigNormalizerOptions {
  /** Base directory for resolving relative paths (default: process.cwd()) */
  baseDirectory?: string;
  /** Whether to expand environment variables (default: true) */
  expandEnvironmentVariables?: boolean;
}

/**
 * Configuration normalizer class
 * Responsible for applying defaults and normalizing procman configuration
 */
export class ConfigNormalizer {
  private baseDirectory: string;
  private expandEnvVars: boolean;

  constructor(options: ConfigNormalizerOptions = {}) {
    this.baseDirectory = options.baseDirectory || process.cwd();
    this.expandEnvVars = options.expandEnvironmentVariables !== false;
  }

  /**
   * Apply default values and normalize paths
   * @param config Configuration to normalize
   * @param originalPath Original configuration file path
   * @returns Normalized configuration
   */
  normalizeConfig(
    config: ProcmanConfig,
    originalPath: string
  ): NormalizedConfig {
    const defaultsApplied: string[] = [];
    const configDir = path.dirname(path.resolve(originalPath));

    const normalizedApps = config.apps.map((app, index) => {
      const normalizedApp = { ...app };

      // Apply defaults
      if (!normalizedApp.cwd) {
        normalizedApp.cwd = configDir;
        defaultsApplied.push(`apps[${index}].cwd`);
      }

      if (!normalizedApp.env) {
        normalizedApp.env = {};
        defaultsApplied.push(`apps[${index}].env`);
      }

      // Normalize paths
      normalizedApp.cwd = this.normalizePath(normalizedApp.cwd, configDir);

      if (normalizedApp.log_file) {
        normalizedApp.log_file = this.normalizePath(
          normalizedApp.log_file,
          configDir
        );
      }
      if (normalizedApp.out_file) {
        normalizedApp.out_file = this.normalizePath(
          normalizedApp.out_file,
          configDir
        );
      }
      if (normalizedApp.error_file) {
        normalizedApp.error_file = this.normalizePath(
          normalizedApp.error_file,
          configDir
        );
      }

      // Expand environment variables
      if (this.expandEnvVars && normalizedApp.env) {
        normalizedApp.env = this.expandEnvironmentVariables(normalizedApp.env);
      }

      return normalizedApp;
    });

    return {
      apps: normalizedApps,
      _metadata: {
        originalPath,
        normalizedPath: originalPath,
        normalizedAt: Date.now(),
        defaultsApplied,
      },
    };
  }

  /**
   * Apply only default values without path normalization
   * @param config Configuration to apply defaults to
   * @param originalPath Original configuration file path
   * @returns Configuration with defaults applied
   */
  applyDefaults(config: ProcmanConfig, originalPath: string): ProcmanConfig {
    const configDir = path.dirname(path.resolve(originalPath));

    const appsWithDefaults = config.apps.map((app) => {
      const appWithDefaults = { ...app };

      // Apply defaults
      if (!appWithDefaults.cwd) {
        appWithDefaults.cwd = configDir;
      }

      if (!appWithDefaults.env) {
        appWithDefaults.env = {};
      }

      return appWithDefaults;
    });

    return {
      ...config,
      apps: appsWithDefaults,
    };
  }

  /**
   * Normalize file paths (relative to absolute conversion)
   * @param filePath File path to normalize
   * @param basePath Base path to resolve relative paths against
   * @returns Normalized absolute path
   */
  normalizePath(filePath: string, basePath: string): string {
    if (path.isAbsolute(filePath)) {
      return path.normalize(filePath);
    }
    return path.normalize(path.join(basePath, filePath));
  }

  /**
   * Expand environment variables in environment configuration
   * @param env Environment variables object
   * @returns Environment variables with expanded values
   */
  expandEnvironmentVariables(
    env: Record<string, string>
  ): Record<string, string> {
    const expanded: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      // Simple environment variable expansion
      let expandedValue = value;

      // Replace ${VAR} and $VAR patterns
      expandedValue = expandedValue.replace(/\$\{([^}]+)\}/g, (_, varName) => {
        return process.env[varName] || `\${${varName}}`;
      });

      expandedValue = expandedValue.replace(
        /\$([A-Z_][A-Z0-9_]*)/g,
        (_, varName) => {
          return process.env[varName] || `$${varName}`;
        }
      );

      expanded[key] = expandedValue;
    }

    return expanded;
  }

  /**
   * Convert relative paths to absolute based on a base directory
   * @param config Configuration to resolve paths for
   * @param baseDir Base directory for path resolution
   * @returns Configuration with resolved paths
   */
  resolvePaths(config: ProcmanConfig, baseDir: string): ProcmanConfig {
    const resolvedApps = config.apps.map((app) => {
      const resolvedApp = { ...app };

      // Resolve paths if they are relative
      if (resolvedApp.cwd && !path.isAbsolute(resolvedApp.cwd)) {
        resolvedApp.cwd = path.resolve(baseDir, resolvedApp.cwd);
      }

      if (resolvedApp.log_file && !path.isAbsolute(resolvedApp.log_file)) {
        resolvedApp.log_file = path.resolve(baseDir, resolvedApp.log_file);
      }

      if (resolvedApp.out_file && !path.isAbsolute(resolvedApp.out_file)) {
        resolvedApp.out_file = path.resolve(baseDir, resolvedApp.out_file);
      }

      if (resolvedApp.error_file && !path.isAbsolute(resolvedApp.error_file)) {
        resolvedApp.error_file = path.resolve(baseDir, resolvedApp.error_file);
      }

      return resolvedApp;
    });

    return {
      ...config,
      apps: resolvedApps,
    };
  }

  /**
   * Merge two configurations, with the second overriding the first
   * @param base Base configuration
   * @param override Configuration to merge in
   * @returns Merged configuration
   */
  mergeConfigs(
    base: ProcmanConfig,
    override: Partial<ProcmanConfig>
  ): ProcmanConfig {
    const mergedApps = [...base.apps];

    // If override has apps, merge them by name
    if (override.apps) {
      for (const overrideApp of override.apps) {
        const existingIndex = mergedApps.findIndex(
          (app) => app.name === overrideApp.name
        );

        if (existingIndex !== -1) {
          // Merge existing app
          mergedApps[existingIndex] = {
            ...mergedApps[existingIndex],
            ...overrideApp,
            env: {
              ...mergedApps[existingIndex].env,
              ...overrideApp.env,
            },
          };
        } else {
          // Add new app
          mergedApps.push(overrideApp);
        }
      }
    }

    return {
      ...base,
      ...override,
      apps: mergedApps,
    };
  }

  /**
   * Deep clone configuration to avoid mutations
   * @param config Configuration to clone
   * @returns Cloned configuration
   */
  cloneConfig(config: ProcmanConfig): ProcmanConfig {
    return {
      apps: config.apps.map((app) => ({
        ...app,
        env: app.env ? { ...app.env } : undefined,
      })),
    };
  }

  /**
   * Validate that all required defaults have been applied
   * @param config Configuration to validate
   * @returns True if all defaults are present
   */
  hasAllDefaults(config: ProcmanConfig): boolean {
    return config.apps.every((app) => {
      return app.cwd !== undefined && app.env !== undefined;
    });
  }

  /**
   * Set base directory for path resolution
   * @param baseDirectory New base directory
   */
  setBaseDirectory(baseDirectory: string): void {
    this.baseDirectory = baseDirectory;
  }

  /**
   * Get current base directory
   * @returns Current base directory
   */
  getBaseDirectory(): string {
    return this.baseDirectory;
  }

  /**
   * Enable or disable environment variable expansion
   * @param enable Whether to enable expansion
   */
  setExpandEnvironmentVariables(enable: boolean): void {
    this.expandEnvVars = enable;
  }

  /**
   * Check if environment variable expansion is enabled
   * @returns True if expansion is enabled
   */
  isExpandEnvironmentVariablesEnabled(): boolean {
    return this.expandEnvVars;
  }

  /**
   * Save normalized configuration to file
   * @param config Normalized configuration to save
   * @param outputPath Output file path
   */
  async saveNormalizedConfig(
    config: NormalizedConfig,
    outputPath: string
  ): Promise<void> {
    const configToSave = {
      apps: config.apps,
      // Don't save metadata
    };

    const configContent = `// Generated normalized configuration
// Original: ${config._metadata.originalPath}
// Normalized at: ${new Date(config._metadata.normalizedAt).toISOString()}
// Defaults applied: ${config._metadata.defaultsApplied.join(', ') || 'none'}

module.exports = ${JSON.stringify(configToSave, null, 2)};
`;

    const fs = await import('fs');
    await fs.promises.writeFile(outputPath, configContent, 'utf8');
  }

  /**
   * Compare two configurations and return differences
   * @param config1 First configuration
   * @param config2 Second configuration
   * @returns Array of differences
   */
  compareConfigs(
    config1: ProcmanConfig,
    config2: ProcmanConfig
  ): Array<{
    type: 'added' | 'removed' | 'modified';
    path: string;
    oldValue?: unknown;
    newValue?: unknown;
  }> {
    const differences: Array<{
      type: 'added' | 'removed' | 'modified';
      path: string;
      oldValue?: unknown;
      newValue?: unknown;
    }> = [];

    // Create Maps for O(1) lookup instead of O(n) with Array.find()
    const apps1Map = new Map(config1.apps.map((app) => [app.name, app]));
    const apps2Map = new Map(config2.apps.map((app) => [app.name, app]));

    // Find added apps
    for (const [appName, app] of Array.from(apps2Map.entries())) {
      if (!apps1Map.has(appName)) {
        differences.push({
          type: 'added',
          path: `apps.${appName}`,
          newValue: app,
        });
      }
    }

    // Find removed and modified apps
    for (const [appName, app1] of Array.from(apps1Map.entries())) {
      const app2 = apps2Map.get(appName);
      if (!app2) {
        differences.push({
          type: 'removed',
          path: `apps.${appName}`,
          oldValue: app1,
        });
      } else if (JSON.stringify(app1) !== JSON.stringify(app2)) {
        differences.push({
          type: 'modified',
          path: `apps.${appName}`,
          oldValue: app1,
          newValue: app2,
        });
      }
    }

    return differences;
  }
}

/**
 * Create a new configuration normalizer instance
 * @param options Normalizer options
 * @returns ConfigNormalizer instance
 */
export function createConfigNormalizer(
  options?: ConfigNormalizerOptions
): ConfigNormalizer {
  return new ConfigNormalizer(options);
}
