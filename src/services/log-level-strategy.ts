/**
 * DefaultLogLevelStrategy - デフォルトのログレベル判定戦略（Strategy パターン）
 */

import { ILogLevelStrategy } from './log-manager-types.js';

export class DefaultLogLevelStrategy implements ILogLevelStrategy {
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
