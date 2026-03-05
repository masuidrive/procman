/**
 * ConfigLoader - Configuration management orchestrator
 *
 * Delegates specialized tasks to focused classes while providing
 * a unified interface for configuration loading and validation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { createRequire } from 'module';
import { ProcmanConfig } from '../shared/config.js';
import { ProcmanError, createError } from '../shared/errors.js';
import { ConfigValidator } from './config-validator.js';
import { ConfigNormalizer, NormalizedConfig } from './config-normalizer.js';
import { ConfigWatcher } from './config-watcher.js';
import { ConfigReporter, ValidationReport } from './config-reporter.js';

export interface LoadedConfig {
  config: ProcmanConfig;
  filePath: string;
  loadTime: number;
}

export interface ConfigLoaderOptions {
  maxFileSize?: number;
  enableCache?: boolean;
  enableReporting?: boolean;
  moduleLoader?: (path: string) => unknown;
  fileWatcher?: ConfigWatcher;
}

export type {
  ValidationSeverity,
  ValidationIssue,
} from './config-validator.js';
export type { ValidationReport } from './config-reporter.js';
export type { NormalizedConfig } from './config-normalizer.js';

export interface ConfigLoaderEvents {
  configChanged: (filePath: string) => void;
}
export class ConfigLoader extends EventEmitter {
  private loadedConfigs = new Map<string, LoadedConfig>();
  private options: Required<ConfigLoaderOptions>;
  private moduleLoader: (path: string) => unknown;
  protected validator: ConfigValidator;
  private normalizer: ConfigNormalizer;
  private watcher: ConfigWatcher;
  private reporter: ConfigReporter;
  private requireInstance = createRequire(import.meta.url);

  /**
   * Dynamic require replacement for ES modules
   */
  private dynamicRequire(modulePath: string): unknown {
    return this.requireInstance(modulePath);
  }

  constructor(options: ConfigLoaderOptions = {}) {
    super();

    this.options = {
      maxFileSize: options.maxFileSize ?? 10 * 1024 * 1024,
      enableCache: options.enableCache ?? true,
      enableReporting: options.enableReporting ?? false,
      moduleLoader: options.moduleLoader ?? this.dynamicRequire.bind(this),
      fileWatcher:
        options.fileWatcher ??
        new ConfigWatcher({ interval: 1000, persistent: true }),
    };

    this.moduleLoader = this.options.moduleLoader;

    const cwd = process.cwd();
    this.validator = new ConfigValidator({
      projectRoot: cwd,
      collectIssues: this.options.enableReporting,
    });
    this.normalizer = new ConfigNormalizer({
      baseDirectory: cwd,
      expandEnvironmentVariables: true,
    });
    this.watcher = this.options.fileWatcher;
    this.reporter = new ConfigReporter({
      includeSuggestions: true,
      maxIssues: 100,
    });
    this.watcher.on('configChanged', (filePath) =>
      this.emit('configChanged', filePath)
    );
  }

  async load(filePath: string): Promise<ProcmanConfig> {
    const absolutePath = await this.validateFilePath(filePath);
    if (this.options.enableCache && this.loadedConfigs.has(absolutePath)) {
      return this.loadedConfigs.get(absolutePath)!.config;
    }
    try {
      // Clear module cache for ES modules to ensure fresh reads
      try {
        const resolvedPath = this.requireInstance.resolve(absolutePath);
        if (this.requireInstance.cache[resolvedPath]) {
          delete this.requireInstance.cache[resolvedPath];
        }
      } catch {
        // Module may not be cached yet, ignore resolve errors
      }
      // Also try with the absolute path directly
      if (this.requireInstance.cache[absolutePath]) {
        delete this.requireInstance.cache[absolutePath];
      }
      const config = this.moduleLoader(absolutePath);
      this.validator.validateConfig(config);
      if (this.options.enableCache) {
        this.loadedConfigs.set(absolutePath, {
          config,
          filePath: absolutePath,
          loadTime: Date.now(),
        });
      }
      return config;
    } catch (error) {
      if (error instanceof ProcmanError) throw error;
      const isError = error instanceof Error;
      if (isError && 'code' in error && error.code === 'MODULE_NOT_FOUND') {
        throw createError('CONFIG_FILE_NOT_FOUND', {
          message: `Configuration file not found: ${absolutePath}`,
          details: { filePath: absolutePath },
        });
      }
      if (
        isError &&
        (error instanceof SyntaxError || error instanceof ReferenceError)
      ) {
        throw createError('CONFIG_PARSE_ERROR', {
          message: `Failed to parse configuration file: ${error.message}`,
          cause: error,
          details: { filePath: absolutePath },
        });
      }
      throw createError('CONFIG_PARSE_ERROR', {
        message: `Failed to load configuration: ${isError ? error.message : String(error)}`,
        cause: isError ? error : undefined,
        details: { filePath: absolutePath },
      });
    }
  }

  async loadWithReport(filePath: string): Promise<ValidationReport> {
    return this.reporter.generateReportFromValidation(filePath, () =>
      this.load(filePath)
    );
  }
  getLastReport(): ValidationReport | null {
    return this.reporter.getLastReport();
  }
  async loadAndNormalize(filePath: string): Promise<NormalizedConfig> {
    const config = await this.load(filePath);
    return this.normalizer.normalizeConfig(config, filePath);
  }
  normalizeConfig(
    config: ProcmanConfig,
    originalPath: string
  ): NormalizedConfig {
    return this.normalizer.normalizeConfig(config, originalPath);
  }
  async saveNormalizedConfig(
    config: NormalizedConfig,
    outputPath: string
  ): Promise<void> {
    return this.normalizer.saveNormalizedConfig(config, outputPath);
  }
  compareConfigs(
    config1: ProcmanConfig,
    config2: ProcmanConfig
  ): Array<{
    type: 'added' | 'removed' | 'modified';
    path: string;
    oldValue?: unknown;
    newValue?: unknown;
  }> {
    return this.normalizer.compareConfigs(config1, config2);
  }

  async reload(filePath: string): Promise<ProcmanConfig> {
    this.loadedConfigs.delete(path.resolve(filePath));
    return this.load(filePath);
  }
  clearCache(): void {
    this.loadedConfigs.clear();
  }
  getCached(filePath: string): LoadedConfig | undefined {
    return this.loadedConfigs.get(path.resolve(filePath));
  }

  private async validateFilePath(filePath: string): Promise<string> {
    // t_wada boundary principle: validate inputs at boundaries
    if (filePath == null) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: 'Configuration file path cannot be null or undefined',
        details: { filePath: filePath },
      });
    }

    if (typeof filePath !== 'string') {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: 'Configuration file path must be a string',
        details: { filePath: filePath },
      });
    }

    if (filePath.trim() === '') {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: 'Configuration file path cannot be empty',
        details: { filePath: filePath },
      });
    }

    const absolutePath = path.resolve(filePath);
    const ext = path.extname(absolutePath);
    if (ext !== '.js' && ext !== '.cjs') {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: 'Configuration file must have .js or .cjs extension',
        details: { filePath: absolutePath },
      });
    }
    try {
      await fs.promises.access(absolutePath, fs.constants.F_OK);
    } catch {
      throw createError('CONFIG_FILE_NOT_FOUND', {
        message: `Configuration file not found: ${absolutePath}`,
        details: { filePath: absolutePath },
      });
    }
    try {
      await fs.promises.access(absolutePath, fs.constants.R_OK);
    } catch (error) {
      throw createError('PERMISSION_DENIED', {
        message: `Cannot read configuration file: ${absolutePath}`,
        cause: error instanceof Error ? error : undefined,
        details: { filePath: absolutePath },
      });
    }
    const stats = await fs.promises.stat(absolutePath);
    if (stats.size > this.options.maxFileSize) {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: `Configuration file too large: ${stats.size} bytes (max: ${this.options.maxFileSize})`,
        details: {
          filePath: absolutePath,
          fileSize: stats.size,
          maxSize: this.options.maxFileSize,
        },
      });
    }
    return absolutePath;
  }

  async createBackup(filePath: string): Promise<string> {
    return this.watcher.createBackup(filePath);
  }
  async hasConfigChanged(filePath: string): Promise<boolean> {
    const absolutePath = path.resolve(filePath);
    const cached = this.loadedConfigs.get(absolutePath);
    if (!cached) return true;
    return this.watcher.hasConfigChanged(absolutePath, cached.loadTime);
  }
  watchConfig(
    filePath: string,
    callback: (event: 'change' | 'rename', filename?: string) => void
  ): { dispose: () => void } {
    return this.watcher.watchConfig(filePath, callback);
  }
  stopWatching(filePath: string): void {
    this.watcher.stopWatching(filePath);
  }
  stopAllWatching(): void {
    this.watcher.stopAllWatching();
  }
  dispose(): void {
    this.stopAllWatching();
    this.loadedConfigs.clear();
    this.removeAllListeners();
  }

  getResourceUsage(): {
    watchedFiles: number;
    cachedConfigs: number;
    validationIssues: number;
    memoryUsage: number;
  } {
    return {
      watchedFiles: this.watcher.getWatchedFiles().length,
      cachedConfigs: this.loadedConfigs.size,
      validationIssues: this.reporter.getValidationIssues().length,
      memoryUsage: JSON.stringify({
        loadedConfigs: Array.from(this.loadedConfigs.values()),
      }).length,
    };
  }
}

export function createConfigLoader(
  options?: ConfigLoaderOptions
): ConfigLoader {
  return new ConfigLoader(options);
}
