/**
 * Unit tests for process management types and utilities
 */

import { describe, it, expect } from 'vitest';
import {
  // Types
  ProcessStatus,
  ProcessInfo,
  ProcessStartOptions,
  ProcessStopOptions,
  ProcessRestartOptions,
  ProcessListOptions,
  ProcessOperationResult,
  ProcessStats,
  MemoryLimit,
  MemoryUsage,
  MemoryMonitorConfig,
  ProcessEvent,
  ProcessLogEntry,
  ProcessConfigValidationResult,
  ProcessNameValidation,
  NamespaceValidation,
  ProcessQuery,
  ProcessExecutionEnvironment,
  ProcessResourceLimits,
  ProcessHealthCheck,
  ProcessBackupConfig,
  ProcessManagementTypes,

  // Type guards
  isValidProcessStatus,
  isProcessInfo,
  isProcessEvent,

  // Constants
  PROCESS_CONSTANTS,
} from '../../src/shared/process';

describe('Process Management Types', () => {
  describe('ProcessStatus type', () => {
    it('should accept valid process status values', () => {
      const validStatuses: ProcessStatus[] = [
        'stopped',
        'starting',
        'online',
        'stopping',
        'errored',
        'max-memory',
      ];

      validStatuses.forEach((status) => {
        expect(isValidProcessStatus(status)).toBe(true);
      });
    });

    it('should reject invalid process status values', () => {
      const invalidStatuses = [
        'invalid',
        'running',
        'failed',
        '',
        null,
        undefined,
        123,
      ];

      invalidStatuses.forEach((status) => {
        expect(isValidProcessStatus(status as string)).toBe(false);
      });
    });
  });

  describe('ProcessInfo interface', () => {
    it('should validate correct ProcessInfo objects', () => {
      const validProcessInfo: ProcessInfo = {
        name: 'test-app',
        namespace: 'default',
        status: 'online',
        pid: 1234,
        uptime: 12345,
        memory: 123456,
        cpu: 45.6,
        restarts: 2,
        note: 'Test process',
      };

      expect(isProcessInfo(validProcessInfo)).toBe(true);
    });

    it('should validate ProcessInfo with null pid', () => {
      const processInfoWithNullPid: ProcessInfo = {
        name: 'test-app',
        namespace: 'default',
        status: 'stopped',
        pid: null,
        uptime: 0,
        memory: 0,
        cpu: 0,
        restarts: 0,
      };

      expect(isProcessInfo(processInfoWithNullPid)).toBe(true);
    });

    it('should validate ProcessInfo without optional note', () => {
      const processInfoWithoutNote: ProcessInfo = {
        name: 'test-app',
        namespace: 'default',
        status: 'online',
        pid: 1234,
        uptime: 12345,
        memory: 123456,
        cpu: 45.6,
        restarts: 2,
      };

      expect(isProcessInfo(processInfoWithoutNote)).toBe(true);
    });

    it('should reject invalid ProcessInfo objects', () => {
      const invalidProcessInfos = [
        null,
        undefined,
        {},
        { name: 'test' }, // 必須フィールドが不足
        {
          name: 123, // nameが文字列でない
          namespace: 'default',
          status: 'online',
          pid: 1234,
          uptime: 12345,
          memory: 123456,
          cpu: 45.6,
          restarts: 2,
        },
        {
          name: 'test-app',
          namespace: 'default',
          status: 'invalid-status', // 無効なstatus
          pid: 1234,
          uptime: 12345,
          memory: 123456,
          cpu: 45.6,
          restarts: 2,
        },
        {
          name: 'test-app',
          namespace: 'default',
          status: 'online',
          pid: 'not-a-number', // pidが数値でない
          uptime: 12345,
          memory: 123456,
          cpu: 45.6,
          restarts: 2,
        },
      ];

      invalidProcessInfos.forEach((info) => {
        expect(isProcessInfo(info)).toBe(false);
      });
    });
  });

  describe('ProcessEvent interface', () => {
    it('should validate correct ProcessEvent objects', () => {
      const validProcessEvent: ProcessEvent = {
        type: 'start',
        processName: 'test-app',
        namespace: 'default',
        timestamp: Date.now(),
        pid: 1234,
        previousStatus: 'stopped',
        currentStatus: 'starting',
        message: 'Process starting',
        data: { some: 'data' },
      };

      expect(isProcessEvent(validProcessEvent)).toBe(true);
    });

    it('should validate ProcessEvent with minimal required fields', () => {
      const minimalProcessEvent: ProcessEvent = {
        type: 'error',
        processName: 'test-app',
        namespace: 'default',
        timestamp: Date.now(),
        currentStatus: 'errored',
      };

      expect(isProcessEvent(minimalProcessEvent)).toBe(true);
    });

    it('should reject invalid ProcessEvent objects', () => {
      const invalidProcessEvents = [
        null,
        undefined,
        {},
        {
          type: 'start',
          processName: 'test-app',
          namespace: 'default',
          timestamp: Date.now(),
          currentStatus: 'invalid-status', // 無効なstatus
        },
        {
          type: 'start',
          processName: 123, // processNameが文字列でない
          namespace: 'default',
          timestamp: Date.now(),
          currentStatus: 'starting',
        },
        {
          type: 'start',
          processName: 'test-app',
          namespace: 'default',
          timestamp: 'not-a-number', // timestampが数値でない
          currentStatus: 'starting',
        },
      ];

      invalidProcessEvents.forEach((event) => {
        expect(isProcessEvent(event)).toBe(false);
      });
    });
  });

  describe('Process Management Options', () => {
    it('should accept valid ProcessStartOptions', () => {
      const startOptions: ProcessStartOptions = {
        name: 'test-app',
        namespace: 'production',
        force: true,
        timeout: 30000,
      };

      expect(startOptions.name).toBe('test-app');
      expect(startOptions.namespace).toBe('production');
      expect(startOptions.force).toBe(true);
      expect(startOptions.timeout).toBe(30000);
    });

    it('should accept valid ProcessStopOptions', () => {
      const stopOptions: ProcessStopOptions = {
        name: 'test-app',
        namespace: 'production',
        signal: 'SIGTERM',
        timeout: 10000,
        force: false,
      };

      expect(stopOptions.name).toBe('test-app');
      expect(stopOptions.signal).toBe('SIGTERM');
    });

    it('should accept valid ProcessRestartOptions', () => {
      const restartOptions: ProcessRestartOptions = {
        name: 'test-app',
        namespace: 'production',
        graceful: true,
        timeout: 15000,
      };

      expect(restartOptions.graceful).toBe(true);
    });

    it('should accept valid ProcessListOptions', () => {
      const listOptions: ProcessListOptions = {
        namespace: 'production',
        status: 'online',
        sortBy: 'memory',
        order: 'desc',
      };

      expect(listOptions.sortBy).toBe('memory');
      expect(listOptions.order).toBe('desc');
    });
  });

  describe('Memory Management Types', () => {
    it('should define MemoryLimit correctly', () => {
      const memoryLimit: MemoryLimit = {
        max: '500M',
        warning: '400M',
        action: 'restart',
        checkInterval: 5000,
      };

      expect(memoryLimit.max).toBe('500M');
      expect(memoryLimit.action).toBe('restart');
    });

    it('should define MemoryUsage correctly', () => {
      const memoryUsage: MemoryUsage = {
        current: 314572800,
        max: 524288000,
        percentage: 60.0,
        unit: 'MB',
        timestamp: Date.now(),
      };

      expect(memoryUsage.percentage).toBe(60.0);
      expect(memoryUsage.unit).toBe('MB');
    });

    it('should define MemoryMonitorConfig correctly', () => {
      const memoryMonitorConfig: MemoryMonitorConfig = {
        enabled: true,
        checkInterval: 5000,
        warningThreshold: 80,
        errorThreshold: 95,
        action: 'restart',
      };

      expect(memoryMonitorConfig.enabled).toBe(true);
      expect(memoryMonitorConfig.warningThreshold).toBe(80);
    });
  });

  describe('ProcessStats interface', () => {
    it('should define ProcessStats correctly', () => {
      const processStats: ProcessStats = {
        name: 'web-server',
        namespace: 'production',
        uptime: 86400000, // 1 day
        memory: {
          current: 314572800,
          max: 524288000,
          unit: 'MB',
        },
        cpu: {
          current: 25.5,
          average: 23.2,
        },
        restarts: 3,
        lastRestart: Date.now() - 3600000, // 1 hour ago
      };

      expect(processStats.name).toBe('web-server');
      expect(processStats.memory.unit).toBe('MB');
      expect(processStats.cpu.current).toBe(25.5);
    });
  });

  describe('ProcessOperationResult interface', () => {
    it('should handle successful operation result', () => {
      const successResult: ProcessOperationResult = {
        success: true,
        message: 'Process started successfully',
        processInfo: {
          name: 'test-app',
          namespace: 'default',
          status: 'online',
          pid: 1234,
          uptime: 1000,
          memory: 123456,
          cpu: 10.5,
          restarts: 0,
        },
      };

      expect(successResult.success).toBe(true);
      expect(successResult.processInfo?.status).toBe('online');
    });

    it('should handle failed operation result', () => {
      const failureResult: ProcessOperationResult = {
        success: false,
        message: 'Failed to start process',
        errorCode: 'PROCESS_START_FAILED',
        details: {
          command: 'node app.js',
          exitCode: 1,
        },
      };

      expect(failureResult.success).toBe(false);
      expect(failureResult.errorCode).toBe('PROCESS_START_FAILED');
    });
  });

  describe('ProcessLogEntry interface', () => {
    it('should define ProcessLogEntry correctly', () => {
      const logEntry: ProcessLogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message: 'Server started on port 3000',
        processName: 'web-server',
        namespace: 'production',
        pid: 1234,
        source: 'stdout',
      };

      expect(logEntry.level).toBe('info');
      expect(logEntry.source).toBe('stdout');
    });
  });

  describe('ProcessQuery interface', () => {
    it('should define ProcessQuery correctly', () => {
      const query: ProcessQuery = {
        name: 'web-server',
        namespace: 'production',
        status: ['online', 'starting'],
        pid: 1234,
        pattern: 'web-*',
      };

      expect(query.status).toEqual(['online', 'starting']);
      expect(query.pattern).toBe('web-*');
    });
  });

  describe('ProcessExecutionEnvironment interface', () => {
    it('should define ProcessExecutionEnvironment correctly', () => {
      const execEnv: ProcessExecutionEnvironment = {
        cwd: '/app',
        env: {
          NODE_ENV: 'production',
          PORT: '3000',
        },
        user: 'appuser',
        group: 'appgroup',
        timeout: 30000,
      };

      expect(execEnv.env?.NODE_ENV).toBe('production');
      expect(execEnv.user).toBe('appuser');
    });
  });

  describe('ProcessResourceLimits interface', () => {
    it('should define ProcessResourceLimits correctly', () => {
      const resourceLimits: ProcessResourceLimits = {
        memory: {
          max: '1G',
          warning: '800M',
          action: 'restart',
        },
        cpu: {
          max: 80,
          checkInterval: 5000,
        },
        fileDescriptors: 1024,
        processes: 100,
      };

      expect(resourceLimits.memory?.max).toBe('1G');
      expect(resourceLimits.cpu?.max).toBe(80);
    });
  });

  describe('ProcessHealthCheck interface', () => {
    it('should define ProcessHealthCheck correctly', () => {
      const healthCheck: ProcessHealthCheck = {
        enabled: true,
        interval: 30000,
        timeout: 5000,
        retries: 3,
        command: 'curl http://localhost:3000/health',
        httpUrl: 'http://localhost:3000/health',
        tcpPort: 3000,
      };

      expect(healthCheck.enabled).toBe(true);
      expect(healthCheck.retries).toBe(3);
    });
  });

  describe('ProcessBackupConfig interface', () => {
    it('should define ProcessBackupConfig correctly', () => {
      const backupConfig: ProcessBackupConfig = {
        enabled: true,
        interval: 86400000, // 24 hours
        retention: 7, // 7 days
        location: '/backup/processes',
        compress: true,
      };

      expect(backupConfig.compress).toBe(true);
      expect(backupConfig.retention).toBe(7);
    });
  });

  describe('Validation Types', () => {
    it('should define ProcessConfigValidationResult correctly', () => {
      const validationResult: ProcessConfigValidationResult = {
        valid: false,
        errors: ['Missing required field: script'],
        warnings: ['Memory limit not specified'],
        processName: 'test-app',
      };

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors).toHaveLength(1);
    });

    it('should define ProcessNameValidation correctly', () => {
      const nameValidation: ProcessNameValidation = {
        valid: true,
      };

      expect(nameValidation.valid).toBe(true);
      expect(nameValidation.error).toBeUndefined();
    });

    it('should define NamespaceValidation correctly', () => {
      const namespaceValidation: NamespaceValidation = {
        valid: false,
        error: 'Namespace cannot contain spaces',
      };

      expect(namespaceValidation.valid).toBe(false);
      expect(namespaceValidation.error).toBe('Namespace cannot contain spaces');
    });
  });

  describe('ProcessManagementTypes aggregate', () => {
    it('should include all key process management types', () => {
      // This is a type-level test - we're checking that the aggregate type includes the expected properties
      const typeCheck: ProcessManagementTypes = {
        ProcessStatus: 'online',
        ProcessInfo: {
          name: 'test',
          namespace: 'default',
          status: 'online',
          pid: 1234,
          uptime: 1000,
          memory: 123456,
          cpu: 10,
          restarts: 0,
        },
        ProcessOperationResult: {
          success: true,
          message: 'OK',
        },
        ProcessStats: {
          name: 'test',
          namespace: 'default',
          uptime: 1000,
          memory: { current: 123456, max: 524288, unit: 'MB' },
          cpu: { current: 10, average: 12 },
          restarts: 0,
        },
        MemoryLimit: {
          max: '500M',
          action: 'restart',
        },
        MemoryUsage: {
          current: 123456,
          max: 524288,
          percentage: 23.5,
          unit: 'MB',
          timestamp: Date.now(),
        },
        ProcessEvent: {
          type: 'start',
          processName: 'test',
          namespace: 'default',
          timestamp: Date.now(),
          currentStatus: 'starting',
        },
        ProcessLogEntry: {
          timestamp: Date.now(),
          level: 'info',
          message: 'test message',
          processName: 'test',
          namespace: 'default',
          source: 'stdout',
        },
      };

      expect(typeCheck.ProcessStatus).toBe('online');
      expect(typeCheck.ProcessInfo.name).toBe('test');
    });
  });

  describe('PROCESS_CONSTANTS', () => {
    it('should define all required constants', () => {
      expect(PROCESS_CONSTANTS.MAX_PROCESS_NAME_LENGTH).toBe(50);
      expect(PROCESS_CONSTANTS.MAX_NAMESPACE_LENGTH).toBe(30);
      expect(PROCESS_CONSTANTS.MIN_MEMORY_LIMIT).toBe('10M');
      expect(PROCESS_CONSTANTS.MAX_RESTART_ATTEMPTS).toBe(10);
      expect(PROCESS_CONSTANTS.DEFAULT_HEALTH_CHECK_INTERVAL).toBe(30000);
      expect(PROCESS_CONSTANTS.DEFAULT_MEMORY_CHECK_INTERVAL).toBe(5000);
      expect(PROCESS_CONSTANTS.DEFAULT_CPU_LIMIT).toBe(80);
    });

    it('should define valid regex patterns', () => {
      expect(PROCESS_CONSTANTS.PROCESS_NAME_PATTERN).toBeInstanceOf(RegExp);
      expect(PROCESS_CONSTANTS.NAMESPACE_PATTERN).toBeInstanceOf(RegExp);

      // Test valid names
      expect(PROCESS_CONSTANTS.PROCESS_NAME_PATTERN.test('web-server')).toBe(
        true
      );
      expect(PROCESS_CONSTANTS.PROCESS_NAME_PATTERN.test('app_1')).toBe(true);
      expect(PROCESS_CONSTANTS.PROCESS_NAME_PATTERN.test('service123')).toBe(
        true
      );

      // Test invalid names
      expect(
        PROCESS_CONSTANTS.PROCESS_NAME_PATTERN.test('app with spaces')
      ).toBe(false);
      expect(PROCESS_CONSTANTS.PROCESS_NAME_PATTERN.test('app@domain')).toBe(
        false
      );
      expect(PROCESS_CONSTANTS.PROCESS_NAME_PATTERN.test('')).toBe(false);
    });
  });

  describe('Type compatibility with base types', () => {
    it('should be compatible with ErrorCode from errors module', () => {
      const operationResult: ProcessOperationResult = {
        success: false,
        message: 'Process not found',
        errorCode: 'PROCESS_NOT_FOUND', // This should be compatible with ErrorCode
      };

      expect(operationResult.errorCode).toBe('PROCESS_NOT_FOUND');
    });

    it('should be compatible with LogLevel from types module', () => {
      const logEntry: ProcessLogEntry = {
        timestamp: Date.now(),
        level: 'error', // This should be compatible with LogLevel
        message: 'Process crashed',
        processName: 'web-server',
        namespace: 'production',
        source: 'stderr',
      };

      expect(logEntry.level).toBe('error');
    });

    it('should be compatible with MemorySize from types module', () => {
      const memoryLimit: MemoryLimit = {
        max: '1G', // This should be compatible with MemorySize
        action: 'restart',
      };

      expect(memoryLimit.max).toBe('1G');
    });
  });
});
