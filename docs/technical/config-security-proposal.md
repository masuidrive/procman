# Configuration Loading Security Proposal

## Overview

This document outlines safer alternatives to using Node.js `require()` for loading configuration files in procman's ConfigLoader.

## Current Security Risks

The current implementation uses `require()` to dynamically load configuration files, which presents several security risks:
- **Arbitrary Code Execution**: Configuration files can execute any JavaScript code
- **Module Access**: Configs have full access to Node.js modules and filesystem
- **No Sandboxing**: Code runs in the same context as the application

## Proposed Solutions

### 1. Hybrid Approach (Recommended Short-term)

Combine static analysis with VM-based sandboxing for JavaScript configurations.

```typescript
import * as vm from 'vm';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

class HybridConfigLoader {
  private readonly DANGEROUS_PATTERNS = [
    'require', 'import', 'eval', 'Function',
    'process', 'child_process', '__dirname', '__filename'
  ];

  private readonly ALLOWED_MODULES = new Set([
    'path', 'os', 'url', 'querystring'
  ]);

  async loadWithStaticAnalysis(filePath: string): Promise<ProcmanConfig> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    
    // Parse and analyze AST
    const ast = acorn.parse(content, { ecmaVersion: 2020 });
    const violations: string[] = [];
    
    walk.simple(ast, {
      Identifier: (node: any) => {
        if (this.DANGEROUS_PATTERNS.includes(node.name)) {
          violations.push(`Dangerous identifier: ${node.name}`);
        }
      },
      CallExpression: (node: any) => {
        if (node.callee.name === 'require') {
          const arg = node.arguments[0];
          if (arg.type === 'Literal' && !this.ALLOWED_MODULES.has(arg.value)) {
            violations.push(`Disallowed module: ${arg.value}`);
          }
        }
      }
    });
    
    if (violations.length > 0) {
      throw createError('CONFIG_SECURITY_ERROR', {
        message: 'Configuration contains dangerous patterns',
        details: { violations }
      });
    }
    
    return this.executeInSandbox(content);
  }

  private executeInSandbox(code: string): ProcmanConfig {
    const sandbox = {
      module: { exports: {} },
      exports: {},
      console: { log: () => {}, error: () => {}, warn: () => {} },
      process: { env: process.env },
      path: require('path'),
      os: require('os')
    };
    
    const script = new vm.Script(code, {
      filename: 'config.js',
      timeout: 1000
    });
    
    const context = vm.createContext(sandbox);
    script.runInContext(context);
    
    return sandbox.module.exports as ProcmanConfig;
  }
}
```

### 2. JSON with Handlebars Templates

Use JSON for static configuration with Handlebars for dynamic values.

```typescript
import * as Handlebars from 'handlebars';

interface TemplateConfig {
  apps: Array<{
    name: string;
    script: string;
    instances?: string;
    env?: Record<string, string>;
  }>;
}

class TemplateConfigLoader {
  private handlebars: typeof Handlebars;

  constructor() {
    this.handlebars = Handlebars.create();
    this.registerHelpers();
  }

  private registerHelpers(): void {
    this.handlebars.registerHelper('env', (key: string, defaultValue?: string) => {
      return process.env[key] || defaultValue || '';
    });

    this.handlebars.registerHelper('cpus', () => {
      return require('os').cpus().length;
    });

    this.handlebars.registerHelper('join', (...args: any[]) => {
      const paths = args.slice(0, -1);
      return require('path').join(...paths);
    });
  }

  async loadTemplate(filePath: string): Promise<ProcmanConfig> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const template = this.handlebars.compile(content);
    
    const context = {
      env: process.env,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd()
    };
    
    const rendered = template(context);
    return JSON.parse(rendered) as ProcmanConfig;
  }
}
```

Example template configuration:
```json
{
  "apps": [
    {
      "name": "api-server",
      "script": "{{join cwd 'dist' 'server.js'}}",
      "instances": "{{cpus}}",
      "env": {
        "NODE_ENV": "{{env 'NODE_ENV' 'production'}}",
        "PORT": "{{env 'PORT' '3000'}}"
      }
    }
  ]
}
```

### 3. Isolated VM with Explicit API

Use isolated-vm for maximum security with explicit API exposure.

```typescript
import ivm from 'isolated-vm';

class IsolatedConfigLoader {
  private isolate: ivm.Isolate;

  constructor() {
    this.isolate = new ivm.Isolate({ memoryLimit: 128 });
  }

  async loadIsolated(filePath: string): Promise<ProcmanConfig> {
    const code = await fs.promises.readFile(filePath, 'utf-8');
    const context = await this.isolate.createContext();
    
    // Expose safe APIs
    const jail = context.global;
    await jail.set('global', jail.derefInto());
    
    // Provide safe configuration API
    await jail.set('config', new ivm.Reference({
      setApp: (app: any) => {
        // Validate and store app configuration
      },
      env: (key: string) => process.env[key],
      cpus: () => require('os').cpus().length
    }));
    
    const script = await this.isolate.compileScript(code);
    await script.run(context, { timeout: 1000 });
    
    // Extract configuration
    const configRef = await jail.get('module.exports');
    const config = await configRef.copy();
    
    return this.validateConfig(config);
  }
  
  dispose(): void {
    this.isolate.dispose();
  }
}
```

## Migration Strategy

### Phase 1: Add Security Warnings
```typescript
class ConfigLoader {
  async load(filePath: string): Promise<ProcmanConfig> {
    console.warn(
      '⚠️  Using require() to load configuration. ' +
      'Consider migrating to secure loading modes. ' +
      'See: https://docs.procman.io/config-security'
    );
    return this.loadWithRequire(filePath);
  }
}
```

### Phase 2: Implement Security Modes
```typescript
export enum ConfigSecurityMode {
  LEGACY = 'legacy',      // Current require() approach
  HYBRID = 'hybrid',      // Static analysis + VM
  TEMPLATE = 'template',  // JSON + Handlebars
  ISOLATED = 'isolated'   // isolated-vm
}

class ConfigLoader {
  constructor(private options: ConfigLoaderOptions = {}) {
    this.securityMode = options.securityMode || ConfigSecurityMode.HYBRID;
  }
  
  async load(filePath: string): Promise<ProcmanConfig> {
    switch (this.securityMode) {
      case ConfigSecurityMode.LEGACY:
        return this.loadLegacy(filePath);
      case ConfigSecurityMode.HYBRID:
        return this.loadHybrid(filePath);
      case ConfigSecurityMode.TEMPLATE:
        return this.loadTemplate(filePath);
      case ConfigSecurityMode.ISOLATED:
        return this.loadIsolated(filePath);
    }
  }
}
```

### Phase 3: Configuration Migration Tool
```typescript
class ConfigMigrator {
  async migrateToTemplate(jsConfigPath: string): Promise<string> {
    // Load existing config
    const config = require(jsConfigPath);
    
    // Convert to template format
    const template = {
      apps: config.apps.map((app: any) => ({
        name: app.name,
        script: app.script,
        instances: typeof app.instances === 'function' 
          ? '{{cpus}}' 
          : app.instances,
        env: this.convertEnv(app.env)
      }))
    };
    
    return JSON.stringify(template, null, 2);
  }
}
```

## Performance Comparison

| Approach | Startup Time | Memory Usage | Security Level |
|----------|--------------|--------------|----------------|
| require() | ~1ms | Minimal | ⚠️ Low |
| Hybrid VM | ~5ms | +2MB | ✅ Medium |
| Templates | ~3ms | +1MB | ✅ High |
| isolated-vm | ~20ms | +10MB | ✅ Maximum |

## Recommendations

1. **Default to Hybrid Mode** for new installations
2. **Provide clear migration documentation** for existing users
3. **Support multiple modes** during transition period
4. **Add security audit logging** to track configuration loading
5. **Implement gradual deprecation** of legacy mode

## Example Implementation

```typescript
// Enhanced ConfigLoader with security modes
export class SecureConfigLoader extends ConfigLoader {
  private hybridLoader?: HybridConfigLoader;
  private templateLoader?: TemplateConfigLoader;
  private isolatedLoader?: IsolatedConfigLoader;

  async load(filePath: string, options?: LoadOptions): Promise<ProcmanConfig> {
    const mode = options?.securityMode || this.options.securityMode;
    
    // Log security mode for auditing
    this.logger.info(`Loading config with security mode: ${mode}`, {
      filePath,
      mode
    });
    
    try {
      switch (mode) {
        case ConfigSecurityMode.LEGACY:
          this.logger.warn('Using legacy require() mode - security risks present');
          return super.load(filePath);
          
        case ConfigSecurityMode.HYBRID:
          this.hybridLoader ||= new HybridConfigLoader();
          return await this.hybridLoader.loadWithStaticAnalysis(filePath);
          
        case ConfigSecurityMode.TEMPLATE:
          this.templateLoader ||= new TemplateConfigLoader();
          return await this.templateLoader.loadTemplate(filePath);
          
        case ConfigSecurityMode.ISOLATED:
          this.isolatedLoader ||= new IsolatedConfigLoader();
          return await this.isolatedLoader.loadIsolated(filePath);
          
        default:
          throw createError('CONFIG_SECURITY_ERROR', {
            message: `Unknown security mode: ${mode}`,
            details: { mode, filePath }
          });
      }
    } catch (error) {
      // Enhanced error reporting with security context
      throw createError('CONFIG_LOAD_ERROR', {
        message: `Failed to load config in ${mode} mode`,
        cause: error instanceof Error ? error : undefined,
        details: { mode, filePath }
      });
    }
  }
}
```

## Conclusion

By implementing these security enhancements, procman can provide a gradual migration path from the current `require()`-based approach to more secure configuration loading methods, while maintaining backward compatibility and developer experience.