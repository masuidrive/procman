/**
 * Test constants for procman tests
 *
 * This file contains all test-specific constants used throughout the test suite.
 * These values are optimized for test execution speed while maintaining reliability.
 */

// CI environment detection and timeout multipliers
const IS_CI = process.env.CI === 'true';
const CI_TIMEOUT_MULTIPLIER = IS_CI ? 3 : 1; // 3x longer timeouts in CI
const CI_MEMORY_MULTIPLIER = IS_CI ? 2 : 1; // 2x larger memory sizes in CI

// Base timeout values (will be multiplied by CI_TIMEOUT_MULTIPLIER)
const BASE_TIMEOUTS = {
  SHORT: 1000, // 1 second - short operations
  MEDIUM: 5000, // 5 seconds - medium operations
  LONG: 10000, // 10 seconds - long operations
  VERY_LONG: 30000, // 30 seconds - very long operations
  EXTRA_LONG: 60000, // 60 seconds - extra long operations
} as const;

// Test timeout constants (automatically adjusted for CI)
export const TEST_TIMEOUTS = {
  SHORT: BASE_TIMEOUTS.SHORT * CI_TIMEOUT_MULTIPLIER,
  MEDIUM: BASE_TIMEOUTS.MEDIUM * CI_TIMEOUT_MULTIPLIER,
  LONG: BASE_TIMEOUTS.LONG * CI_TIMEOUT_MULTIPLIER,
  VERY_LONG: BASE_TIMEOUTS.VERY_LONG * CI_TIMEOUT_MULTIPLIER,
  EXTRA_LONG: BASE_TIMEOUTS.EXTRA_LONG * CI_TIMEOUT_MULTIPLIER,

  // Specific timeout values for common operations
  PROCESS_START: 5000 * CI_TIMEOUT_MULTIPLIER,
  PROCESS_STOP: 10000 * CI_TIMEOUT_MULTIPLIER,
  IPC_COMMAND: 5000 * CI_TIMEOUT_MULTIPLIER,
  FILE_OPERATION: 2000 * CI_TIMEOUT_MULTIPLIER,
  GRACEFUL_SHUTDOWN: 10000 * CI_TIMEOUT_MULTIPLIER,
  FORCE_KILL: 5000 * CI_TIMEOUT_MULTIPLIER,
  CONFIG_LOAD: 3000 * CI_TIMEOUT_MULTIPLIER,
  MEMORY_CHECK: 30000 * CI_TIMEOUT_MULTIPLIER,
  MONITOR_INTERVAL: 5000 * CI_TIMEOUT_MULTIPLIER,
} as const;

// Sleep/delay constants
export const TEST_DELAYS = {
  TINY: 50, // 50ms - very short delay
  SHORT: 100, // 100ms - short delay
  MEDIUM: 500, // 500ms - medium delay
  LONG: 1000, // 1000ms - long delay
  VERY_LONG: 2000, // 2000ms - very long delay
} as const;

// Memory size constants (automatically adjusted for CI)
export const TEST_MEMORY_SIZES = {
  SMALL: 1024 * 1024 * CI_MEMORY_MULTIPLIER, // 1MB
  MEDIUM: 10 * 1024 * 1024 * CI_MEMORY_MULTIPLIER, // 10MB
  LARGE: 100 * 1024 * 1024 * CI_MEMORY_MULTIPLIER, // 100MB
  VERY_LARGE: 512 * 1024 * 1024 * CI_MEMORY_MULTIPLIER, // 512MB
  HUGE: 1024 * 1024 * 1024 * CI_MEMORY_MULTIPLIER, // 1GB

  // Byte sizes for testing
  BYTES_1KB: 1024,
  BYTES_1MB: 1024 * 1024,
  BYTES_10MB: 10 * 1024 * 1024,
  BYTES_100MB: 100 * 1024 * 1024,
} as const;

// Count constants for iterations and bulk operations
export const TEST_COUNTS = {
  TINY: 10, // 10 items - very small set
  SMALL: 50, // 50 items - small set
  MEDIUM: 100, // 100 items - medium set
  LARGE: 500, // 500 items - large set
  VERY_LARGE: 1000, // 1000 items - very large set
  EXTREME: 10000, // 10000 items - extreme set

  // Specific counts for common operations
  LOG_ENTRIES: 1000,
  PROCESSES: 100,
  CONCURRENT_OPERATIONS: 20,
  STRESS_TEST_ITERATIONS: 50,
  MEMORY_PRESSURE_OPERATIONS: 100,
} as const;

// Port numbers for testing
export const TEST_PORTS = {
  BASE: 3000,
  HTTP_SERVER: 3000,
  ALTERNATIVE: 3001,
  BACKUP: 3002,
} as const;

// String lengths for testing
export const TEST_STRING_LENGTHS = {
  SHORT: 100, // 100 characters
  MEDIUM: 1000, // 1000 characters
  LONG: 10000, // 10000 characters
  VERY_LONG: 100000, // 100000 characters
} as const;

// Process monitoring intervals (faster for tests)
export const TEST_MONITORING = {
  HEALTH_CHECK_INTERVAL: 500, // 500ms - faster than production
  MEMORY_CHECK_INTERVAL: 1000, // 1000ms - faster than production
  FAST_MONITOR_INTERVAL: 100, // 100ms - very fast monitoring
  SLOW_MONITOR_INTERVAL: 2000, // 2000ms - slower monitoring
} as const;

// File system constants
export const TEST_FILE_SIZES = {
  TINY: 100, // 100 bytes
  SMALL: 1024, // 1KB
  MEDIUM: 1024 * 1024, // 1MB
  LARGE: 10 * 1024 * 1024, // 10MB
  VERY_LARGE: 100 * 1024 * 1024, // 100MB
} as const;

// Environment detection
export const TEST_ENVIRONMENT = {
  IS_CI,
  CI_TIMEOUT_MULTIPLIER,
  CI_MEMORY_MULTIPLIER,
  NODE_ENV: process.env.NODE_ENV || 'test',
} as const;

// Common test values
export const TEST_VALUES = {
  PROCESS_NAME: 'test-process',
  APP_NAME: 'test-app',
  NAMESPACE: 'test-namespace',
  GROUP: 'test-group',
  LOG_MESSAGE: 'test log message',
  ENV_VAR_NAME: 'TEST_ENV_VAR',
  ENV_VAR_VALUE: 'test-env-value',
} as const;

// Export utility functions
export const getTimeoutForCI = (baseTimeout: number): number => {
  return baseTimeout * CI_TIMEOUT_MULTIPLIER;
};

export const getMemorySizeForCI = (baseSize: number): number => {
  return baseSize * CI_MEMORY_MULTIPLIER;
};

export const isRunningInCI = (): boolean => {
  return IS_CI;
};
