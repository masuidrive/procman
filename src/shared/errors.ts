/**
 * Error management types and utilities for procman
 *
 * This file contains all error-related type definitions, including error codes,
 * error messages, custom error classes, and error handling utilities.
 */

// エラーコードの型定義
export type ErrorCode =
  | 'DAEMON_NOT_RUNNING'
  | 'DAEMON_CONNECTION_FAILED'
  | 'PERMISSION_DENIED'
  | 'CONFIG_FILE_NOT_FOUND'
  | 'CONFIG_PARSE_ERROR'
  | 'CONFIG_VALIDATION_ERROR'
  | 'PROCESS_NOT_FOUND'
  | 'PROCESS_START_FAILED'
  | 'LOG_FILE_NOT_FOUND';

// エラーメッセージの型定義
export type ErrorMessage = {
  [K in ErrorCode]: string;
};

// エラーメッセージのマッピング
export const ERROR_MESSAGES: ErrorMessage = {
  DAEMON_NOT_RUNNING: 'Daemon is not running. Please start the daemon first.',
  DAEMON_CONNECTION_FAILED:
    'Failed to connect to daemon. Check if daemon is running.',
  PERMISSION_DENIED:
    'Permission denied. Please check file/directory permissions.',
  CONFIG_FILE_NOT_FOUND: 'Configuration file not found.',
  CONFIG_PARSE_ERROR: 'Failed to parse configuration file. Check file syntax.',
  CONFIG_VALIDATION_ERROR:
    'Configuration validation failed. Check configuration values.',
  PROCESS_NOT_FOUND: 'Process not found. Check process name and namespace.',
  PROCESS_START_FAILED: 'Failed to start process. Check process configuration.',
  LOG_FILE_NOT_FOUND: 'Log file not found.',
} as const;

// カスタムエラークラスの型定義
export interface ProcmanErrorOptions {
  code: ErrorCode;
  message?: string;
  cause?: Error;
  details?: Record<string, unknown>;
}

// カスタムエラークラス
export class ProcmanError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly cause?: Error;

  constructor(options: ProcmanErrorOptions) {
    const message = options.message ?? ERROR_MESSAGES[options.code];
    super(message);

    this.name = 'ProcmanError';
    this.code = options.code;
    this.details = options.details;
    this.cause = options.cause;

    // スタックトレースを正しく設定
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProcmanError);
    }
  }

  // エラー情報をJSON形式で出力
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }

  // エラー情報を文字列で出力
  public toString(): string {
    let result = `${this.name} [${this.code}]: ${this.message}`;

    if (this.details) {
      result += `\nDetails: ${JSON.stringify(this.details, null, 2)}`;
    }

    if (this.cause) {
      result += `\nCaused by: ${this.cause.message}`;
    }

    return result;
  }
}

// エラーハンドリング用のユーティリティ型

// 成功/失敗を表すResult型
export type Result<T, E = ProcmanError> =
  | { success: true; data: T }
  | { success: false; error: E };

// 非同期操作のResult型
export type AsyncResult<T, E = ProcmanError> = Promise<Result<T, E>>;

// エラーハンドラーの型定義
export type ErrorHandler<T = void> = (error: ProcmanError) => T;

// エラー情報の詳細型
export interface ErrorDetails {
  timestamp: number;
  code: ErrorCode;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

// エラーログエントリの型定義
export interface ErrorLogEntry {
  timestamp: number;
  level: 'error';
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  source?: string;
}

// エラー作成用のヘルパー関数の型定義
export type CreateError = (
  code: ErrorCode,
  options?: Omit<ProcmanErrorOptions, 'code'>
) => ProcmanError;

// エラーチェック用の型ガード
export function isProcmanError(error: unknown): error is ProcmanError {
  return error instanceof ProcmanError;
}

// エラーコードチェック用の型ガード
export function hasErrorCode<T extends ErrorCode>(
  error: ProcmanError,
  code: T
): error is ProcmanError & { code: T } {
  return error.code === code;
}

// Result型のヘルパー関数
export function createSuccess<T>(data: T): Result<T, never> {
  return { success: true, data };
}

export function createFailure<E extends ProcmanError>(
  error: E
): Result<never, E> {
  return { success: false, error };
}

// Result型の型ガード
export function isSuccess<T, E>(
  result: Result<T, E>
): result is { success: true; data: T } {
  return result.success;
}

export function isFailure<T, E>(
  result: Result<T, E>
): result is { success: false; error: E } {
  return !result.success;
}

// エラー作成用のヘルパー関数
export const createError: CreateError = (code, options = {}) => {
  return new ProcmanError({ code, ...options });
};

// よく使用されるエラーの作成関数
export const createDaemonNotRunningError = (
  details?: Record<string, unknown>
): ProcmanError => createError('DAEMON_NOT_RUNNING', { details });

export const createConfigNotFoundError = (filePath: string): ProcmanError =>
  createError('CONFIG_FILE_NOT_FOUND', {
    details: { filePath },
  });

export const createProcessNotFoundError = (
  name: string,
  namespace?: string
): ProcmanError =>
  createError('PROCESS_NOT_FOUND', {
    details: { name, namespace },
  });

export const createPermissionDeniedError = (resource: string): ProcmanError =>
  createError('PERMISSION_DENIED', {
    details: { resource },
  });
