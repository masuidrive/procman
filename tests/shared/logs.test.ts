/**
 * Unit tests for log management types and utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Types
  type LogEntry,
  type LogOptions,
  type LogFormat,
  type LogOutputConfig,
  type LogFileInfo,
  type LogFileConfig,
  type LogRotationConfig,
  type LogStreamConfig,
  type LogSearchConfig,
  type LogEvent,
  type LogStats,
  type LogQueryResult,
  type LogOperationResult,
  type LogWatchConfig,
  type LogArchiveConfig,

  // Type guards
  isLogEntry,
  isLogOptions,
  isLogFileInfo,

  // Helper functions
  createLogEntry,
  createDefaultLogOptions,
  createDefaultLogOutputConfig,
  createDefaultLogFileConfig,
  formatTimestamp,

  // Constants
  LOG_CONSTANTS,
  SUPPORTED_LOG_FORMATS,
  SUPPORTED_COMPRESSION_FORMATS,
  LOG_FILE_EXTENSIONS,
} from '../../src/shared/logs';

import type { LogLevel, LogType } from '../../src/shared/types';

describe('Log Management Types', () => {
  describe('LogEntry interface', () => {
    it('should define required properties correctly', () => {
      const logEntry: LogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message: 'Test message',
        app: 'test-app',
        namespace: 'default',
        type: 'stdout',
      };

      expect(logEntry).toBeDefined();
      expect(typeof logEntry.timestamp).toBe('number');
      expect(typeof logEntry.level).toBe('string');
      expect(typeof logEntry.message).toBe('string');
      expect(typeof logEntry.app).toBe('string');
      expect(typeof logEntry.namespace).toBe('string');
      expect(typeof logEntry.type).toBe('string');
    });

    it('should support all log levels', () => {
      const levels: LogLevel[] = ['info', 'warn', 'error'];

      levels.forEach((level) => {
        const logEntry: LogEntry = {
          timestamp: Date.now(),
          level,
          message: `Test ${level} message`,
          app: 'test-app',
          namespace: 'default',
          type: 'stdout',
        };
        expect(logEntry.level).toBe(level);
      });
    });

    it('should support all log types', () => {
      const types: LogType[] = ['stdout', 'stderr'];

      types.forEach((type) => {
        const logEntry: LogEntry = {
          timestamp: Date.now(),
          level: 'info',
          message: 'Test message',
          app: 'test-app',
          namespace: 'default',
          type,
        };
        expect(logEntry.type).toBe(type);
      });
    });
  });

  describe('LogOptions interface', () => {
    it('should define optional properties correctly', () => {
      const options: LogOptions = {
        lines: 50,
        human: true,
        stream: false,
        follow: true,
        since: Date.now() - 3600000,
        until: Date.now(),
        level: 'error',
        type: 'stderr',
        app: 'test-app',
        namespace: 'production',
        pattern: 'error',
        regex: false,
        ignoreCase: true,
      };

      expect(options).toBeDefined();
      expect(options.lines).toBe(50);
      expect(options.human).toBe(true);
      expect(options.stream).toBe(false);
      expect(options.follow).toBe(true);
    });

    it('should support array filters', () => {
      const options: LogOptions = {
        level: ['error', 'warn'],
        type: ['stdout', 'stderr'],
        app: ['app1', 'app2'],
        namespace: ['default', 'production'],
      };

      expect(Array.isArray(options.level)).toBe(true);
      expect(Array.isArray(options.type)).toBe(true);
      expect(Array.isArray(options.app)).toBe(true);
      expect(Array.isArray(options.namespace)).toBe(true);
    });
  });

  describe('LogFormat type', () => {
    it('should support all defined formats', () => {
      const formats: LogFormat[] = [
        'default',
        'json',
        'compact',
        'raw',
        'timestamp',
        'pretty',
      ];

      formats.forEach((format) => {
        const config: LogOutputConfig = {
          format,
        };
        expect(config.format).toBe(format);
      });
    });
  });

  describe('LogFileInfo interface', () => {
    it('should define file information correctly', () => {
      const fileInfo: LogFileInfo = {
        path: '/path/to/log.log',
        size: 1024,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        accessedAt: Date.now(),
        type: 'stdout',
        app: 'test-app',
        namespace: 'default',
        readable: true,
        writable: false,
      };

      expect(fileInfo).toBeDefined();
      expect(fileInfo.path).toBe('/path/to/log.log');
      expect(fileInfo.size).toBe(1024);
      expect(fileInfo.type).toBe('stdout');
    });

    it('should support all file types', () => {
      const types = ['stdout', 'stderr', 'combined', 'daemon'] as const;

      types.forEach((type) => {
        const fileInfo: LogFileInfo = {
          path: `/path/to/${type}.log`,
          size: 1024,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          accessedAt: Date.now(),
          type,
          readable: true,
          writable: false,
        };
        expect(fileInfo.type).toBe(type);
      });
    });
  });

  describe('LogFileConfig interface', () => {
    it('should define configuration properties correctly', () => {
      const config: LogFileConfig = {
        logDir: '/var/log/procman',
        maxSize: 100 * 1024 * 1024,
        maxFiles: 5,
        rotate: true,
        rotateInterval: 24 * 60 * 60 * 1000,
        compress: true,
        permissions: 0o644,
        filenamePattern: '{app}-{namespace}-{type}-{date}.log',
        dateFormat: 'YYYY-MM-DD-HH',
      };

      expect(config).toBeDefined();
      expect(config.logDir).toBe('/var/log/procman');
      expect(config.maxSize).toBe(100 * 1024 * 1024);
      expect(config.rotate).toBe(true);
    });
  });

  describe('LogRotationConfig interface', () => {
    it('should define rotation settings correctly', () => {
      const config: LogRotationConfig = {
        enabled: true,
        maxSize: 50 * 1024 * 1024,
        maxFiles: 7,
        compress: true,
        interval: 24 * 60 * 60 * 1000,
        time: '00:00',
        dayOfWeek: 0,
      };

      expect(config).toBeDefined();
      expect(config.enabled).toBe(true);
      expect(config.time).toBe('00:00');
      expect(config.dayOfWeek).toBe(0);
    });
  });

  describe('LogStreamConfig interface', () => {
    it('should define streaming settings correctly', () => {
      const config: LogStreamConfig = {
        bufferSize: 64 * 1024,
        flushInterval: 1000,
        maxConnections: 10,
        timeout: 30000,
        keepAlive: true,
        backpressure: true,
        maxQueueSize: 1000,
      };

      expect(config).toBeDefined();
      expect(config.bufferSize).toBe(64 * 1024);
      expect(config.keepAlive).toBe(true);
    });
  });

  describe('LogSearchConfig interface', () => {
    it('should define search settings correctly', () => {
      const config: LogSearchConfig = {
        pattern: 'error',
        regex: true,
        ignoreCase: false,
        wholeWord: true,
        maxResults: 100,
        timeout: 5000,
        context: 3,
      };

      expect(config).toBeDefined();
      expect(config.pattern).toBe('error');
      expect(config.regex).toBe(true);
      expect(config.context).toBe(3);
    });
  });

  describe('LogEvent interface', () => {
    it('should define event properties correctly', () => {
      const event: LogEvent = {
        type: 'new',
        timestamp: Date.now(),
        app: 'test-app',
        namespace: 'default',
        filePath: '/path/to/log.log',
        data: { key: 'value' },
      };

      expect(event).toBeDefined();
      expect(event.type).toBe('new');
      expect(typeof event.timestamp).toBe('number');
    });

    it('should support all event types', () => {
      const types = ['new', 'rotation', 'error', 'overflow'] as const;

      types.forEach((type) => {
        const event: LogEvent = {
          type,
          timestamp: Date.now(),
        };
        expect(event.type).toBe(type);
      });
    });
  });

  describe('LogStats interface', () => {
    it('should define statistics correctly', () => {
      const stats: LogStats = {
        totalEntries: 1000,
        levelCounts: {
          info: 800,
          warn: 150,
          error: 50,
        },
        typeCounts: {
          stdout: 900,
          stderr: 100,
        },
        appCounts: {
          app1: 500,
          app2: 500,
        },
        namespaceCounts: {
          default: 700,
          production: 300,
        },
        firstEntry: Date.now() - 86400000,
        lastEntry: Date.now(),
        totalSize: 10 * 1024 * 1024,
        fileCount: 5,
      };

      expect(stats).toBeDefined();
      expect(stats.totalEntries).toBe(1000);
      expect(stats.levelCounts.info).toBe(800);
      expect(stats.typeCounts.stdout).toBe(900);
    });
  });

  describe('LogQueryResult interface', () => {
    it('should define query result correctly', () => {
      const result: LogQueryResult = {
        entries: [],
        totalCount: 1000,
        filteredCount: 50,
        hasMore: true,
        nextCursor: 'cursor123',
        searchTime: 250,
      };

      expect(result).toBeDefined();
      expect(result.totalCount).toBe(1000);
      expect(result.filteredCount).toBe(50);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('LogOperationResult interface', () => {
    it('should define operation result correctly', () => {
      const result: LogOperationResult = {
        success: true,
        processedFiles: 5,
        deletedFiles: 2,
        compressedFiles: 3,
        processedBytes: 1024 * 1024,
      };

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.processedFiles).toBe(5);
    });

    it('should handle error cases', () => {
      const result: LogOperationResult = {
        success: false,
        error: 'Permission denied',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });

  describe('LogWatchConfig interface', () => {
    it('should define watch configuration correctly', () => {
      const config: LogWatchConfig = {
        interval: 1000,
        patterns: ['*.log', '*.out'],
        excludePatterns: ['*.tmp'],
        recursive: true,
        events: {
          create: true,
          modify: true,
          delete: false,
          move: true,
        },
        debounce: 100,
      };

      expect(config).toBeDefined();
      expect(config.recursive).toBe(true);
      expect(config.events?.create).toBe(true);
    });
  });

  describe('LogArchiveConfig interface', () => {
    it('should define archive configuration correctly', () => {
      const config: LogArchiveConfig = {
        enabled: true,
        archiveDir: '/archive/logs',
        retentionDays: 90,
        compressionFormat: 'gzip',
        scheduleTime: '02:00',
        encryption: {
          enabled: true,
          algorithm: 'aes-256-gcm',
          key: 'secret-key',
        },
      };

      expect(config).toBeDefined();
      expect(config.enabled).toBe(true);
      expect(config.compressionFormat).toBe('gzip');
      expect(config.encryption?.enabled).toBe(true);
    });
  });
});

describe('Type Guard Functions', () => {
  describe('isLogEntry', () => {
    it('should return true for valid LogEntry', () => {
      const validEntry = {
        timestamp: Date.now(),
        level: 'info' as LogLevel,
        message: 'Test message',
        app: 'test-app',
        namespace: 'default',
        type: 'stdout' as LogType,
      };

      expect(isLogEntry(validEntry)).toBe(true);
    });

    it('should return false for invalid LogEntry', () => {
      const invalidEntries = [
        null,
        undefined,
        'string',
        123,
        [],
        {},
        { timestamp: 'invalid' },
        { timestamp: 123, level: 'invalid' },
        { timestamp: 123, level: 'info', message: 123 },
        { timestamp: 123, level: 'info', message: 'test', app: 123 },
        {
          timestamp: 123,
          level: 'info',
          message: 'test',
          app: 'test',
          namespace: 123,
        },
        {
          timestamp: 123,
          level: 'info',
          message: 'test',
          app: 'test',
          namespace: 'test',
          type: 'invalid',
        },
      ];

      invalidEntries.forEach((entry) => {
        expect(isLogEntry(entry)).toBe(false);
      });
    });

    it('should validate log levels correctly', () => {
      const validLevels = ['info', 'warn', 'error'];
      const invalidLevels = ['debug', 'trace', 'fatal', 'invalid'];

      validLevels.forEach((level) => {
        const entry = {
          timestamp: Date.now(),
          level,
          message: 'Test',
          app: 'test',
          namespace: 'default',
          type: 'stdout',
        };
        expect(isLogEntry(entry)).toBe(true);
      });

      invalidLevels.forEach((level) => {
        const entry = {
          timestamp: Date.now(),
          level,
          message: 'Test',
          app: 'test',
          namespace: 'default',
          type: 'stdout',
        };
        expect(isLogEntry(entry)).toBe(false);
      });
    });

    it('should validate log types correctly', () => {
      const validTypes = ['stdout', 'stderr'];
      const invalidTypes = ['stdin', 'log', 'file', 'invalid'];

      validTypes.forEach((type) => {
        const entry = {
          timestamp: Date.now(),
          level: 'info',
          message: 'Test',
          app: 'test',
          namespace: 'default',
          type,
        };
        expect(isLogEntry(entry)).toBe(true);
      });

      invalidTypes.forEach((type) => {
        const entry = {
          timestamp: Date.now(),
          level: 'info',
          message: 'Test',
          app: 'test',
          namespace: 'default',
          type,
        };
        expect(isLogEntry(entry)).toBe(false);
      });
    });
  });

  describe('isLogOptions', () => {
    it('should return true for valid LogOptions', () => {
      const validOptions = [
        {},
        { lines: 100 },
        { human: true, stream: false },
        { follow: true, since: Date.now() },
        { lines: 50, human: true, stream: true, follow: false },
      ];

      validOptions.forEach((options) => {
        expect(isLogOptions(options)).toBe(true);
      });
    });

    it('should return false for invalid LogOptions', () => {
      const invalidOptions = [
        null,
        undefined,
        'string',
        123,
        [],
        { lines: 'invalid' },
        { human: 'true' },
        { stream: 1 },
        { follow: 'false' },
        { since: 'yesterday' },
        { until: 'tomorrow' },
      ];

      invalidOptions.forEach((options) => {
        expect(isLogOptions(options)).toBe(false);
      });
    });
  });

  describe('isLogFileInfo', () => {
    it('should return true for valid LogFileInfo', () => {
      const validFileInfo = {
        path: '/path/to/file.log',
        size: 1024,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        accessedAt: Date.now(),
        type: 'stdout' as const,
        app: 'test-app',
        namespace: 'default',
        readable: true,
        writable: false,
      };

      expect(isLogFileInfo(validFileInfo)).toBe(true);
    });

    it('should return false for invalid LogFileInfo', () => {
      const invalidFileInfos = [
        null,
        undefined,
        'string',
        123,
        [],
        {},
        { path: 123 },
        { path: '/test', size: 'invalid' },
        { path: '/test', size: 123, createdAt: 'invalid' },
        { path: '/test', size: 123, createdAt: 123, modifiedAt: 'invalid' },
        {
          path: '/test',
          size: 123,
          createdAt: 123,
          modifiedAt: 123,
          accessedAt: 'invalid',
        },
        {
          path: '/test',
          size: 123,
          createdAt: 123,
          modifiedAt: 123,
          accessedAt: 123,
          type: 'invalid',
        },
        {
          path: '/test',
          size: 123,
          createdAt: 123,
          modifiedAt: 123,
          accessedAt: 123,
          type: 'stdout',
          readable: 'true',
        },
        {
          path: '/test',
          size: 123,
          createdAt: 123,
          modifiedAt: 123,
          accessedAt: 123,
          type: 'stdout',
          readable: true,
          writable: 'false',
        },
      ];

      invalidFileInfos.forEach((fileInfo) => {
        expect(isLogFileInfo(fileInfo)).toBe(false);
      });
    });

    it('should validate file types correctly', () => {
      const validTypes = ['stdout', 'stderr', 'combined', 'daemon'];
      const invalidTypes = ['stdin', 'log', 'file', 'invalid'];

      validTypes.forEach((type) => {
        const fileInfo = {
          path: '/test',
          size: 123,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          accessedAt: Date.now(),
          type,
          readable: true,
          writable: false,
        };
        expect(isLogFileInfo(fileInfo)).toBe(true);
      });

      invalidTypes.forEach((type) => {
        const fileInfo = {
          path: '/test',
          size: 123,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          accessedAt: Date.now(),
          type,
          readable: true,
          writable: false,
        };
        expect(isLogFileInfo(fileInfo)).toBe(false);
      });
    });
  });
});

describe('Helper Functions', () => {
  describe('createLogEntry', () => {
    it('should create LogEntry with all parameters', () => {
      const entry = createLogEntry(
        'Test message',
        'test-app',
        'production',
        'error',
        'stderr'
      );

      expect(entry.message).toBe('Test message');
      expect(entry.app).toBe('test-app');
      expect(entry.namespace).toBe('production');
      expect(entry.level).toBe('error');
      expect(entry.type).toBe('stderr');
      expect(typeof entry.timestamp).toBe('number');
      expect(entry.timestamp).toBeCloseTo(Date.now(), -2);
    });

    it('should create LogEntry with default parameters', () => {
      const entry = createLogEntry('Test message', 'test-app', 'default');

      expect(entry.message).toBe('Test message');
      expect(entry.app).toBe('test-app');
      expect(entry.namespace).toBe('default');
      expect(entry.level).toBe('info');
      expect(entry.type).toBe('stdout');
      expect(typeof entry.timestamp).toBe('number');
    });

    it('should validate created LogEntry with type guard', () => {
      const entry = createLogEntry('Test', 'app', 'ns');
      expect(isLogEntry(entry)).toBe(true);
    });
  });

  describe('createDefaultLogOptions', () => {
    it('should create default LogOptions', () => {
      const options = createDefaultLogOptions();

      expect(options.lines).toBe(100);
      expect(options.human).toBe(false);
      expect(options.stream).toBe(false);
      expect(options.follow).toBe(false);
    });

    it('should validate created LogOptions with type guard', () => {
      const options = createDefaultLogOptions();
      expect(isLogOptions(options)).toBe(true);
    });
  });

  describe('createDefaultLogOutputConfig', () => {
    it('should create default LogOutputConfig', () => {
      const config = createDefaultLogOutputConfig();

      expect(config.format).toBe('default');
      expect(config.colors).toBe(true);
      expect(config.timestampFormat).toBe('iso');
      expect(config.lineEnding).toBe('\n');
      expect(config.indent).toBe(2);
    });
  });

  describe('createDefaultLogFileConfig', () => {
    it('should create default LogFileConfig', () => {
      const logDir = '/var/log/test';
      const config = createDefaultLogFileConfig(logDir);

      expect(config.logDir).toBe(logDir);
      expect(config.maxSize).toBe(50 * 1024 * 1024);
      expect(config.maxFiles).toBe(10);
      expect(config.rotate).toBe(true);
      expect(config.rotateInterval).toBe(24 * 60 * 60 * 1000);
      expect(config.compress).toBe(true);
      expect(config.permissions).toBe(0o644);
      expect(config.filenamePattern).toBe(
        '{app}-{namespace}-{type}-{date}.log'
      );
      expect(config.dateFormat).toBe('YYYY-MM-DD');
    });
  });

  describe('formatTimestamp', () => {
    let testTimestamp: number;

    beforeEach(() => {
      testTimestamp = new Date('2023-12-25T12:00:00.000Z').getTime();
    });

    it('should format timestamp in ISO format', () => {
      const formatted = formatTimestamp(testTimestamp, 'iso');
      expect(formatted).toBe('2023-12-25T12:00:00.000Z');
    });

    it('should format timestamp in Unix format', () => {
      const formatted = formatTimestamp(testTimestamp, 'unix');
      expect(formatted).toBe(testTimestamp.toString());
    });

    it('should format timestamp in relative format', () => {
      const now = Date.now();

      // 30 seconds ago
      const thirtySecondsAgo = now - 30000;
      expect(formatTimestamp(thirtySecondsAgo, 'relative')).toBe('30s ago');

      // 5 minutes ago
      const fiveMinutesAgo = now - 5 * 60000;
      expect(formatTimestamp(fiveMinutesAgo, 'relative')).toBe('5m ago');

      // 2 hours ago
      const twoHoursAgo = now - 2 * 3600000;
      expect(formatTimestamp(twoHoursAgo, 'relative')).toBe('2h ago');

      // 3 days ago
      const threeDaysAgo = now - 3 * 86400000;
      expect(formatTimestamp(threeDaysAgo, 'relative')).toBe('3d ago');
    });

    it('should default to ISO format for invalid format', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formatted = formatTimestamp(testTimestamp, 'invalid' as any);
      expect(formatted).toBe('2023-12-25T12:00:00.000Z');
    });

    it('should default to ISO format when no format specified', () => {
      const formatted = formatTimestamp(testTimestamp);
      expect(formatted).toBe('2023-12-25T12:00:00.000Z');
    });
  });
});

describe('Constants', () => {
  describe('LOG_CONSTANTS', () => {
    it('should define all required constants', () => {
      expect(LOG_CONSTANTS.DEFAULT_LOG_LINES).toBe(100);
      expect(LOG_CONSTANTS.DEFAULT_MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
      expect(LOG_CONSTANTS.DEFAULT_MAX_FILES).toBe(10);
      expect(LOG_CONSTANTS.DEFAULT_ROTATION_INTERVAL).toBe(24 * 60 * 60 * 1000);
      expect(LOG_CONSTANTS.DEFAULT_STREAM_BUFFER_SIZE).toBe(64 * 1024);
      expect(LOG_CONSTANTS.DEFAULT_FLUSH_INTERVAL).toBe(1000);
      expect(LOG_CONSTANTS.DEFAULT_MAX_CONNECTIONS).toBe(10);
      expect(LOG_CONSTANTS.DEFAULT_TIMEOUT).toBe(30000);
      expect(LOG_CONSTANTS.MAX_MESSAGE_LENGTH).toBe(10000);
      expect(LOG_CONSTANTS.MAX_SEARCH_RESULTS).toBe(1000);
      expect(LOG_CONSTANTS.DEFAULT_RETENTION_DAYS).toBe(30);
    });

    it('should have consistent types', () => {
      Object.values(LOG_CONSTANTS).forEach((value) => {
        expect(typeof value).toBe('number');
      });
    });
  });

  describe('SUPPORTED_LOG_FORMATS', () => {
    it('should contain all expected formats', () => {
      const expectedFormats = [
        'default',
        'json',
        'compact',
        'raw',
        'timestamp',
        'pretty',
      ];

      expect(SUPPORTED_LOG_FORMATS).toEqual(expectedFormats);
    });

    it('should be readonly array', () => {
      expect(Object.isFrozen(SUPPORTED_LOG_FORMATS)).toBe(true);
    });
  });

  describe('SUPPORTED_COMPRESSION_FORMATS', () => {
    it('should contain all expected compression formats', () => {
      const expectedFormats = ['gzip', 'zip', 'bzip2'];
      expect(SUPPORTED_COMPRESSION_FORMATS).toEqual(expectedFormats);
    });

    it('should be readonly array', () => {
      expect(Object.isFrozen(SUPPORTED_COMPRESSION_FORMATS)).toBe(true);
    });
  });

  describe('LOG_FILE_EXTENSIONS', () => {
    it('should contain all expected extensions', () => {
      expect(LOG_FILE_EXTENSIONS.log).toBe('log');
      expect(LOG_FILE_EXTENSIONS.json).toBe('json');
      expect(LOG_FILE_EXTENSIONS.txt).toBe('txt');
      expect(LOG_FILE_EXTENSIONS.out).toBe('out');
      expect(LOG_FILE_EXTENSIONS.err).toBe('err');
    });

    it('should be readonly object', () => {
      expect(Object.isFrozen(LOG_FILE_EXTENSIONS)).toBe(true);
    });
  });
});

describe('Integration with Other Modules', () => {
  it('should import types from other modules correctly', () => {
    // Test that LogLevel and LogType are properly imported and used
    const entry = createLogEntry('test', 'app', 'ns', 'info', 'stdout');
    expect(entry.level).toBe('info');
    expect(entry.type).toBe('stdout');
  });

  it('should work with existing constants', () => {
    // Integration test - constants should be available and consistent
    expect(LOG_CONSTANTS.DEFAULT_LOG_LINES).toBeGreaterThan(0);
    expect(LOG_CONSTANTS.DEFAULT_MAX_FILE_SIZE).toBeGreaterThan(0);
  });

  it('should create valid entries that pass type guards', () => {
    const entry = createLogEntry(
      'Integration test',
      'integration-app',
      'test-namespace'
    );
    expect(isLogEntry(entry)).toBe(true);

    const options = createDefaultLogOptions();
    expect(isLogOptions(options)).toBe(true);
  });
});
