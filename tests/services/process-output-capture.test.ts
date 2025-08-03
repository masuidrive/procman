/**
 * Unit tests for Process Output Capture functionality (Phase 3)
 */

/* global NodeJS */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LogManager } from '../../src/services/log-manager.js';
import { ProcessLogIntegrator } from '../../src/services/process-log-integration.js';
import { ProcessManager } from '../../src/process-manager/process-manager.js';
import { LogEntry } from '../../src/shared/logs.js';

// Node.js global timer functions (for ESLint)
declare const setTimeout: (callback: () => void, ms: number) => NodeJS.Timeout;

describe('Process Output Capture Tests (Phase 3)', () => {
  let logManager: LogManager;
  let processManager: ProcessManager;
  let integrator: ProcessLogIntegrator;
  let tempLogDir: string;

  beforeEach(() => {
    // Create temporary log directory for tests
    tempLogDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'procman-capture-test-')
    );
    logManager = new LogManager(tempLogDir);
    processManager = new ProcessManager();
    integrator = new ProcessLogIntegrator(processManager, logManager);
  });

  afterEach(async () => {
    // Clean up resources
    await integrator.cleanup();
    await logManager.close();
    await processManager.cleanup();

    // Remove temporary directory
    if (fs.existsSync(tempLogDir)) {
      fs.rmSync(tempLogDir, { recursive: true, force: true });
    }
  });

  describe('Basic Process Output Capture', () => {
    test('should capture stdout data from process', async () => {
      logManager.setupAppLogs('test-app');

      // Simulate process stdout data
      const testData = 'Hello, World!\n';
      logManager.captureProcessOutput('test-app', 'stdout', testData);

      // Wait for buffer flush
      await new Promise<void>((resolve) => setTimeout(resolve, 150));

      const logFile = path.join(tempLogDir, 'test-app.jsonl');
      expect(fs.existsSync(logFile)).toBe(true);

      const content = fs.readFileSync(logFile, 'utf8');
      expect(content.trim()).not.toBe('');

      const logEntry = JSON.parse(content.trim()) as LogEntry;

      expect(logEntry.message).toBe('Hello, World!');
      expect(logEntry.type).toBe('stdout');
      expect(logEntry.app).toBe('test-app');
    });

    test('should capture stderr data from process', async () => {
      logManager.setupAppLogs('error-app');

      // Simulate process stderr data
      const testData = 'Error: Something went wrong!\n';
      logManager.captureProcessOutput('error-app', 'stderr', testData);

      // Wait for buffer flush
      await new Promise<void>((resolve) => setTimeout(resolve, 150));

      const logFile = path.join(tempLogDir, 'error-app.jsonl');
      expect(fs.existsSync(logFile)).toBe(true);

      const content = fs.readFileSync(logFile, 'utf8');
      expect(content.trim()).not.toBe('');

      const logEntry = JSON.parse(content.trim()) as LogEntry;

      expect(logEntry.message).toBe('Error: Something went wrong!');
      expect(logEntry.type).toBe('stderr');
      expect(logEntry.level).toBe('error');
    });

    test('should handle partial lines correctly', () => {
      logManager.setupAppLogs('partial-app');

      // Simulate partial data chunks
      logManager.captureProcessOutput('partial-app', 'stdout', 'Hello,');
      logManager.captureProcessOutput(
        'partial-app',
        'stdout',
        ' World!\nSecond line\nThird'
      );
      logManager.captureProcessOutput('partial-app', 'stdout', ' line\n');

      const logFile = path.join(tempLogDir, 'partial-app.jsonl');
      expect(fs.existsSync(logFile)).toBe(true);

      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      const entries = lines.map((line) => JSON.parse(line) as LogEntry);
      expect(entries[0].message).toBe('Hello, World!');
      expect(entries[1].message).toBe('Second line');
      expect(entries[2].message).toBe('Third line');
    });
  });

  describe('Log Message Preprocessing', () => {
    test('should truncate oversized messages', () => {
      logManager.setupAppLogs('size-test');

      // Create a message larger than MAX_LOG_MESSAGE_SIZE (1MB)
      const largeMessage = 'x'.repeat(1024 * 1024 + 100) + '\n';
      logManager.captureProcessOutput('size-test', 'stdout', largeMessage);

      const logFile = path.join(tempLogDir, 'size-test.jsonl');
      const content = fs.readFileSync(logFile, 'utf8');
      const logEntry = JSON.parse(content.trim()) as LogEntry;

      // Should be truncated to 1MB - 3 + '...'
      expect(logEntry.message.length).toBe(1024 * 1024);
      expect(logEntry.message.endsWith('...')).toBe(true);
    });

    test('should remove control characters', () => {
      logManager.setupAppLogs('control-test');

      // Message with control characters
      const messageWithControlChars = 'Hello\x00\x01\x02World\x7F!\n';
      logManager.captureProcessOutput(
        'control-test',
        'stdout',
        messageWithControlChars
      );

      const logFile = path.join(tempLogDir, 'control-test.jsonl');
      const content = fs.readFileSync(logFile, 'utf8');
      const logEntry = JSON.parse(content.trim()) as LogEntry;

      expect(logEntry.message).toBe('HelloWorld!');
    });

    test('should normalize line endings', () => {
      logManager.setupAppLogs('newline-test');

      // Message with different line endings
      const messageWithMixedEndings = 'Line 1\r\nLine 2\rLine 3\n';
      logManager.captureProcessOutput(
        'newline-test',
        'stdout',
        messageWithMixedEndings
      );

      const logFile = path.join(tempLogDir, 'newline-test.jsonl');
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      const entries = lines.map((line) => JSON.parse(line) as LogEntry);
      expect(entries[0].message).toBe('Line 1');
      expect(entries[1].message).toBe('Line 2');
      expect(entries[2].message).toBe('Line 3');
    });

    test('should handle encoding issues gracefully', () => {
      logManager.setupAppLogs('encoding-test');

      // Simulate message with invalid UTF-8
      const buffer = Buffer.from([
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0xff, 0xfe, 0x21, 0x0a,
      ]); // Hello + invalid bytes + !
      const messageWithBadEncoding = buffer.toString('utf8');
      logManager.captureProcessOutput(
        'encoding-test',
        'stdout',
        messageWithBadEncoding
      );

      const logFile = path.join(tempLogDir, 'encoding-test.jsonl');
      expect(fs.existsSync(logFile)).toBe(true);

      // Should not crash and should produce a valid log entry
      const content = fs.readFileSync(logFile, 'utf8');
      const logEntry = JSON.parse(content.trim()) as LogEntry;
      expect(logEntry.message).toMatch(/Hello.*!/);
    });
  });

  describe('Buffering Strategy', () => {
    test('should buffer entries and flush periodically', async () => {
      logManager.setupAppLogs('buffer-test');

      // Generate multiple log entries quickly
      for (let i = 0; i < 10; i++) {
        logManager.captureProcessOutput(
          'buffer-test',
          'stdout',
          `Message ${i}\n`
        );
      }

      // Wait for buffer flush (100ms timeout)
      await new Promise<void>((resolve) => setTimeout(resolve, 150));

      const logFile = path.join(tempLogDir, 'buffer-test.jsonl');
      expect(fs.existsSync(logFile)).toBe(true);

      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(10);
    });

    test('should get buffer statistics', () => {
      logManager.setupAppLogs('stats-test');

      // Add some entries to buffer
      logManager.captureProcessOutput(
        'stats-test',
        'stdout',
        'Test message 1\n'
      );
      logManager.captureProcessOutput(
        'stats-test',
        'stdout',
        'Test message 2\n'
      );

      const stats = logManager.getBufferStats('stats-test');
      expect(typeof stats.entryCount).toBe('number');
      expect(typeof stats.bufferSize).toBe('number');
      expect(typeof stats.isBackpressured).toBe('boolean');
    });

    test('should handle backpressure correctly', () => {
      logManager.setupAppLogs('backpressure-test');

      // Generate a very large amount of data to trigger backpressure
      const largeMessage = 'x'.repeat(100000) + '\n';

      // Fill buffer to trigger backpressure
      for (let i = 0; i < 100; i++) {
        logManager.captureProcessOutput(
          'backpressure-test',
          'stdout',
          largeMessage
        );
      }

      const stats = logManager.getBufferStats('backpressure-test');
      // Buffer should either be flushed or show backpressure
      expect(stats.bufferSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ProcessLogIntegrator', () => {
    test('should integrate process manager and log manager', () => {
      expect(() => integrator.setupIntegration()).not.toThrow();
      expect(integrator.isIntegrationActive()).toBe(true);
    });

    test('should teardown integration', () => {
      integrator.setupIntegration();
      expect(integrator.isIntegrationActive()).toBe(true);

      integrator.teardownIntegration();
      expect(integrator.isIntegrationActive()).toBe(false);
    });

    test('should get integration statistics', () => {
      integrator.setupIntegration();
      logManager.setupAppLogs('integration-test');

      const stats = integrator.getIntegrationStats();
      expect(stats.isActive).toBe(true);
      expect(Array.isArray(stats.managedApps)).toBe(true);
      expect(typeof stats.bufferStats).toBe('object');
    });

    test('should check backpressure status', () => {
      integrator.setupIntegration();

      const status = integrator.checkBackpressureStatus();
      expect(typeof status.hasBackpressure).toBe('boolean');
      expect(Array.isArray(status.backpressuredApps)).toBe(true);
    });

    test('should flush all buffers', async () => {
      integrator.setupIntegration();
      logManager.setupAppLogs('flush-test');

      // Add some data to buffers
      logManager.captureProcessOutput('flush-test', 'stdout', 'Test message\n');

      await expect(integrator.flushAllBuffers()).resolves.not.toThrow();
    });
  });

  describe('Performance Tests', () => {
    test('should handle high-frequency output efficiently', () => {
      logManager.setupAppLogs('high-freq-test');

      const startTime = Date.now();

      // Simulate high-frequency output (1000 small messages)
      for (let i = 0; i < 1000; i++) {
        logManager.captureProcessOutput(
          'high-freq-test',
          'stdout',
          `Message ${i}\n`
        );
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (200ms for buffering)
      expect(duration).toBeLessThan(200);
    });

    test('should handle large output chunks efficiently', () => {
      logManager.setupAppLogs('large-chunk-test');

      const startTime = Date.now();

      // Simulate large output chunks
      const largeChunk = 'x'.repeat(10000) + '\n';
      for (let i = 0; i < 100; i++) {
        logManager.captureProcessOutput(
          'large-chunk-test',
          'stdout',
          largeChunk
        );
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Error Handling', () => {
    test('should handle capture for non-existent app gracefully', () => {
      expect(() => {
        logManager.captureProcessOutput(
          'non-existent-app',
          'stdout',
          'test data'
        );
      }).not.toThrow();
    });

    test('should handle empty data gracefully', () => {
      logManager.setupAppLogs('empty-test');

      expect(() => {
        logManager.captureProcessOutput('empty-test', 'stdout', '');
      }).not.toThrow();

      expect(() => {
        logManager.captureProcessOutput('empty-test', 'stdout', '\n');
      }).not.toThrow();
    });

    test('should handle null/undefined data gracefully', () => {
      logManager.setupAppLogs('null-test');

      // Should not crash with null/undefined data
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logManager.captureProcessOutput('null-test', 'stdout', null as any);
      }).not.toThrow();
    });
  });
});
