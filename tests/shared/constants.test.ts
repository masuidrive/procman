/**
 * Unit tests for system constants
 */
import { describe, it, expect } from 'vitest';
import {
  // File path constants
  PROCMAN_DIR,
  SOCKET_PATH,
  NAMED_PIPE_PATH,
  PID_FILE,
  PROCESSES_FILE,
  DAEMON_LOG_FILE,
  APP_LOGS_DIR,

  // Default value constants
  DEFAULT_NAMESPACE,
  DEFAULT_LOG_LINES,
  DEFAULT_MEMORY_CHECK_INTERVAL,
  DEFAULT_MONITOR_INTERVAL,

  // Timeout value constants
  GRACEFUL_SHUTDOWN_TIMEOUT,
  FORCE_KILL_TIMEOUT,
  IPC_CONNECTION_TIMEOUT,
  PROCESS_START_TIMEOUT,

  // Memory unit constants
  MEMORY_MULTIPLIERS,
  MEMORY_UNITS,

  // Platform constants
  PLATFORM_CONSTANTS,

  // Signal constants
  GRACEFUL_SHUTDOWN_SIGNAL,
  FORCE_KILL_SIGNAL,
  PROCESS_CHECK_SIGNAL,

  // Log constants
  LOG_LEVELS,
  LOG_TYPES,

  // File permission constants
  SOCKET_PERMISSIONS,
  LOG_FILE_PERMISSIONS,
  CONFIG_FILE_PERMISSIONS,

  // Additional defaults
  DEFAULT_PROCESS_CWD,
} from '../../src/shared/constants';

describe('File Path Constants', () => {
  it('should have correct procman directory path', () => {
    expect(PROCMAN_DIR).toBe('~/.masuidrive-procman');
  });

  it('should have correct socket path', () => {
    expect(SOCKET_PATH).toBe('~/.masuidrive-procman/procman.sock');
  });

  it('should have correct Windows named pipe path', () => {
    expect(NAMED_PIPE_PATH).toBe('\\\\.\\pipe\\masuidrive-procman');
  });

  it('should have correct PID file path', () => {
    expect(PID_FILE).toBe('~/.masuidrive-procman/daemon.pid');
  });

  it('should have correct processes file path', () => {
    expect(PROCESSES_FILE).toBe('~/.masuidrive-procman/processes.json');
  });

  it('should have correct daemon log file path', () => {
    expect(DAEMON_LOG_FILE).toBe('~/.masuidrive-procman/daemon.log');
  });

  it('should have correct app logs directory path', () => {
    expect(APP_LOGS_DIR).toBe('~/.masuidrive-procman/app-logs');
  });
});

describe('Default Value Constants', () => {
  it('should have correct default namespace', () => {
    expect(DEFAULT_NAMESPACE).toBe('default');
  });

  it('should have correct default log lines', () => {
    expect(DEFAULT_LOG_LINES).toBe(100);
  });

  it('should have correct default memory check interval', () => {
    expect(DEFAULT_MEMORY_CHECK_INTERVAL).toBe(30000);
  });

  it('should have correct default monitor interval', () => {
    expect(DEFAULT_MONITOR_INTERVAL).toBe(5000);
  });

  it('should have correct default process CWD', () => {
    expect(DEFAULT_PROCESS_CWD).toBe(process.cwd());
  });
});

describe('Timeout Value Constants', () => {
  it('should have correct graceful shutdown timeout', () => {
    expect(GRACEFUL_SHUTDOWN_TIMEOUT).toBe(10000);
  });

  it('should have correct force kill timeout', () => {
    expect(FORCE_KILL_TIMEOUT).toBe(5000);
  });

  it('should have correct IPC connection timeout', () => {
    expect(IPC_CONNECTION_TIMEOUT).toBe(5000);
  });

  it('should have correct process start timeout', () => {
    expect(PROCESS_START_TIMEOUT).toBe(30000);
  });
});

describe('Memory Unit Constants', () => {
  it('should have correct memory multipliers', () => {
    expect(MEMORY_MULTIPLIERS['']).toBe(1);
    expect(MEMORY_MULTIPLIERS['K']).toBe(1024);
    expect(MEMORY_MULTIPLIERS['k']).toBe(1024);
    expect(MEMORY_MULTIPLIERS['M']).toBe(1024 * 1024);
    expect(MEMORY_MULTIPLIERS['m']).toBe(1024 * 1024);
    expect(MEMORY_MULTIPLIERS['G']).toBe(1024 * 1024 * 1024);
    expect(MEMORY_MULTIPLIERS['g']).toBe(1024 * 1024 * 1024);
  });

  it('should have correct memory units array', () => {
    expect(MEMORY_UNITS).toEqual(['', 'K', 'k', 'M', 'm', 'G', 'g']);
  });

  it('should have all memory units in multipliers', () => {
    MEMORY_UNITS.forEach((unit) => {
      expect(MEMORY_MULTIPLIERS).toHaveProperty(unit);
    });
  });
});

describe('Platform Constants', () => {
  it('should have correct Windows platform constants', () => {
    expect(PLATFORM_CONSTANTS.WINDOWS.IPC_PATH).toBe(NAMED_PIPE_PATH);
    expect(PLATFORM_CONSTANTS.WINDOWS.PATH_SEPARATOR).toBe('\\');
    expect(PLATFORM_CONSTANTS.WINDOWS.EOL).toBe('\r\n');
  });

  it('should have correct Unix platform constants', () => {
    expect(PLATFORM_CONSTANTS.UNIX.IPC_PATH).toBe(SOCKET_PATH);
    expect(PLATFORM_CONSTANTS.UNIX.PATH_SEPARATOR).toBe('/');
    expect(PLATFORM_CONSTANTS.UNIX.EOL).toBe('\n');
  });
});

describe('Signal Constants', () => {
  it('should have correct signal values', () => {
    expect(GRACEFUL_SHUTDOWN_SIGNAL).toBe('SIGTERM');
    expect(FORCE_KILL_SIGNAL).toBe('SIGKILL');
    expect(PROCESS_CHECK_SIGNAL).toBe(0);
  });
});

describe('Log Constants', () => {
  it('should have correct log levels', () => {
    expect(LOG_LEVELS).toEqual(['info', 'warn', 'error']);
  });

  it('should have correct log types', () => {
    expect(LOG_TYPES).toEqual(['stdout', 'stderr']);
  });
});

describe('File Permission Constants', () => {
  it('should have correct file permissions', () => {
    expect(SOCKET_PERMISSIONS).toBe(0o600);
    expect(LOG_FILE_PERMISSIONS).toBe(0o644);
    expect(CONFIG_FILE_PERMISSIONS).toBe(0o600);
  });

  it('should have valid octal permission values', () => {
    expect(SOCKET_PERMISSIONS).toBeGreaterThan(0);
    expect(LOG_FILE_PERMISSIONS).toBeGreaterThan(0);
    expect(CONFIG_FILE_PERMISSIONS).toBeGreaterThan(0);

    // Check that permissions are reasonable (not more than 0o777)
    expect(SOCKET_PERMISSIONS).toBeLessThanOrEqual(0o777);
    expect(LOG_FILE_PERMISSIONS).toBeLessThanOrEqual(0o777);
    expect(CONFIG_FILE_PERMISSIONS).toBeLessThanOrEqual(0o777);
  });
});
