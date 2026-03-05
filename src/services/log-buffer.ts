/**
 * LogBuffer - 高頻度書き込み時のバッファリング管理
 */

import {
  LogManagerConfig,
  DEFAULT_LOG_MANAGER_CONFIG,
} from './log-manager-config.js';
import { BufferedLogEntry } from './log-manager-types.js';

export class LogBuffer {
  private buffer: BufferedLogEntry[] = [];
  private bufferSize = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
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
