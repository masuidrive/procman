#!/usr/bin/env node

/**
 * PoC: 設定ファイルの動的読み込み検証
 * CommonJS形式のJavaScriptファイルの安全な読み込みをテスト
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

class ConfigLoader {
  constructor() {
    this.loadedConfigs = new Map();
  }

  /**
   * 設定ファイルのパスを検証
   */
  validateConfigPath(configPath) {
    // 絶対パスに変換
    const absolutePath = path.resolve(configPath);
    
    // ファイルの存在確認
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Configuration file not found: ${absolutePath}`);
    }

    // ファイルかどうか確認
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      throw new Error(`Configuration path is not a file: ${absolutePath}`);
    }

    // JavaScript ファイルかどうか確認
    if (!absolutePath.endsWith('.js')) {
      throw new Error(`Configuration file must have .js extension: ${absolutePath}`);
    }

    return absolutePath;
  }

  /**
   * 設定ファイルを読み込んで検証
   */
  async loadConfig(configPath) {
    const absolutePath = this.validateConfigPath(configPath);
    
    console.log(`[ConfigLoader] Loading config from: ${absolutePath}`);

    try {
      // キャッシュをクリア（再読み込み対応）
      if (require.cache[absolutePath]) {
        delete require.cache[absolutePath];
      }

      // 設定ファイルを読み込み
      const config = require(absolutePath);
      
      // 設定の基本構造を検証
      this.validateConfig(config);

      // キャッシュに保存
      this.loadedConfigs.set(absolutePath, {
        config,
        loadTime: Date.now(),
        filePath: absolutePath
      });

      console.log(`[ConfigLoader] Config loaded successfully`);
      console.log(`[ConfigLoader] Found ${config.apps?.length || 0} applications`);

      return config;

    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error(`Failed to load configuration file: ${error.message}`);
      } else if (error instanceof SyntaxError) {
        throw new Error(`Configuration file has syntax errors: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * 設定の構造と内容を検証
   */
  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration must be an object');
    }

    if (!config.apps || !Array.isArray(config.apps)) {
      throw new Error('Configuration must have an "apps" array');
    }

    if (config.apps.length === 0) {
      throw new Error('No applications defined in configuration');
    }

    const names = new Set();

    for (let i = 0; i < config.apps.length; i++) {
      const app = config.apps[i];
      this.validateAppConfig(app, i);

      // 名前の重複チェック
      if (names.has(app.name)) {
        throw new Error(`Duplicate application name: ${app.name}`);
      }
      names.add(app.name);
    }
  }

  /**
   * アプリケーション設定を検証
   */
  validateAppConfig(app, index) {
    if (!app || typeof app !== 'object') {
      throw new Error(`Application config at index ${index} must be an object`);
    }

    // 必須項目のチェック
    if (!app.name || typeof app.name !== 'string') {
      throw new Error(`Application at index ${index} must have a valid "name" string`);
    }

    if (!app.script || typeof app.script !== 'string') {
      throw new Error(`Application "${app.name}" must have a valid "script" string`);
    }

    // 名前の形式チェック（英数字、ハイフン、アンダースコアのみ）
    if (!/^[a-zA-Z0-9_-]+$/.test(app.name)) {
      throw new Error(`Application name "${app.name}" contains invalid characters. Use only alphanumeric, hyphens, and underscores`);
    }

    // オプション項目の型チェック
    if (app.namespace && typeof app.namespace !== 'string') {
      throw new Error(`Application "${app.name}": namespace must be a string`);
    }

    if (app.args && typeof app.args !== 'string') {
      throw new Error(`Application "${app.name}": args must be a string`);
    }

    if (app.cwd && typeof app.cwd !== 'string') {
      throw new Error(`Application "${app.name}": cwd must be a string`);
    }

    if (app.note && typeof app.note !== 'string') {
      throw new Error(`Application "${app.name}": note must be a string`);
    }

    if (app.env && (typeof app.env !== 'object' || Array.isArray(app.env))) {
      throw new Error(`Application "${app.name}": env must be an object`);
    }

    if (app.max_memory_restart && typeof app.max_memory_restart !== 'string') {
      throw new Error(`Application "${app.name}": max_memory_restart must be a string`);
    }

    // メモリ制限の形式チェック
    if (app.max_memory_restart) {
      this.validateMemoryLimit(app.max_memory_restart, app.name);
    }

    // ログファイルパスのチェック
    const logFields = ['log_file', 'out_file', 'error_file'];
    for (const field of logFields) {
      if (app[field] && typeof app[field] !== 'string') {
        throw new Error(`Application "${app.name}": ${field} must be a string`);
      }
    }
  }

  /**
   * メモリ制限の形式を検証
   */
  validateMemoryLimit(limit, appName) {
    const pattern = /^(\d+)([KMGkmg]?)$/;
    const match = limit.match(pattern);
    
    if (!match) {
      throw new Error(`Application "${appName}": invalid memory limit format "${limit}". Use formats like "300M", "1G", "512K"`);
    }

    const [, number, unit] = match;
    const value = parseInt(number, 10);
    
    if (value <= 0) {
      throw new Error(`Application "${appName}": memory limit must be greater than 0`);
    }

    // 実際の制限値を計算（検証目的）
    const multipliers = {
      '': 1,
      'K': 1024, 'k': 1024,
      'M': 1024 * 1024, 'm': 1024 * 1024,
      'G': 1024 * 1024 * 1024, 'g': 1024 * 1024 * 1024
    };

    const bytes = value * (multipliers[unit] || 1);
    console.log(`[ConfigLoader] Memory limit for ${appName}: ${limit} = ${bytes} bytes`);
  }

  /**
   * 設定の詳細を表示
   */
  displayConfigSummary(config) {
    console.log('\n=== Configuration Summary ===');
    console.log(`Applications: ${config.apps.length}`);
    
    for (const app of config.apps) {
      console.log(`\n- ${app.name}:`);
      console.log(`  Script: ${app.script}`);
      console.log(`  Namespace: ${app.namespace || 'default'}`);
      console.log(`  Args: ${app.args || '(none)'}`);
      console.log(`  CWD: ${app.cwd || 'current directory'}`);
      console.log(`  Note: ${app.note || '(none)'}`);
      
      if (app.env && Object.keys(app.env).length > 0) {
        console.log(`  Environment variables: ${Object.keys(app.env).join(', ')}`);
      }
      
      if (app.max_memory_restart) {
        console.log(`  Memory limit: ${app.max_memory_restart}`);
      }
      
      const logFiles = [];
      if (app.log_file) logFiles.push(`combined: ${app.log_file}`);
      if (app.out_file) logFiles.push(`stdout: ${app.out_file}`);
      if (app.error_file) logFiles.push(`stderr: ${app.error_file}`);
      
      if (logFiles.length > 0) {
        console.log(`  Log files: ${logFiles.join(', ')}`);
      }
    }
  }

  /**
   * 設定のリロード
   */
  async reloadConfig(configPath) {
    const absolutePath = this.validateConfigPath(configPath);
    console.log(`[ConfigLoader] Reloading config from: ${absolutePath}`);
    
    return await this.loadConfig(absolutePath);
  }

  /**
   * 読み込み済み設定の一覧
   */
  getLoadedConfigs() {
    const result = [];
    for (const [path, info] of this.loadedConfigs) {
      result.push({
        path,
        loadTime: new Date(info.loadTime).toISOString(),
        appCount: info.config.apps?.length || 0
      });
    }
    return result;
  }
}

// Test runner
async function runTest() {
  console.log(`=== Configuration Loader PoC ===`);
  
  const loader = new ConfigLoader();
  const testConfigDir = path.join(__dirname, 'test-configs');

  // Create test directory
  if (!fs.existsSync(testConfigDir)) {
    fs.mkdirSync(testConfigDir, { recursive: true });
  }

  try {
    // Test 1: Create and load a valid config
    console.log(`\n--- Test 1: Valid configuration ---`);
    const validConfigPath = path.join(testConfigDir, 'valid.config.js');
    const validConfig = `
module.exports = {
  apps: [
    {
      name: "test-app",
      script: "node",
      args: "server.js",
      namespace: "dev",
      note: "Test application",
      cwd: "/tmp",
      env: {
        NODE_ENV: "development",
        PORT: "3000"
      },
      max_memory_restart: "500M"
    },
    {
      name: "another-app",
      script: "python3",
      args: "app.py",
      namespace: "prod"
    }
  ]
};
`;
    fs.writeFileSync(validConfigPath, validConfig);
    
    const config1 = await loader.loadConfig(validConfigPath);
    loader.displayConfigSummary(config1);

    // Test 2: Invalid config (missing required field)
    console.log(`\n--- Test 2: Invalid configuration (missing script) ---`);
    const invalidConfigPath = path.join(testConfigDir, 'invalid.config.js');
    const invalidConfig = `
module.exports = {
  apps: [
    {
      name: "invalid-app"
      // missing script field
    }
  ]
};
`;
    fs.writeFileSync(invalidConfigPath, invalidConfig);
    
    try {
      await loader.loadConfig(invalidConfigPath);
      console.error('ERROR: Should have failed validation');
    } catch (error) {
      console.log(`✓ Correctly rejected invalid config: ${error.message}`);
    }

    // Test 3: Syntax error config
    console.log(`\n--- Test 3: Syntax error in configuration ---`);
    const syntaxErrorConfigPath = path.join(testConfigDir, 'syntax-error.config.js');
    const syntaxErrorConfig = `
module.exports = {
  apps: [
    {
      name: "syntax-error-app",
      script: "node",
      // syntax error: missing comma
      args: "test.js"
      invalid: true
    }
  ]
`;
    fs.writeFileSync(syntaxErrorConfigPath, syntaxErrorConfig);
    
    try {
      await loader.loadConfig(syntaxErrorConfigPath);
      console.error('ERROR: Should have failed due to syntax error');
    } catch (error) {
      console.log(`✓ Correctly rejected config with syntax error: ${error.message}`);
    }

    // Test 4: Duplicate app names
    console.log(`\n--- Test 4: Duplicate application names ---`);
    const duplicateConfigPath = path.join(testConfigDir, 'duplicate.config.js');
    const duplicateConfig = `
module.exports = {
  apps: [
    {
      name: "duplicate-app",
      script: "node",
      args: "app1.js"
    },
    {
      name: "duplicate-app",
      script: "node", 
      args: "app2.js"
    }
  ]
};
`;
    fs.writeFileSync(duplicateConfigPath, duplicateConfig);
    
    try {
      await loader.loadConfig(duplicateConfigPath);
      console.error('ERROR: Should have failed due to duplicate names');
    } catch (error) {
      console.log(`✓ Correctly rejected config with duplicate names: ${error.message}`);
    }

    // Test 5: Config reload
    console.log(`\n--- Test 5: Configuration reload ---`);
    const reloadedConfig = await loader.reloadConfig(validConfigPath);
    console.log(`✓ Config reloaded successfully`);

    // Show loaded configs
    console.log(`\n--- Loaded configurations ---`);
    console.log(loader.getLoadedConfigs());

    console.log(`\n--- Test completed successfully ---`);

  } catch (error) {
    console.error(`Test failed:`, error.message);
    process.exit(1);
  } finally {
    // Cleanup test files
    try {
      if (fs.existsSync(testConfigDir)) {
        const files = fs.readdirSync(testConfigDir);
        for (const file of files) {
          fs.unlinkSync(path.join(testConfigDir, file));
        }
        fs.rmdirSync(testConfigDir);
      }
    } catch (cleanupError) {
      console.warn('Cleanup warning:', cleanupError.message);
    }
  }
}

// Run the test
if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = { ConfigLoader };