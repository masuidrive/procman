/**
 * Log Manager Factory Pattern Implementation
 *
 * Uncle Bob's guidance: Factory pattern for organized object creation
 * DI Container pattern for better testability and flexibility
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import { LogManager } from './log-manager.js';
import {
  LogManagerConfig,
  mergeLogManagerConfig,
  validateLogManagerConfig,
} from './log-manager-config.js';

/**
 * ログマネージャーのファクトリーインターフェース（Abstract Factory パターン）
 */
export interface ILogManagerFactory {
  /**
   * ログマネージャーの作成
   */
  createLogManager(
    logDir?: string,
    config?: Partial<LogManagerConfig>
  ): LogManager;

  /**
   * 設定を使用してログマネージャーを作成
   */
  createLogManagerWithConfig(
    logDir: string,
    config: LogManagerConfig
  ): LogManager;
}

/**
 * 依存性注入のためのサービスコンテナ
 */
export interface IServiceContainer {
  /** ファイルマネージャーファクトリー */
  fileManagerFactory?: () => IFileManager;
  /** ログプリプロセッサーファクトリー */
  logPreprocessorFactory?: () => ILogPreprocessor;
  /** ログレベル戦略ファクトリー */
  logLevelStrategyFactory?: () => ILogLevelStrategy;
  /** イベントマネージャーファクトリー */
  eventManagerFactory?: (eventEmitter: EventEmitter) => IEventManager;
}

/**
 * インターフェースのインポート（循環参照を避けるため、ここで定義）
 */
interface IFileManager {
  ensureFileExists(filePath: string): void;
  ensureLogDirectory(logDir: string): void;
  readTailLines(filePath: string, maxLines: number): Promise<string[]>;
  writeToFileWithRetry(
    filePath: string,
    content: string,
    maxRetries: number
  ): Promise<void>;
}

interface ILogPreprocessor {
  preprocessMessage(message: string): string;
}

interface ILogLevelStrategy {
  determineLevel(
    type: 'stdout' | 'stderr',
    message: string
  ): 'info' | 'warn' | 'error';
}

interface IEventManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emitLogEvent(logEntry: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emitFileChangeEvent(data: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emitDiskSpaceErrorEvent(data: any): void;
}

/**
 * デフォルトのログマネージャーファクトリー実装
 */
export class DefaultLogManagerFactory implements ILogManagerFactory {
  constructor(private serviceContainer: IServiceContainer = {}) {}

  /**
   * ログマネージャーの作成（設定をマージ）
   */
  public createLogManager(
    logDir?: string,
    config: Partial<LogManagerConfig> = {}
  ): LogManager {
    // 設定をマージして検証
    const mergedConfig = mergeLogManagerConfig(config);
    validateLogManagerConfig(mergedConfig);

    return this.createLogManagerWithConfig(logDir || this.getDefaultLogDir());
  }

  /**
   * 設定を使用してログマネージャーを作成
   */
  public createLogManagerWithConfig(logDir: string): LogManager {
    // ファイルマネージャーを作成（DI）
    const fileManager =
      this.serviceContainer.fileManagerFactory?.() ||
      this.createDefaultFileManager();

    // ログマネージャーを作成
    return new LogManager(logDir, fileManager);
  }

  /**
   * デフォルトのログディレクトリパスを取得
   */
  private getDefaultLogDir(): string {
    // Enhanced HOME detection: process.env.HOME || os.homedir()
    const homeDir = process.env.HOME || os.homedir();
    if (!homeDir) {
      throw new Error('Unable to determine home directory for log path');
    }
    return path.join(homeDir, '.masuidrive-procman', 'app-logs');
  }

  /**
   * デフォルトのファイルマネージャーを作成
   */
  private createDefaultFileManager(): IFileManager {
    // 設定を注入したFileManagerの作成
    // 注意：実際の実装では、FileManagerクラスのコンストラクタに設定を渡す必要があります
    // TODO: FileManagerの実装を追加
    throw new Error('FileManager implementation not available');
  }
}

/**
 * テスト用のログマネージャーファクトリー
 */
export class TestLogManagerFactory implements ILogManagerFactory {
  constructor(
    private mockFileManager?: IFileManager,
    private mockLogPreprocessor?: ILogPreprocessor,
    private mockLogLevelStrategy?: ILogLevelStrategy,
    private mockEventManager?: IEventManager
  ) {}

  public createLogManager(logDir?: string): LogManager {
    return this.createLogManagerWithConfig(logDir || '/tmp/test-logs');
  }

  public createLogManagerWithConfig(logDir: string): LogManager {
    // テスト用のモックを注入
    return new LogManager(logDir, this.mockFileManager);
  }
}

/**
 * 開発用のログマネージャーファクトリー
 */
export class DevelopmentLogManagerFactory implements ILogManagerFactory {
  public createLogManager(
    logDir?: string,
    config: Partial<LogManagerConfig> = {}
  ): LogManager {
    // 開発用の設定を適用
    const baseConfig = mergeLogManagerConfig(config);
    const devConfig: LogManagerConfig = {
      ...baseConfig,
      buffer: {
        ...baseConfig.buffer,
        flushInterval: 50, // より頻繁なフラッシュ
      },
    };

    return this.createLogManagerWithConfig(
      logDir || this.getDevLogDir(),
      devConfig
    );
  }

  public createLogManagerWithConfig(
    logDir: string,
    config: LogManagerConfig
  ): LogManager {
    validateLogManagerConfig(config);
    return new LogManager(logDir);
  }

  private getDevLogDir(): string {
    return path.join(process.cwd(), 'logs', 'dev');
  }
}

/**
 * 本番用のログマネージャーファクトリー
 */
export class ProductionLogManagerFactory implements ILogManagerFactory {
  public createLogManager(
    logDir?: string,
    config: Partial<LogManagerConfig> = {}
  ): LogManager {
    // 本番用の設定を適用
    const baseConfig = mergeLogManagerConfig(config);
    const prodConfig: LogManagerConfig = {
      ...baseConfig,
      buffer: {
        ...baseConfig.buffer,
        maxSize: 50 * 1024 * 1024, // 50MB
        backpressureThreshold: 25 * 1024 * 1024, // 25MB
      },
      file: {
        ...baseConfig.file,
        maxRetries: 5, // より多いリトライ
      },
    };

    return this.createLogManagerWithConfig(
      logDir || this.getProdLogDir(),
      prodConfig
    );
  }

  public createLogManagerWithConfig(
    logDir: string,
    config: LogManagerConfig
  ): LogManager {
    validateLogManagerConfig(config);
    return new LogManager(logDir);
  }

  private getProdLogDir(): string {
    // Enhanced HOME detection: process.env.HOME || os.homedir()
    const homeDir = process.env.HOME || os.homedir();
    if (!homeDir) {
      throw new Error('Unable to determine home directory for log path');
    }
    return path.join(homeDir, '.masuidrive-procman', 'app-logs');
  }
}

/**
 * ファクトリーレジストリ（Registry パターン）
 */
export class LogManagerFactoryRegistry {
  private static factories: Map<string, ILogManagerFactory> = new Map();

  /**
   * ファクトリーの登録
   */
  public static registerFactory(
    name: string,
    factory: ILogManagerFactory
  ): void {
    this.factories.set(name, factory);
  }

  /**
   * ファクトリーの取得
   */
  public static getFactory(name: string): ILogManagerFactory {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Factory not found: ${name}`);
    }
    return factory;
  }

  /**
   * デフォルトファクトリーの設定
   */
  public static setDefaultFactories(): void {
    this.registerFactory('default', new DefaultLogManagerFactory());
    this.registerFactory('test', new TestLogManagerFactory());
    this.registerFactory('development', new DevelopmentLogManagerFactory());
    this.registerFactory('production', new ProductionLogManagerFactory());
  }

  /**
   * 環境に応じたファクトリーの取得
   */
  public static getFactoryForEnvironment(): ILogManagerFactory {
    const env = process.env.NODE_ENV || 'development';

    // 環境に応じたファクトリーを返す
    switch (env) {
      case 'production':
        return this.getFactory('production');
      case 'test':
        return this.getFactory('test');
      case 'development':
      default:
        return this.getFactory('development');
    }
  }
}

// デフォルトファクトリーの登録
LogManagerFactoryRegistry.setDefaultFactories();

/**
 * 簡単にログマネージャーを作成するためのヘルパー関数
 */
export function createLogManager(
  environment?: string,
  logDir?: string,
  config?: Partial<LogManagerConfig>
): LogManager {
  let factory: ILogManagerFactory;

  if (environment) {
    factory = LogManagerFactoryRegistry.getFactory(environment);
  } else {
    factory = LogManagerFactoryRegistry.getFactoryForEnvironment();
  }

  return factory.createLogManager(logDir, config);
}

// Builder パターンは型の複雑さのため一時的にコメントアウト
// 基本的なFactory機能の動作確認後に再実装する
