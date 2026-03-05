/**
 * LogPreprocessor - ログ前処理の専門クラス（単一責任原則）
 */

import {
  LogManagerConfig,
  DEFAULT_LOG_MANAGER_CONFIG,
} from './log-manager-config.js';
import { ILogPreprocessor, ESCAPE_CHARS } from './log-manager-types.js';

export class LogPreprocessor implements ILogPreprocessor {
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
