/**
 * Secure Configuration Loader
 *
 * Provides safer alternatives to using require() for loading configuration files.
 * Implements multiple security modes including sandboxed execution and template-based configs.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { ProcmanConfig } from '../shared/config';
import { createError } from '../shared/errors';
import { ConfigLoader, ConfigLoaderOptions } from './config-loader';

export enum ConfigSecurityMode {
  LEGACY = 'legacy', // Current require() approach
  HYBRID = 'hybrid', // Static analysis + VM sandbox
  TEMPLATE = 'template', // JSON + template engine (future)
  ISOLATED = 'isolated', // isolated-vm (future)
}

export interface SecureConfigLoaderOptions extends ConfigLoaderOptions {
  securityMode?: ConfigSecurityMode;
  allowedModules?: string[];
  sandboxTimeout?: number;
}

/**
 * Enhanced ConfigLoader with security modes
 */
export class SecureConfigLoader extends ConfigLoader {
  private securityMode: ConfigSecurityMode;
  private allowedModules: Set<string>;
  private sandboxTimeout: number;

  constructor(options: SecureConfigLoaderOptions = {}) {
    super(options);
    this.securityMode = options.securityMode || ConfigSecurityMode.LEGACY;
    this.allowedModules = new Set(
      options.allowedModules || ['path', 'os', 'url']
    );
    this.sandboxTimeout = options.sandboxTimeout || 1000;
  }

  async load(filePath: string): Promise<ProcmanConfig> {
    switch (this.securityMode) {
      case ConfigSecurityMode.LEGACY:
        console.warn(
          '⚠️  WARNING: Using legacy require() mode to load configuration.\n' +
            '   This allows arbitrary code execution. Consider using HYBRID mode.\n' +
            '   See: https://github.com/yourusername/procman/docs/config-security'
        );
        return super.load(filePath);

      case ConfigSecurityMode.HYBRID:
        return this.loadWithHybridSandbox(filePath);

      case ConfigSecurityMode.TEMPLATE:
        throw createError('CONFIG_SECURITY_ERROR', {
          message: 'Template mode not yet implemented',
          details: { mode: this.securityMode },
        });

      case ConfigSecurityMode.ISOLATED:
        throw createError('CONFIG_SECURITY_ERROR', {
          message:
            'Isolated mode not yet implemented. Install isolated-vm package.',
          details: { mode: this.securityMode },
        });

      default:
        throw createError('CONFIG_SECURITY_ERROR', {
          message: `Unknown security mode: ${this.securityMode}`,
          details: { mode: this.securityMode },
        });
    }
  }

  /**
   * Load configuration using VM sandbox with restricted context
   */
  private async loadWithHybridSandbox(
    filePath: string
  ): Promise<ProcmanConfig> {
    const absolutePath = path.resolve(filePath);

    // Validate file exists and is readable
    await this.validateFilePathSecure(filePath);

    const content = await fs.promises.readFile(absolutePath, 'utf-8');

    // Quick check for obvious dangerous patterns
    this.performBasicSecurityCheck(content, absolutePath);

    // Create sandbox context
    const sandbox = this.createSandboxContext(absolutePath);

    try {
      // Compile and run script in sandbox
      const script = new vm.Script(content, {
        filename: path.basename(absolutePath),
        // @ts-expect-error - displayErrors exists but not in types
        displayErrors: true,
      });

      const context = vm.createContext(sandbox);
      script.runInContext(context, { timeout: this.sandboxTimeout });

      // Extract configuration from sandbox
      const config = sandbox.module.exports;

      // Validate the configuration
      this.validator.validateConfig(config);

      return config as ProcmanConfig;
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        throw createError('CONFIG_PARSE_ERROR', {
          message: `Configuration script execution timed out after ${this.sandboxTimeout}ms`,
          cause: error,
          details: { filePath: absolutePath, timeout: this.sandboxTimeout },
        });
      }

      throw createError('CONFIG_PARSE_ERROR', {
        message: `Failed to execute configuration in sandbox: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
        details: { filePath: absolutePath },
      });
    }
  }

  /**
   * Basic security check for dangerous patterns
   */
  private performBasicSecurityCheck(content: string, filePath: string): void {
    const dangerousPatterns = [
      /child_process/,
      /exec\s*\(/,
      /spawn\s*\(/,
      /eval\s*\(/,
      /Function\s*\(/,
      /\.constructor\s*\(/,
      /__proto__/,
      /process\.exit/,
      /process\.kill/,
      /fs\.(unlink|rmdir|rm)/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        throw createError('CONFIG_SECURITY_ERROR', {
          message: `Configuration contains potentially dangerous pattern: ${pattern}`,
          details: {
            filePath,
            pattern: pattern.toString(),
          },
        });
      }
    }

    // Check for require() of non-allowed modules
    const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;
    while ((match = requirePattern.exec(content)) !== null) {
      const moduleName = match[1];
      if (
        !this.allowedModules.has(moduleName) &&
        !moduleName.startsWith('./') &&
        !moduleName.startsWith('../')
      ) {
        throw createError('CONFIG_SECURITY_ERROR', {
          message: `Configuration attempts to require disallowed module: ${moduleName}`,
          details: {
            filePath,
            module: moduleName,
            allowedModules: Array.from(this.allowedModules),
          },
        });
      }
    }
  }

  /**
   * Create sandboxed context for VM execution
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createSandboxContext(filePath: string): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sandbox: any = {
      // Basic module structure
      module: { exports: {} },
      exports: {},

      // Limited console (no access to real console)
      console: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
        log: (...args: any[]) => {
          /* silent */
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
        error: (...args: any[]) => {
          /* silent */
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
        warn: (...args: any[]) => {
          /* silent */
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
        info: (...args: any[]) => {
          /* silent */
        },
      },

      // Limited process object
      process: {
        env: { ...process.env },
        platform: process.platform,
        arch: process.arch,
        version: process.version,
        versions: process.versions,
        cwd: () => path.dirname(filePath),
      },

      // Paths relative to config file
      __filename: filePath,
      __dirname: path.dirname(filePath),

      // Controlled require function
      require: (id: string) => {
        if (!this.allowedModules.has(id)) {
          throw new Error(
            `Module '${id}' is not allowed in sandboxed configuration`
          );
        }

        // Limited module access
        switch (id) {
          case 'path':
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require('path');
          case 'os':
            return {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              cpus: require('os').cpus,
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              platform: require('os').platform,
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              arch: require('os').arch,
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              hostname: require('os').hostname,
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              homedir: require('os').homedir,
            };
          case 'url':
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require('url');
          default:
            throw new Error(
              `Module '${id}' is not available in sandboxed configuration`
            );
        }
      },

      // No access to global object properties
      global: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      Buffer: undefined,
    };

    return sandbox;
  }

  /**
   * Get current security mode
   */
  getSecurityMode(): ConfigSecurityMode {
    return this.securityMode;
  }

  /**
   * Set security mode (use with caution)
   */
  setSecurityMode(mode: ConfigSecurityMode): void {
    this.securityMode = mode;
  }

  /**
   * Get allowed modules for sandbox
   */
  getAllowedModules(): string[] {
    return Array.from(this.allowedModules);
  }

  /**
   * Add allowed module for sandbox
   */
  addAllowedModule(moduleName: string): void {
    this.allowedModules.add(moduleName);
  }

  /**
   * Remove allowed module from sandbox
   */
  removeAllowedModule(moduleName: string): void {
    this.allowedModules.delete(moduleName);
  }

  /**
   * Validate file path exists and is readable
   */
  private async validateFilePathSecure(filePath: string): Promise<string> {
    const absolutePath = path.resolve(filePath);

    if (path.extname(absolutePath) !== '.js') {
      throw createError('CONFIG_VALIDATION_ERROR', {
        message: 'Configuration file must have .js extension',
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

    return absolutePath;
  }

  /**
   * Validate that a configuration file is safe to load
   */
  async validateConfigSecurity(
    filePath: string
  ): Promise<{ safe: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');

      // Check for dangerous patterns
      try {
        this.performBasicSecurityCheck(content, filePath);
      } catch (error) {
        if (error instanceof Error) {
          issues.push(error.message);
        }
      }

      // Additional checks can be added here

      return {
        safe: issues.length === 0,
        issues,
      };
    } catch (error) {
      return {
        safe: false,
        issues: [
          `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  }
}

/**
 * Create a secure configuration loader instance
 */
export function createSecureConfigLoader(
  options?: SecureConfigLoaderOptions
): SecureConfigLoader {
  return new SecureConfigLoader(options);
}
