/**
 * Boundary tests for ConfigLoader
 * Following t_wada's test strategy: Focus on public API boundaries, not implementation details
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigLoader } from '../../src/config/config-loader';
import { ProcmanError } from '../../src/shared/errors';
import {
  TEST_MEMORY_SIZES,
  TEST_FILE_SIZES,
  TEST_DELAYS,
  TEST_COUNTS,
  TEST_STRING_LENGTHS,
} from '../helpers/test-constants';

describe('ConfigLoader Boundary Tests', () => {
  let tempDir: string;
  let configLoader: ConfigLoader;

  beforeEach(() => {
    // Use real filesystem with temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procman-test-'));
    configLoader = new ConfigLoader();
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('File I/O Boundary', () => {
    test('should successfully load valid configuration file', async () => {
      // Arrange: Create a valid config file
      const configPath = path.join(tempDir, 'procman.config.js');
      const validConfig = `
        module.exports = {
          apps: [
            {
              name: 'test-app',
              script: 'node',
              args: 'server.js'
            }
          ]
        };
      `;
      fs.writeFileSync(configPath, validConfig);

      // Act: Load the configuration
      const result = await configLoader.load(configPath);

      // Assert: Verify the loaded configuration
      expect(result.apps).toHaveLength(1);
      expect(result.apps[0].name).toBe('test-app');
      expect(result.apps[0].script).toBe('node');
    });

    test('should throw error when configuration file does not exist', async () => {
      // Arrange: Non-existent file path
      const nonExistentPath = path.join(tempDir, 'non-existent.config.js');

      // Act & Assert: Should throw appropriate error
      await expect(configLoader.load(nonExistentPath)).rejects.toThrow(
        ProcmanError
      );
    });

    test('should reject non-.js configuration files', async () => {
      // Arrange: Create a non-.js file
      const invalidPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(invalidPath, '{"apps": []}');

      // Act & Assert: Should reject non-.js files
      await expect(configLoader.load(invalidPath)).rejects.toThrow(
        'Configuration file must have .js or .cjs extension'
      );
    });

    test('should handle file with syntax errors', async () => {
      // Arrange: Create a file with syntax error
      const configPath = path.join(tempDir, 'invalid.config.js');
      fs.writeFileSync(configPath, 'module.exports = { invalid javascript');

      // Act & Assert: Should throw error for invalid syntax
      await expect(configLoader.load(configPath)).rejects.toThrow();
    });

    test('should enforce file size limits', async () => {
      // Arrange: Create a large file exceeding size limit
      const configPath = path.join(tempDir, 'large.config.js');
      const largeContent =
        'module.exports = { data: "' +
        'x'.repeat(TEST_MEMORY_SIZES.SMALL) +
        '" };';
      fs.writeFileSync(configPath, largeContent);

      // Create loader with small size limit
      const limitedLoader = new ConfigLoader({
        maxFileSize: TEST_FILE_SIZES.SMALL,
      });

      // Act & Assert: Should reject oversized files
      await expect(limitedLoader.load(configPath)).rejects.toThrow(
        'Configuration file too large'
      );
    });
  });

  describe('Configuration Validation Boundary', () => {
    test('should validate required app properties', async () => {
      // Arrange: Config missing required 'name' property
      const configPath = path.join(tempDir, 'invalid-app.config.js');
      const invalidConfig = `
        module.exports = {
          apps: [
            {
              script: 'node server.js'
            }
          ]
        };
      `;
      fs.writeFileSync(configPath, invalidConfig);

      // Act & Assert: Should fail validation
      await expect(configLoader.load(configPath)).rejects.toThrow();
    });

    test('should accept valid memory format strings', async () => {
      // Arrange: Config with various memory formats
      const configPath = path.join(tempDir, 'memory.config.js');
      const memoryConfig = `
        module.exports = {
          apps: [
            {
              name: 'app1',
              script: 'node',
              max_memory_restart: '512M'
            },
            {
              name: 'app2',
              script: 'node',
              max_memory_restart: '2G'
            }
          ]
        };
      `;
      fs.writeFileSync(configPath, memoryConfig);

      // Act: Load configuration
      const result = await configLoader.load(configPath);

      // Assert: Memory values should be accepted
      expect(result.apps[0].max_memory_restart).toBe('512M');
      expect(result.apps[1].max_memory_restart).toBe('2G');
    });

    test('should reject invalid memory format strings', async () => {
      // Arrange: Config with invalid memory format
      const configPath = path.join(tempDir, 'bad-memory.config.js');
      const invalidMemoryConfig = `
        module.exports = {
          apps: [
            {
              name: 'app',
              script: 'node',
              max_memory_restart: '512X' // Invalid unit
            }
          ]
        };
      `;
      fs.writeFileSync(configPath, invalidMemoryConfig);

      // Act & Assert: Should reject invalid memory format
      await expect(configLoader.load(configPath)).rejects.toThrow();
    });
  });

  describe('File Watching Boundary', () => {
    test('should emit event when watched configuration file changes', async (context) => {
      // File watching test that should work in all environments

      // Arrange: Create initial config with valid app
      const configPath = path.join(tempDir, 'watched.config.js');
      fs.writeFileSync(
        configPath,
        'module.exports = { apps: [{name: "initial", script: "node", args: ""}] };'
      );

      // Load and start watching
      await configLoader.load(configPath);

      // Set up event listener
      const changePromise = new Promise<string>((resolve) => {
        configLoader.once('configChanged', resolve);
      });

      // Watch the config file
      const watcher = configLoader.watchConfig(configPath, () => {});

      // Act: Modify the file
      await new Promise((resolve) => setTimeout(resolve, TEST_DELAYS.SHORT)); // Wait for watcher to stabilize
      fs.writeFileSync(
        configPath,
        'module.exports = { apps: [{name: "updated", script: "node", args: ""}] };'
      );

      // Assert: Event should be emitted
      const changedPath = await changePromise;
      expect(changedPath).toBe(configPath);

      // Clean up
      watcher.dispose();
    });
  });

  describe('Input Validation Edge Cases', () => {
    test('should handle null and undefined config paths', async () => {
      // Act & Assert: Should throw errors for invalid inputs
      await expect(configLoader.load(null as any)).rejects.toThrow();

      await expect(configLoader.load(undefined as any)).rejects.toThrow();
    });

    test('should handle empty string config path', async () => {
      // Act & Assert: Should throw error for empty path
      await expect(configLoader.load('')).rejects.toThrow();
    });

    test('should handle extremely long file paths', async () => {
      // Arrange: Create path approaching filesystem limits (255+ chars)
      const longFileName = 'a'.repeat(250) + '.config.js';
      const longPath = path.join(tempDir, longFileName);

      // Act & Assert: Should handle gracefully
      await expect(configLoader.load(longPath)).rejects.toThrow();
    });

    test('should handle paths with special characters', async () => {
      // Arrange: Create config with special characters in path
      const specialChars = ['%', '&', '@', '#', '!', '~'];

      for (const char of specialChars) {
        const specialPath = path.join(tempDir, `config${char}test.config.js`);
        fs.writeFileSync(
          specialPath,
          'module.exports = { apps: [{ name: "test", script: "node" }] };'
        );

        // Act: Should handle special characters in paths
        const result = await configLoader.load(specialPath);

        // Assert: Should load successfully
        expect(result.apps).toHaveLength(1);
        expect(result.apps[0].name).toBe('test');
      }
    });
  });

  describe('Resource Limits and Extreme Values', () => {
    test('should handle configuration with extremely large app arrays', async () => {
      // Arrange: Create config with many apps
      const configPath = path.join(tempDir, 'large-apps.config.js');
      const apps = [];

      // Create 1000 app configurations
      for (let i = 0; i < TEST_COUNTS.VERY_LARGE; i++) {
        apps.push(`{ name: "app-${i}", script: "node", args: "index.js" }`);
      }

      const largeConfig = `module.exports = { apps: [${apps.join(', ')}] };`;
      fs.writeFileSync(configPath, largeConfig);

      // Act: Load large configuration
      const result = await configLoader.load(configPath);

      // Assert: Should handle large arrays
      expect(result.apps).toHaveLength(TEST_COUNTS.VERY_LARGE);
      expect(result.apps[TEST_COUNTS.VERY_LARGE - 1].name).toBe(
        `app-${TEST_COUNTS.VERY_LARGE - 1}`
      );
    });

    test('should handle nested object depth limits', async () => {
      // Arrange: Create deeply nested configuration
      const configPath = path.join(tempDir, 'deep-nested.config.js');
      let deepNesting = '"value"';

      // Create 100 levels of nesting
      for (let i = 0; i < TEST_COUNTS.MEDIUM; i++) {
        deepNesting = `{ level${i}: ${deepNesting} }`;
      }

      const deepConfig = `
        module.exports = {
          apps: [{ 
            name: "deep-app", 
            script: "node",
            metadata: ${deepNesting}
          }]
        };
      `;
      fs.writeFileSync(configPath, deepConfig);

      // Act: Load deeply nested config
      const result = await configLoader.load(configPath);

      // Assert: Should handle deep nesting
      expect(result.apps[0].name).toBe('deep-app');
      expect((result.apps[0] as any).metadata).toBeDefined();
    });

    test('should enforce memory limit validation with extreme values', async () => {
      // Arrange: Config with extreme memory values
      const configPath = path.join(tempDir, 'extreme-memory.config.js');
      const extremeConfig = `
        module.exports = {
          apps: [
            {
              name: 'extreme-app',
              script: 'node',
              max_memory_restart: '999999G'
            }
          ]
        };
      `;
      fs.writeFileSync(configPath, extremeConfig);

      // Act: Load configuration with extreme memory value
      const result = await configLoader.load(configPath);

      // Assert: Should accept but validate the extreme value
      expect(result.apps[0].max_memory_restart).toBe('999999G');
    });
  });

  describe('Concurrent Access and Race Conditions', () => {
    test('should handle concurrent loads of same file', async () => {
      // Arrange: Create config file
      const configPath = path.join(tempDir, 'concurrent.config.js');
      fs.writeFileSync(
        configPath,
        'module.exports = { apps: [{ name: "concurrent", script: "node" }] };'
      );

      // Act: Load same file concurrently
      const promises = [];
      for (let i = 0; i < TEST_COUNTS.TINY; i++) {
        promises.push(configLoader.load(configPath));
      }

      const results = await Promise.all(promises);

      // Assert: All should succeed
      expect(results).toHaveLength(TEST_COUNTS.TINY);
      results.forEach((result) => {
        expect(result.apps[0].name).toBe('concurrent');
      });
    });

    test('should handle file modification during load', async () => {
      // Arrange: Create config file
      const configPath = path.join(tempDir, 'modifying.config.js');
      fs.writeFileSync(
        configPath,
        'module.exports = { apps: [{ name: "initial", script: "node" }] };'
      );

      // Act: Start loading and modify file simultaneously
      const loadPromise = configLoader.load(configPath);

      // Modify file immediately after starting load
      setTimeout(() => {
        try {
          fs.writeFileSync(
            configPath,
            'module.exports = { apps: [{ name: "modified", script: "node" }] };'
          );
        } catch {
          // File might be locked during read
        }
      }, 1);

      const result = await loadPromise;

      // Assert: Should complete successfully (either version)
      expect(result.apps[0].name).toMatch(/initial|modified/);
    });
  });

  describe('System Error Boundary Cases', () => {
    test('should handle filesystem read-only scenarios', async () => {
      // Skip on Windows where chmod behaves differently
      if (process.platform === 'win32') {
        return;
      }

      // Arrange: Create config and make parent directory read-only
      const readOnlyDir = path.join(tempDir, 'readonly');
      fs.mkdirSync(readOnlyDir);

      const configPath = path.join(readOnlyDir, 'readonly.config.js');
      fs.writeFileSync(
        configPath,
        'module.exports = { apps: [{ name: "readonly", script: "node" }] };'
      );

      // Make directory read-only - files should still be readable
      fs.chmodSync(configPath, 0o444); // Make file read-only
      fs.chmodSync(readOnlyDir, 0o555); // Make directory read+execute only

      try {
        // Act: Try to load from read-only directory
        const result = await configLoader.load(configPath);

        // Assert: Should still be able to read existing files
        expect(result.apps[0].name).toBe('readonly');
      } finally {
        // Clean up: Restore permissions
        fs.chmodSync(readOnlyDir, 0o755);
        fs.chmodSync(configPath, 0o644);
      }
    });

    test('should handle corrupted file recovery', async () => {
      // Arrange: Create partially written/corrupted file
      const configPath = path.join(tempDir, 'corrupted.config.js');

      // Write incomplete JavaScript
      fs.writeFileSync(configPath, 'module.exports = { apps: [{ name: "test"');

      // Act & Assert: Should handle corrupted file
      await expect(configLoader.load(configPath)).rejects.toThrow();
    });

    test('should handle binary file masquerading as config', async () => {
      // Arrange: Create binary file with .js extension
      const configPath = path.join(tempDir, 'binary.config.js');
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);
      fs.writeFileSync(configPath, binaryData);

      // Act & Assert: Should reject binary data
      await expect(configLoader.load(configPath)).rejects.toThrow();
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    test('should handle empty configuration file', async () => {
      // Arrange: Empty file
      const configPath = path.join(tempDir, 'empty.config.js');
      fs.writeFileSync(configPath, '');

      // Act & Assert: Should handle gracefully
      await expect(configLoader.load(configPath)).rejects.toThrow();
    });

    test('should handle configuration that exports non-object', async () => {
      // Arrange: Config exports string instead of object
      const configPath = path.join(tempDir, 'string.config.js');
      fs.writeFileSync(configPath, 'module.exports = "not an object";');

      // Act & Assert: Should reject non-object exports
      await expect(configLoader.load(configPath)).rejects.toThrow();
    });

    test('should handle circular references in configuration', async () => {
      // Arrange: Config with circular reference
      const configPath = path.join(tempDir, 'circular.config.js');
      const circularConfig = `
        const config = { apps: [] };
        config.self = config;
        module.exports = config;
      `;
      fs.writeFileSync(configPath, circularConfig);

      // Act & Assert: Should handle circular references
      await expect(configLoader.load(configPath)).rejects.toThrow();
    });

    test('should handle file permissions errors', async () => {
      // Skip on Windows where chmod doesn't work as expected
      if (process.platform === 'win32') {
        return;
      }

      // Arrange: Create file and remove read permissions
      const configPath = path.join(tempDir, 'no-read.config.js');
      fs.writeFileSync(configPath, 'module.exports = { apps: [] };');
      fs.chmodSync(configPath, 0o000);

      // Act & Assert: Should throw permission error
      await expect(configLoader.load(configPath)).rejects.toThrow();

      // Clean up: Restore permissions for cleanup
      fs.chmodSync(configPath, 0o644);
    });

    test('should handle symbolic links and aliases', async () => {
      // Skip on Windows where symlinks require elevated privileges
      if (process.platform === 'win32') {
        return;
      }

      // Arrange: Create config and symbolic link to it
      const configPath = path.join(tempDir, 'original.config.js');
      const linkPath = path.join(tempDir, 'link.config.js');

      fs.writeFileSync(
        configPath,
        'module.exports = { apps: [{ name: "linked", script: "node" }] };'
      );
      fs.symlinkSync(configPath, linkPath);

      // Act: Load through symbolic link
      const result = await configLoader.load(linkPath);

      // Assert: Should resolve and load correctly
      expect(result.apps[0].name).toBe('linked');
    });

    test('should handle broken symbolic links', async () => {
      // Skip on Windows
      if (process.platform === 'win32') {
        return;
      }

      // Arrange: Create broken symbolic link
      const nonExistentPath = path.join(tempDir, 'nonexistent.config.js');
      const brokenLinkPath = path.join(tempDir, 'broken-link.config.js');

      fs.symlinkSync(nonExistentPath, brokenLinkPath);

      // Act & Assert: Should handle broken link gracefully
      await expect(configLoader.load(brokenLinkPath)).rejects.toThrow();
    });
  });

  describe('Caching Behavior', () => {
    test('should return cached result for subsequent loads of same file', async () => {
      // Arrange: Create config file
      const configPath = path.join(tempDir, 'cached.config.js');
      fs.writeFileSync(
        configPath,
        'module.exports = { apps: [{name: "app1", script: "node"}] };'
      );

      // Act: Load twice
      const result1 = await configLoader.load(configPath);
      const result2 = await configLoader.load(configPath);

      // Assert: Should return same instance (cached)
      expect(result1).toBe(result2);
    });

    test('should bypass cache when disabled', async () => {
      // Arrange: Create loader with cache disabled
      const noCacheLoader = new ConfigLoader({ enableCache: false });
      const configPath = path.join(tempDir, 'no-cache.config.js');
      fs.writeFileSync(
        configPath,
        'module.exports = { apps: [{name: "app1", script: "node"}] };'
      );

      // Act: Load twice
      const result1 = await noCacheLoader.load(configPath);

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, TEST_DELAYS.TINY));

      const result2 = await noCacheLoader.load(configPath);

      // Assert: Should return different instances
      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });
  });
});
