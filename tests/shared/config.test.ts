/**
 * Unit tests for configuration file type definitions
 */

import { describe, it, expect } from 'vitest';
import {
  AppConfig,
  ProcmanConfig,
  ConfigValidationResult,
  MemoryParseResult,
  isAppConfig,
  isProcmanConfig,
  validateAppConfig,
  validateProcmanConfig,
  parseMemorySize,
  formatMemorySize,
  createDefaultAppConfig,
  createDefaultProcmanConfig,
  mergeAppConfig,
  CONFIG_CONSTANTS,
  ConfigFileExtension,
  ConfigLoadOptions,
  ConfigLoadResult,
} from '../../src/shared/config';

import { DEFAULT_NAMESPACE } from '../../src/shared/constants';

describe('Configuration Types', () => {
  describe('AppConfig interface', () => {
    it('should define required fields correctly', () => {
      const config: AppConfig = {
        name: 'test-app',
        script: './index.js',
      };

      expect(config.name).toBe('test-app');
      expect(config.script).toBe('./index.js');
      expect(config.namespace).toBeUndefined();
      expect(config.args).toBeUndefined();
    });

    it('should define optional fields correctly', () => {
      const config: AppConfig = {
        name: 'test-app',
        script: './index.js',
        namespace: 'production',
        args: '--env production',
        cwd: '/app',
        note: 'Production web server',
        env: { NODE_ENV: 'production' },
        max_memory_restart: '1G',
        log_file: './logs/app.log',
        out_file: './logs/out.log',
        error_file: './logs/error.log',
      };

      expect(config.namespace).toBe('production');
      expect(config.args).toBe('--env production');
      expect(config.cwd).toBe('/app');
      expect(config.note).toBe('Production web server');
      expect(config.env).toEqual({ NODE_ENV: 'production' });
      expect(config.max_memory_restart).toBe('1G');
      expect(config.log_file).toBe('./logs/app.log');
      expect(config.out_file).toBe('./logs/out.log');
      expect(config.error_file).toBe('./logs/error.log');
    });
  });

  describe('ProcmanConfig interface', () => {
    it('should define apps array correctly', () => {
      const config: ProcmanConfig = {
        apps: [
          { name: 'app1', script: './app1.js' },
          { name: 'app2', script: './app2.js' },
        ],
      };

      expect(config.apps).toHaveLength(2);
      expect(config.apps[0].name).toBe('app1');
      expect(config.apps[1].name).toBe('app2');
    });

    it('should accept empty apps array', () => {
      const config: ProcmanConfig = {
        apps: [],
      };

      expect(config.apps).toHaveLength(0);
    });
  });
});

describe('Type Guards', () => {
  describe('isAppConfig', () => {
    it('should return true for valid AppConfig', () => {
      const validConfig = {
        name: 'test-app',
        script: './index.js',
      };

      expect(isAppConfig(validConfig)).toBe(true);
    });

    it('should return true for AppConfig with all optional fields', () => {
      const validConfig = {
        name: 'test-app',
        script: './index.js',
        namespace: 'test',
        args: '--env test',
        cwd: '/app',
        note: 'Test application',
        env: { NODE_ENV: 'test' },
        max_memory_restart: '500M',
        log_file: './logs/app.log',
        out_file: './logs/out.log',
        error_file: './logs/error.log',
      };

      expect(isAppConfig(validConfig)).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(isAppConfig(null)).toBe(false);
      expect(isAppConfig(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(isAppConfig('string')).toBe(false);
      expect(isAppConfig(123)).toBe(false);
      expect(isAppConfig(true)).toBe(false);
      expect(isAppConfig([])).toBe(false);
    });

    it('should return false when name is missing', () => {
      const invalidConfig = {
        script: './index.js',
      };

      expect(isAppConfig(invalidConfig)).toBe(false);
    });

    it('should return false when script is missing', () => {
      const invalidConfig = {
        name: 'test-app',
      };

      expect(isAppConfig(invalidConfig)).toBe(false);
    });

    it('should return false when name is not a string', () => {
      const invalidConfig = {
        name: 123,
        script: './index.js',
      };

      expect(isAppConfig(invalidConfig)).toBe(false);
    });

    it('should return false when script is not a string', () => {
      const invalidConfig = {
        name: 'test-app',
        script: 123,
      };

      expect(isAppConfig(invalidConfig)).toBe(false);
    });

    it('should return false when name is empty', () => {
      const invalidConfig = {
        name: '',
        script: './index.js',
      };

      expect(isAppConfig(invalidConfig)).toBe(false);
    });

    it('should return false when script is empty', () => {
      const invalidConfig = {
        name: 'test-app',
        script: '',
      };

      expect(isAppConfig(invalidConfig)).toBe(false);
    });

    it('should return false when optional fields have wrong types', () => {
      const invalidConfigs = [
        { name: 'test', script: './index.js', namespace: 123 },
        { name: 'test', script: './index.js', args: 123 },
        { name: 'test', script: './index.js', cwd: 123 },
        { name: 'test', script: './index.js', note: 123 },
        { name: 'test', script: './index.js', env: 'string' },
        { name: 'test', script: './index.js', max_memory_restart: 123 },
        { name: 'test', script: './index.js', log_file: 123 },
        { name: 'test', script: './index.js', out_file: 123 },
        { name: 'test', script: './index.js', error_file: 123 },
      ];

      invalidConfigs.forEach((config) => {
        expect(isAppConfig(config)).toBe(false);
      });
    });

    it('should return false when env has non-string values', () => {
      const invalidConfig = {
        name: 'test-app',
        script: './index.js',
        env: { NODE_ENV: 123 },
      };

      expect(isAppConfig(invalidConfig)).toBe(false);
    });
  });

  describe('isProcmanConfig', () => {
    it('should return true for valid ProcmanConfig', () => {
      const validConfig = {
        apps: [
          { name: 'app1', script: './app1.js' },
          { name: 'app2', script: './app2.js' },
        ],
      };

      expect(isProcmanConfig(validConfig)).toBe(true);
    });

    it('should return true for empty apps array', () => {
      const validConfig = {
        apps: [],
      };

      expect(isProcmanConfig(validConfig)).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(isProcmanConfig(null)).toBe(false);
      expect(isProcmanConfig(undefined)).toBe(false);
    });

    it('should return false when apps is not an array', () => {
      const invalidConfig = {
        apps: 'string',
      };

      expect(isProcmanConfig(invalidConfig)).toBe(false);
    });

    it('should return false when apps contains invalid AppConfig', () => {
      const invalidConfig = {
        apps: [
          { name: 'app1', script: './app1.js' },
          { name: 123, script: './app2.js' }, // Invalid name
        ],
      };

      expect(isProcmanConfig(invalidConfig)).toBe(false);
    });
  });
});

describe('Configuration Validation', () => {
  describe('validateAppConfig', () => {
    it('should return valid result for valid config', () => {
      const config = {
        name: 'test-app',
        script: './index.js',
        namespace: 'test',
      };

      const result = validateAppConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for non-AppConfig structure', () => {
      const result = validateAppConfig({ invalid: 'config' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid AppConfig structure');
    });

    it('should detect invalid application name', () => {
      const config = {
        name: 'app/with/slashes',
        script: './index.js',
      };

      const result = validateAppConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Application name cannot contain path separators'
      );
    });

    it('should detect invalid namespace', () => {
      const config = {
        name: 'test-app',
        script: './index.js',
        namespace: 'namespace/with/slashes',
      };

      const result = validateAppConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Namespace cannot contain path separators'
      );
    });

    it('should detect invalid memory size format', () => {
      const config = {
        name: 'test-app',
        script: './index.js',
        max_memory_restart: 'invalid-size',
      };

      const result = validateAppConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((error) =>
          error.includes('Invalid memory size format')
        )
      ).toBe(true);
    });

    it('should warn about missing namespace', () => {
      const config = {
        name: 'test-app',
        script: './index.js',
      };

      const result = validateAppConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        "Application 'test-app' will use default namespace"
      );
    });

    it('should warn about missing cwd', () => {
      const config = {
        name: 'test-app',
        script: './index.js',
        namespace: 'test',
      };

      const result = validateAppConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        "Application 'test-app' will use current working directory"
      );
    });
  });

  describe('validateProcmanConfig', () => {
    it('should return valid result for valid config', () => {
      const config = {
        apps: [
          { name: 'app1', script: './app1.js' },
          { name: 'app2', script: './app2.js' },
        ],
      };

      const result = validateProcmanConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should return invalid for non-ProcmanConfig structure', () => {
      const result = validateProcmanConfig({ invalid: 'config' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid ProcmanConfig structure');
    });

    it('should return invalid for empty apps array', () => {
      const config = { apps: [] };
      const result = validateProcmanConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Configuration must contain at least one application'
      );
    });

    it('should detect duplicate app names in same namespace', () => {
      const config = {
        apps: [
          { name: 'duplicate-app', script: './app1.js' },
          { name: 'duplicate-app', script: './app2.js' },
        ],
      };

      const result = validateProcmanConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((error) =>
          error.includes("Duplicate application name 'duplicate-app'")
        )
      ).toBe(true);
    });

    it('should allow same app names in different namespaces', () => {
      const config = {
        apps: [
          { name: 'same-name', script: './app1.js', namespace: 'namespace1' },
          { name: 'same-name', script: './app2.js', namespace: 'namespace2' },
        ],
      };

      const result = validateProcmanConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should aggregate errors from individual app validations', () => {
      const config = {
        apps: [
          { name: 'app/with/slashes', script: './app1.js' },
          { name: 'app2', script: './app2.js', max_memory_restart: 'invalid' },
        ],
      };

      const result = validateProcmanConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});

describe('Memory Size Utilities', () => {
  describe('parseMemorySize', () => {
    it('should parse valid memory sizes', () => {
      const testCases = [
        { input: '100', expected: 100 },
        { input: '100K', expected: 100 * 1024 },
        { input: '100k', expected: 100 * 1024 },
        { input: '100M', expected: 100 * 1024 * 1024 },
        { input: '100m', expected: 100 * 1024 * 1024 },
        { input: '1G', expected: 1024 * 1024 * 1024 },
        { input: '1g', expected: 1024 * 1024 * 1024 },
        { input: '1.5G', expected: Math.floor(1.5 * 1024 * 1024 * 1024) },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = parseMemorySize(input);
        expect(result.success).toBe(true);
        expect(result.bytes).toBe(expected);
        expect(result.error).toBeUndefined();
      });
    });

    it('should handle whitespace', () => {
      const result = parseMemorySize('  100M  ');
      expect(result.success).toBe(true);
      expect(result.bytes).toBe(100 * 1024 * 1024);
    });

    it('should return error for invalid input types', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = parseMemorySize(123 as any);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Memory size must be a string');
    });

    it('should return error for empty string', () => {
      const result = parseMemorySize('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Memory size cannot be empty');
    });

    it('should return error for invalid format', () => {
      const invalidInputs = ['invalid', '100X', 'M100', '100 M', 'abc123'];

      invalidInputs.forEach((input) => {
        const result = parseMemorySize(input);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid memory size format');
      });
    });

    it('should return error for negative numbers', () => {
      const result = parseMemorySize('-100M');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Memory size must be a non-negative number');
    });
  });

  describe('formatMemorySize', () => {
    it('should format bytes correctly', () => {
      expect(formatMemorySize(512)).toBe('512');
      expect(formatMemorySize(1024)).toBe('1K');
      expect(formatMemorySize(1536)).toBe('2K'); // Rounded
      expect(formatMemorySize(1024 * 1024)).toBe('1M');
      expect(formatMemorySize(1.5 * 1024 * 1024)).toBe('2M'); // Rounded
      expect(formatMemorySize(1024 * 1024 * 1024)).toBe('1G');
      expect(formatMemorySize(1.5 * 1024 * 1024 * 1024)).toBe('2G'); // Rounded
    });
  });
});

describe('Configuration Utilities', () => {
  describe('createDefaultAppConfig', () => {
    it('should create default app config with required fields', () => {
      const config = createDefaultAppConfig('test-app', './index.js');
      expect(config.name).toBe('test-app');
      expect(config.script).toBe('./index.js');
      expect(config.namespace).toBe(DEFAULT_NAMESPACE);
    });
  });

  describe('createDefaultProcmanConfig', () => {
    it('should create default procman config with empty apps array', () => {
      const config = createDefaultProcmanConfig();
      expect(config.apps).toEqual([]);
    });
  });

  describe('mergeAppConfig', () => {
    it('should merge app configs correctly', () => {
      const base: AppConfig = {
        name: 'test-app',
        script: './index.js',
        namespace: 'default',
        env: { NODE_ENV: 'development' },
      };

      const partial: Partial<AppConfig> = {
        namespace: 'production',
        args: '--env production',
        env: { NODE_ENV: 'production', PORT: '3000' },
      };

      const merged = mergeAppConfig(base, partial);
      expect(merged.name).toBe('test-app');
      expect(merged.script).toBe('./index.js');
      expect(merged.namespace).toBe('production');
      expect(merged.args).toBe('--env production');
      expect(merged.env).toEqual({ NODE_ENV: 'production', PORT: '3000' });
    });

    it('should handle partial config without env', () => {
      const base: AppConfig = {
        name: 'test-app',
        script: './index.js',
        env: { NODE_ENV: 'development' },
      };

      const partial: Partial<AppConfig> = {
        namespace: 'production',
      };

      const merged = mergeAppConfig(base, partial);
      expect(merged.env).toEqual({ NODE_ENV: 'development' });
    });

    it('should handle base config without env', () => {
      const base: AppConfig = {
        name: 'test-app',
        script: './index.js',
      };

      const partial: Partial<AppConfig> = {
        env: { NODE_ENV: 'production' },
      };

      const merged = mergeAppConfig(base, partial);
      expect(merged.env).toEqual({ NODE_ENV: 'production' });
    });
  });
});

describe('Configuration Constants', () => {
  it('should define CONFIG_CONSTANTS correctly', () => {
    expect(CONFIG_CONSTANTS.MAX_APPS_PER_NAMESPACE).toBe(100);
    expect(CONFIG_CONSTANTS.MAX_MEMORY_SIZE).toBe(100 * 1024 * 1024 * 1024);
    expect(CONFIG_CONSTANTS.MIN_MEMORY_SIZE).toBe(1024 * 1024);
    expect(CONFIG_CONSTANTS.DEFAULT_MEMORY_LIMIT).toBe('300M');
    expect(CONFIG_CONSTANTS.SUPPORTED_CONFIG_EXTENSIONS).toEqual([
      '.js',
      '.json',
      '.ts',
    ]);
  });

  it('should define ConfigFileExtension type correctly', () => {
    const extensions: ConfigFileExtension[] = ['.js', '.json', '.ts'];
    expect(extensions).toEqual(CONFIG_CONSTANTS.SUPPORTED_CONFIG_EXTENSIONS);
  });
});

describe('Configuration Loading Types', () => {
  describe('ConfigLoadOptions', () => {
    it('should define all required and optional fields', () => {
      const options: ConfigLoadOptions = {
        configPath: '/path/to/config.js',
        validate: true,
        allowPartial: false,
        defaultNamespace: 'custom',
      };

      expect(options.configPath).toBe('/path/to/config.js');
      expect(options.validate).toBe(true);
      expect(options.allowPartial).toBe(false);
      expect(options.defaultNamespace).toBe('custom');
    });

    it('should make optional fields truly optional', () => {
      const options: ConfigLoadOptions = {
        configPath: '/path/to/config.js',
      };

      expect(options.configPath).toBe('/path/to/config.js');
      expect(options.validate).toBeUndefined();
      expect(options.allowPartial).toBeUndefined();
      expect(options.defaultNamespace).toBeUndefined();
    });
  });

  describe('ConfigLoadResult', () => {
    it('should define success result correctly', () => {
      const config: ProcmanConfig = { apps: [] };
      const validation: ConfigValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
      };

      const result: ConfigLoadResult = {
        success: true,
        config,
        validation,
        filePath: '/path/to/config.js',
      };

      expect(result.success).toBe(true);
      expect(result.config).toBe(config);
      expect(result.validation).toBe(validation);
      expect(result.filePath).toBe('/path/to/config.js');
      expect(result.error).toBeUndefined();
    });

    it('should define error result correctly', () => {
      const result: ConfigLoadResult = {
        success: false,
        error: 'Configuration file not found',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Configuration file not found');
      expect(result.config).toBeUndefined();
      expect(result.validation).toBeUndefined();
      expect(result.filePath).toBeUndefined();
    });
  });
});

describe('Type Integration', () => {
  it('should work with types from other modules', () => {
    const config: AppConfig = {
      name: 'test-app',
      script: './index.js',
      namespace: DEFAULT_NAMESPACE, // From constants.ts
    };

    expect(config.namespace).toBe('default');
  });

  it('should integrate validation results correctly', () => {
    const validationResult: ConfigValidationResult = {
      valid: false,
      errors: ['Test error'],
      warnings: ['Test warning'],
    };

    const memoryResult: MemoryParseResult = {
      success: true,
      bytes: 1024 * 1024 * 300,
    };

    expect(validationResult.valid).toBe(false);
    expect(validationResult.errors).toHaveLength(1);
    expect(validationResult.warnings).toHaveLength(1);

    expect(memoryResult.success).toBe(true);
    expect(memoryResult.bytes).toBe(314572800);
    expect(memoryResult.error).toBeUndefined();
  });
});
