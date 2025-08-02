/**
 * Utility types for procman constants
 *
 * This file contains utility types that work with the system constants,
 * providing type safety and better developer experience.
 */

import { MEMORY_UNITS, LOG_LEVELS, LOG_TYPES } from './constants';

// メモリ単位の型定義
export type MemoryUnit = (typeof MEMORY_UNITS)[number];

// ログレベルの型定義
export type LogLevel = (typeof LOG_LEVELS)[number];

// ログタイプの型定義
export type LogType = (typeof LOG_TYPES)[number];

// プラットフォーム型定義
export type Platform = 'WINDOWS' | 'UNIX';

// メモリサイズ文字列の型定義
export type MemorySize = `${number}${MemoryUnit}`;

// ファイルパス型の定義
export type FilePath = string;

// プロセスシグナル型の定義
export type ProcessSignal = 'SIGTERM' | 'SIGKILL' | number;
