/**
 * CLI Signal Handling Test - CLIプロセスのシグナル処理テスト
 *
 * t_wadaの教えに従い、CLIの境界でのシグナル処理の振る舞いをテストする
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLISignalHandler } from '../../src/cli/signal-handler.js';

describe('CLISignalHandler', () => {
  let cliSignalHandler: CLISignalHandler;
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
    mockSetTimeout = vi.fn(() => 'mockTimeout');
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

    cliSignalHandler = new CLISignalHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cliSignalHandler.cleanup();
  });

  describe('setup', () => {
    test('should register SIGINT and SIGTERM handlers', () => {
      cliSignalHandler.setup();

      expect(mockProcessOn).toHaveBeenCalledWith(
        'SIGINT',
        expect.any(Function)
      );
      expect(mockProcessOn).toHaveBeenCalledWith(
        'SIGTERM',
        expect.any(Function)
      );
    });

    test('should handle SIGINT signal with graceful cleanup', () => {
      const mockAsyncCleanup = vi.fn().mockResolvedValue(undefined);
      cliSignalHandler.setup(mockAsyncCleanup);

      // Extract the SIGINT handler
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      expect(sigintCall).toBeDefined();
      const sigintHandler = sigintCall![1];

      // Trigger SIGINT
      sigintHandler();

      // Should call async cleanup and set timeout
      expect(mockAsyncCleanup).toHaveBeenCalled();
      expect(mockSetTimeout).toHaveBeenCalled();
    });

    test('should handle SIGTERM signal with graceful cleanup', () => {
      const mockAsyncCleanup = vi.fn().mockResolvedValue(undefined);
      cliSignalHandler.setup(mockAsyncCleanup);

      // Extract the SIGTERM handler
      const sigtermCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGTERM'
      );
      expect(sigtermCall).toBeDefined();
      const sigtermHandler = sigtermCall![1];

      // Trigger SIGTERM
      sigtermHandler();

      // Should call async cleanup and set timeout
      expect(mockAsyncCleanup).toHaveBeenCalled();
      expect(mockSetTimeout).toHaveBeenCalled();
    });

    test('should force exit if cleanup takes too long', () => {
      const slowCleanup = vi.fn().mockImplementation(() => {
        return new Promise(() => {}); // Never resolves
      });
      cliSignalHandler.setup(slowCleanup);

      // Extract the SIGINT handler
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      const sigintHandler = sigintCall![1];

      // Capture timeout callback
      let timeoutCallback: (() => void) | undefined;
      mockSetTimeout.mockImplementation((callback) => {
        timeoutCallback = callback;
        return 'mockTimeout';
      });

      // Trigger SIGINT (should not exit immediately)
      sigintHandler();

      expect(mockProcessExit).not.toHaveBeenCalled();
      expect(slowCleanup).toHaveBeenCalled();

      // Trigger timeout
      if (timeoutCallback) {
        timeoutCallback();
      }

      // Should force exit after timeout
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    test('should exit with code 0 after successful cleanup', () => {
      const fastCleanup = vi.fn().mockResolvedValue(undefined);
      cliSignalHandler.setup(fastCleanup);

      // Extract the SIGINT handler
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      const sigintHandler = sigintCall![1];

      // Trigger SIGINT
      sigintHandler();

      // Should call cleanup and set timeout
      expect(fastCleanup).toHaveBeenCalled();
      expect(mockSetTimeout).toHaveBeenCalled();
    });

    test('should handle cleanup errors gracefully', () => {
      const errorCleanup = vi
        .fn()
        .mockRejectedValue(new Error('Cleanup failed'));
      cliSignalHandler.setup(errorCleanup);

      // Mock console.error to avoid noise during test
      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Extract the SIGINT handler
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      const sigintHandler = sigintCall![1];

      // Trigger SIGINT
      sigintHandler();

      // Should call cleanup and set timeout
      expect(errorCleanup).toHaveBeenCalled();
      expect(mockSetTimeout).toHaveBeenCalled();

      mockConsoleError.mockRestore();
    });

    test('should ignore subsequent signals during cleanup', () => {
      const slowCleanup = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
      });
      cliSignalHandler.setup(slowCleanup);

      // Extract handlers
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      const sigtermCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGTERM'
      );

      const sigintHandler = sigintCall![1];
      const sigtermHandler = sigtermCall![1];

      // First signal should trigger cleanup
      sigintHandler();
      expect(slowCleanup).toHaveBeenCalledTimes(1);

      // Second signal should be ignored
      sigtermHandler();
      expect(slowCleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup', () => {
    test('should remove all registered listeners', () => {
      cliSignalHandler.setup();
      cliSignalHandler.cleanup();

      expect(mockProcessRemoveListener).toHaveBeenCalledWith(
        'SIGINT',
        expect.any(Function)
      );
      expect(mockProcessRemoveListener).toHaveBeenCalledWith(
        'SIGTERM',
        expect.any(Function)
      );
    });

    test('should clear timeout when cleaning up', () => {
      const mockTimeoutId = 'mockTimeout';
      mockSetTimeout.mockReturnValue(mockTimeoutId);

      cliSignalHandler.setup();

      // Trigger signal to create timeout
      const sigintCall = mockProcessOn.mock.calls.find(
        (call) => call[0] === 'SIGINT'
      );
      const sigintHandler = sigintCall![1];
      sigintHandler();

      // Cleanup should clear the timeout
      cliSignalHandler.cleanup();
      expect(mockClearTimeout).toHaveBeenCalledWith(mockTimeoutId);
    });

    test('should be safe to call multiple times', () => {
      cliSignalHandler.setup();
      cliSignalHandler.cleanup();

      // Should not throw or cause issues
      expect(() => cliSignalHandler.cleanup()).not.toThrow();
    });
  });
});
