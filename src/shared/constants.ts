/**
 * System constants for procman
 *
 * This file contains all system-wide constants used throughout the procman application,
 * including file paths, default values, timeouts, and memory-related constants.
 */

// ファイルパスの定数
export const PROCMAN_DIR = '~/.masuidrive-procman';
export const SOCKET_PATH = '~/.masuidrive-procman/procman.sock';
export const NAMED_PIPE_PATH = '\\\\.\\pipe\\masuidrive-procman';
export const PID_FILE = '~/.masuidrive-procman/daemon.pid';
export const PROCESSES_FILE = '~/.masuidrive-procman/processes.json';
export const DAEMON_LOG_FILE = '~/.masuidrive-procman/daemon.log';
export const APP_LOGS_DIR = '~/.masuidrive-procman/app-logs';

// デフォルト値の定数
export const DEFAULT_NAMESPACE = 'default';
export const DEFAULT_LOG_LINES = 100;
export const DEFAULT_MEMORY_CHECK_INTERVAL = 30000;
export const DEFAULT_MONITOR_INTERVAL = 5000;

// タイムアウト値の定数
export const GRACEFUL_SHUTDOWN_TIMEOUT = 10000;
export const FORCE_KILL_TIMEOUT = 5000;
export const IPC_CONNECTION_TIMEOUT = 5000;
export const PROCESS_START_TIMEOUT = 30000;

// メモリ単位定数
export const MEMORY_MULTIPLIERS = {
  '': 1,
  K: 1024,
  k: 1024,
  M: 1024 * 1024,
  m: 1024 * 1024,
  G: 1024 * 1024 * 1024,
  g: 1024 * 1024 * 1024,
} as const;

export const MEMORY_UNITS = ['', 'K', 'k', 'M', 'm', 'G', 'g'] as const;

// プラットフォーム固有の定数
export const PLATFORM_CONSTANTS = {
  WINDOWS: {
    IPC_PATH: NAMED_PIPE_PATH,
    PATH_SEPARATOR: '\\',
    EOL: '\r\n',
  },
  UNIX: {
    IPC_PATH: SOCKET_PATH,
    PATH_SEPARATOR: '/',
    EOL: '\n',
  },
} as const;

// シグナル定数
export const GRACEFUL_SHUTDOWN_SIGNAL = 'SIGTERM';
export const FORCE_KILL_SIGNAL = 'SIGKILL';
export const PROCESS_CHECK_SIGNAL = 0;

// ログレベル定数
export const LOG_LEVELS = ['info', 'warn', 'error'] as const;
export const LOG_TYPES = ['stdout', 'stderr'] as const;

// ファイル権限定数
export const SOCKET_PERMISSIONS = 0o600;
export const LOG_FILE_PERMISSIONS = 0o644;
export const CONFIG_FILE_PERMISSIONS = 0o600;

// 追加のデフォルト値
export const DEFAULT_PROCESS_CWD = process.cwd();

// 自動再起動の定数
export const MAX_RESTART_COUNT = 10;
export const RESTART_BACKOFF_BASE_DELAY = 1000; // 1秒
export const RESTART_BACKOFF_MAX_DELAY = 30000; // 30秒
export const RESTART_BACKOFF_MULTIPLIER = 2;
export const RESTART_WINDOW_TIME = 300000; // 5分 - この時間内の連続失敗をカウント

// 履歴管理の定数
export const MAX_HISTORY_LENGTH = 100; // 履歴の最大保持件数
export const DEBOUNCE_SAVE_STATE_DELAY = 300; // 状態保存のデバウンス遅延時間（ミリ秒）
