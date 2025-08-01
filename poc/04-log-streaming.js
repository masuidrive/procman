#!/usr/bin/env node

/**
 * PoC: ログストリーミングの検証
 * JSONL形式のログファイル監視とリアルタイムストリーミングをテスト
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { promisify } = require('util');

class LogManager extends EventEmitter {
  constructor(logDir) {
    super();
    this.logDir = logDir || path.join(process.cwd(), 'test-logs');
    this.logFiles = new Map(); // appName -> logFile info
    this.watchers = new Map(); // appName -> fs.FSWatcher
    this.streams = new Map(); // appName -> write streams
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
      console.log(`[LogManager] Created log directory: ${this.logDir}`);
    }
  }

  /**
   * アプリケーションのログファイルを設定
   */
  setupAppLogs(appName, config = {}) {
    const {
      logFile = null,
      outFile = null,
      errorFile = null,
      namespace = 'default'
    } = config;

    console.log(`[LogManager] Setting up logs for app: ${appName}`);

    const logInfo = {
      appName,
      namespace,
      logFile: logFile || path.join(this.logDir, `${appName}.jsonl`),
      outFile: outFile || (logFile ? null : path.join(this.logDir, `${appName}-out.jsonl`)),
      errorFile: errorFile || (logFile ? null : path.join(this.logDir, `${appName}-error.jsonl`)),
      streams: {}
    };

    // ログファイルのストリームを作成
    if (logInfo.logFile) {
      logInfo.streams.combined = fs.createWriteStream(logInfo.logFile, { flags: 'a' });
    }
    if (logInfo.outFile) {
      logInfo.streams.stdout = fs.createWriteStream(logInfo.outFile, { flags: 'a' });
    }
    if (logInfo.errorFile) {
      logInfo.streams.stderr = fs.createWriteStream(logInfo.errorFile, { flags: 'a' });
    }

    this.logFiles.set(appName, logInfo);
    console.log(`[LogManager] Log files configured for ${appName}`);

    return logInfo;
  }

  /**
   * ログエントリを記録
   */
  writeLog(appName, type, message) {
    const logInfo = this.logFiles.get(appName);
    if (!logInfo) {
      console.warn(`[LogManager] No log configuration for app: ${appName}`);
      return;
    }

    const logEntry = {
      timestamp: Date.now(),
      level: 'info',
      message: message.toString().trim(),
      app: appName,
      namespace: logInfo.namespace,
      type: type // 'stdout', 'stderr'
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    // 統合ログファイルに書き込み
    if (logInfo.streams.combined) {
      logInfo.streams.combined.write(logLine);
    }

    // タイプ別ログファイルに書き込み
    if (type === 'stdout' && logInfo.streams.stdout) {
      logInfo.streams.stdout.write(logLine);
    } else if (type === 'stderr' && logInfo.streams.stderr) {
      logInfo.streams.stderr.write(logLine);
    }

    // イベント発行
    this.emit('log', logEntry);
  }

  /**
   * ログファイルの監視を開始
   */
  startWatching(appName) {
    const logInfo = this.logFiles.get(appName);
    if (!logInfo) {
      throw new Error(`No log configuration for app: ${appName}`);
    }

    console.log(`[LogManager] Starting log watch for app: ${appName}`);

    // 既存のwatcherがあれば停止
    this.stopWatching(appName);

    const filesToWatch = [];
    if (logInfo.logFile) filesToWatch.push({ file: logInfo.logFile, type: 'combined' });
    if (logInfo.outFile) filesToWatch.push({ file: logInfo.outFile, type: 'stdout' });
    if (logInfo.errorFile) filesToWatch.push({ file: logInfo.errorFile, type: 'stderr' });

    const watchers = [];

    for (const { file, type } of filesToWatch) {
      if (fs.existsSync(file)) {
        try {
          const watcher = fs.watch(file, (eventType, filename) => {
            if (eventType === 'change') {
              this.emit('fileChange', { appName, file, type });
            }
          });
          watchers.push(watcher);
          console.log(`[LogManager] Watching ${type} log: ${file}`);
        } catch (error) {
          console.warn(`[LogManager] Failed to watch ${file}: ${error.message}`);
        }
      }
    }

    if (watchers.length > 0) {
      this.watchers.set(appName, watchers);
    }
  }

  /**
   * ログファイルの監視を停止
   */
  stopWatching(appName) {
    const watchers = this.watchers.get(appName);
    if (watchers) {
      for (const watcher of watchers) {
        watcher.close();
      }
      this.watchers.delete(appName);
      console.log(`[LogManager] Stopped watching logs for app: ${appName}`);
    }
  }

  /**
   * ログファイルを読み込み（最新N行）
   */
  async readLogs(appName, options = {}) {
    const { lines = 100, type = 'combined' } = options;
    
    const logInfo = this.logFiles.get(appName);
    if (!logInfo) {
      throw new Error(`No log configuration for app: ${appName}`);
    }

    let logFile;
    switch (type) {
      case 'combined':
        logFile = logInfo.logFile;
        break;
      case 'stdout':
        logFile = logInfo.outFile || logInfo.logFile;
        break;
      case 'stderr':
        logFile = logInfo.errorFile || logInfo.logFile;
        break;
      default:
        throw new Error(`Invalid log type: ${type}`);
    }

    if (!logFile || !fs.existsSync(logFile)) {
      return [];
    }

    console.log(`[LogManager] Reading ${lines} lines from ${logFile}`);

    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      const recentLines = allLines.slice(-lines);
      
      const logEntries = [];
      for (const line of recentLines) {
        try {
          const entry = JSON.parse(line);
          logEntries.push(entry);
        } catch (parseError) {
          console.warn(`[LogManager] Failed to parse log line: ${line}`);
        }
      }

      return logEntries;
    } catch (error) {
      console.error(`[LogManager] Failed to read log file ${logFile}: ${error.message}`);
      return [];
    }
  }

  /**
   * ログファイルをクリア
   */
  async clearLogs(appName) {
    const logInfo = this.logFiles.get(appName);
    if (!logInfo) {
      throw new Error(`No log configuration for app: ${appName}`);
    }

    console.log(`[LogManager] Clearing logs for app: ${appName}`);

    const filesToClear = [];
    if (logInfo.logFile) filesToClear.push(logInfo.logFile);
    if (logInfo.outFile) filesToClear.push(logInfo.outFile);
    if (logInfo.errorFile) filesToClear.push(logInfo.errorFile);

    for (const file of filesToClear) {
      if (fs.existsSync(file)) {
        fs.writeFileSync(file, '');
        console.log(`[LogManager] Cleared: ${file}`);
      }
    }
  }

  /**
   * すべてのストリームを閉じる
   */
  async close() {
    console.log(`[LogManager] Closing all log streams and watchers`);

    // ファイル監視を停止
    for (const [appName] of this.watchers) {
      this.stopWatching(appName);
    }

    // ストリームを閉じる
    for (const [appName, logInfo] of this.logFiles) {
      for (const [streamType, stream] of Object.entries(logInfo.streams)) {
        if (stream && typeof stream.end === 'function') {
          stream.end();
        }
      }
    }

    this.logFiles.clear();
    this.watchers.clear();
    this.streams.clear();
  }

  /**
   * 人間が読みやすい形式でログを表示
   */
  formatLogForHuman(logEntry) {
    const timestamp = new Date(logEntry.timestamp);
    const timeStr = timestamp.toISOString().substring(11, 19); // HH:mm:ss
    const dateStr = timestamp.toISOString().substring(2, 10); // YY-MM-DD
    
    return `[${logEntry.app}] ${dateStr} ${timeStr} > ${logEntry.message}`;
  }
}

// Test runner
async function runTest() {
  console.log(`=== Log Streaming PoC ===`);
  
  const testLogDir = path.join(__dirname, 'test-logs');
  const logManager = new LogManager(testLogDir);

  // イベントリスナーを設定
  logManager.on('log', (logEntry) => {
    console.log(`[Event] New log: ${logManager.formatLogForHuman(logEntry)}`);
  });

  logManager.on('fileChange', ({ appName, file, type }) => {
    console.log(`[Event] File changed: ${appName} (${type})`);
  });

  try {
    // Test 1: アプリケーションログの設定
    console.log(`\n--- Test 1: Setting up application logs ---`);
    logManager.setupAppLogs('test-app', {
      namespace: 'dev'
    });

    logManager.setupAppLogs('web-server', {
      namespace: 'web',
      outFile: path.join(testLogDir, 'custom-out.jsonl'),
      errorFile: path.join(testLogDir, 'custom-error.jsonl')
    });

    // Test 2: ログの書き込み
    console.log(`\n--- Test 2: Writing logs ---`);
    logManager.writeLog('test-app', 'stdout', 'Application started');
    logManager.writeLog('test-app', 'stdout', 'Processing request...');
    logManager.writeLog('test-app', 'stderr', 'Warning: deprecated API used');
    
    logManager.writeLog('web-server', 'stdout', 'Server listening on port 3000');
    logManager.writeLog('web-server', 'stderr', 'Database connection failed');

    // Test 3: ログファイル監視
    console.log(`\n--- Test 3: Starting log file watching ---`);
    logManager.startWatching('test-app');
    
    // 追加のログを書き込み（ファイル変更を発生させる）
    setTimeout(() => {
      logManager.writeLog('test-app', 'stdout', 'Additional log entry');
      logManager.writeLog('test-app', 'stdout', 'Another log entry');
    }, 500);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 4: ログの読み込み
    console.log(`\n--- Test 4: Reading logs ---`);
    const logs = await logManager.readLogs('test-app', { lines: 5 });
    console.log(`Read ${logs.length} log entries:`);
    for (const log of logs) {
      console.log(`  ${logManager.formatLogForHuman(log)}`);
    }

    // Test 5: 異なるログタイプの読み込み
    console.log(`\n--- Test 5: Reading stdout logs only ---`);
    const stdoutLogs = await logManager.readLogs('test-app', { lines: 10, type: 'stdout' });
    console.log(`Read ${stdoutLogs.length} stdout entries`);

    // Test 6: ログのクリア
    console.log(`\n--- Test 6: Clearing logs ---`);
    await logManager.clearLogs('test-app');
    
    const clearedLogs = await logManager.readLogs('test-app');
    console.log(`After clearing: ${clearedLogs.length} log entries`);

    // Test 7: 大量ログの性能テスト
    console.log(`\n--- Test 7: Performance test with many logs ---`);
    const startTime = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      logManager.writeLog('test-app', 'stdout', `Performance test log entry ${i}`);
    }
    
    const writeTime = Date.now() - startTime;
    console.log(`Wrote 1000 log entries in ${writeTime}ms`);

    const readStartTime = Date.now();
    const manyLogs = await logManager.readLogs('test-app', { lines: 100 });
    const readTime = Date.now() - readStartTime;
    console.log(`Read ${manyLogs.length} log entries in ${readTime}ms`);

    console.log(`\n--- Test completed successfully ---`);

  } catch (error) {
    console.error(`Test failed:`, error.message);
    process.exit(1);
  } finally {
    // Cleanup
    await logManager.close();
    
    // Remove test directory
    try {
      if (fs.existsSync(testLogDir)) {
        const files = fs.readdirSync(testLogDir);
        for (const file of files) {
          fs.unlinkSync(path.join(testLogDir, file));
        }
        fs.rmdirSync(testLogDir);
        console.log(`[Cleanup] Removed test log directory`);
      }
    } catch (cleanupError) {
      console.warn('Cleanup warning:', cleanupError.message);
    }
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  process.exit(0);
});

// Run the test
if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = { LogManager };