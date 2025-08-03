/**
 * Unit tests for LogManager class
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LogManager } from '../../src/services/log-manager.js';
import { LogEntry } from '../../src/shared/logs.js';

describe('LogManager Unit Tests', () => {
  let logManager: LogManager;
  let tempLogDir: string;

  beforeEach(() => {
    // Create temporary log directory for tests
    tempLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procman-test-'));
    logManager = new LogManager(tempLogDir);
  });

  afterEach(async () => {
    // Clean up resources
    await logManager.close();

    // Remove temporary directory
    if (fs.existsSync(tempLogDir)) {
      fs.rmSync(tempLogDir, { recursive: true, force: true });
    }
  });

  describe('Basic Functionality', () => {
    test('should create log directory on initialization', () => {
      expect(fs.existsSync(tempLogDir)).toBe(true);

      const stats = fs.statSync(tempLogDir);
      expect(stats.isDirectory()).toBe(true);
    });

    test('should setup app logs with default configuration', () => {
      expect(() => logManager.setupAppLogs('test-app')).not.toThrow();
      expect(logManager.getAppNames()).toContain('test-app');
    });

    test('should write and read logs with default configuration', async () => {
      logManager.setupAppLogs('test-app');
      logManager.writeLog('test-app', 'stdout', 'Test message');

      // Flush buffer to ensure async writes complete
      await logManager.flushBuffer('test-app');

      // For default configuration, logs go to [app-name].jsonl file
      const logFile = path.join(tempLogDir, 'test-app.jsonl');
      expect(fs.existsSync(logFile)).toBe(true);

      const content = fs.readFileSync(logFile, 'utf8');
      const logEntry = JSON.parse(content.trim()) as LogEntry;

      expect(logEntry.message).toBe('Test message');
      expect(logEntry.type).toBe('stdout');
      expect(logEntry.app).toBe('test-app');
      expect(logEntry.namespace).toBe('default');
      expect(logEntry.level).toBe('info');
      expect(typeof logEntry.timestamp).toBe('number');

      // Test reading logs through LogManager
      const logs = await logManager.readLogs('test-app');
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Test message');
    });

    test('should handle multiple log entries', async () => {
      logManager.setupAppLogs('multi-test');

      logManager.writeLog('multi-test', 'stdout', 'Message 1');
      logManager.writeLog('multi-test', 'stderr', 'Error message');
      logManager.writeLog('multi-test', 'stdout', 'Message 3');

      // Flush buffer to ensure async writes complete
      await logManager.flushBuffer('multi-test');

      const logFile = path.join(tempLogDir, 'multi-test.jsonl');
      expect(fs.existsSync(logFile)).toBe(true);

      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      const entries = lines.map((line) => JSON.parse(line) as LogEntry);
      expect(entries[0].message).toBe('Message 1');
      expect(entries[0].type).toBe('stdout');
      expect(entries[1].message).toBe('Error message');
      expect(entries[1].type).toBe('stderr');
      expect(entries[2].message).toBe('Message 3');
      expect(entries[2].type).toBe('stdout');
    });
  });

  describe('Log Priority Configuration', () => {
    test('should use logFile when only logFile is specified', () => {
      const config = {
        logFile: path.join(tempLogDir, 'combined.jsonl'),
      };

      logManager.setupAppLogs('combined-test', config);

      logManager.writeLog('combined-test', 'stdout', 'stdout message');
      logManager.writeLog('combined-test', 'stderr', 'stderr message');

      expect(fs.existsSync(config.logFile)).toBe(true);
    });

    test('should prioritize outFile + errorFile over logFile', () => {
      const config = {
        logFile: path.join(tempLogDir, 'combined.jsonl'),
        outFile: path.join(tempLogDir, 'stdout.jsonl'),
        errorFile: path.join(tempLogDir, 'stderr.jsonl'),
      };

      logManager.setupAppLogs('priority-test', config);

      logManager.writeLog('priority-test', 'stdout', 'stdout message');
      logManager.writeLog('priority-test', 'stderr', 'stderr message');

      // outFile and errorFile should be created
      expect(fs.existsSync(config.outFile)).toBe(true);
      expect(fs.existsSync(config.errorFile)).toBe(true);

      // logFile should be ignored (not created)
      expect(fs.existsSync(config.logFile)).toBe(false);
    });
  });

  describe('Log Level Determination', () => {
    test('should determine log levels correctly', async () => {
      logManager.setupAppLogs('level-test');

      // stdout with error keyword should be 'error'
      logManager.writeLog('level-test', 'stdout', 'Fatal error occurred');

      // stdout with warn keyword should be 'warn'
      logManager.writeLog(
        'level-test',
        'stdout',
        'Warning: deprecated function'
      );

      // stderr with error keyword should be 'error'
      logManager.writeLog('level-test', 'stderr', 'Error: file not found');

      // normal stdout should be 'info'
      logManager.writeLog('level-test', 'stdout', 'Normal message');

      // normal stderr should be 'warn'
      logManager.writeLog('level-test', 'stderr', 'Normal stderr message');

      // Flush buffer to ensure async writes complete
      await logManager.flushBuffer('level-test');

      const logFile = path.join(tempLogDir, 'level-test.jsonl');
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');

      const entries = lines.map((line) => JSON.parse(line) as LogEntry);

      expect(entries[0].level).toBe('error'); // Fatal error
      expect(entries[1].level).toBe('warn'); // Warning
      expect(entries[2].level).toBe('error'); // Error
      expect(entries[3].level).toBe('info'); // Normal message
      expect(entries[4].level).toBe('warn'); // Normal stderr
    });
  });

  describe('Performance Tests', () => {
    test('should handle 1000 log entries within 50ms', async () => {
      logManager.setupAppLogs('perf-test');

      const startTime = Date.now();

      // Write 1000 log entries
      for (let i = 0; i < 1000; i++) {
        logManager.writeLog(
          'perf-test',
          'stdout',
          `Performance test message ${i}`
        );
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within 50ms (specification requirement)
      expect(duration).toBeLessThan(50);

      // Flush buffer to ensure async writes complete
      await logManager.flushBuffer('perf-test');

      // Verify file was created and has correct number of entries
      const logFile = path.join(tempLogDir, 'perf-test.jsonl');
      expect(fs.existsSync(logFile)).toBe(true);

      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1000);
    });
  });

  describe('Error Handling', () => {
    test('should handle writing to non-existent app gracefully', () => {
      // Should warn but not throw
      expect(() => {
        logManager.writeLog('unknown-app', 'stdout', 'test message');
      }).not.toThrow();
    });

    test('should handle reading from non-existent app', async () => {
      await expect(logManager.readLogs('non-existent-app')).rejects.toThrow(
        'No log configuration for app: non-existent-app'
      );
    });
  });

  describe('Log Management Operations', () => {
    test('should clear logs for specific app', async () => {
      logManager.setupAppLogs('clear-test');

      // Write some logs
      logManager.writeLog('clear-test', 'stdout', 'message 1');
      logManager.writeLog('clear-test', 'stdout', 'message 2');

      // Flush buffer to ensure async writes complete
      await logManager.flushBuffer('clear-test');

      const logFile = path.join(tempLogDir, 'clear-test.jsonl');
      expect(fs.existsSync(logFile)).toBe(true);
      expect(fs.readFileSync(logFile, 'utf8').trim()).not.toBe('');

      // Clear logs
      await logManager.clearLogs('clear-test');

      // File should exist but be empty
      expect(fs.existsSync(logFile)).toBe(true);
      expect(fs.readFileSync(logFile, 'utf8')).toBe('');
    });

    test('should get log statistics', async () => {
      logManager.setupAppLogs('stats-test');

      logManager.writeLog('stats-test', 'stdout', 'test message 1');
      logManager.writeLog('stats-test', 'stdout', 'test message 2');

      // Flush buffer to ensure async writes complete
      await logManager.flushBuffer('stats-test');

      const stats = logManager.getLogStats('stats-test');

      expect(stats.logFileSize).toBeGreaterThan(0);
      expect(typeof stats.lastModified).toBe('number');
      expect(stats.lastModified).toBeGreaterThan(0);
    });
  });

  describe('Human-readable Formatting', () => {
    test('should format log entry for human reading', () => {
      const logEntry: LogEntry = {
        timestamp: new Date('2025-08-03T12:30:45.123Z').getTime(),
        level: 'info',
        message: 'Test message',
        app: 'test-app',
        namespace: 'default',
        type: 'stdout',
      };

      const formatted = logManager.formatLogForHuman(logEntry);

      // Format should be: [app] YY-MM-DD HH:mm:ss > message
      expect(formatted).toMatch(
        /^\[test-app\] \d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} > Test message$/
      );
      expect(formatted).toContain('[test-app]');
      expect(formatted).toContain('Test message');
    });
  });
});
