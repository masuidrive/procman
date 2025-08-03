/**
 * True Unit tests for LogManager class with filesystem mocking
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { LogManager } from '../../src/services/log-manager.js';
import { LogEntry } from '../../src/shared/logs.js';

// Mock the filesystem operations
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  statSync: vi.fn(),
  openSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
  readFileSync: vi.fn(),
  watch: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  appendFile: vi.fn(),
}));

// Mock path and os modules
vi.mock('path', () => ({
  join: vi.fn((...parts) => parts.join('/')),
  dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/')),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/user'),
  tmpdir: vi.fn(() => '/tmp'),
}));

describe('LogManager Unit Tests (Mocked)', () => {
  let logManager: LogManager;

  // Mock implementations
  const mockFs = {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    openSync: vi.fn(),
    readSync: vi.fn(),
    closeSync: vi.fn(),
    readFileSync: vi.fn(),
    watch: vi.fn(),
    rmSync: vi.fn(),
  };

  const mockFsPromises = {
    appendFile: vi.fn(),
  };

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Default mock implementations
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.statSync.mockReturnValue({
      size: 100,
      isDirectory: () => true,
      mtime: new Date(),
    });
    mockFs.readFileSync.mockReturnValue('');
    mockFsPromises.appendFile.mockResolvedValue(undefined);

    // Import mocked modules
    const fs = await import('fs');
    const fsPromises = await import('fs/promises');

    Object.assign(fs, mockFs);
    Object.assign(fsPromises, mockFsPromises);

    logManager = new LogManager('/test/log/dir');
  });

  afterEach(async () => {
    await logManager.close();
  });

  describe('Constructor and Initialization', () => {
    test('should create log directory on initialization', () => {
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/log/dir', {
        recursive: true,
        mode: 0o700,
      });
    });

    test('should use default directory when not specified', () => {
      new LogManager(); // intentionally not assigned to test default behavior

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.masuidrive-procman/app-logs'),
        { recursive: true, mode: 0o700 }
      );
    });
  });

  describe('App Configuration', () => {
    test('should setup app logs with default configuration', () => {
      expect(() => logManager.setupAppLogs('test-app')).not.toThrow();
      expect(logManager.getAppNames()).toContain('test-app');
    });

    test('should setup app logs with custom configuration', () => {
      const config = {
        logFile: '/custom/log/path.jsonl',
        namespace: 'custom-namespace',
      };

      expect(() => logManager.setupAppLogs('custom-app', config)).not.toThrow();
      expect(logManager.getAppNames()).toContain('custom-app');
    });

    test('should replace existing app configuration', () => {
      logManager.setupAppLogs('test-app', { namespace: 'first' });
      logManager.setupAppLogs('test-app', { namespace: 'second' });

      expect(logManager.getAppNames()).toContain('test-app');
      expect(
        logManager.getAppNames().filter((name) => name === 'test-app')
      ).toHaveLength(1);
    });
  });

  describe('Log Writing', () => {
    beforeEach(() => {
      logManager.setupAppLogs('test-app');
    });

    test('should write stdout log entries', () => {
      logManager.writeLog('test-app', 'stdout', 'Test stdout message');

      expect(mockFsPromises.appendFile).toHaveBeenCalled();
    });

    test('should write stderr log entries', () => {
      logManager.writeLog('test-app', 'stderr', 'Test stderr message');

      expect(mockFsPromises.appendFile).toHaveBeenCalled();
    });

    test('should emit log events', async () => {
      const eventPromise = new Promise<LogEntry>((resolve) => {
        logManager.on('log', (logEntry: LogEntry) => {
          resolve(logEntry);
        });
      });

      logManager.writeLog('test-app', 'stdout', 'Event test message');

      const logEntry = await eventPromise;
      expect(logEntry.message).toBe('Event test message');
      expect(logEntry.app).toBe('test-app');
      expect(logEntry.type).toBe('stdout');
    });

    test('should handle backpressure gracefully', async () => {
      // Simulate many rapid writes to trigger backpressure
      for (let i = 0; i < 1000; i++) {
        logManager.writeLog('test-app', 'stdout', `Message ${i}`);
      }

      // Should not throw
      expect(() =>
        logManager.writeLog('test-app', 'stdout', 'Final message')
      ).not.toThrow();
    });
  });

  describe('Process Output Capture', () => {
    beforeEach(() => {
      logManager.setupAppLogs('capture-test');
    });

    test('should capture complete lines', () => {
      logManager.captureProcessOutput(
        'capture-test',
        'stdout',
        'Line 1\\nLine 2\\n'
      );

      expect(mockFsPromises.appendFile).toHaveBeenCalled();
    });

    test('should handle partial lines correctly', () => {
      logManager.captureProcessOutput('capture-test', 'stdout', 'Partial ');
      logManager.captureProcessOutput('capture-test', 'stdout', 'line\\n');

      expect(mockFsPromises.appendFile).toHaveBeenCalled();
    });

    test('should warn when no app configuration exists', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      logManager.captureProcessOutput('non-existent-app', 'stdout', 'test');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'No log configuration for app: non-existent-app'
        )
      );

      consoleSpy.mockRestore();
    });
  });

  describe('File Operations', () => {
    beforeEach(() => {
      logManager.setupAppLogs('file-test');
    });

    test('should start file watching', async () => {
      const mockWatcher = { close: vi.fn() };
      mockFs.watch.mockReturnValue(mockWatcher);
      mockFs.existsSync.mockReturnValue(true);

      await logManager.startWatching('file-test');

      expect(mockFs.watch).toHaveBeenCalled();
    });

    test('should stop file watching', () => {
      const mockWatcher = { close: vi.fn() };
      mockFs.watch.mockReturnValue(mockWatcher);
      mockFs.existsSync.mockReturnValue(true);

      logManager.startWatching('file-test');
      logManager.stopWatching('file-test');

      // Should not throw
      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });

  describe('Buffer Management', () => {
    beforeEach(() => {
      logManager.setupAppLogs('buffer-test');
    });

    test('should get buffer stats', () => {
      const stats = logManager.getBufferStats('buffer-test');

      expect(stats).toHaveProperty('entryCount');
      expect(stats).toHaveProperty('bufferSize');
      expect(stats).toHaveProperty('isBackpressured');
    });

    test('should get all buffer stats', () => {
      logManager.setupAppLogs('app1');
      logManager.setupAppLogs('app2');

      const allStats = logManager.getAllBufferStats();

      expect(allStats).toHaveProperty('app1');
      expect(allStats).toHaveProperty('app2');
    });

    test('should flush individual buffer', async () => {
      await expect(
        logManager.flushBuffer('buffer-test')
      ).resolves.not.toThrow();
    });

    test('should flush all buffers', async () => {
      logManager.setupAppLogs('app1');
      logManager.setupAppLogs('app2');

      await expect(logManager.flushAllBuffers()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle file write errors gracefully', async () => {
      mockFsPromises.appendFile.mockRejectedValue(new Error('Write failed'));

      logManager.setupAppLogs('error-test');
      logManager.writeLog('error-test', 'stdout', 'Test message');

      // Should not throw
      await expect(logManager.flushBuffer('error-test')).resolves.not.toThrow();
    });

    test('should handle disk space errors', async () => {
      const diskSpaceError = new Error('ENOSPC: no space left on device');
      mockFsPromises.appendFile.mockRejectedValue(diskSpaceError);

      let diskSpaceEvent = false;
      logManager.on('diskSpaceError', () => {
        diskSpaceEvent = true;
      });

      logManager.setupAppLogs('disk-test');
      logManager.writeLog('disk-test', 'stdout', 'Test message');

      await logManager.flushBuffer('disk-test').catch(() => {});

      expect(diskSpaceEvent).toBe(true);
    });

    test('should throw error for non-existent app operations', async () => {
      await expect(logManager.readLogs('non-existent')).rejects.toThrow();
      await expect(logManager.clearLogs('non-existent')).rejects.toThrow();
      await expect(logManager.flushBuffer('non-existent')).rejects.toThrow();
    });
  });

  describe('Cleanup', () => {
    test('should cleanup all resources on close', async () => {
      logManager.setupAppLogs('cleanup-test');

      await expect(logManager.close()).resolves.not.toThrow();
      expect(logManager.getAppNames()).toHaveLength(0);
    });
  });

  describe('Log Formatting', () => {
    test('should format logs for human readability', () => {
      const logEntry: LogEntry = {
        timestamp: 1609459200000, // 2021-01-01 00:00:00 UTC
        level: 'info',
        message: 'Test message',
        app: 'test-app',
        namespace: 'default',
        type: 'stdout',
      };

      const formatted = logManager.formatLogForHuman(logEntry);

      expect(formatted).toContain('test-app');
      expect(formatted).toContain('Test message');
      expect(formatted).toMatch(/\\d{2}-\\d{2}-\\d{2}/); // Date format
      expect(formatted).toMatch(/\\d{2}:\\d{2}:\\d{2}/); // Time format
    });
  });
});
