/**
 * Configuration Module Exports
 *
 * Main entry point for configuration-related functionality.
 * Exports all public interfaces and classes for configuration management.
 */

// Re-export main ConfigLoader class
export { ConfigLoader } from './config-loader.js';
export type { ConfigLoaderOptions, LoadedConfig } from './config-loader.js';

// Re-export specialized classes for advanced usage
export { ConfigValidator } from './config-validator.js';
export type {
  ConfigValidatorOptions,
  ValidationIssue,
  ValidationSeverity,
} from './config-validator.js';

export { ConfigNormalizer } from './config-normalizer.js';
export type {
  ConfigNormalizerOptions,
  NormalizedConfig,
} from './config-normalizer.js';

export { ConfigWatcher } from './config-watcher.js';
export type {
  ConfigWatcherOptions,
  WatchCallback,
  WatcherDisposal,
  FileChangeEvent,
} from './config-watcher.js';

export { ConfigReporter } from './config-reporter.js';
export type {
  ConfigReporterOptions,
  ValidationReport,
  EnhancedValidationError,
} from './config-reporter.js';

// Re-export secure config loader for safer configuration loading
export {
  SecureConfigLoader,
  ConfigSecurityMode,
} from './secure-config-loader.js';
export type { SecureConfigLoaderOptions } from './secure-config-loader.js';

// Re-export shared types for convenience
export type { ProcmanConfig, AppConfig } from '../shared/config.js';

// Factory functions for easy instantiation
export { createConfigValidator } from './config-validator.js';
export { createConfigNormalizer } from './config-normalizer.js';
export { createConfigWatcher } from './config-watcher.js';
export { createConfigReporter } from './config-reporter.js';
export { createSecureConfigLoader } from './secure-config-loader.js';

/**
 * Create a new ConfigLoader instance with default options
 * @param options Optional configuration options
 * @returns ConfigLoader instance
 */
export function createConfigLoader(
  options?: import('./config-loader').ConfigLoaderOptions
): import('./config-loader').ConfigLoader {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ConfigLoader } = require('./config-loader');
  return new ConfigLoader(options);
}

/**
 * Default ConfigLoader instance for convenience
 * Use this for simple use cases where you don't need custom configuration
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const defaultConfigLoader = (() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ConfigLoader } = require('./config-loader');
  return new ConfigLoader();
})();
