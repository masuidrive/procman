/**
 * Unit tests for configuration type definitions
 */

import { describe, test, expect } from 'vitest';
import {
  // Types
  type AppConfig,
  type ProcmanConfig,

  // Type guards
  isAppConfig,
  isProcmanConfig,

  // Utility functions
  parseMemorySize,
} from '../../src/shared/config';

describe('Configuration Types', () => {
  describe('AppConfig interface', () => {
    test('should accept valid minimal app config', () => {
      const minimalConfig: AppConfig = {
        name: 'test-app',
        script: './test.js',
      };

      expect(minimalConfig.name).toBe('test-app');
      expect(minimalConfig.script).toBe('./test.js');
      expect(minimalConfig.namespace).toBeUndefined();
    });

    test('should accept full app config', () => {
      const fullConfig: AppConfig = {
        name: 'full-app',
        script: './app.js',
        namespace: 'production',
        args: '--port 3000',
        cwd: '/app',
        note: 'Production server',
        env: {
          NODE_ENV: 'production',
          PORT: '3000',
        },
        max_memory_restart: '512M',
        log_file: '/logs/app.log',
        out_file: '/logs/out.log',
        error_file: '/logs/error.log',
      };

      expect(fullConfig.name).toBe('full-app');
      expect(fullConfig.namespace).toBe('production');
      expect(fullConfig.env?.NODE_ENV).toBe('production');
      expect(fullConfig.max_memory_restart).toBe('512M');
    });
  });

  describe('ProcmanConfig interface', () => {
    test('should accept valid project config', () => {
      const config: ProcmanConfig = {
        apps: [
          {
            name: 'app1',
            script: './app1.js',
          },
          {
            name: 'app2',
            script: './app2.js',
            namespace: 'backend',
            max_memory_restart: '1G',
          },
        ],
      };

      expect(config.apps).toHaveLength(2);
      expect(config.apps[0].name).toBe('app1');
      expect(config.apps[1].namespace).toBe('backend');
    });

    test('should accept empty apps array', () => {
      const emptyConfig: ProcmanConfig = {
        apps: [],
      };

      expect(emptyConfig.apps).toHaveLength(0);
    });
  });

  describe('Type guards', () => {
    describe('isAppConfig', () => {
      test('should return true for valid app config', () => {
        const validConfig = {
          name: 'test-app',
          script: './test.js',
        };

        expect(isAppConfig(validConfig)).toBe(true);
      });

      test('should return true for app config with optional fields', () => {
        const configWithOptionals = {
          name: 'test-app',
          script: './test.js',
          namespace: 'dev',
          args: '--debug',
          env: { DEBUG: 'true' },
        };

        expect(isAppConfig(configWithOptionals)).toBe(true);
      });

      test('should return false for invalid objects', () => {
        expect(isAppConfig(null)).toBe(false);
        expect(isAppConfig(undefined)).toBe(false);
        expect(isAppConfig('string')).toBe(false);
        expect(isAppConfig(123)).toBe(false);
        expect(isAppConfig({})).toBe(false);
        expect(isAppConfig({ name: 'test' })).toBe(false); // missing script
        expect(isAppConfig({ script: './test.js' })).toBe(false); // missing name
        expect(isAppConfig({ name: 123, script: './test.js' })).toBe(false); // wrong type
        expect(isAppConfig({ name: 'test', script: 123 })).toBe(false); // wrong type
      });
    });

    describe('isProcmanConfig', () => {
      test('should return true for valid project config', () => {
        const validConfig = {
          apps: [
            { name: 'app1', script: './app1.js' },
            { name: 'app2', script: './app2.js' },
          ],
        };

        expect(isProcmanConfig(validConfig)).toBe(true);
      });

      test('should return true for empty apps array', () => {
        const emptyConfig = { apps: [] };
        expect(isProcmanConfig(emptyConfig)).toBe(true);
      });

      test('should return false for invalid objects', () => {
        expect(isProcmanConfig(null)).toBe(false);
        expect(isProcmanConfig(undefined)).toBe(false);
        expect(isProcmanConfig('string')).toBe(false);
        expect(isProcmanConfig(123)).toBe(false);
        expect(isProcmanConfig({})).toBe(false);
        expect(isProcmanConfig({ apps: 'not-array' })).toBe(false);
        expect(isProcmanConfig({ apps: [{ name: 'test' }] })).toBe(false); // invalid app
        expect(
          isProcmanConfig({
            apps: [
              { name: 'app1', script: './app1.js' },
              { name: 'app2' }, // missing script
            ],
          })
        ).toBe(false);
      });
    });
  });

  describe('Utility functions', () => {
    describe('parseMemorySize', () => {
      test('should parse valid memory sizes', () => {
        expect(parseMemorySize('100')).toEqual({ success: true, value: 100 });
        expect(parseMemorySize('1K')).toEqual({ success: true, value: 1024 });
        expect(parseMemorySize('1k')).toEqual({ success: true, value: 1024 });
        expect(parseMemorySize('2M')).toEqual({
          success: true,
          value: 2 * 1024 * 1024,
        });
        expect(parseMemorySize('2m')).toEqual({
          success: true,
          value: 2 * 1024 * 1024,
        });
        expect(parseMemorySize('3G')).toEqual({
          success: true,
          value: 3 * 1024 * 1024 * 1024,
        });
        expect(parseMemorySize('3g')).toEqual({
          success: true,
          value: 3 * 1024 * 1024 * 1024,
        });
      });

      test('should parse decimal values', () => {
        expect(parseMemorySize('1.5M')).toEqual({
          success: true,
          value: Math.floor(1.5 * 1024 * 1024),
        });
        expect(parseMemorySize('2.5G')).toEqual({
          success: true,
          value: Math.floor(2.5 * 1024 * 1024 * 1024),
        });
      });

      test('should handle spaces', () => {
        expect(parseMemorySize('100 M')).toEqual({
          success: true,
          value: 100 * 1024 * 1024,
        });
        expect(parseMemorySize('1 G')).toEqual({
          success: true,
          value: 1024 * 1024 * 1024,
        });
      });

      test('should return error for invalid formats', () => {
        expect(parseMemorySize('')).toEqual({
          success: false,
          error: 'Invalid format. Expected: number[KMG] (e.g., "300M", "1G")',
        });
        expect(parseMemorySize('invalid')).toEqual({
          success: false,
          error: 'Invalid format. Expected: number[KMG] (e.g., "300M", "1G")',
        });
        expect(parseMemorySize('M100')).toEqual({
          success: false,
          error: 'Invalid format. Expected: number[KMG] (e.g., "300M", "1G")',
        });
        expect(parseMemorySize('100MB')).toEqual({
          success: false,
          error: 'Invalid format. Expected: number[KMG] (e.g., "300M", "1G")',
        });
        expect(parseMemorySize('100 MB')).toEqual({
          success: false,
          error: 'Invalid format. Expected: number[KMG] (e.g., "300M", "1G")',
        });
        expect(parseMemorySize('-100M')).toEqual({
          success: false,
          error: 'Invalid format. Expected: number[KMG] (e.g., "300M", "1G")',
        });
      });
    });
  });
});
