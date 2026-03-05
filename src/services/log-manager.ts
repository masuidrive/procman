/**
 * Log Manager - ログ管理システム
 *
 * アプリケーションプロセスのstdout/stderrを集約し、JSONL形式でログを管理する。
 * リアルタイムログストリーミング機能とファイル管理を提供する。
 * ログストリーミングはEventEmitterパターンで実装し、new-log イベントを発行する。
 */

import { EventEmitter } from 'events';
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
import { LOG_STREAM_EVENTS } from '../shared/constants-streaming.js';
import { EventCleanupHelper } from '../utils/event-cleanup.js';
import { IFileManager, AppLogConfig } from './log-manager-types.js';
import { FileManager } from './log-file-manager.js';
import { AppLogger } from './app-logger.js';

// Re-export everything from split modules for backward compatibility
export {
  ESCAPE_CHARS,
  IFileManager,
  ILogPreprocessor,
  ILogLevelStrategy,
  IEventManager,
  AppLogConfig,
  AppLogInfo,
  BufferedLogEntry,
} from './log-manager-types.js';
export { FileManager } from './log-file-manager.js';
export { LogPreprocessor } from './log-preprocessor.js';
export { DefaultLogLevelStrategy } from './log-level-strategy.js';
export { EventManager } from './log-event-manager.js';
export { LogBuffer } from './log-buffer.js';
export { AppLogger } from './app-logger.js';

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

  // Add EventCleanupHelper for proper listener cleanup
  private readonly cleanup = new EventCleanupHelper();

  constructor(
    logDir?: string,
    fileManager?: IFileManager,
    config: LogManagerConfig = DEFAULT_LOG_MANAGER_CONFIG
  ) {
    super();
    // Enhanced HOME detection: process.env.HOME || os.homedir()
    const homeDir = process.env.HOME || os.homedir();
    if (!homeDir && !logDir) {
      throw new Error('Unable to determine home directory for log path');
    }
    this.logDir =
      logDir || path.join(homeDir!, '.masuidrive-procman', 'app-logs');
    this.config = config;
    this.fileManager = fileManager || new FileManager(this.config);

    // No additional initialization needed for EventCleanupHelper

    // パストラバーサル対策の初期化（テスト環境では緩い検証にする）
    const pathValidationConfig =
      process.env.NODE_ENV === 'test'
        ? { forbiddenPatterns: [/\0/] } // テスト環境ではnull byteのみ禁止
        : undefined;
    this.pathValidator = new LogPathValidator(
      this.logDir,
      pathValidationConfig
    );
    this.securePathBuilder = new SecureLogPathBuilder(this.pathValidator);

    this.ensureLogDirectory();
  }

  /**
   * Private method to register and track listeners
   */
  private registerListener<T extends EventEmitter>(
    emitter: T,
    event: string | symbol,
    listener: (...args: any[]) => void
  ): void {
    this.cleanup.track(emitter, event, listener);
  }

  /**
   * ログディレクトリの確認・作成（FileManagerに委譲）
   */
  private ensureLogDirectory(): void {
    this.fileManager.ensureLogDirectory(this.logDir);
  }

  /**
   * Sanitize invalid app names to prevent errors
   */
  private sanitizeAppName(appName: string): string {
    if (typeof appName !== 'string' || appName.trim() === '') {
      return 'unknown-app';
    }

    // Remove invalid characters and limit length
    const sanitized = appName
      .replace(/[/\\<>:"|?*\0]/g, '_')
      .replace(/^\.+|\.+$/g, '') // Remove leading/trailing dots
      .substring(0, 64)
      .trim();

    return sanitized || 'sanitized-app';
  }

  /**
   * アプリケーションのログ設定（セキュリティ検証付き）
   */
  public setupAppLogs(appName: string, config: AppLogConfig = {}): void {
    // t_wada boundary principle: gracefully handle invalid inputs
    if (appName == null) {
      // Silently ignore null/undefined inputs as per test expectation
      return;
    }

    // アプリケーション名のセキュリティ検証
    let validatedAppName: string;
    try {
      validatedAppName = this.pathValidator.validateApplicationName(appName);
    } catch {
      // Gracefully handle invalid app names by sanitizing them
      validatedAppName = this.sanitizeAppName(appName);
    }

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
    // t_wada boundary principle: gracefully handle invalid inputs
    if (appName == null || type == null || message == null) {
      // Silently ignore null/undefined inputs as per test expectation
      return;
    }

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
    // Clean up all tracked listeners
    await this.cleanup.dispose();

    // Note: Don't log here as it can cause issues during shutdown
    // console.log(`[LogManager] Cleaned up ${cleanedUpListeners} managed listeners`);

    // Clean up app loggers
    for (const appLogger of this.appLoggers.values()) {
      await appLogger.close();
    }

    this.appLoggers.clear();

    // Clean up our own listeners (this should be empty after EventCleanupHelper cleanup)
    this.removeAllListeners();
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

  /**
   * ログストリーミングの開始
   * 新しいログエントリが追加されるたびにリスナーを呼び出す
   *
   * Note: This method now tracks listeners but doesn't use the EventCleanupHelper
   * because it returns a cleanup function that the caller must use.
   * The caller is responsible for calling the cleanup function.
   */
  public startLogStream(
    appName: string | null,
    listener: (logEntry: LogEntry) => void
  ): () => void {
    // フィルタリング関数の作成
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const filterListener = (logEntry: LogEntry) => {
      // appNameが指定されている場合はフィルタリング
      if (appName && logEntry.app !== appName) {
        return;
      }
      listener(logEntry);
    };

    // new-logイベントのリスナーを登録
    this.on(LOG_STREAM_EVENTS.NEW_LOG, filterListener);

    // クリーンアップ関数を返す
    return () => {
      this.off(LOG_STREAM_EVENTS.NEW_LOG, filterListener);
    };
  }

  /**
   * ログストリーミング状態を取得
   */
  public isStreamingActive(): boolean {
    // EventEmitterのリスナー数をチェック
    const listeners = this.listenerCount(LOG_STREAM_EVENTS.NEW_LOG);
    return listeners > 0;
  }

  /**
   * Get statistics about listener management
   */
  public getListenerStats(): {
    managedListeners: number;
    ownListeners: number;
    streamingListeners: number;
  } {
    const ownEvents = this.eventNames();
    let ownListenersCount = 0;

    for (const event of ownEvents) {
      ownListenersCount += this.listenerCount(event);
    }

    return {
      managedListeners: this.cleanup.getListenerCount(),
      ownListeners: ownListenersCount,
      streamingListeners: this.listenerCount(LOG_STREAM_EVENTS.NEW_LOG),
    };
  }
}
