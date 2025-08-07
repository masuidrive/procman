/**
 * Signal Handler Test - シグナル処理の単体テスト
 *
 * t_wadaの教えに従い、境界（インターフェース）の振る舞いをテストする
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignalHandler } from '../../src/daemon/signal-handler.js';

describe('SignalHandler', () => {
  let signalHandler: SignalHandler;
  let mockProcessExit: ReturnType<typeof vi.fn>;
  let mockProcessOn: ReturnType<typeof vi.fn>;
  let mockProcessRemoveListener: ReturnType<typeof vi.fn>;
  let mockSetTimeout: ReturnType<typeof vi.fn>;
  let mockClearTimeout: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset mocks
    mockProcessExit = vi.fn();
    mockProcessOn = vi.fn();
    mockProcessRemoveListener = vi.fn();
    mockSetTimeout = vi.fn();
    mockClearTimeout = vi.fn();

    // Mock global functions
    vi.stubGlobal('setTimeout', mockSetTimeout);
    vi.stubGlobal('clearTimeout', mockClearTimeout);

    // Mock process methods
    Object.defineProperty(process, 'exit', {
      value: mockProcessExit,
      writable: true,
    });
    Object.defineProperty(process, 'on', {
      value: mockProcessOn,
      writable: true,
    });
    Object.defineProperty(process, 'removeListener', {
      value: mockProcessRemoveListener,
      writable: true,
    });

    signalHandler = new SignalHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    signalHandler.cleanupHandlers();
  });

  describe('setupHandlers', () => {
    test('should register SIGINT and SIGTERM handlers', () => {
      signalHandler.setupHandlers();

      expect(mockProcessOn).toHaveBeenCalledWith(
        'SIGINT',
        expect.any(Function)
      );
      expect(mockProcessOn).toHaveBeenCalledWith(
        'SIGTERM',
        expect.any(Function)
      );
      expect(mockProcessOn).toHaveBeenCalledWith(
        'uncaughtException',
        expect.any(Function)
      );
      expect(mockProcessOn).toHaveBeenCalledWith(
        'unhandledRejection',
        expect.any(Function)
      );
    });

    test('should emit gracefulShutdown event when SIGINT is received', async () => {
      signalHandler.setupHandlers();

      // Extract the SIGINT handler
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      expect(sigintCall).toBeDefined();
      const sigintHandler = sigintCall![1];

      // Create promise to wait for event
      const gracefulShutdownPromise = new Promise((resolve) => {
        signalHandler.on('gracefulShutdown', (signal) => {
          expect(signal).toBe('SIGINT');
          expect(signalHandler.isShutdownInProgress()).toBe(true);
          resolve(signal);
        });
      });

      // Trigger SIGINT
      sigintHandler();

      // Wait for event
      await gracefulShutdownPromise;
    });

    test('should emit gracefulShutdown event when SIGTERM is received', async () => {
      signalHandler.setupHandlers();

      // Extract the SIGTERM handler
      const sigtermCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGTERM'
      );
      expect(sigtermCall).toBeDefined();
      const sigtermHandler = sigtermCall![1];

      // Create promise to wait for event
      const gracefulShutdownPromise = new Promise((resolve) => {
        signalHandler.on('gracefulShutdown', (signal) => {
          expect(signal).toBe('SIGTERM');
          expect(signalHandler.isShutdownInProgress()).toBe(true);
          resolve(signal);
        });
      });

      // Trigger SIGTERM
      sigtermHandler();

      // Wait for event
      await gracefulShutdownPromise;
    });

    test('should ignore subsequent signals during shutdown', () => {
      const gracefulShutdownSpy = vi.fn();
      signalHandler.on('gracefulShutdown', gracefulShutdownSpy);
      signalHandler.setupHandlers();

      // Extract handlers
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      const sigintHandler = sigintCall![1];

      // First signal should trigger shutdown
      sigintHandler();
      expect(gracefulShutdownSpy).toHaveBeenCalledTimes(1);

      // Second signal should be ignored
      sigintHandler();
      expect(gracefulShutdownSpy).toHaveBeenCalledTimes(1);
    });

    test('should setup force shutdown timeout on graceful shutdown', () => {
      signalHandler.setupHandlers();

      // Extract the SIGINT handler and trigger it
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      const sigintHandler = sigintCall![1];
      sigintHandler();

      // Verify timeout was set
      expect(mockSetTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        30000 // GRACEFUL_TIMEOUT_MS
      );
    });
  });

  describe('cleanupHandlers', () => {
    test('should remove all registered listeners', () => {
      signalHandler.setupHandlers();
      signalHandler.cleanupHandlers();

      // Should remove all registered handlers
      expect(mockProcessRemoveListener).toHaveBeenCalledWith(
        'SIGINT',
        expect.any(Function)
      );
      expect(mockProcessRemoveListener).toHaveBeenCalledWith(
        'SIGTERM',
        expect.any(Function)
      );
      expect(mockProcessRemoveListener).toHaveBeenCalledWith(
        'uncaughtException',
        expect.any(Function)
      );
      expect(mockProcessRemoveListener).toHaveBeenCalledWith(
        'unhandledRejection',
        expect.any(Function)
      );
    });

    test('should clear timeouts when cleaning up', () => {
      // Mock timeout return value
      const mockTimeoutId = 'mockTimeout';
      mockSetTimeout.mockReturnValue(mockTimeoutId);

      signalHandler.setupHandlers();

      // Trigger shutdown to create timeout
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      const sigintHandler = sigintCall![1];
      sigintHandler();

      // Cleanup should clear the timeout
      signalHandler.cleanupHandlers();
      expect(mockClearTimeout).toHaveBeenCalledWith(mockTimeoutId);
    });
  });

  describe('forceShutdown', () => {
    test('should cleanup handlers and exit with code 1', () => {
      signalHandler.setupHandlers();
      signalHandler.forceShutdown();

      expect(mockProcessRemoveListener).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('graceful shutdown timeout', () => {
    test('should trigger force shutdown when timeout expires', () => {
      const forceShutdownSpy = vi.fn();
      signalHandler.on('forceShutdown', forceShutdownSpy);
      signalHandler.setupHandlers();

      // Extract the SIGINT handler and trigger it
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      const sigintHandler = sigintCall![1];
      sigintHandler();

      // Extract the timeout callback and trigger it
      const timeoutCall = mockSetTimeout.mock.calls[0];
      const timeoutCallback = timeoutCall[0];
      timeoutCallback();

      expect(forceShutdownSpy).toHaveBeenCalledWith('SIGINT');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('error handling', () => {
    test('should emit uncaughtException event and initiate graceful shutdown', async () => {
      const testError = new Error('Test error');

      // Create promises for both events
      const uncaughtExceptionPromise = new Promise((resolve) => {
        signalHandler.on('uncaughtException', (error) => {
          expect(error).toBe(testError);
          resolve(error);
        });
      });

      const gracefulShutdownPromise = new Promise((resolve) => {
        signalHandler.on('gracefulShutdown', (signal) => {
          expect(signal).toBe('uncaughtException');
          resolve(signal);
        });
      });

      signalHandler.setupHandlers();

      // Extract the uncaughtException handler and trigger it
      const uncaughtCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'uncaughtException'
      );
      const uncaughtHandler = uncaughtCall![1];
      uncaughtHandler(testError);

      // Wait for both events
      await Promise.all([uncaughtExceptionPromise, gracefulShutdownPromise]);
    });

    test('should handle unhandled rejection as uncaught exception', async () => {
      const testReason = 'Test rejection reason';

      const unhandledRejectionPromise = new Promise((resolve) => {
        signalHandler.on('unhandledRejection', (reason) => {
          expect(reason).toBe(testReason);
          resolve(reason);
        });
      });

      signalHandler.setupHandlers();

      // Extract the unhandledRejection handler and trigger it
      const rejectionCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'unhandledRejection'
      );
      const rejectionHandler = rejectionCall![1];
      rejectionHandler(testReason);

      // Wait for event
      await unhandledRejectionPromise;
    });
  });

  describe('state management', () => {
    test('should track shutdown state correctly', () => {
      expect(signalHandler.isShutdownInProgress()).toBe(false);

      signalHandler.setupHandlers();

      // Extract and trigger SIGINT handler
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      const sigintHandler = sigintCall![1];
      sigintHandler();

      expect(signalHandler.isShutdownInProgress()).toBe(true);
    });

    test('should reset shutdown state after cleanup', () => {
      signalHandler.setupHandlers();

      // Trigger shutdown
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      const sigintHandler = sigintCall![1];
      sigintHandler();

      expect(signalHandler.isShutdownInProgress()).toBe(true);

      // Cleanup should not reset the state (once shutdown starts, it continues)
      signalHandler.cleanupHandlers();
      expect(signalHandler.isShutdownInProgress()).toBe(true);
    });
  });
});
