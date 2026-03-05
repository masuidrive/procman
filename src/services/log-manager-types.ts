/**
 * Log Manager Types - ログ管理システムの型定義
 *
 * インターフェース、型、定数の定義
 */

import * as fs from 'fs';
import { LogEntry } from '../shared/logs.js';

// =============================================================================
// Constants
// =============================================================================

/** 特殊文字のエスケープ対象 */
// eslint-disable-next-line no-control-regex
export const ESCAPE_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// =============================================================================
// Interfaces
// =============================================================================

/**
 * ファイル管理のインターフェース（依存性逆転原則）
 */
export interface IFileManager {
  /**
   * ファイルの存在確認・作成
   */
  ensureFileExists(filePath: string): void;

  /**
   * ログディレクトリの確認・作成
   */
  ensureLogDirectory(logDir: string): void;

  /**
   * ファイルの末尾から指定行数を効率的に読み込み
   */
  readTailLines(filePath: string, maxLines: number): Promise<string[]>;

  /**
   * ファイルへのリトライ機能付き書き込み
   */
  writeToFileWithRetry(
    filePath: string,
    content: string,
    maxRetries: number
  ): Promise<void>;
}

/**
 * ログ前処理のインターフェース（依存性逆転原則）
 */
export interface ILogPreprocessor {
  /**
   * ログメッセージの前処理
   */
  preprocessMessage(message: string): string;
}

/**
 * ログレベル判定のインターフェース（Strategy パターン）
 */
export interface ILogLevelStrategy {
  /**
   * ログレベルの判定
   */
  determineLevel(
    type: 'stdout' | 'stderr',
    message: string
  ): 'info' | 'warn' | 'error';
}

/**
 * イベント管理のインターフェース（依存性逆転原則）
 */
export interface IEventManager {
  /**
   * ログイベントの発行
   */
  emitLogEvent(logEntry: LogEntry): void;

  /**
   * ファイル変更イベントの発行
   */
  emitFileChangeEvent(data: {
    appName: string;
    file: string;
    type: string;
  }): void;

  /**
   * ディスク容量エラーイベントの発行
   */
  emitDiskSpaceErrorEvent(data: {
    filePath: string;
    appName: string;
    timestamp: number;
    message: string;
  }): void;
}

/**
 * アプリケーション固有のログ設定
 */
export interface AppLogConfig {
  /** 統合ログファイルパス */
  logFile?: string | null;
  /** stdout専用ログファイルパス */
  outFile?: string | null;
  /** stderr専用ログファイルパス */
  errorFile?: string | null;
  /** ネームスペース */
  namespace?: string;
}

/**
 * 内部ログ情報管理
 */
export interface AppLogInfo {
  /** アプリケーション名 */
  appName: string;
  /** ネームスペース */
  namespace: string;
  /** 統合ログファイルパス */
  logFile: string | null;
  /** stdout専用ログファイルパス */
  outFile: string | null;
  /** stderr専用ログファイルパス */
  errorFile: string | null;
  /** 書き込みストリーム（現在は未使用だが互換性のため保持） */
  streams: {
    combined?: fs.WriteStream;
    stdout?: fs.WriteStream;
    stderr?: fs.WriteStream;
  };
}

/**
 * ログバッファエントリ
 */
export interface BufferedLogEntry {
  logEntry: LogEntry;
  targetFiles: string[];
  timestamp: number;
}
