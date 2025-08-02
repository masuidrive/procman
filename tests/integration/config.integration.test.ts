/**
 * Integration tests for Configuration System
 * Tests real file operations and configuration validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';

import * as config from '../../src/shared/config';
import * as constants from '../../src/shared/constants';
import * as errors from '../../src/shared/errors';

describe('Configuration Integration', () => {
  let tempDir: string;
  let tempConfigPath: string;

  beforeEach(() => {
    // Create temporary directory for test configs
    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'procman-config-test-'));
    tempConfigPath = path.join(tempDir, 'test.config.js');
  });

  afterEach(() => {
    // Cleanup temporary files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Real Configuration File Validation', () => {
    it('should validate a real procman configuration file', () => {
      const configContent = `
module.exports = {
  apps: [
    {
      name: "web-server",
      script: "node",
      args: "server.js",
      namespace: "production",
      cwd: "/var/www",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        DB_HOST: "localhost"
      },
      max_memory_restart: "512M",
      log_file: "/var/log/procman/web-server.jsonl",
      note: "Main web server application"
    },
    {
      name: "worker",
      script: "node",
      args: "worker.js",
      namespace: "production",
      cwd: "/var/www",
      env: {
        NODE_ENV: "production",
        WORKER_CONCURRENCY: "4"
      },
      max_memory_restart: "256M",
      out_file: "/var/log/procman/worker-out.jsonl",
      error_file: "/var/log/procman/worker-error.jsonl"
    },
    {
      name: "api-dev",
      script: "npm",
      args: "run dev",
      namespace: "development",
      cwd: "/home/dev/api",
      env: {
        NODE_ENV: "development",
        DEBUG: "*"
      },
      max_memory_restart: "128M"
    }
  ]
};`;

      // Write config to file
      fs.writeFileSync(tempConfigPath, configContent, 'utf8');

      // Read and require the config file
      delete require.cache[tempConfigPath];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loadedConfig = require(tempConfigPath);

      // Validate the loaded configuration
      expect(config.isProcmanConfig(loadedConfig)).toBe(true);

      const validationResult = config.validateProcmanConfig(loadedConfig);
      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);

      // Validate each app
      for (const app of loadedConfig.apps) {
        expect(config.isAppConfig(app)).toBe(true);

        const appValidation = config.validateAppConfig(app);
        expect(appValidation.valid).toBe(true);
      }
    });

    it('should detect configuration errors in real files', () => {
      const invalidConfigContent = `
module.exports = {
  apps: [
    {
      name: "invalid-app",
      // Missing required 'script' field
      namespace: "test",
      max_memory_restart: "invalid-memory-format",
      env: {
        PORT: 3000 // Should be string, not number
      }
    },
    {
      name: "invalid-app", // Duplicate name
      script: "node",
      args: "app.js"
    }
  ]
};`;

      fs.writeFileSync(tempConfigPath, invalidConfigContent, 'utf8');

      delete require.cache[tempConfigPath];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loadedConfig = require(tempConfigPath);

      const validationResult = config.validateProcmanConfig(loadedConfig);
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);

      // Since the first app is invalid (missing script), it should fail validation
      const errorMessages = validationResult.errors.join(' ');
      expect(errorMessages).toContain('Invalid');
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });

    it('should handle syntax errors in configuration files', () => {
      const syntaxErrorContent = `
module.exports = {
  apps: [
    {
      name: "syntax-error-app",
      script: "node",
      args: "app.js"
      // Missing comma - syntax error
      env: {
        NODE_ENV: "test"
      }
    }
  ]
}; // Missing semicolon`;

      fs.writeFileSync(tempConfigPath, syntaxErrorContent, 'utf8');

      // Test that requiring syntax error file throws
      expect(() => {
        delete require.cache[tempConfigPath];
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require(tempConfigPath);
      }).toThrow(/Unexpected token|SyntaxError|Unexpected identifier/i);
    });

    it('should handle file system errors during configuration loading', () => {
      const nonExistentPath = path.join(tempDir, 'non-existent', 'config.js');

      // Test that requiring non-existent file throws
      expect(() => {
        delete require.cache[nonExistentPath];
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require(nonExistentPath);
      }).toThrow(/Cannot find module|ENOENT/i);
    });

    it('should handle JSON.parse errors for malformed data', () => {
      const malformedJSON = '{"name": "test", "invalid": }';

      // Test that JSON.parse throws for malformed JSON
      expect(() => JSON.parse(malformedJSON)).toThrow(SyntaxError);
      expect(() => JSON.parse(malformedJSON)).toThrow(/JSON|Unexpected token/i);
    });
  });

  describe('Memory Size Parsing Integration', () => {
    it('should parse various memory size formats from real configs', () => {
      const testCases = [
        { input: '128M', expected: 128 * 1024 * 1024 },
        { input: '1G', expected: 1 * 1024 * 1024 * 1024 },
        { input: '512K', expected: 512 * 1024 },
        { input: '256m', expected: 256 * 1024 * 1024 },
        { input: '2g', expected: 2 * 1024 * 1024 * 1024 },
        { input: '1024', expected: 1024 },
      ];

      for (const testCase of testCases) {
        const result = config.parseMemorySize(testCase.input);
        expect(result.success).toBe(true);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.bytes).toBe(testCase.expected);
        }
      }
    });

    it('should format memory sizes for human reading', () => {
      const actualTestCases = [
        { input: 1024, expected: '1K' },
        { input: 1024 * 1024, expected: '1M' },
        { input: 1024 * 1024 * 1024, expected: '1G' },
        { input: 512 * 1024 * 1024, expected: '512M' },
        { input: 2 * 1024 * 1024 * 1024, expected: '2G' },
      ];

      for (const testCase of actualTestCases) {
        const formatted = config.formatMemorySize(testCase.input);
        expect(formatted).toBe(testCase.expected);
      }
    });

    it('should handle invalid memory size formats', () => {
      const invalidTestCases = [
        '999X', // Invalid unit
        '256P', // Non-existent unit
        'invalid', // Non-numeric
        '', // Empty string
        '128MB', // Should be 'M' not 'MB'
        '-256M', // Negative value
      ];

      for (const invalidInput of invalidTestCases) {
        const result = config.parseMemorySize(invalidInput);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toMatch(
            /Invalid memory size format|Memory size cannot be empty|Memory size must be a non-negative number/i
          );
        }
      }
    });

    it('should integrate memory validation with constants', () => {
      // Test that memory parsing uses the correct constants
      const parseResult = config.parseMemorySize('1M');
      expect(parseResult.success).toBe(true);

      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.bytes).toBe(constants.MEMORY_MULTIPLIERS.M);
      }

      // Test various units from constants
      for (const unit of constants.MEMORY_UNITS) {
        if (unit) {
          // Skip empty string
          const testSize = `1${unit}`;
          const result = config.parseMemorySize(testSize);
          expect(result.success).toBe(true);
        }
      }
    });
  });

  describe('Configuration Merging and Defaults', () => {
    it('should merge configurations with proper defaults', () => {
      const baseConfig = config.createDefaultAppConfig(
        'base-app',
        'node server.js'
      );
      const overrideConfig: Partial<config.AppConfig> = {
        namespace: 'custom',
        env: { NODE_ENV: 'production' },
        max_memory_restart: '1G',
      };

      const mergedConfig = config.mergeAppConfig(baseConfig, overrideConfig);

      expect(mergedConfig.name).toBe('base-app');
      expect(mergedConfig.script).toBe('node server.js');
      expect(mergedConfig.namespace).toBe('custom');
      expect(mergedConfig.env?.NODE_ENV).toBe('production');
      expect(mergedConfig.max_memory_restart).toBe('1G');

      // Validate merged config
      expect(config.isAppConfig(mergedConfig)).toBe(true);

      const validation = config.validateAppConfig(mergedConfig);
      expect(validation.valid).toBe(true);
    });

    it('should create valid default configurations', () => {
      const defaultAppConfig = config.createDefaultAppConfig(
        'test-app',
        'npm start'
      );
      const defaultProcmanConfig = config.createDefaultProcmanConfig();

      expect(config.isAppConfig(defaultAppConfig)).toBe(true);
      expect(config.isProcmanConfig(defaultProcmanConfig)).toBe(true);

      expect(defaultAppConfig.namespace).toBe(constants.DEFAULT_NAMESPACE);
      expect(defaultProcmanConfig.apps).toHaveLength(0);
    });
  });

  describe('Error Handling Integration', () => {
    it('should create proper error results for invalid configurations', () => {
      const invalidMemorySize = '999X'; // Invalid unit
      const result = config.parseMemorySize(invalidMemorySize);

      expect(result.success).toBe(false);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid memory size format');
      }
    });

    it('should integrate with error system for configuration validation', () => {
      const invalidConfig = {
        apps: [
          {
            name: '', // Invalid empty name
            script: 'node app.js',
          },
        ],
      };

      const validationResult = config.validateProcmanConfig(invalidConfig);
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);

      // Test both valid and invalid configuration paths
      if (!validationResult.valid) {
        const configError = new errors.ProcmanError({
          code: 'CONFIG_VALIDATION_ERROR',
          message: `Configuration validation failed: ${validationResult.errors.join(', ')}`,
          details: { errors: validationResult.errors },
        });

        expect(errors.isProcmanError(configError)).toBe(true);
        expect(configError.code).toBe('CONFIG_VALIDATION_ERROR');
      }
    });
  });

  describe('File System Integration', () => {
    it('should handle various file path scenarios', () => {
      const testPaths = [
        '/absolute/path/to/config.js',
        './relative/path/config.js',
        '../parent/config.js',
        'simple-config.js',
      ];

      for (const configPath of testPaths) {
        // Test that config types can handle various path formats
        const appConfig: config.AppConfig = {
          name: 'path-test',
          script: 'node',
          args: 'app.js',
          cwd: path.dirname(configPath),
          log_file: configPath.replace('.js', '.log'),
          out_file: configPath.replace('.js', '-out.log'),
          error_file: configPath.replace('.js', '-error.log'),
        };

        expect(config.isAppConfig(appConfig)).toBe(true);

        const validation = config.validateAppConfig(appConfig);
        expect(validation.valid).toBe(true);
      }
    });

    it('should validate configuration with real directory structures', () => {
      // Create nested directory structure
      const nestedDir = path.join(tempDir, 'nested', 'deep', 'structure');
      fs.mkdirSync(nestedDir, { recursive: true });

      const configWithNestedPaths: config.AppConfig = {
        name: 'nested-test',
        script: 'node',
        args: 'server.js',
        cwd: nestedDir,
        log_file: path.join(nestedDir, 'app.log'),
        out_file: path.join(nestedDir, 'app-out.log'),
        error_file: path.join(nestedDir, 'app-error.log'),
      };

      expect(config.isAppConfig(configWithNestedPaths)).toBe(true);

      const validation = config.validateAppConfig(configWithNestedPaths);
      expect(validation.valid).toBe(true);
    });
  });
});
