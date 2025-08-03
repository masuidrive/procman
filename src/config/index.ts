/**
 * Configuration Module Exports
 * 
 * Main entry point for configuration-related functionality.
 * Exports all public interfaces and classes for configuration management.
 */

// Re-export main ConfigLoader class
export { ConfigLoader } from './config-loader';
export type { ConfigLoaderOptions, LoadedConfig } from './config-loader';

// Re-export specialized classes for advanced usage
export { ConfigValidator } from './config-validator';
export type { ConfigValidatorOptions, ValidationIssue, ValidationSeverity } from './config-validator';

export { ConfigNormalizer } from './config-normalizer';
export type { ConfigNormalizerOptions, NormalizedConfig } from './config-normalizer';

export { ConfigWatcher } from './config-watcher';
export type { ConfigWatcherOptions, WatchCallback, WatcherDisposal, FileChangeEvent } from './config-watcher';

export { ConfigReporter } from './config-reporter';
export type { ConfigReporterOptions, ValidationReport, EnhancedValidationError } from './config-reporter';

// Re-export secure config loader for safer configuration loading
export { SecureConfigLoader, ConfigSecurityMode } from './secure-config-loader';
export type { SecureConfigLoaderOptions } from './secure-config-loader';

// Re-export shared types for convenience
export type { ProcmanConfig, AppConfig } from '../shared/config';

// Factory functions for easy instantiation
export { createConfigValidator } from './config-validator';
export { createConfigNormalizer } from './config-normalizer';
export { createConfigWatcher } from './config-watcher';
export { createConfigReporter } from './config-reporter';
export { createSecureConfigLoader } from './secure-config-loader';

/**
 * Create a new ConfigLoader instance with default options
 * @param options Optional configuration options
 * @returns ConfigLoader instance
 */
export function createConfigLoader(options?: import('./config-loader').ConfigLoaderOptions): import('./config-loader').ConfigLoader {
  const { ConfigLoader } = require('./config-loader');
  return new ConfigLoader(options);
}

/**
 * Default ConfigLoader instance for convenience
 * Use this for simple use cases where you don't need custom configuration
 */
export const defaultConfigLoader = (() => {
  const { ConfigLoader } = require('./config-loader');
  return new ConfigLoader();
})();