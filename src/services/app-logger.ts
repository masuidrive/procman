/**
 * AppLogger - 個別アプリケーションのログ管理（リファクタリング後）
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { LogEntry, LogOptions } from '../shared/logs.js';
import {
  LogManagerConfig,
  DEFAULT_LOG_MANAGER_CONFIG,
} from './log-manager-config.js';
import {
  IFileManager,
  ILogPreprocessor,
  ILogLevelStrategy,
  IEventManager,
  AppLogConfig,
  AppLogInfo,
  BufferedLogEntry,
} from './log-manager-types.js';
import { FileManager } from './log-file-manager.js';
import { LogPreprocessor } from './log-preprocessor.js';
import { DefaultLogLevelStrategy } from './log-level-strategy.js';
import { EventManager } from './log-event-manager.js';
import { LogBuffer } from './log-buffer.js';

export class AppLogger {
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
        timestamp: Date.now(),
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
          error: lastError,
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
