/**
 * Process management types for procman
 *
 * This file contains all process-related type definitions, including process status,
 * process information, process management operations, and memory limit types.
 */

import { ErrorCode } from './errors';
import { MemorySize, LogLevel, ProcessSignal } from './types';

// プロセス状態の型定義
export type ProcessStatus =
  | 'stopped'
  | 'starting'
  | 'online'
  | 'stopping'
  | 'errored'
  | 'max-memory';

// プロセス情報の型定義
export interface ProcessInfo {
  name: string;
  namespace: string;
  status: ProcessStatus;
  pid: number | null;
  uptime: number;
  memory: number;
  cpu: number;
  restarts: number;
  note?: string;
}

// プロセス管理操作の型定義

// プロセス開始オプション
export interface ProcessStartOptions {
  name: string;
  namespace?: string;
  force?: boolean;
  timeout?: number;
}

// プロセス停止オプション
export interface ProcessStopOptions {
  name: string;
  namespace?: string;
  signal?: ProcessSignal;
  timeout?: number;
  force?: boolean;
}

// プロセス再起動オプション
export interface ProcessRestartOptions {
  name: string;
  namespace?: string;
  graceful?: boolean;
  timeout?: number;
}

// プロセス一覧取得オプション
export interface ProcessListOptions {
  namespace?: string;
  status?: ProcessStatus;
  sortBy?: 'name' | 'namespace' | 'status' | 'uptime' | 'memory' | 'cpu';
  order?: 'asc' | 'desc';
}

// プロセス削除オプション
export interface ProcessDeleteOptions {
  name: string;
  namespace?: string;
  force?: boolean;
}

// プロセス監視オプション
export interface ProcessMonitorOptions {
  interval?: number;
  includeMemory?: boolean;
  includeCpu?: boolean;
}

// プロセス管理操作の結果
export interface ProcessOperationResult {
  success: boolean;
  message: string;
  processInfo?: ProcessInfo;
  errorCode?: ErrorCode;
  details?: Record<string, unknown>;
}

// プロセス統計情報
export interface ProcessStats {
  name: string;
  namespace: string;
  uptime: number;
  memory: {
    current: number;
    max: number;
    unit: 'bytes' | 'KB' | 'MB' | 'GB';
  };
  cpu: {
    current: number;
    average: number;
  };
  restarts: number;
  lastRestart?: number;
}

// メモリ制限に関する型定義

// メモリ制限設定
export interface MemoryLimit {
  max: MemorySize;
  warning?: MemorySize;
  action: 'restart' | 'notify' | 'kill';
  checkInterval?: number;
}

// メモリ使用量情報
export interface MemoryUsage {
  current: number;
  max: number;
  percentage: number;
  unit: 'bytes' | 'KB' | 'MB' | 'GB';
  timestamp: number;
}

// メモリ監視設定
export interface MemoryMonitorConfig {
  enabled: boolean;
  checkInterval: number;
  warningThreshold: number;
  errorThreshold: number;
  action: 'log' | 'restart' | 'kill';
}

// プロセスイベント関連の型定義

// プロセスイベントタイプ
export type ProcessEventType =
  | 'start'
  | 'stop'
  | 'restart'
  | 'error'
  | 'memory-limit'
  | 'cpu-limit'
  | 'log'
  | 'status-change';

// プロセスイベント
export interface ProcessEvent {
  type: ProcessEventType;
  processName: string;
  namespace: string;
  timestamp: number;
  pid?: number;
  previousStatus?: ProcessStatus;
  currentStatus: ProcessStatus;
  message?: string;
  data?: Record<string, unknown>;
}

// プロセスログエントリ
export interface ProcessLogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  processName: string;
  namespace: string;
  pid?: number;
  source: 'stdout' | 'stderr' | 'system';
}

// プロセス設定検証用の型定義

// プロセス設定の検証結果
export interface ProcessConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  processName: string;
}

// プロセス名の検証
export type ProcessNameValidation = {
  valid: boolean;
  error?: string;
};

// 名前空間の検証
export type NamespaceValidation = {
  valid: boolean;
  error?: string;
};

// プロセス管理に関する型ガード関数

// プロセス状態の型ガード
export function isValidProcessStatus(status: string): status is ProcessStatus {
  return [
    'stopped',
    'starting',
    'online',
    'stopping',
    'errored',
    'max-memory',
  ].includes(status);
}

// プロセス情報の型ガード
export function isProcessInfo(obj: unknown): obj is ProcessInfo {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const info = obj as Record<string, unknown>;

  return (
    typeof info.name === 'string' &&
    typeof info.namespace === 'string' &&
    isValidProcessStatus(info.status as string) &&
    (info.pid === null || typeof info.pid === 'number') &&
    typeof info.uptime === 'number' &&
    typeof info.memory === 'number' &&
    typeof info.cpu === 'number' &&
    typeof info.restarts === 'number' &&
    (info.note === undefined || typeof info.note === 'string')
  );
}

// プロセスイベントの型ガード
export function isProcessEvent(obj: unknown): obj is ProcessEvent {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const event = obj as Record<string, unknown>;

  return (
    typeof event.type === 'string' &&
    typeof event.processName === 'string' &&
    typeof event.namespace === 'string' &&
    typeof event.timestamp === 'number' &&
    isValidProcessStatus(event.currentStatus as string) &&
    (event.pid === undefined || typeof event.pid === 'number') &&
    (event.previousStatus === undefined ||
      isValidProcessStatus(event.previousStatus as string)) &&
    (event.message === undefined || typeof event.message === 'string')
  );
}

// プロセス管理のヘルパー型定義

// プロセス検索クエリ
export interface ProcessQuery {
  name?: string;
  namespace?: string;
  status?: ProcessStatus[];
  pid?: number;
  pattern?: string; // 名前のパターンマッチング用
}

// プロセス実行環境
export interface ProcessExecutionEnvironment {
  cwd?: string;
  env?: Record<string, string>;
  user?: string;
  group?: string;
  timeout?: number;
}

// プロセスリソース制限
export interface ProcessResourceLimits {
  memory?: MemoryLimit;
  cpu?: {
    max: number; // CPU使用率の上限（パーセント）
    checkInterval?: number;
  };
  fileDescriptors?: number;
  processes?: number;
}

// プロセス健全性チェック
export interface ProcessHealthCheck {
  enabled: boolean;
  interval: number;
  timeout: number;
  retries: number;
  command?: string;
  httpUrl?: string;
  tcpPort?: number;
}

// プロセスバックアップ設定
export interface ProcessBackupConfig {
  enabled: boolean;
  interval: number;
  retention: number;
  location: string;
  compress: boolean;
}

// エクスポート用の型定義集約
export type ProcessManagementTypes = {
  ProcessStatus: ProcessStatus;
  ProcessInfo: ProcessInfo;
  ProcessOperationResult: ProcessOperationResult;
  ProcessStats: ProcessStats;
  MemoryLimit: MemoryLimit;
  MemoryUsage: MemoryUsage;
  ProcessEvent: ProcessEvent;
  ProcessLogEntry: ProcessLogEntry;
};

// プロセス管理に関する定数
export const PROCESS_CONSTANTS = {
  MAX_PROCESS_NAME_LENGTH: 50,
  MAX_NAMESPACE_LENGTH: 30,
  MIN_MEMORY_LIMIT: '10M',
  MAX_RESTART_ATTEMPTS: 10,
  DEFAULT_HEALTH_CHECK_INTERVAL: 30000,
  DEFAULT_MEMORY_CHECK_INTERVAL: 5000,
  DEFAULT_CPU_LIMIT: 80, // パーセント
  PROCESS_NAME_PATTERN: /^[a-zA-Z0-9_-]+$/,
  NAMESPACE_PATTERN: /^[a-zA-Z0-9_-]+$/,
} as const;
