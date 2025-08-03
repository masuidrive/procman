/**
 * Unit tests for AppLogger class functionality
 * Note: AppLogger is a private class, so we test it through LogManager
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LogManager } from '../../src/services/log-manager.js';
import { LogEntry } from '../../src/shared/logs.js';

describe('AppLogger Unit Tests', () => {
  let logManager: LogManager;
  let tempLogDir: string;

  beforeEach(() => {
    tempLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procman-test-'));
    logManager = new LogManager(tempLogDir);
  });

  afterEach(async () => {
    await logManager.close();
    if (fs.existsSync(tempLogDir)) {
      fs.rmSync(tempLogDir, { recursive: true, force: true });
    }
  });

  describe('Log Priority Tests', () => {
    test('should prioritize outFile + errorFile over logFile', async () => {
      const config = {
        logFile: path.join(tempLogDir, 'combined.jsonl'),
        outFile: path.join(tempLogDir, 'stdout.jsonl'),
        errorFile: path.join(tempLogDir, 'stderr.jsonl'),
      };

      logManager.setupAppLogs('priority-test', config);

      logManager.writeLog('priority-test', 'stdout', 'stdout message');
      logManager.writeLog('priority-test', 'stderr', 'stderr message');

      // Flush buffer to ensure async writes complete
      await logManager.flushBuffer('priority-test');

      expect(fs.existsSync(config.outFile)).toBe(true);
      expect(fs.existsSync(config.errorFile)).toBe(true);
      expect(fs.existsSync(config.logFile)).toBe(false);

      // Check content of separate files
      const stdoutContent = fs.readFileSync(config.outFile, 'utf8');
      const stderrContent = fs.readFileSync(config.errorFile, 'utf8');

      const stdoutEntry = JSON.parse(stdoutContent.trim()) as LogEntry;
      const stderrEntry = JSON.parse(stderrContent.trim()) as LogEntry;

      expect(stdoutEntry.message).toBe('stdout message');
      expect(stdoutEntry.type).toBe('stdout');
      expect(stderrEntry.message).toBe('stderr message');
      expect(stderrEntry.type).toBe('stderr');
    });

    test('should use logFile when only logFile is specified', async () => {
      const config = {
        logFile: path.join(tempLogDir, 'combined.jsonl'),
      };

      logManager.setupAppLogs('combined-test', config);

      logManager.writeLog('combined-test', 'stdout', 'stdout message');
      logManager.writeLog('combined-test', 'stderr', 'stderr message');

      // Flush buffer to ensure async writes complete
      await logManager.flushBuffer('combined-test');

      expect(fs.existsSync(config.logFile)).toBe(true);

      // Both stdout and stderr should go to the same file
      const content = fs.readFileSync(config.logFile, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);

      const entries = lines.map((line) => JSON.parse(line) as LogEntry);
      expect(entries[0].message).toBe('stdout message');
      expect(entries[0].type).toBe('stdout');
      expect(entries[1].message).toBe('stderr message');
      expect(entries[1].type).toBe('stderr');
    });

    test('should use default path when no files specified', async () => {
      logManager.setupAppLogs('default-test');
      logManager.writeLog('default-test', 'stdout', 'test message');

      // Flush buffer to ensure async writes complete
      await logManager.flushBuffer('default-test');

      const defaultFile = path.join(tempLogDir, 'default-test.jsonl');
      expect(fs.existsSync(defaultFile)).toBe(true);

      const content = fs.readFileSync(defaultFile, 'utf8');
      const entry = JSON.parse(content.trim()) as LogEntry;
      expect(entry.message).toBe('test message');
      expect(entry.app).toBe('default-test');
      expect(entry.namespace).toBe('default');
    });
  });

  describe('Log Level Determination', () => {
    test('should determine log levels correctly for stdout', () => {
      logManager.setupAppLogs('level-test');

      logManager.writeLog('level-test', 'stdout', 'Fatal error occurred');
      logManager.writeLog(
        'level-test',
        'stdout',
        'Error: something went wrong'
      );
      logManager.writeLog(
        'level-test',
        'stdout',
        'Warning: deprecated function'
      );
      logManager.writeLog('level-test', 'stdout', 'Warn: please update');
      logManager.writeLog('level-test', 'stdout', 'Normal info message');

      const logFile = path.join(tempLogDir, 'level-test.jsonl');
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');

      const entries = lines.map((line) => JSON.parse(line) as LogEntry);

      expect(entries[0].level).toBe('error'); // Fatal error
      expect(entries[1].level).toBe('error'); // Error:
      expect(entries[2].level).toBe('warn'); // Warning:
      expect(entries[3].level).toBe('warn'); // Warn:
      expect(entries[4].level).toBe('info'); // Normal message
    });

    test('should determine log levels correctly for stderr', () => {
      logManager.setupAppLogs('stderr-level-test');

      logManager.writeLog(
        'stderr-level-test',
        'stderr',
        'Fatal error in stderr'
      );
      logManager.writeLog(
        'stderr-level-test',
        'stderr',
        'Error: critical failure'
      );
      logManager.writeLog(
        'stderr-level-test',
        'stderr',
        'Normal stderr message'
      );

      const logFile = path.join(tempLogDir, 'stderr-level-test.jsonl');
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');

      const entries = lines.map((line) => JSON.parse(line) as LogEntry);

      expect(entries[0].level).toBe('error'); // Fatal error
      expect(entries[1].level).toBe('error'); // Error:
      expect(entries[2].level).toBe('warn'); // Normal stderr defaults to warn
    });
  });

  describe('File Permissions', () => {
    test('should create log files with correct permissions (0644)', () => {
      logManager.setupAppLogs('perm-test');
      logManager.writeLog('perm-test', 'stdout', 'test message');

      const logFile = path.join(tempLogDir, 'perm-test.jsonl');
      expect(fs.existsSync(logFile)).toBe(true);

      const stats = fs.statSync(logFile);
      const mode = stats.mode & parseInt('777', 8);
      expect(mode).toBe(parseInt('644', 8));
    });

    test('should create separate files with correct permissions', () => {
      const config = {
        outFile: path.join(tempLogDir, 'separate-out.jsonl'),
        errorFile: path.join(tempLogDir, 'separate-err.jsonl'),
      };

      logManager.setupAppLogs('separate-test', config);
      logManager.writeLog('separate-test', 'stdout', 'stdout message');
      logManager.writeLog('separate-test', 'stderr', 'stderr message');

      expect(fs.existsSync(config.outFile)).toBe(true);
      expect(fs.existsSync(config.errorFile)).toBe(true);

      const outStats = fs.statSync(config.outFile);
      const errStats = fs.statSync(config.errorFile);

      const outMode = outStats.mode & parseInt('777', 8);
      const errMode = errStats.mode & parseInt('777', 8);

      expect(outMode).toBe(parseInt('644', 8));
      expect(errMode).toBe(parseInt('644', 8));
    });
  });

  describe('Real-time Events', () => {
    test('should emit log events when writing logs', async () => {
      const expectedMessage = 'streaming test message';

      logManager.setupAppLogs('stream-test');

      const logEventPromise = new Promise<LogEntry>((resolve) => {
        logManager.once('log', (logEntry: LogEntry) => {
          resolve(logEntry);
        });
      });

      logManager.writeLog('stream-test', 'stdout', expectedMessage);

      const logEntry = await logEventPromise;
      expect(logEntry.message).toBe(expectedMessage);
      expect(logEntry.app).toBe('stream-test');
      expect(logEntry.type).toBe('stdout');
      expect(logEntry.namespace).toBe('default');
    });

    test('should emit events for both stdout and stderr', async () => {
      const events: LogEntry[] = [];

      logManager.setupAppLogs('multi-stream-test');

      logManager.on('log', (logEntry: LogEntry) => {
        events.push(logEntry);
      });

      logManager.writeLog('multi-stream-test', 'stdout', 'stdout message');
      logManager.writeLog('multi-stream-test', 'stderr', 'stderr message');

      // Wait for events to be emitted (event-based)
      await new Promise<void>((resolve) => {
        if (events.length >= 2) {
          resolve();
        } else {
          const checkEvents = () => {
            if (events.length >= 2) {
              resolve();
            } else {
              // 少し短い間隔でチェック（イベントベースのアプローチ）
              process.nextTick(checkEvents);
            }
          };
          checkEvents();
        }
      });

      expect(events).toHaveLength(2);
      expect(events[0].message).toBe('stdout message');
      expect(events[0].type).toBe('stdout');
      expect(events[1].message).toBe('stderr message');
      expect(events[1].type).toBe('stderr');
    });
  });

  describe('Namespace Configuration', () => {
    test('should use custom namespace', () => {
      const config = {
        namespace: 'custom-namespace',
      };

      logManager.setupAppLogs('namespace-test', config);
      logManager.writeLog('namespace-test', 'stdout', 'test message');

      const logFile = path.join(tempLogDir, 'namespace-test.jsonl');
      const content = fs.readFileSync(logFile, 'utf8');
      const entry = JSON.parse(content.trim()) as LogEntry;

      expect(entry.namespace).toBe('custom-namespace');
      expect(entry.app).toBe('namespace-test');
    });

    test('should default to "default" namespace when not specified', () => {
      logManager.setupAppLogs('default-namespace-test');
      logManager.writeLog('default-namespace-test', 'stdout', 'test message');

      const logFile = path.join(tempLogDir, 'default-namespace-test.jsonl');
      const content = fs.readFileSync(logFile, 'utf8');
      const entry = JSON.parse(content.trim()) as LogEntry;

      expect(entry.namespace).toBe('default');
    });
  });

  describe('Error Handling', () => {
    test('should handle concurrent access safely', () => {
      logManager.setupAppLogs('concurrent-test');

      // Simulate concurrent writes
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve().then(() => {
            logManager.writeLog(
              'concurrent-test',
              'stdout',
              `Concurrent message ${i}`
            );
          })
        );
      }

      return Promise.all(promises).then(() => {
        const logFile = path.join(tempLogDir, 'concurrent-test.jsonl');
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content
          .trim()
          .split('\n')
          .filter((line) => line);

        expect(lines).toHaveLength(10);

        // Verify all messages are valid JSON
        lines.forEach((line) => {
          expect(() => JSON.parse(line)).not.toThrow();
        });
      });
    });
  });
});
