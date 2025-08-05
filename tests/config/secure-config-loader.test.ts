import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  SecureConfigLoader,
  ConfigSecurityMode,
  createSecureConfigLoader,
} from '../../src/config/secure-config-loader';

describe('SecureConfigLoader', () => {
  let tmpDir: string;
  let configPath: string;
  let loader: SecureConfigLoader;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'secure-config-test-')
    );
    configPath = path.join(tmpDir, 'test.config.js');
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('Legacy Mode', () => {
    beforeEach(() => {
      loader = createSecureConfigLoader({
        securityMode: ConfigSecurityMode.LEGACY,
      });
    });

    it('should load configuration with warning', async () => {
      const config = {
        apps: [
          {
            name: 'test-app',
            script: './app.js',
          },
        ],
      };

      await fs.promises.writeFile(
        configPath,
        `module.exports = ${JSON.stringify(config)};`
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await loader.load(configPath);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Using legacy require() mode')
      );
      expect(result).toEqual(config);

      consoleSpy.mockRestore();
    });
  });

  describe('Hybrid Mode', () => {
    beforeEach(() => {
      loader = createSecureConfigLoader({
        securityMode: ConfigSecurityMode.HYBRID,
        sandboxTimeout: 500,
      });
    });

    it('should load safe configuration in sandbox', async () => {
      const configContent = `
        const path = require('path');
        const os = require('os');
        
        module.exports = {
          apps: [{
            name: 'worker',
            script: path.join(__dirname, 'worker.js'),
            instances: os.cpus().length
          }]
        };
      `;

      await fs.promises.writeFile(configPath, configContent);
      const result = await loader.load(configPath);

      expect(result.apps).toHaveLength(1);
      expect(result.apps[0].name).toBe('worker');
      expect(result.apps[0].script).toContain('worker.js');
    });

    it('should block dangerous child_process usage', async () => {
      const configContent = `
        const { exec } = require('child_process');
        exec('rm -rf /');
        module.exports = { apps: [] };
      `;

      await fs.promises.writeFile(configPath, configContent);

      await expect(loader.load(configPath)).rejects.toMatchObject({
        code: 'CONFIG_SECURITY_ERROR',
        message: expect.stringContaining('dangerous pattern'),
      });
    });

    it('should block eval usage', async () => {
      const configContent = `
        eval('process.exit(1)');
        module.exports = { apps: [] };
      `;

      await fs.promises.writeFile(configPath, configContent);

      await expect(loader.load(configPath)).rejects.toMatchObject({
        code: 'CONFIG_SECURITY_ERROR',
        message: expect.stringContaining('dangerous pattern'),
      });
    });

    it('should block Function constructor', async () => {
      const configContent = `
        const malicious = new Function('return process.exit()');
        module.exports = { apps: [] };
      `;

      await fs.promises.writeFile(configPath, configContent);

      await expect(loader.load(configPath)).rejects.toMatchObject({
        code: 'CONFIG_SECURITY_ERROR',
        message: expect.stringContaining('dangerous pattern'),
      });
    });

    it('should block disallowed module imports', async () => {
      const configContent = `
        const fs = require('fs');
        module.exports = { apps: [] };
      `;

      await fs.promises.writeFile(configPath, configContent);

      await expect(loader.load(configPath)).rejects.toMatchObject({
        code: 'CONFIG_SECURITY_ERROR',
        message: expect.stringContaining('disallowed module: fs'),
      });
    });

    it('should allow only whitelisted modules', async () => {
      const configContent = `
        const path = require('path');
        const url = require('url');
        module.exports = { 
          apps: [{
            name: 'test',
            script: path.join('.', 'app.js'),
            url: url.parse('http://localhost:3000').href
          }]
        };
      `;

      await fs.promises.writeFile(configPath, configContent);
      const result = await loader.load(configPath);

      // URL might be set directly or in env, check both
      const appConfig = result.apps[0];
      const url =
        (appConfig as any).url || appConfig.env?.URL || appConfig.env?.url;
      expect(url).toBe('http://localhost:3000/');
    });

    it('should timeout on infinite loops', async () => {
      const configContent = `
        while(true) {}
        module.exports = { apps: [] };
      `;

      await fs.promises.writeFile(configPath, configContent);

      await expect(loader.load(configPath)).rejects.toMatchObject({
        code: 'CONFIG_PARSE_ERROR',
        message: expect.stringContaining('timed out'),
      });
    });

    it('should provide limited process object', async () => {
      const configContent = `
        module.exports = {
          apps: [{
            name: 'test',
            script: './app.js',
            env: {
              PLATFORM: process.platform,
              ARCH: process.arch,
              CWD: process.cwd()
            }
          }]
        };
      `;

      await fs.promises.writeFile(configPath, configContent);
      const result = await loader.load(configPath);

      expect(result.apps[0].env?.PLATFORM).toBe(process.platform);
      expect(result.apps[0].env?.ARCH).toBe(process.arch);
      expect(result.apps[0].env?.CWD).toBe(tmpDir);
    });

    it('should not have access to real console', async () => {
      const configContent = `
        console.log('This should not appear');
        console.error('Neither should this');
        module.exports = { apps: [{ name: 'test', script: './test.js' }] };
      `;

      await fs.promises.writeFile(configPath, configContent);

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await loader.load(configPath);

      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should block prototype pollution attempts', async () => {
      const configContent = `
        Object.prototype.polluted = 'bad';
        module.exports = { apps: [{ name: 'test', script: './test.js' }] };
      `;

      await fs.promises.writeFile(configPath, configContent);

      // Should not throw but should not pollute prototype
      await loader.load(configPath);
      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });

  describe('Security Mode Management', () => {
    it('should get and set security mode', () => {
      loader = createSecureConfigLoader({
        securityMode: ConfigSecurityMode.HYBRID,
      });

      expect(loader.getSecurityMode()).toBe(ConfigSecurityMode.HYBRID);

      loader.setSecurityMode(ConfigSecurityMode.LEGACY);
      expect(loader.getSecurityMode()).toBe(ConfigSecurityMode.LEGACY);
    });

    it('should throw for unimplemented modes', async () => {
      await fs.promises.writeFile(configPath, 'module.exports = { apps: [] };');

      loader = createSecureConfigLoader({
        securityMode: ConfigSecurityMode.TEMPLATE,
      });
      await expect(loader.load(configPath)).rejects.toMatchObject({
        code: 'CONFIG_SECURITY_ERROR',
        message: expect.stringContaining('not yet implemented'),
      });

      loader.setSecurityMode(ConfigSecurityMode.ISOLATED);
      await expect(loader.load(configPath)).rejects.toMatchObject({
        code: 'CONFIG_SECURITY_ERROR',
        message: expect.stringContaining('isolated-vm'),
      });
    });
  });

  describe('Module Whitelist Management', () => {
    beforeEach(() => {
      loader = createSecureConfigLoader({
        securityMode: ConfigSecurityMode.HYBRID,
        allowedModules: ['path'],
      });
    });

    it('should manage allowed modules', () => {
      expect(loader.getAllowedModules()).toEqual(['path']);

      loader.addAllowedModule('os');
      expect(loader.getAllowedModules()).toContain('os');

      loader.removeAllowedModule('path');
      expect(loader.getAllowedModules()).not.toContain('path');
    });

    it('should respect custom module whitelist', async () => {
      const configContent = `
        const path = require('path');
        module.exports = { apps: [{ name: 'test', script: path.join('.', 'app.js') }] };
      `;

      await fs.promises.writeFile(configPath, configContent);
      await expect(loader.load(configPath)).resolves.toBeDefined();

      // Try to use os which is not whitelisted
      const configWithOs = `
        const os = require('os');
        module.exports = { apps: [] };
      `;

      await fs.promises.writeFile(configPath, configWithOs);
      await expect(loader.load(configPath)).rejects.toMatchObject({
        code: 'CONFIG_SECURITY_ERROR',
        message: expect.stringContaining('disallowed module: os'),
      });
    });
  });

  describe('validateConfigSecurity', () => {
    beforeEach(() => {
      loader = createSecureConfigLoader({
        securityMode: ConfigSecurityMode.HYBRID,
      });
    });

    it('should validate safe configuration', async () => {
      const safeConfig = `
        const path = require('path');
        module.exports = {
          apps: [{
            name: 'app',
            script: path.join(__dirname, 'app.js')
          }]
        };
      `;

      await fs.promises.writeFile(configPath, safeConfig);
      const result = await loader.validateConfigSecurity(configPath);

      expect(result.safe).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect security issues', async () => {
      const unsafeConfig = `
        const { exec } = require('child_process');
        const fs = require('fs');
        eval('console.log("evil")');
        module.exports = { apps: [] };
      `;

      await fs.promises.writeFile(configPath, unsafeConfig);
      const result = await loader.validateConfigSecurity(configPath);

      expect(result.safe).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain('dangerous pattern');
    });

    it('should handle file read errors gracefully', async () => {
      const result = await loader.validateConfigSecurity(
        '/nonexistent/file.js'
      );

      expect(result.safe).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toContain('Failed to read file');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      loader = createSecureConfigLoader({
        securityMode: ConfigSecurityMode.HYBRID,
      });
    });

    it('should handle syntax errors in config', async () => {
      const invalidConfig = `
        module.exports = {
          apps: [
            name: 'broken'  // Missing brace
          ]
        };
      `;

      await fs.promises.writeFile(configPath, invalidConfig);

      await expect(loader.load(configPath)).rejects.toMatchObject({
        code: 'CONFIG_PARSE_ERROR',
        message: expect.stringContaining('Failed to execute'),
      });
    });

    it('should handle configs that export non-objects', async () => {
      const configContent = `module.exports = "not an object";`;

      await fs.promises.writeFile(configPath, configContent);

      await expect(loader.load(configPath)).rejects.toMatchObject({
        code: 'CONFIG_PARSE_ERROR',
      });
    });

    it('should handle relative requires safely', async () => {
      const helperPath = path.join(tmpDir, 'helper.js');
      await fs.promises.writeFile(
        helperPath,
        'module.exports = { foo: "bar" };'
      );

      const configContent = `
        const helper = require('./helper.js');
        module.exports = { apps: [], helper: helper.foo };
      `;

      await fs.promises.writeFile(configPath, configContent);

      // Relative requires should be blocked in sandbox
      await expect(loader.load(configPath)).rejects.toBeDefined();
    });
  });
});
