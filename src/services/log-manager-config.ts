/**
 * Log Manager Configuration
 *
 * Uncle Bob's guidance: Externalize magic numbers and make them configurable
 * 設定値の外部化と設定可能なパラメータとしての実装
 */

/**
 * ログマネージャーの設定インターフェース
 */
export interface LogManagerConfig {
  /** 最大ログメッセージサイズ（デフォルト: 1MB） */
  maxLogMessageSize: number;

  /** バッファ設定 */
  buffer: {
    /** 最大バッファサイズ（デフォルト: 10MB） */
    maxSize: number;
    /** フラッシュ間隔（ms）（デフォルト: 100ms） */
    flushInterval: number;
    /** バックプレッシャー閾値（デフォルト: 5MB） */
    backpressureThreshold: number;
  };

  /** ファイル操作設定 */
  file: {
    /** ディレクトリのパーミッション（デフォルト: 0o700） */
    directoryMode: number;
    /** ファイルのパーミッション（デフォルト: 0o644） */
    fileMode: number;
    /** 読み込みチャンクサイズ（デフォルト: 8192） */
    chunkSize: number;
    /** 書き込みリトライ回数（デフォルト: 3） */
    maxRetries: number;
    /** リトライ間隔のベース時間（ms）（デフォルト: 100） */
    retryBaseDelay: number;
  };

  /** パフォーマンス設定 */
  performance: {
    /** 小さなファイルの閾値（デフォルト: 8KB） */
    smallFileThreshold: number;
  };
}

/**
 * デフォルトのログマネージャー設定
 */
export const DEFAULT_LOG_MANAGER_CONFIG: LogManagerConfig = {
  maxLogMessageSize: 1024 * 1024, // 1MB

  buffer: {
    maxSize: 10 * 1024 * 1024, // 10MB
    flushInterval: 100, // 100ms
    backpressureThreshold: 5 * 1024 * 1024, // 5MB
  },

  file: {
    directoryMode: 0o700,
    fileMode: 0o644,
    chunkSize: 8192, // 8KB
    maxRetries: 3,
    retryBaseDelay: 100, // 100ms
  },

  performance: {
    smallFileThreshold: 8192, // 8KB
  },
};

/**
 * 設定のマージ機能
 */
export function mergeLogManagerConfig(
  customConfig: Partial<LogManagerConfig> = {}
): LogManagerConfig {
  return {
    maxLogMessageSize:
      customConfig.maxLogMessageSize ??
      DEFAULT_LOG_MANAGER_CONFIG.maxLogMessageSize,

    buffer: {
      maxSize:
        customConfig.buffer?.maxSize ??
        DEFAULT_LOG_MANAGER_CONFIG.buffer.maxSize,
      flushInterval:
        customConfig.buffer?.flushInterval ??
        DEFAULT_LOG_MANAGER_CONFIG.buffer.flushInterval,
      backpressureThreshold:
        customConfig.buffer?.backpressureThreshold ??
        DEFAULT_LOG_MANAGER_CONFIG.buffer.backpressureThreshold,
    },

    file: {
      directoryMode:
        customConfig.file?.directoryMode ??
        DEFAULT_LOG_MANAGER_CONFIG.file.directoryMode,
      fileMode:
        customConfig.file?.fileMode ?? DEFAULT_LOG_MANAGER_CONFIG.file.fileMode,
      chunkSize:
        customConfig.file?.chunkSize ??
        DEFAULT_LOG_MANAGER_CONFIG.file.chunkSize,
      maxRetries:
        customConfig.file?.maxRetries ??
        DEFAULT_LOG_MANAGER_CONFIG.file.maxRetries,
      retryBaseDelay:
        customConfig.file?.retryBaseDelay ??
        DEFAULT_LOG_MANAGER_CONFIG.file.retryBaseDelay,
    },

    performance: {
      smallFileThreshold:
        customConfig.performance?.smallFileThreshold ??
        DEFAULT_LOG_MANAGER_CONFIG.performance.smallFileThreshold,
    },
  };
}

/**
 * 設定値の検証
 */
export function validateLogManagerConfig(config: LogManagerConfig): void {
  // 基本的な数値の範囲チェック
  if (config.maxLogMessageSize <= 0) {
    throw new Error('maxLogMessageSize must be greater than 0');
  }

  if (config.buffer.maxSize <= 0) {
    throw new Error('buffer.maxSize must be greater than 0');
  }

  if (config.buffer.flushInterval <= 0) {
    throw new Error('buffer.flushInterval must be greater than 0');
  }

  if (config.buffer.backpressureThreshold <= 0) {
    throw new Error('buffer.backpressureThreshold must be greater than 0');
  }

  if (config.buffer.backpressureThreshold > config.buffer.maxSize) {
    throw new Error(
      'buffer.backpressureThreshold must not exceed buffer.maxSize'
    );
  }

  if (config.file.chunkSize <= 0) {
    throw new Error('file.chunkSize must be greater than 0');
  }

  if (config.file.maxRetries < 1) {
    throw new Error('file.maxRetries must be at least 1');
  }

  if (config.file.retryBaseDelay < 0) {
    throw new Error('file.retryBaseDelay must not be negative');
  }

  if (config.performance.smallFileThreshold <= 0) {
    throw new Error('performance.smallFileThreshold must be greater than 0');
  }
}

/**
 * 開発・テスト用の設定プリセット
 */
export const DEV_LOG_MANAGER_CONFIG: LogManagerConfig = {
  ...DEFAULT_LOG_MANAGER_CONFIG,
  buffer: {
    ...DEFAULT_LOG_MANAGER_CONFIG.buffer,
    flushInterval: 50, // より頻繁なフラッシュ
  },
  file: {
    ...DEFAULT_LOG_MANAGER_CONFIG.file,
    maxRetries: 1, // テストでは早く失敗
    retryBaseDelay: 10, // 短いディレイ
  },
};

/**
 * 本番用の設定プリセット
 */
export const PRODUCTION_LOG_MANAGER_CONFIG: LogManagerConfig = {
  ...DEFAULT_LOG_MANAGER_CONFIG,
  buffer: {
    ...DEFAULT_LOG_MANAGER_CONFIG.buffer,
    maxSize: 50 * 1024 * 1024, // 50MB - より大きなバッファ
    backpressureThreshold: 25 * 1024 * 1024, // 25MB
  },
  file: {
    ...DEFAULT_LOG_MANAGER_CONFIG.file,
    maxRetries: 5, // より多いリトライ
    retryBaseDelay: 200, // より長いディレイ
  },
};

/**
 * 高パフォーマンス用の設定プリセット
 */
export const HIGH_PERFORMANCE_LOG_MANAGER_CONFIG: LogManagerConfig = {
  ...DEFAULT_LOG_MANAGER_CONFIG,
  maxLogMessageSize: 256 * 1024, // 256KB - 短いメッセージ
  buffer: {
    ...DEFAULT_LOG_MANAGER_CONFIG.buffer,
    maxSize: 100 * 1024 * 1024, // 100MB - 非常に大きなバッファ
    flushInterval: 200, // より低頻度のフラッシュ
    backpressureThreshold: 75 * 1024 * 1024, // 75MB
  },
  file: {
    ...DEFAULT_LOG_MANAGER_CONFIG.file,
    chunkSize: 64 * 1024, // 64KB - より大きなチャンク
  },
  performance: {
    ...DEFAULT_LOG_MANAGER_CONFIG.performance,
    smallFileThreshold: 64 * 1024, // 64KB
  },
};
