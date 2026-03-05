/**
 * FileManager - ファイル操作の専門クラス（単一責任原則）
 */

import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import {
  LogManagerConfig,
  DEFAULT_LOG_MANAGER_CONFIG,
} from './log-manager-config.js';
import { IFileManager } from './log-manager-types.js';

export class FileManager implements IFileManager {
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
