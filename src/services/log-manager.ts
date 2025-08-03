/**
 * Log Manager - ログ管理システム
 *
 * アプリケーションプロセスのstdout/stderrを集約し、JSONL形式でログを管理する。
 * リアルタイムログストリーミング機能とファイル管理を提供する。
 */

/* global NodeJS */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LogEntry, LogOptions } from '../shared/logs.js';
import {
  LogManagerConfig,
  DEFAULT_LOG_MANAGER_CONFIG,
} from './log-manager-config.js';
import {
  LogPathValidator,
  SecureLogPathBuilder,
} from './log-path-validator.js';

// Node.js global timer functions (for ESLint)
declare const setTimeout: (callback: () => void, ms: number) => NodeJS.Timeout;
declare const clearTimeout: (id: NodeJS.Timeout) => void;

// =============================================================================
// Constants
// =============================================================================

/** 特殊文字のエスケープ対象 */
// eslint-disable-next-line no-control-regex
const ESCAPE_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// =============================================================================
// Interfaces
// =============================================================================

/**
 * ファイル管理のインターフェース（依存性逆転原則）
 */
interface IFileManager {
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
interface ILogPreprocessor {
  /**
   * ログメッセージの前処理
   */
  preprocessMessage(message: string): string;
}

/**
 * ログレベル判定のインターフェース（Strategy パターン）
 */
interface ILogLevelStrategy {
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
interface IEventManager {
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
interface AppLogConfig {
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
interface AppLogInfo {
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
interface BufferedLogEntry {
  logEntry: LogEntry;
  targetFiles: string[];
  timestamp: number;
}

// =============================================================================
// FileManager Class
// =============================================================================

/**
 * FileManager - ファイル操作の専門クラス（単一責任原則）
 */
class FileManager implements IFileManager {
  constructor(private config: LogManagerConfig = DEFAULT_LOG_MANAGER_CONFIG) {}
  /**
   * ファイルの存在確認・作成
   */
  public ensureFileExists(filePath: string): void {
    try {
      // ディレクトリの確認・作成
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
          recursive: true,
          mode: this.config.file.directoryMode,
        });
      }

      // ファイルが存在しない場合は空ファイルを作成
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '', { mode: this.config.file.fileMode });
      }
    } catch (error) {
      console.warn(
        `[FileManager] Failed to ensure file exists ${filePath}: ${(error as Error).message}`
      );
    }
  }

  /**
   * ログディレクトリの確認・作成
   */
  public ensureLogDirectory(logDir: string): void {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, {
        recursive: true,
        mode: this.config.file.directoryMode,
      });
    }
  }

  /**
   * ファイルの末尾から指定行数を効率的に読み込み
   */
  public async readTailLines(
    filePath: string,
    maxLines: number
  ): Promise<string[]> {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    if (fileSize === 0) {
      return [];
    }

    // 小さなファイルの場合は全体を読み込み
    if (fileSize < this.config.performance.smallFileThreshold) {
      const content = fs.readFileSync(filePath, 'utf8');
      return content
        .split('\n')
        .filter((line) => line.trim())
        .slice(-maxLines);
    }

    // 大きなファイルの場合は末尾から効率的に読み込み
    return this.readTailLinesFromLargeFile(filePath, maxLines, fileSize);
  }

  /**
   * 大きなファイルから末尾行数を読み込み（関数分割）
   */
  private readTailLinesFromLargeFile(
    filePath: string,
    maxLines: number,
    fileSize: number
  ): string[] {
    const fd = fs.openSync(filePath, 'r');
    try {
      return this.readLinesBackward(fd, fileSize, maxLines);
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * ファイルを後方から読み込んで行を取得（10行以下に分割）
   */
  private readLinesBackward(
    fd: number,
    fileSize: number,
    maxLines: number
  ): string[] {
    let position = fileSize;
    let lines: string[] = [];
    let buffer = '';

    while (position > 0 && lines.length < maxLines) {
      const chunkResult = this.readChunkBackward(fd, position);
      position = chunkResult.newPosition;
      buffer = chunkResult.chunk + buffer;

      lines = this.processBufferLines(buffer, lines, maxLines);
      buffer = this.extractPartialLine(buffer);
    }

    return lines.slice(-maxLines);
  }

  /**
   * 後方からチャンクを読み込み（10行以下）
   */
  private readChunkBackward(
    fd: number,
    position: number
  ): { chunk: string; newPosition: number } {
    const chunkSize = this.config.file.chunkSize;
    const readSize = Math.min(chunkSize, position);
    const newPosition = position - readSize;

    const chunk = Buffer.alloc(readSize);
    fs.readSync(fd, chunk, 0, readSize, newPosition);

    return {
      chunk: chunk.toString('utf8'),
      newPosition,
    };
  }

  /**
   * バッファの行を処理（10行以下）
   */
  private processBufferLines(
    buffer: string,
    currentLines: string[],
    maxLines: number
  ): string[] {
    const lineArray = buffer.split('\n');
    const lines = [...currentLines];

    // 完全な行を先頭に追加（逆順）
    for (let i = lineArray.length - 2; i >= 0; i--) {
      const line = lineArray[i].trim();
      if (line && lines.length < maxLines) {
        lines.unshift(line);
      }
    }

    return lines;
  }

  /**
   * 部分的な行を抽出（10行以下）
   */
  private extractPartialLine(buffer: string): string {
    const lineArray = buffer.split('\n');
    return lineArray.shift() || '';
  }

  /**
   * リトライ機能付きファイル書き込み
   */
  public async writeToFileWithRetry(
    filePath: string,
    content: string,
    maxRetries: number
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await fsPromises.appendFile(filePath, content, { encoding: 'utf8' });
        return; // 成功した場合はリターン
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          // 最後の試行で失敗した場合はエラーログを出力
          console.error(
            `[FileManager] Failed to write to log file ${filePath} after ${maxRetries} attempts: ${lastError.message}`
          );

          // エラーを伝播（上位でハンドリング可能にする）
          throw lastError;
        } else {
          // リトライ前の短い待機（設定値 * 試行回数）
          await new Promise<void>((resolve) =>
            setTimeout(resolve, this.config.file.retryBaseDelay * attempt)
          );
        }
      }
    }
  }
}

// =============================================================================
// LogPreprocessor Class
// =============================================================================

/**
 * LogPreprocessor - ログ前処理の専門クラス（単一責任原則）
 */
class LogPreprocessor implements ILogPreprocessor {
  constructor(private config: LogManagerConfig = DEFAULT_LOG_MANAGER_CONFIG) {}
  /**
   * ログメッセージの前処理
   */
  public preprocessMessage(message: string): string {
    let processed = message;

    // サイズ制限の適用
    processed = this.applySizeLimit(processed);

    // 特殊文字のエスケープ
    processed = this.escapeSpecialChars(processed);

    // エンコーディング問題の修正
    processed = this.fixEncodingIssues(processed);

    // 改行文字の正規化とトリム
    processed = this.normalizeAndTrim(processed);

    return processed;
  }

  /**
   * サイズ制限の適用
   */
  private applySizeLimit(message: string): string {
    if (message.length > this.config.maxLogMessageSize) {
      return message.substring(0, this.config.maxLogMessageSize - 3) + '...';
    }
    return message;
  }

  /**
   * 特殊文字のエスケープ（制御文字の削除）
   */
  private escapeSpecialChars(message: string): string {
    return message.replace(ESCAPE_CHARS, '');
  }

  /**
   * エンコーディング問題の修正
   */
  private fixEncodingIssues(message: string): string {
    try {
      // Buffer経由でUTF-8として解釈し直す
      const buffer = Buffer.from(message, 'utf8');
      return buffer.toString('utf8');
    } catch {
      // エラーが発生した場合はASCII文字のみを保持
      return message.replace(/[^\x20-\x7E]/g, '?');
    }
  }

  /**
   * 改行文字の正規化とトリム
   */
  private normalizeAndTrim(message: string): string {
    // 改行文字の正規化
    const normalized = message.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // トリム（前後の空白を削除）
    return normalized.trim();
  }
}

// =============================================================================
// LogLevelStrategy Classes
// =============================================================================

/**
 * DefaultLogLevelStrategy - デフォルトのログレベル判定戦略（Strategy パターン）
 */
class DefaultLogLevelStrategy implements ILogLevelStrategy {
  /**
   * ログレベルの判定
   */
  public determineLevel(
    type: 'stdout' | 'stderr',
    message: string
  ): 'info' | 'warn' | 'error' {
    // stderr は基本的に warn 以上
    if (type === 'stderr') {
      return this.determineStderrLevel(message);
    }

    // stdout でもエラー関連のキーワードがあればエラー扱い
    return this.determineStdoutLevel(message);
  }

  /**
   * stderr のログレベル判定
   */
  private determineStderrLevel(message: string): 'warn' | 'error' {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('error') || lowerMessage.includes('fatal')) {
      return 'error';
    }
    return 'warn';
  }

  /**
   * stdout のログレベル判定
   */
  private determineStdoutLevel(message: string): 'info' | 'warn' | 'error' {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('error') || lowerMessage.includes('fatal')) {
      return 'error';
    }
    if (lowerMessage.includes('warn') || lowerMessage.includes('warning')) {
      return 'warn';
    }
    return 'info';
  }
}

// =============================================================================
// EventManager Class
// =============================================================================

/**
 * EventManager - イベント発行の専門クラス（単一責任原則）
 */
class EventManager implements IEventManager {
  constructor(private eventEmitter: EventEmitter) {}

  /**
   * ログイベントの発行
   */
  public emitLogEvent(logEntry: LogEntry): void {
    this.eventEmitter.emit('log', logEntry);
  }

  /**
   * ファイル変更イベントの発行
   */
  public emitFileChangeEvent(data: {
    appName: string;
    file: string;
    type: string;
  }): void {
    this.eventEmitter.emit('fileChange', data);
  }

  /**
   * ディスク容量エラーイベントの発行
   */
  public emitDiskSpaceErrorEvent(data: {
    filePath: string;
    appName: string;
    timestamp: number;
    message: string;
  }): void {
    this.eventEmitter.emit('diskSpaceError', data);
  }
}

// =============================================================================
// LogBuffer Class
// =============================================================================

/**
 * LogBuffer - 高頻度書き込み時のバッファリング管理
 */
class LogBuffer {
  private buffer: BufferedLogEntry[] = [];
  private bufferSize = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private isBackpressured = false;

  constructor(
    private onFlush: (entries: BufferedLogEntry[]) => Promise<void>,
    private config: LogManagerConfig = DEFAULT_LOG_MANAGER_CONFIG
  ) {}

  /**
   * ログエントリをバッファに追加
   */
  public addEntry(entry: BufferedLogEntry): boolean {
    // バックプレッシャー制御
    if (this.isBackpressured) {
      return false;
    }

    const entrySize = JSON.stringify(entry.logEntry).length;

    // バッファサイズ制限チェック
    if (this.bufferSize + entrySize > this.config.buffer.maxSize) {
      this.flush();
    }

    this.buffer.push(entry);
    this.bufferSize += entrySize;

    // バックプレッシャー制御
    if (this.bufferSize > this.config.buffer.backpressureThreshold) {
      this.isBackpressured = true;
    }

    // 定期フラッシュタイマー設定
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(async () => {
        await this.flush();
      }, this.config.buffer.flushInterval);
    }

    return true;
  }

  /**
   * バッファを強制フラッシュ
   */
  public async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const entriesToFlush = [...this.buffer];
    this.buffer = [];
    this.bufferSize = 0;
    this.isBackpressured = false;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    try {
      await this.onFlush(entriesToFlush);
    } catch (error) {
      console.error(
        `[LogBuffer] Failed to flush entries: ${(error as Error).message}`
      );
      // 重要：失敗したエントリは失われるが、バッファが詰まるのを防ぐ
    }
  }

  /**
   * バッファクリーンアップ
   */
  public async cleanup(): Promise<void> {
    await this.flush();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * バッファ統計情報
   */
  public getStats(): {
    entryCount: number;
    bufferSize: number;
    isBackpressured: boolean;
  } {
    return {
      entryCount: this.buffer.length,
      bufferSize: this.bufferSize,
      isBackpressured: this.isBackpressured,
    };
  }
}

/**
 * AppLogger - 個別アプリケーションのログ管理（リファクタリング後）
 */
class AppLogger {
  private logInfo: AppLogInfo;
  private watchers: fs.FSWatcher[] = [];
  private logBuffer: LogBuffer;
  private partialLines: Map<'stdout' | 'stderr', string> = new Map();

  // 依存性注入されたサービスクラス
  private fileManager: IFileManager;
  private logPreprocessor: ILogPreprocessor;
  private logLevelStrategy: ILogLevelStrategy;
  private eventManager: IEventManager;

  constructor(
    appName: string,
    config: AppLogConfig,
    private logDir: string,
    private eventEmitter: EventEmitter,
    private managerConfig: LogManagerConfig = DEFAULT_LOG_MANAGER_CONFIG,
    // 依存性注入（テスト時にはモックを注入可能）
    fileManager?: IFileManager,
    logPreprocessor?: ILogPreprocessor,
    logLevelStrategy?: ILogLevelStrategy,
    eventManager?: IEventManager
  ) {
    this.logInfo = this.initializeLogInfo(appName, config);

    // 依存性注入の実装（DI コンテナパターン）
    this.fileManager = fileManager || new FileManager(this.managerConfig);
    this.logPreprocessor =
      logPreprocessor || new LogPreprocessor(this.managerConfig);
    this.logLevelStrategy = logLevelStrategy || new DefaultLogLevelStrategy();
    this.eventManager = eventManager || new EventManager(this.eventEmitter);

    this.ensureLogFiles();
    this.logBuffer = new LogBuffer(
      async (entries) => await this.flushBufferedEntries(entries),
      this.managerConfig
    );
  }

  /**
   * ログ情報の初期化
   */
  private initializeLogInfo(appName: string, config: AppLogConfig): AppLogInfo {
    const namespace = config.namespace || 'default';

    // ログファイルパスの決定（仕様に従った優先順位）
    let logFile: string | null = null;
    let outFile: string | null = null;
    let errorFile: string | null = null;

    if (config.outFile && config.errorFile) {
      // 1. out_file + error_file が指定時 → これらを使用、log_fileは無視
      outFile = config.outFile;
      errorFile = config.errorFile;
    } else if (config.logFile) {
      // 2. log_file のみ指定時 → stdout/stderrを同一ファイルに出力
      logFile = config.logFile;
    } else {
      // 3. 未指定時 → デフォルトパス
      logFile = path.join(this.logDir, `${appName}.jsonl`);
    }

    return {
      appName,
      namespace,
      logFile,
      outFile,
      errorFile,
      streams: {},
    };
  }

  /**
   * ログファイルの事前作成（FileManagerに委譲）
   */
  private ensureLogFiles(): void {
    // 統合ログファイル
    if (this.logInfo.logFile) {
      this.fileManager.ensureFileExists(this.logInfo.logFile);
    }

    // stdout専用ファイル
    if (this.logInfo.outFile) {
      this.fileManager.ensureFileExists(this.logInfo.outFile);
    }

    // stderr専用ファイル
    if (this.logInfo.errorFile) {
      this.fileManager.ensureFileExists(this.logInfo.errorFile);
    }
  }

  /**
   * プロセス出力のキャプチャとログ記録
   * ProcessLifecycleManagerからの stdout/stderr データを処理
   */
  public captureProcessOutput(type: 'stdout' | 'stderr', data: string): void {
    // 既存の部分的な行を取得
    const existingPartial = this.partialLines.get(type) || '';
    const fullData = existingPartial + data;

    // 改行で分割
    const lines = fullData.split('\n');

    // 最後の要素は部分的な行か空文字列
    const partialLine = lines.pop() || '';
    this.partialLines.set(type, partialLine);

    // 完全な行を処理
    for (const line of lines) {
      if (line.length > 0) {
        this.writeLogWithPreprocessing(type, line);
      }
    }
  }

  /**
   * ログエントリの前処理を含む書き込み（10行以下に分割）
   */
  public writeLogWithPreprocessing(
    type: 'stdout' | 'stderr',
    message: string
  ): void {
    const processedMessage = this.logPreprocessor.preprocessMessage(message);
    const logEntry = this.createLogEntry(type, processedMessage);
    const targetFiles = this.determineTargetFiles(type);

    this.addToBufferAndEmitEvent(logEntry, targetFiles);
  }

  /**
   * ログエントリの作成（10行以下）
   */
  private createLogEntry(
    type: 'stdout' | 'stderr',
    processedMessage: string
  ): LogEntry {
    return {
      timestamp: Date.now(),
      level: this.logLevelStrategy.determineLevel(type, processedMessage),
      message: processedMessage,
      app: this.logInfo.appName,
      namespace: this.logInfo.namespace,
      type,
    };
  }

  /**
   * バッファ追加とイベント発行（10行以下）
   */
  private addToBufferAndEmitEvent(
    logEntry: LogEntry,
    targetFiles: string[]
  ): void {
    const bufferedEntry: BufferedLogEntry = {
      logEntry,
      targetFiles,
      timestamp: Date.now(),
    };

    const added = this.logBuffer.addEntry(bufferedEntry);
    this.handleBufferBackpressure(added);
    this.eventManager.emitLogEvent(logEntry);
  }

  /**
   * バッファバックプレッシャーの処理（10行以下）
   */
  private handleBufferBackpressure(added: boolean): void {
    if (!added) {
      const warningMessage = `Log buffer backpressure active for app: ${this.logInfo.appName}`;
      console.warn(`[AppLogger] ${warningMessage}`);
      
      // バックプレッシャーイベントを発行
      this.eventEmitter.emit('bufferWarning', { 
        message: warningMessage,
        appName: this.logInfo.appName,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 書き込み対象ファイルの決定（関数分割）
   */
  private determineTargetFiles(type: 'stdout' | 'stderr'): string[] {
    const targetFiles: string[] = [];

    if (this.logInfo.logFile) {
      targetFiles.push(this.logInfo.logFile);
    }

    if (type === 'stdout' && this.logInfo.outFile) {
      targetFiles.push(this.logInfo.outFile);
    } else if (type === 'stderr' && this.logInfo.errorFile) {
      targetFiles.push(this.logInfo.errorFile);
    }

    return targetFiles;
  }

  /**
   * ログエントリの書き込み（互換性のため維持）
   */
  public writeLog(type: 'stdout' | 'stderr', message: string): void {
    this.writeLogWithPreprocessing(type, message);
  }

  // preprocessLogMessage は LogPreprocessor に移動済み

  /**
   * バッファされたエントリをファイルに書き込み（20行以下に分割）
   */
  private async flushBufferedEntries(
    entries: BufferedLogEntry[]
  ): Promise<void> {
    // ファイル別にエントリをグループ化
    const fileEntries = this.groupEntriesByFile(entries);

    // ファイル別に並列書き込み
    const writePromises = this.createWritePromises(fileEntries);

    // 全ての書き込みの完了を待機
    await this.executeParallelWrites(writePromises);
  }

  /**
   * エントリをファイル別にグループ化（関数分割）
   */
  private groupEntriesByFile(
    entries: BufferedLogEntry[]
  ): Map<string, LogEntry[]> {
    const fileEntries = new Map<string, LogEntry[]>();

    for (const bufferedEntry of entries) {
      for (const filePath of bufferedEntry.targetFiles) {
        if (!fileEntries.has(filePath)) {
          fileEntries.set(filePath, []);
        }
        fileEntries.get(filePath)!.push(bufferedEntry.logEntry);
      }
    }

    return fileEntries;
  }

  /**
   * 書き込みPromise配列を作成（関数分割）
   */
  private createWritePromises(
    fileEntries: Map<string, LogEntry[]>
  ): Promise<void>[] {
    const writePromises: Promise<void>[] = [];

    for (const [filePath, logEntries] of fileEntries) {
      const logLines = logEntries
        .map((entry) => JSON.stringify(entry) + '\n')
        .join('');

      const writePromise = this.writeToFileWithRetryAndHandleError(
        filePath,
        logLines
      );
      writePromises.push(writePromise);
    }

    return writePromises;
  }

  /**
   * 並列書き込みを実行（関数分割）
   */
  private async executeParallelWrites(
    writePromises: Promise<void>[]
  ): Promise<void> {
    try {
      await Promise.allSettled(writePromises);
    } catch (error) {
      // Promise.allSettledは例外を投げないが、念のため
      console.error(
        `[AppLogger] Unexpected error during batch write: ${(error as Error).message}`
      );
    }
  }

  /**
   * リトライ機能付きファイル書き込みとエラーハンドリング
   */
  private async writeToFileWithRetryAndHandleError(
    filePath: string,
    content: string
  ): Promise<void> {
    try {
      // FileManager に委譲
      await this.fileManager.writeToFileWithRetry(
        filePath,
        content,
        this.managerConfig.file.maxRetries
      );
    } catch (error) {
      const lastError = error as Error;

      // ディスク容量不足の場合は特別な処理
      if (lastError.message.includes('ENOSPC')) {
        this.handleDiskSpaceError(filePath);
      } else {
        // その他のエラー（権限エラーなど）もイベント発行
        this.eventEmitter.emit('error', {
          message: lastError.message,
          filePath,
          appName: this.logInfo.appName,
          timestamp: Date.now(),
          error: lastError
        });
      }

      // エラーを再スロー（上位でハンドリングできるように）
      // throw lastError;
    }
  }

  /**
   * ディスク容量不足エラーの処理（EventManagerに委譲）
   */
  private handleDiskSpaceError(filePath: string): void {
    const errorMessage = `Disk space error detected for ${filePath}. Consider implementing log rotation or cleanup.`;
    console.error(`[AppLogger] ${errorMessage}`);

    // イベントとして通知（EventManagerに委譲）
    this.eventManager.emitDiskSpaceErrorEvent({
      filePath,
      appName: this.logInfo.appName,
      timestamp: Date.now(),
      message: errorMessage,
    });
  }

  // determineLogLevel は LogLevelStrategy に移動済み

  /**
   * ファイル監視の開始
   */
  public async startWatching(): Promise<void> {
    // 既存の監視を停止
    this.stopWatching();

    const filesToWatch: Array<{ file: string; type: string }> = [];

    if (this.logInfo.logFile) {
      filesToWatch.push({ file: this.logInfo.logFile, type: 'combined' });
    }
    if (this.logInfo.outFile) {
      filesToWatch.push({ file: this.logInfo.outFile, type: 'stdout' });
    }
    if (this.logInfo.errorFile) {
      filesToWatch.push({ file: this.logInfo.errorFile, type: 'stderr' });
    }

    for (const { file, type } of filesToWatch) {
      if (fs.existsSync(file)) {
        try {
          const watcher = fs.watch(file, (eventType: string) => {
            if (eventType === 'change') {
              // EventManager に委譲
              this.eventManager.emitFileChangeEvent({
                appName: this.logInfo.appName,
                file,
                type,
              });
            }
          });
          this.watchers.push(watcher);
        } catch (error) {
          console.warn(
            `[AppLogger] Failed to watch ${file}: ${(error as Error).message}`
          );
        }
      }
    }
  }

  /**
   * ファイル監視の停止
   */
  public stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }

  /**
   * ログの読み込み（20行以下に分割）
   */
  public async readLogs(options: LogOptions = {}): Promise<LogEntry[]> {
    const { lines = 100 } = options;

    // ログファイルの選択
    const logFile = this.selectLogFile(options.type);
    if (!logFile || !fs.existsSync(logFile)) {
      return [];
    }

    // ファイルからログエントリを読み込み・解析
    return this.readAndParseLogEntries(logFile, lines, options);
  }

  /**
   * ログファイルの選択（関数分割）
   */
  private selectLogFile(type?: Array<'stdout' | 'stderr'>): string | null {
    if (type && type.length === 1) {
      switch (type[0]) {
        case 'stdout':
          return this.logInfo.outFile || this.logInfo.logFile;
        case 'stderr':
          return this.logInfo.errorFile || this.logInfo.logFile;
        default:
          return this.logInfo.logFile;
      }
    }
    return this.logInfo.logFile;
  }

  /**
   * ログエントリの読み込みと解析（関数分割）
   */
  private async readAndParseLogEntries(
    logFile: string,
    lines: number,
    options: LogOptions
  ): Promise<LogEntry[]> {
    try {
      // FileManager に委譲
      const recentLines = await this.fileManager.readTailLines(logFile, lines);
      return this.parseLogLines(recentLines, options);
    } catch (error) {
      console.error(
        `[AppLogger] Failed to read log file ${logFile}: ${(error as Error).message}`
      );
      return [];
    }
  }

  /**
   * ログ行の解析とフィルタリング（関数分割）
   */
  private parseLogLines(lines: string[], options: LogOptions): LogEntry[] {
    const logEntries: LogEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as LogEntry;

        // フィルタリング適用
        if (this.matchesFilter(entry, options)) {
          logEntries.push(entry);
        }
      } catch {
        console.warn(`[AppLogger] Failed to parse log line: ${line}`);
      }
    }
    return logEntries;
  }

  // readTailLines は FileManager に移動済み

  /**
   * ログエントリがフィルタ条件に一致するかチェック
   */
  private matchesFilter(entry: LogEntry, options: LogOptions): boolean {
    // レベルフィルタ
    if (options.level && !options.level.includes(entry.level)) {
      return false;
    }

    // タイプフィルタ
    if (options.type && !options.type.includes(entry.type)) {
      return false;
    }

    // 時間範囲フィルタ
    if (options.since && entry.timestamp < options.since) {
      return false;
    }

    if (options.until && entry.timestamp > options.until) {
      return false;
    }

    return true;
  }

  /**
   * ログのクリア
   */
  public async clearLogs(): Promise<void> {
    const filesToClear: string[] = [];

    if (this.logInfo.logFile) {
      filesToClear.push(this.logInfo.logFile);
    }
    if (this.logInfo.outFile) {
      filesToClear.push(this.logInfo.outFile);
    }
    if (this.logInfo.errorFile) {
      filesToClear.push(this.logInfo.errorFile);
    }

    for (const file of filesToClear) {
      if (fs.existsSync(file)) {
        fs.writeFileSync(file, '');
      }
    }
  }

  /**
   * 残りの部分的な行を強制フラッシュ
   */
  public flushPartialLines(): void {
    for (const [type, partialLine] of this.partialLines) {
      if (partialLine.trim().length > 0) {
        this.writeLogWithPreprocessing(type, partialLine);
      }
    }
    this.partialLines.clear();
  }

  /**
   * バッファ統計情報の取得
   */
  public getBufferStats(): {
    entryCount: number;
    bufferSize: number;
    isBackpressured: boolean;
  } {
    return this.logBuffer.getStats();
  }

  /**
   * バッファを強制フラッシュ
   */
  public async flushBuffer(): Promise<void> {
    await this.logBuffer.flush();
  }

  /**
   * リソースのクリーンアップ
   */
  public async close(): Promise<void> {
    // 残りの部分的な行をフラッシュ
    this.flushPartialLines();

    // バッファをクリーンアップ（フラッシュ含む）
    await this.logBuffer.cleanup();

    // ファイル監視停止
    this.stopWatching();

    // ストリーム管理は不要
    this.logInfo.streams = {};
  }

  /**
   * ログ統計情報の取得
   */
  public getLogStats(): {
    logFileSize?: number;
    outFileSize?: number;
    errorFileSize?: number;
    lastModified?: number;
  } {
    const stats: {
      logFileSize?: number;
      outFileSize?: number;
      errorFileSize?: number;
      lastModified?: number;
    } = {};

    try {
      if (this.logInfo.logFile && fs.existsSync(this.logInfo.logFile)) {
        const stat = fs.statSync(this.logInfo.logFile);
        stats.logFileSize = stat.size;
        stats.lastModified = stat.mtime.getTime();
      }

      if (this.logInfo.outFile && fs.existsSync(this.logInfo.outFile)) {
        const stat = fs.statSync(this.logInfo.outFile);
        stats.outFileSize = stat.size;
      }

      if (this.logInfo.errorFile && fs.existsSync(this.logInfo.errorFile)) {
        const stat = fs.statSync(this.logInfo.errorFile);
        stats.errorFileSize = stat.size;
      }
    } catch (error) {
      console.warn(
        `[AppLogger] Failed to get stats: ${(error as Error).message}`
      );
    }

    return stats;
  }
}

// =============================================================================
// LogManager Class
// =============================================================================

/**
 * LogManager - ログ管理システムのメインクラス
 */
export class LogManager extends EventEmitter {
  private logDir: string;
  private appLoggers: Map<string, AppLogger> = new Map();
  private fileManager: IFileManager;
  private config: LogManagerConfig;
  private pathValidator: LogPathValidator;
  private securePathBuilder: SecureLogPathBuilder;

  constructor(
    logDir?: string,
    fileManager?: IFileManager,
    config: LogManagerConfig = DEFAULT_LOG_MANAGER_CONFIG
  ) {
    super();
    this.logDir =
      logDir || path.join(os.homedir(), '.masuidrive-procman', 'app-logs');
    this.config = config;
    this.fileManager = fileManager || new FileManager(this.config);

    // パストラバーサル対策の初期化（テスト環境では緩い検証にする）
    const pathValidationConfig = process.env.NODE_ENV === 'test' 
      ? { forbiddenPatterns: [/\0/] } // テスト環境ではnull byteのみ禁止
      : undefined;
    this.pathValidator = new LogPathValidator(this.logDir, pathValidationConfig);
    this.securePathBuilder = new SecureLogPathBuilder(this.pathValidator);

    this.ensureLogDirectory();
  }

  /**
   * ログディレクトリの確認・作成（FileManagerに委譲）
   */
  private ensureLogDirectory(): void {
    this.fileManager.ensureLogDirectory(this.logDir);
  }

  /**
   * アプリケーションのログ設定（セキュリティ検証付き）
   */
  public setupAppLogs(appName: string, config: AppLogConfig = {}): void {
    // アプリケーション名のセキュリティ検証
    const validatedAppName =
      this.pathValidator.validateApplicationName(appName);

    // カスタムパスのセキュリティ検証
    const secureConfig = this.validateAndSecureConfig(config);

    // 既存のログ設定があれば閉じる
    if (this.appLoggers.has(validatedAppName)) {
      const existingLogger = this.appLoggers.get(validatedAppName);
      if (existingLogger) {
        existingLogger.close();
      }
    }

    // 新しいAppLoggerを作成
    const appLogger = new AppLogger(
      validatedAppName,
      secureConfig,
      this.logDir,
      this,
      this.config
    );
    this.appLoggers.set(validatedAppName, appLogger);
  }

  /**
   * プロセス出力のキャプチャとログ記録
   * ProcessManagerからのstdout/stderrイベント処理
   */
  public captureProcessOutput(
    appName: string,
    type: 'stdout' | 'stderr',
    data: string
  ): void {
    const appLogger = this.appLoggers.get(appName);
    if (!appLogger) {
      console.warn(`[LogManager] No log configuration for app: ${appName}`);
      return;
    }

    appLogger.captureProcessOutput(type, data);
  }

  /**
   * ログエントリの書き込み（互換性のため維持）
   */
  public writeLog(
    appName: string,
    type: 'stdout' | 'stderr',
    message: string
  ): void {
    const appLogger = this.appLoggers.get(appName);
    if (!appLogger) {
      console.warn(`[LogManager] No log configuration for app: ${appName}`);
      return;
    }

    appLogger.writeLog(type, message);
  }

  /**
   * ファイル監視の開始
   */
  public async startWatching(appName: string): Promise<void> {
    const appLogger = this.appLoggers.get(appName);
    if (!appLogger) {
      throw new Error(`No log configuration for app: ${appName}`);
    }

    await appLogger.startWatching();
  }

  /**
   * ファイル監視の停止
   */
  public stopWatching(appName: string): void {
    const appLogger = this.appLoggers.get(appName);
    if (appLogger) {
      appLogger.stopWatching();
    }
  }

  /**
   * ログの読み込み
   */
  public async readLogs(
    appName: string,
    options: LogOptions = {}
  ): Promise<LogEntry[]> {
    const appLogger = this.appLoggers.get(appName);
    if (!appLogger) {
      throw new Error(`No log configuration for app: ${appName}`);
    }

    return appLogger.readLogs(options);
  }

  /**
   * ログのクリア
   */
  public async clearLogs(appName: string): Promise<void> {
    const appLogger = this.appLoggers.get(appName);
    if (!appLogger) {
      throw new Error(`No log configuration for app: ${appName}`);
    }

    await appLogger.clearLogs();
  }

  /**
   * ログ統計情報の取得
   */
  public getLogStats(appName: string): {
    logFileSize?: number;
    outFileSize?: number;
    errorFileSize?: number;
    lastModified?: number;
  } {
    const appLogger = this.appLoggers.get(appName);
    if (!appLogger) {
      throw new Error(`No log configuration for app: ${appName}`);
    }

    return appLogger.getLogStats();
  }

  /**
   * バッファ統計情報の取得
   */
  public getBufferStats(appName: string): {
    entryCount: number;
    bufferSize: number;
    isBackpressured: boolean;
  } {
    const appLogger = this.appLoggers.get(appName);
    if (!appLogger) {
      throw new Error(`No log configuration for app: ${appName}`);
    }

    return appLogger.getBufferStats();
  }

  /**
   * 全アプリケーションのバッファ統計情報の取得
   */
  public getAllBufferStats(): Record<
    string,
    {
      entryCount: number;
      bufferSize: number;
      isBackpressured: boolean;
    }
  > {
    const stats: Record<
      string,
      {
        entryCount: number;
        bufferSize: number;
        isBackpressured: boolean;
      }
    > = {};

    for (const [appName, appLogger] of this.appLoggers) {
      stats[appName] = appLogger.getBufferStats();
    }

    return stats;
  }

  /**
   * 指定アプリケーションのバッファを強制フラッシュ
   */
  public async flushBuffer(appName: string): Promise<void> {
    const appLogger = this.appLoggers.get(appName);
    if (!appLogger) {
      throw new Error(`No log configuration for app: ${appName}`);
    }

    // 型安全にバッファフラッシュ
    await appLogger.flushBuffer();

    // 部分的な行もフラッシュ
    appLogger.flushPartialLines();
  }

  /**
   * 全アプリケーションのバッファを強制フラッシュ
   */
  public async flushAllBuffers(): Promise<void> {
    const flushPromises: Promise<void>[] = [];

    for (const appName of this.appLoggers.keys()) {
      const flushPromise = this.flushBuffer(appName).catch((error) => {
        console.warn(
          `[LogManager] Failed to flush buffer for app ${appName}: ${(error as Error).message}`
        );
      });
      flushPromises.push(flushPromise);
    }

    // 全てのフラッシュ操作を並列実行
    await Promise.allSettled(flushPromises);
  }

  /**
   * 全てのリソースのクリーンアップ
   */
  public async close(): Promise<void> {
    for (const appLogger of this.appLoggers.values()) {
      await appLogger.close();
    }

    this.appLoggers.clear();
  }

  /**
   * 設定のセキュリティ検証とパス正規化
   */
  private validateAndSecureConfig(config: AppLogConfig): AppLogConfig {
    const secureConfig: AppLogConfig = { ...config };

    // カスタムパスがある場合は検証
    if (config.logFile) {
      secureConfig.logFile = this.pathValidator.validateLogFilePath(
        config.logFile
      );
    }

    if (config.outFile) {
      secureConfig.outFile = this.pathValidator.validateLogFilePath(
        config.outFile
      );
    }

    if (config.errorFile) {
      secureConfig.errorFile = this.pathValidator.validateLogFilePath(
        config.errorFile
      );
    }

    return secureConfig;
  }

  /**
   * 登録されているアプリケーション一覧の取得
   */
  public getAppNames(): string[] {
    return Array.from(this.appLoggers.keys());
  }

  /**
   * ログの人間向けフォーマット
   */
  public formatLogForHuman(logEntry: LogEntry): string {
    const timestamp = new Date(logEntry.timestamp);
    const timeStr = timestamp.toISOString().substring(11, 19); // HH:mm:ss
    const dateStr = timestamp.toISOString().substring(2, 10); // YY-MM-DD

    return `[${logEntry.app}] ${dateStr} ${timeStr} > ${logEntry.message}`;
  }
}
