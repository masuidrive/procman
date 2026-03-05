/**
 * EventManager - イベント発行の専門クラス（単一責任原則）
 */

import { EventEmitter } from 'events';
import { LogEntry } from '../shared/logs.js';
import { LOG_STREAM_EVENTS } from '../shared/constants-streaming.js';
import { IEventManager } from './log-manager-types.js';

export class EventManager implements IEventManager {
  constructor(private eventEmitter: EventEmitter) {}

  /**
   * ログイベントの発行
   */
  public emitLogEvent(logEntry: LogEntry): void {
    this.eventEmitter.emit('log', logEntry);
    // ストリーミング用の新しいログイベントも発行
    this.eventEmitter.emit(LOG_STREAM_EVENTS.NEW_LOG, logEntry);
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
