/**
 * Log Path Validator
 *
 * Security measure against path traversal vulnerabilities
 * パストラバーサル脆弱性対策のためのパス検証機能
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * パス検証エラー
 */
export class PathValidationError extends Error {
  constructor(
    message: string,
    public readonly invalidPath: string
  ) {
    super(message);
    this.name = 'PathValidationError';
  }
}

/**
 * パス検証設定
 */
export interface PathValidationConfig {
  /** 許可されるベースディレクトリ一覧 */
  allowedBaseDirectories: string[];
  /** 許可されるファイル拡張子 */
  allowedExtensions: string[];
  /** 最大パス長 */
  maxPathLength: number;
  /** 禁止されるパターン */
  forbiddenPatterns: RegExp[];
}

/**
 * デフォルトのパス検証設定
 */
export const DEFAULT_PATH_VALIDATION_CONFIG: PathValidationConfig = {
  allowedBaseDirectories: [], // 実行時に設定される
  allowedExtensions: ['.jsonl', '.log'],
  maxPathLength: 512,
  forbiddenPatterns: [
    /\.\./, // .. (parent directory)
    /\/\.\./, // /../ (path traversal)
    /\.\.\//, // ../ (path traversal)
    /^\//, // Absolute path starting with /
    /^[A-Za-z]:\\/, // Windows absolute path C:\
    /[<>:"|?*]/, // Invalid filename characters
    /\0/, // Null byte
    /\/$|\\$/, // Trailing slash/backslash
  ],
};

/**
 * ログパス検証クラス
 */
export class LogPathValidator {
  private config: PathValidationConfig;

  constructor(
    logBaseDirectory: string,
    customConfig: Partial<PathValidationConfig> = {}
  ) {
    // ベースディレクトリの正規化
    const normalizedBaseDir = path.resolve(logBaseDirectory);

    this.config = {
      ...DEFAULT_PATH_VALIDATION_CONFIG,
      ...customConfig,
      allowedBaseDirectories: [
        normalizedBaseDir,
        ...(customConfig.allowedBaseDirectories || []),
      ].map((dir) => path.resolve(dir)),
    };
  }

  /**
   * ファイルパスの包括的検証
   */
  public validateLogFilePath(filePath: string): string {
    // 基本的な入力検証
    this.validateBasicInput(filePath);

    // 危険なパターンの検出
    this.validateAgainstForbiddenPatterns(filePath);

    // パス長の検証
    this.validatePathLength(filePath);

    // 拡張子の検証
    this.validateFileExtension(filePath);

    // パスの正規化と解決
    const resolvedPath = this.resolveAndNormalizePath(filePath);

    // ディレクトリトラバーサルの検証
    this.validateDirectoryTraversal(resolvedPath);

    // シンボリックリンクの検証
    this.validateSymbolicLinks(resolvedPath);

    return resolvedPath;
  }

  /**
   * 基本的な入力検証
   */
  private validateBasicInput(filePath: string): void {
    if (!filePath || typeof filePath !== 'string') {
      throw new PathValidationError(
        'File path must be a non-empty string',
        filePath
      );
    }

    if (filePath.trim() === '') {
      throw new PathValidationError(
        'File path cannot be empty or whitespace',
        filePath
      );
    }
  }

  /**
   * 禁止されたパターンに対する検証
   */
  private validateAgainstForbiddenPatterns(filePath: string): void {
    for (const pattern of this.config.forbiddenPatterns) {
      if (pattern.test(filePath)) {
        throw new PathValidationError(
          `File path contains forbidden pattern: ${pattern.source}`,
          filePath
        );
      }
    }
  }

  /**
   * パス長の検証
   */
  private validatePathLength(filePath: string): void {
    if (filePath.length > this.config.maxPathLength) {
      throw new PathValidationError(
        `File path exceeds maximum length of ${this.config.maxPathLength} characters`,
        filePath
      );
    }
  }

  /**
   * ファイル拡張子の検証
   */
  private validateFileExtension(filePath: string): void {
    const extension = path.extname(filePath).toLowerCase();

    if (!this.config.allowedExtensions.includes(extension)) {
      throw new PathValidationError(
        `File extension '${extension}' is not allowed. Allowed: ${this.config.allowedExtensions.join(', ')}`,
        filePath
      );
    }
  }

  /**
   * パスの正規化と解決
   */
  private resolveAndNormalizePath(filePath: string): string {
    try {
      // パスを正規化（相対パスの解決など）
      const normalized = path.normalize(filePath);

      // 絶対パスでない場合は、最初の許可されたベースディレクトリからの相対として扱う
      if (!path.isAbsolute(normalized)) {
        return path.resolve(this.config.allowedBaseDirectories[0], normalized);
      }

      return normalized;
    } catch (error) {
      throw new PathValidationError(
        `Failed to resolve path: ${(error as Error).message}`,
        filePath
      );
    }
  }

  /**
   * ディレクトリトラバーサルの検証
   */
  private validateDirectoryTraversal(resolvedPath: string): void {
    // すべての許可されたベースディレクトリに対してチェック
    const isInAllowedDirectory = this.config.allowedBaseDirectories.some(
      (baseDir) => {
        return this.isPathWithinDirectory(resolvedPath, baseDir);
      }
    );

    if (!isInAllowedDirectory) {
      throw new PathValidationError(
        `Path is outside allowed directories: ${this.config.allowedBaseDirectories.join(', ')}`,
        resolvedPath
      );
    }
  }

  /**
   * パスが指定されたディレクトリ内にあるかチェック
   */
  private isPathWithinDirectory(
    filePath: string,
    baseDirectory: string
  ): boolean {
    const relativePath = path.relative(baseDirectory, filePath);

    // 相対パスが.. で始まる場合、baseDirectory の外側
    return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  }

  /**
   * シンボリックリンクの検証
   */
  private validateSymbolicLinks(resolvedPath: string): void {
    try {
      // ファイルが存在する場合のみチェック
      if (fs.existsSync(resolvedPath)) {
        const stats = fs.lstatSync(resolvedPath);

        if (stats.isSymbolicLink()) {
          // シンボリックリンクの実際のターゲットを取得
          const realPath = fs.realpathSync(resolvedPath);

          // ターゲットも許可されたディレクトリ内にあるかチェック
          this.validateDirectoryTraversal(realPath);
        }
      }
    } catch (error) {
      throw new PathValidationError(
        `Symbolic link validation failed: ${(error as Error).message}`,
        resolvedPath
      );
    }
  }

  /**
   * ディレクトリパスの検証（ログディレクトリ用）
   */
  public validateLogDirectory(dirPath: string): string {
    // 基本的な入力検証
    this.validateBasicInput(dirPath);

    // 危険なパターンの検出
    this.validateAgainstForbiddenPatterns(dirPath);

    // パスの正規化
    const resolvedPath = path.resolve(dirPath);

    // ディレクトリトラバーサルの検証
    this.validateDirectoryTraversal(resolvedPath);

    return resolvedPath;
  }

  /**
   * アプリケーション名の検証（ファイル名生成用）
   */
  public validateApplicationName(appName: string): string {
    if (!appName || typeof appName !== 'string') {
      throw new PathValidationError(
        'Application name must be a non-empty string',
        appName
      );
    }

    const trimmedName = appName.trim();

    if (trimmedName === '') {
      throw new PathValidationError(
        'Application name cannot be empty or whitespace',
        appName
      );
    }

    // 危険な文字の検出
    const dangerousChars = /[/\\<>:"|?*\0]/;
    if (dangerousChars.test(trimmedName)) {
      throw new PathValidationError(
        'Application name contains invalid characters',
        appName
      );
    }

    // ドット始まりやドット終わりの禁止
    if (trimmedName.startsWith('.') || trimmedName.endsWith('.')) {
      throw new PathValidationError(
        'Application name cannot start or end with a dot',
        appName
      );
    }

    // 最大長の制限
    if (trimmedName.length > 64) {
      throw new PathValidationError(
        'Application name exceeds maximum length of 64 characters',
        appName
      );
    }

    return trimmedName;
  }

  /**
   * 設定のアップデート
   */
  public updateConfig(newConfig: Partial<PathValidationConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      allowedBaseDirectories: [
        ...this.config.allowedBaseDirectories,
        ...(newConfig.allowedBaseDirectories || []),
      ].map((dir) => path.resolve(dir)),
    };
  }

  /**
   * 現在の設定の取得
   */
  public getConfig(): Readonly<PathValidationConfig> {
    return { ...this.config };
  }
}

/**
 * セキュリティ強化されたパス生成ヘルパー
 */
export class SecureLogPathBuilder {
  constructor(private validator: LogPathValidator) {}

  /**
   * アプリケーション用ログファイルパスの安全な生成
   */
  public buildLogFilePath(
    appName: string,
    logType: 'combined' | 'stdout' | 'stderr' = 'combined'
  ): string {
    // アプリケーション名の検証
    const validatedAppName = this.validator.validateApplicationName(appName);

    // ファイル名の生成
    let fileName: string;
    switch (logType) {
      case 'stdout':
        fileName = `${validatedAppName}-out.jsonl`;
        break;
      case 'stderr':
        fileName = `${validatedAppName}-error.jsonl`;
        break;
      case 'combined':
      default:
        fileName = `${validatedAppName}.jsonl`;
        break;
    }

    // パスの検証
    return this.validator.validateLogFilePath(fileName);
  }

  /**
   * カスタムログファイルパスの安全な生成
   */
  public buildCustomLogFilePath(customPath: string): string {
    return this.validator.validateLogFilePath(customPath);
  }
}

/**
 * パス検証のユーティリティ関数
 */
export function createLogPathValidator(
  logBaseDirectory: string,
  customConfig?: Partial<PathValidationConfig>
): LogPathValidator {
  return new LogPathValidator(logBaseDirectory, customConfig);
}

/**
 * 簡単なパス検証関数
 */
export function validateLogPath(
  filePath: string,
  logBaseDirectory: string
): string {
  const validator = createLogPathValidator(logBaseDirectory);
  return validator.validateLogFilePath(filePath);
}

/**
 * 開発用の緩い検証設定
 */
export const DEV_PATH_VALIDATION_CONFIG: Partial<PathValidationConfig> = {
  forbiddenPatterns: [
    /\0/, // Null byte のみ
  ],
  maxPathLength: 1024,
};

/**
 * 本番用の厳格な検証設定
 */
export const PRODUCTION_PATH_VALIDATION_CONFIG: Partial<PathValidationConfig> =
  {
    forbiddenPatterns: [
      ...DEFAULT_PATH_VALIDATION_CONFIG.forbiddenPatterns,
      /\s{2,}/, // 連続する空白
      /[^\x20-\x7E]/, // ASCII printable characters 以外
    ],
    maxPathLength: 256,
    allowedExtensions: ['.jsonl'], // .log は本番では禁止
  };
