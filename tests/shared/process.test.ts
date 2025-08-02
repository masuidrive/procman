/**
 * Unit tests for process management type definitions
 */

import { describe, test, expect } from 'vitest';
import {
  // Types
  type ProcessStatus,
  type ProcessInfo,

  // Type guards
  isValidProcessStatus,
  isProcessInfo,
} from '../../src/shared/process';

describe('Process Management Types', () => {
  describe('ProcessStatus type', () => {
    test('should accept valid process statuses', () => {
      const statuses: ProcessStatus[] = [
        'stopped',
        'starting',
        'online',
        'stopping',
        'errored',
        'max-memory',
      ];

      statuses.forEach((status) => {
        expect(status).toBeDefined();
        expect(typeof status).toBe('string');
      });
    });
  });

  describe('ProcessInfo interface', () => {
    test('should accept valid process info', () => {
      const processInfo: ProcessInfo = {
        name: 'test-app',
        namespace: 'default',
        status: 'online',
        pid: 12345,
        uptime: 3600000,
        memory: 104857600, // 100MB
        cpu: 25.5,
        restarts: 2,
      };

      expect(processInfo.name).toBe('test-app');
      expect(processInfo.namespace).toBe('default');
      expect(processInfo.status).toBe('online');
      expect(processInfo.pid).toBe(12345);
      expect(processInfo.uptime).toBe(3600000);
      expect(processInfo.memory).toBe(104857600);
      expect(processInfo.cpu).toBe(25.5);
      expect(processInfo.restarts).toBe(2);
      expect(processInfo.note).toBeUndefined();
    });

    test('should accept process info with null pid', () => {
      const stoppedProcess: ProcessInfo = {
        name: 'stopped-app',
        namespace: 'test',
        status: 'stopped',
        pid: null,
        uptime: 0,
        memory: 0,
        cpu: 0,
        restarts: 0,
      };

      expect(stoppedProcess.pid).toBe(null);
      expect(stoppedProcess.status).toBe('stopped');
    });

    test('should accept process info with optional note', () => {
      const processWithNote: ProcessInfo = {
        name: 'app-with-note',
        namespace: 'production',
        status: 'online',
        pid: 54321,
        uptime: 7200000,
        memory: 209715200, // 200MB
        cpu: 10.0,
        restarts: 0,
        note: 'Production API server',
      };

      expect(processWithNote.note).toBe('Production API server');
    });
  });

  describe('Type guards', () => {
    describe('isValidProcessStatus', () => {
      test('should return true for valid statuses', () => {
        const validStatuses = [
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

      test('should return false for invalid statuses', () => {
        expect(isValidProcessStatus('')).toBe(false);
        expect(isValidProcessStatus('running')).toBe(false);
        expect(isValidProcessStatus('crashed')).toBe(false);
        expect(isValidProcessStatus('ONLINE')).toBe(false);
        expect(isValidProcessStatus('Online')).toBe(false);
        expect(isValidProcessStatus('stopped ')).toBe(false);
      });
    });

    describe('isProcessInfo', () => {
      test('should return true for valid process info', () => {
        const validInfo = {
          name: 'test-app',
          namespace: 'default',
          status: 'online',
          pid: 12345,
          uptime: 1000,
          memory: 1048576,
          cpu: 5.5,
          restarts: 0,
        };

        expect(isProcessInfo(validInfo)).toBe(true);
      });

      test('should return true for process info with null pid', () => {
        const infoWithNullPid = {
          name: 'stopped-app',
          namespace: 'test',
          status: 'stopped',
          pid: null,
          uptime: 0,
          memory: 0,
          cpu: 0,
          restarts: 0,
        };

        expect(isProcessInfo(infoWithNullPid)).toBe(true);
      });

      test('should return true for process info with note', () => {
        const infoWithNote = {
          name: 'app',
          namespace: 'prod',
          status: 'online',
          pid: 1234,
          uptime: 1000,
          memory: 1000000,
          cpu: 1.0,
          restarts: 0,
          note: 'Test note',
        };

        expect(isProcessInfo(infoWithNote)).toBe(true);
      });

      test('should return false for invalid objects', () => {
        expect(isProcessInfo(null)).toBe(false);
        expect(isProcessInfo(undefined)).toBe(false);
        expect(isProcessInfo('string')).toBe(false);
        expect(isProcessInfo(123)).toBe(false);
        expect(isProcessInfo({})).toBe(false);

        // Missing required fields
        expect(isProcessInfo({ name: 'test' })).toBe(false);
        expect(
          isProcessInfo({
            name: 'test',
            namespace: 'default',
            status: 'online',
          })
        ).toBe(false);

        // Invalid field types
        expect(
          isProcessInfo({
            name: 123,
            namespace: 'default',
            status: 'online',
            pid: 12345,
            uptime: 1000,
            memory: 1048576,
            cpu: 5.5,
            restarts: 0,
          })
        ).toBe(false);

        // Invalid status
        expect(
          isProcessInfo({
            name: 'test',
            namespace: 'default',
            status: 'invalid-status',
            pid: 12345,
            uptime: 1000,
            memory: 1048576,
            cpu: 5.5,
            restarts: 0,
          })
        ).toBe(false);

        // Invalid pid (must be number or null)
        expect(
          isProcessInfo({
            name: 'test',
            namespace: 'default',
            status: 'online',
            pid: 'not-a-number',
            uptime: 1000,
            memory: 1048576,
            cpu: 5.5,
            restarts: 0,
          })
        ).toBe(false);
      });
    });
  });
});
