/**
 * Log management type definitions
 *
 * This file contains type definitions for log management functionality including
 * log entries, log options, log output formats, and log file management.
 */

import type { LogLevel, LogType } from './types';

/**
 * ログエントリの型定義
 * 個々のログエントリを表すインターフェース
 */
export interface LogEntry {
  /** タイムスタンプ（Unix時間、ミリ秒） */
  timestamp: number;
  /** ログレベル */
  level: LogLevel;
  /** ログメッセージ */
  message: string;
  /** アプリケーション名 */
  app: string;
  /** 名前空間 */
  namespace: string;
  /** ログタイプ（stdout/stderr） */
  type: LogType;
}

/**
 * ログオプションの型定義
 * ログ表示・取得時のオプション設定
 */
export interface LogOptions {
  /** 表示する行数（-n オプション） */
  lines?: number;
  /** 人間が読みやすい形式で表示（--human オプション） */
  human?: boolean;
  /** リアルタイムストリーミング（--stream オプション） */
  stream?: boolean;
  /** フォロー（-f, --follow オプション） */
  follow?: boolean;
  /** 開始時刻からのフィルタ */
  since?: number;
  /** 終了時刻までのフィルタ */
  until?: number;
  /** ログレベルによるフィルタ */
  level?: LogLevel | LogLevel[];
  /** ログタイプによるフィルタ */
  type?: LogType | LogType[];
  /** アプリケーション名によるフィルタ */
  app?: string | string[];
  /** 名前空間によるフィルタ */
  namespace?: string | string[];
  /** メッセージのパターンマッチング */
  pattern?: string;
  /** 正規表現フラグ */
  regex?: boolean;
  /** 大文字小文字を区別しない検索 */
  ignoreCase?: boolean;
}

/**
 * ログ出力形式の型定義
 */
export type LogFormat =
  | 'default' // デフォルト形式
  | 'json' // JSON形式
  | 'compact' // コンパクト形式
  | 'raw' // 生ログ形式
  | 'timestamp' // タイムスタンプ付き形式
  | 'pretty'; // 色付きの見やすい形式

/**
 * ログ出力設定
 */
export interface LogOutputConfig {
  /** 出力形式 */
  format: LogFormat;
  /** カラー出力の有効/無効 */
  colors?: boolean;
  /** タイムスタンプの形式 */
  timestampFormat?: 'iso' | 'relative' | 'unix';
  /** 出力する最大文字数 */
  maxLength?: number;
  /** 改行文字 */
  lineEnding?: '\n' | '\r\n';
  /** インデント文字数（JSON形式時） */
  indent?: number;
}

/**
 * ログファイル管理の型定義
 */
export interface LogFileInfo {
  /** ファイルパス */
  path: string;
  /** ファイルサイズ（バイト） */
  size: number;
  /** 作成日時 */
  createdAt: number;
  /** 最終更新日時 */
  modifiedAt: number;
  /** 最終アクセス日時 */
  accessedAt: number;
  /** ファイルの種類 */
  type: 'stdout' | 'stderr' | 'combined' | 'daemon';
  /** アプリケーション名（daemon以外） */
  app?: string;
  /** 名前空間（daemon以外） */
  namespace?: string;
  /** 読み取り可能かどうか */
  readable: boolean;
  /** 書き込み可能かどうか */
  writable: boolean;
}

/**
 * ログファイル管理設定
 */
export interface LogFileConfig {
  /** ログファイルの保存ディレクトリ */
  logDir: string;
  /** ログファイルの最大サイズ（バイト） */
  maxSize?: number;
  /** 保持するログファイル数 */
  maxFiles?: number;
  /** ログローテーション有効/無効 */
  rotate?: boolean;
  /** ローテーション間隔（ミリ秒） */
  rotateInterval?: number;
  /** 圧縮設定 */
  compress?: boolean;
  /** ログファイルの権限 */
  permissions?: number;
  /** ファイル名のパターン */
  filenamePattern?: string;
  /** 日付形式（ファイル名用） */
  dateFormat?: string;
}

/**
 * ログローテーション設定
 */
export interface LogRotationConfig {
  /** ローテーション有効/無効 */
  enabled: boolean;
  /** 最大ファイルサイズ */
  maxSize: number;
  /** 保持するファイル数 */
  maxFiles: number;
  /** 圧縮設定 */
  compress: boolean;
  /** ローテーション間隔（ミリ秒） */
  interval?: number;
  /** ローテーション時刻（24時間形式: "HH:MM"） */
  time?: string;
  /** ローテーション曜日（0-6、0は日曜日） */
  dayOfWeek?: number;
}

/**
 * ログストリーミング設定
 */
export interface LogStreamConfig {
  /** バッファサイズ */
  bufferSize?: number;
  /** フラッシュ間隔（ミリ秒） */
  flushInterval?: number;
  /** 最大接続数 */
  maxConnections?: number;
  /** タイムアウト（ミリ秒） */
  timeout?: number;
  /** 接続キープアライブ */
  keepAlive?: boolean;
  /** バックプレッシャー制御 */
  backpressure?: boolean;
  /** 最大キューサイズ */
  maxQueueSize?: number;
}

/**
 * ログ検索設定
 */
export interface LogSearchConfig {
  /** 検索パターン */
  pattern: string;
  /** 正規表現使用 */
  regex?: boolean;
  /** 大文字小文字を区別しない */
  ignoreCase?: boolean;
  /** 全体マッチング */
  wholeWord?: boolean;
  /** 最大結果数 */
  maxResults?: number;
  /** 検索タイムアウト（ミリ秒） */
  timeout?: number;
  /** コンテキスト行数 */
  context?: number;
}

/**
 * ログイベントの型定義
 */
export interface LogEvent {
  /** イベントタイプ */
  type: 'new' | 'rotation' | 'error' | 'overflow';
  /** タイムスタンプ */
  timestamp: number;
  /** アプリケーション名 */
  app?: string;
  /** 名前空間 */
  namespace?: string;
  /** ファイルパス */
  filePath?: string;
  /** エラーメッセージ（errorタイプの場合） */
  error?: string;
  /** 追加データ */
  data?: Record<string, unknown>;
}

/**
 * ログ統計情報
 */
export interface LogStats {
  /** 総ログエントリ数 */
  totalEntries: number;
  /** ログレベル別カウント */
  levelCounts: Record<LogLevel, number>;
  /** ログタイプ別カウント */
  typeCounts: Record<LogType, number>;
  /** アプリケーション別カウント */
  appCounts: Record<string, number>;
  /** 名前空間別カウント */
  namespaceCounts: Record<string, number>;
  /** 最初のログエントリのタイムスタンプ */
  firstEntry?: number;
  /** 最後のログエントリのタイムスタンプ */
  lastEntry?: number;
  /** 総ファイルサイズ（バイト） */
  totalSize: number;
  /** ファイル数 */
  fileCount: number;
}

/**
 * ログクエリ結果
 */
export interface LogQueryResult {
  /** ログエントリ */
  entries: LogEntry[];
  /** 総エントリ数（フィルタ前） */
  totalCount: number;
  /** フィルタ後のエントリ数 */
  filteredCount: number;
  /** 次のページがあるかどうか */
  hasMore: boolean;
  /** 次のページのカーソル */
  nextCursor?: string;
  /** 検索にかかった時間（ミリ秒） */
  searchTime: number;
}

/**
 * ログ管理操作の結果型
 */
export interface LogOperationResult {
  /** 操作の成功/失敗 */
  success: boolean;
  /** エラーメッセージ（失敗時） */
  error?: string;
  /** 処理されたファイル数 */
  processedFiles?: number;
  /** 削除されたファイル数 */
  deletedFiles?: number;
  /** 圧縮されたファイル数 */
  compressedFiles?: number;
  /** 処理されたバイト数 */
  processedBytes?: number;
}

/**
 * ログ監視設定
 */
export interface LogWatchConfig {
  /** 監視間隔（ミリ秒） */
  interval?: number;
  /** 監視するファイルパターン */
  patterns?: string[];
  /** 除外するファイルパターン */
  excludePatterns?: string[];
  /** 再帰的監視 */
  recursive?: boolean;
  /** イベント種別の監視設定 */
  events?: {
    create?: boolean;
    modify?: boolean;
    delete?: boolean;
    move?: boolean;
  };
  /** デバウンス時間（ミリ秒） */
  debounce?: number;
}

/**
 * ログアーカイブ設定
 */
export interface LogArchiveConfig {
  /** アーカイブ有効/無効 */
  enabled: boolean;
  /** アーカイブディレクトリ */
  archiveDir: string;
  /** アーカイブまでの日数 */
  retentionDays: number;
  /** 圧縮形式 */
  compressionFormat: 'gzip' | 'zip' | 'bzip2';
  /** アーカイブ実行時刻 */
  scheduleTime?: string;
  /** 暗号化設定 */
  encryption?: {
    enabled: boolean;
    algorithm: string;
    key?: string;
  };
}

// ===== 型ガード関数 =====

/**
 * LogEntry型のチェック
 */
export function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.timestamp === 'number' &&
    typeof obj.level === 'string' &&
    ['info', 'warn', 'error'].includes(obj.level as string) &&
    typeof obj.message === 'string' &&
    typeof obj.app === 'string' &&
    typeof obj.namespace === 'string' &&
    typeof obj.type === 'string' &&
    ['stdout', 'stderr'].includes(obj.type as string)
  );
}

/**
 * LogOptions型のチェック
 */
export function isLogOptions(value: unknown): value is LogOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    (obj.lines === undefined || typeof obj.lines === 'number') &&
    (obj.human === undefined || typeof obj.human === 'boolean') &&
    (obj.stream === undefined || typeof obj.stream === 'boolean') &&
    (obj.follow === undefined || typeof obj.follow === 'boolean') &&
    (obj.since === undefined || typeof obj.since === 'number') &&
    (obj.until === undefined || typeof obj.until === 'number')
  );
}

/**
 * LogFileInfo型のチェック
 */
export function isLogFileInfo(value: unknown): value is LogFileInfo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.path === 'string' &&
    typeof obj.size === 'number' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.modifiedAt === 'number' &&
    typeof obj.accessedAt === 'number' &&
    typeof obj.type === 'string' &&
    ['stdout', 'stderr', 'combined', 'daemon'].includes(obj.type as string) &&
    typeof obj.readable === 'boolean' &&
    typeof obj.writable === 'boolean'
  );
}

// ===== ヘルパー関数 =====

/**
 * LogEntryを作成するヘルパー関数
 */
export function createLogEntry(
  message: string,
  app: string,
  namespace: string,
  level: LogLevel = 'info',
  type: LogType = 'stdout'
): LogEntry {
  return {
    timestamp: Date.now(),
    level,
    message,
    app,
    namespace,
    type,
  };
}

/**
 * デフォルトのLogOptionsを作成
 */
export function createDefaultLogOptions(): LogOptions {
  return {
    lines: 100,
    human: false,
    stream: false,
    follow: false,
  };
}

/**
 * デフォルトのLogOutputConfigを作成
 */
export function createDefaultLogOutputConfig(): LogOutputConfig {
  return {
    format: 'default',
    colors: true,
    timestampFormat: 'iso',
    lineEnding: '\n',
    indent: 2,
  };
}

/**
 * デフォルトのLogFileConfigを作成
 */
export function createDefaultLogFileConfig(logDir: string): LogFileConfig {
  return {
    logDir,
    maxSize: 50 * 1024 * 1024, // 50MB
    maxFiles: 10,
    rotate: true,
    rotateInterval: 24 * 60 * 60 * 1000, // 24時間
    compress: true,
    permissions: 0o644,
    filenamePattern: '{app}-{namespace}-{type}-{date}.log',
    dateFormat: 'YYYY-MM-DD',
  };
}

/**
 * タイムスタンプを人間が読みやすい形式にフォーマット
 */
export function formatTimestamp(
  timestamp: number,
  format: 'iso' | 'relative' | 'unix' = 'iso'
): string {
  const date = new Date(timestamp);

  switch (format) {
    case 'iso': {
      return date.toISOString();
    }
    case 'relative': {
      const now = Date.now();
      const diff = now - timestamp;
      if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return `${Math.floor(diff / 86400000)}d ago`;
    }
    case 'unix': {
      return timestamp.toString();
    }
    default: {
      return date.toISOString();
    }
  }
}

// ===== 定数 =====

/**
 * ログ管理関連の定数
 */
export const LOG_CONSTANTS = {
  /** デフォルトのログ行数 */
  DEFAULT_LOG_LINES: 100,
  /** デフォルトのログファイル最大サイズ（50MB） */
  DEFAULT_MAX_FILE_SIZE: 50 * 1024 * 1024,
  /** デフォルトの保持ファイル数 */
  DEFAULT_MAX_FILES: 10,
  /** デフォルトのローテーション間隔（24時間） */
  DEFAULT_ROTATION_INTERVAL: 24 * 60 * 60 * 1000,
  /** デフォルトのストリームバッファサイズ */
  DEFAULT_STREAM_BUFFER_SIZE: 64 * 1024,
  /** デフォルトのフラッシュ間隔（1秒） */
  DEFAULT_FLUSH_INTERVAL: 1000,
  /** デフォルトの最大接続数 */
  DEFAULT_MAX_CONNECTIONS: 10,
  /** デフォルトのタイムアウト（30秒） */
  DEFAULT_TIMEOUT: 30000,
  /** ログエントリの最大メッセージ長 */
  MAX_MESSAGE_LENGTH: 10000,
  /** 検索結果の最大数 */
  MAX_SEARCH_RESULTS: 1000,
  /** アーカイブのデフォルト保持日数 */
  DEFAULT_RETENTION_DAYS: 30,
} as const;

/**
 * サポートされるログフォーマット
 */
export const SUPPORTED_LOG_FORMATS = Object.freeze([
  'default',
  'json',
  'compact',
  'raw',
  'timestamp',
  'pretty',
] as const);

/**
 * サポートされる圧縮形式
 */
export const SUPPORTED_COMPRESSION_FORMATS = Object.freeze([
  'gzip',
  'zip',
  'bzip2',
] as const);

/**
 * ログファイルの拡張子マッピング
 */
export const LOG_FILE_EXTENSIONS = Object.freeze({
  log: 'log',
  json: 'json',
  txt: 'txt',
  out: 'out',
  err: 'err',
} as const);
