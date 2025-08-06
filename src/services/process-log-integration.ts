/**
 * Process-Log Integration - プロセス管理とログ管理の統合
 *
 * ProcessManagerとLogManagerを連携させ、プロセスのstdout/stderrを
 * 自動的にキャプチャしてJSONL形式でログに記録する。
 */

import { EventEmitter } from 'events';
import { ProcessManager } from '../process-manager/process-manager.js';
import { LogManager } from './log-manager.js';

/**
 * ProcessLogIntegrator - プロセス管理とログ管理の統合クラス
 */
export class ProcessLogIntegrator extends EventEmitter {
  private isSetup = false;

  constructor(
    private processManager: ProcessManager,
    private logManager: LogManager
  ) {
    super();
  }

  /**
   * プロセス管理とログ管理の統合を開始
   */
  public setupIntegration(): void {
    if (this.isSetup) {
      return;
    }

    // ProcessLifecycleManagerのイベントをリッスン
    this.setupProcessEventHandlers();

    this.isSetup = true;
    this.emit('integration:setup');
  }

  /**
   * 統合の停止
   */
  public teardownIntegration(): void {
    if (!this.isSetup) {
      return;
    }

    // イベントリスナーを削除
    // ProcessManagerのlifecycleはEventEmitterとしてキャスト
    const lifecycleEmitter = this.processManager
      .lifecycle as unknown as EventEmitter;
    lifecycleEmitter.removeAllListeners('process:stdout');
    lifecycleEmitter.removeAllListeners('process:stderr');

    this.isSetup = false;
    this.emit('integration:teardown');
  }

  /**
   * プロセスイベントハンドラーの設定
   */
  private setupProcessEventHandlers(): void {
    // ProcessManagerのlifecycleはEventEmitterとしてキャスト
    const lifecycleEmitter = this.processManager
      .lifecycle as unknown as EventEmitter;

    // stdout キャプチャ
    lifecycleEmitter.on('process:stdout', (appName: string, data: string) => {
      try {
        this.logManager.captureProcessOutput(appName, 'stdout', data);
        this.emit('log:captured', appName, 'stdout', data.length);
      } catch (error) {
        console.error(
          `[ProcessLogIntegrator] Failed to capture stdout for ${appName}:`,
          error
        );
        this.emit('log:capture-error', appName, 'stdout', error);
      }
    });

    // stderr キャプチャ
    lifecycleEmitter.on('process:stderr', (appName: string, data: string) => {
      try {
        this.logManager.captureProcessOutput(appName, 'stderr', data);
        this.emit('log:captured', appName, 'stderr', data.length);
      } catch (error) {
        console.error(
          `[ProcessLogIntegrator] Failed to capture stderr for ${appName}:`,
          error
        );
        this.emit('log:capture-error', appName, 'stderr', error);
      }
    });

    // プロセス開始時のログ設定
    this.processManager.on(
      'process:started',
      (appName: string, processInfo) => {
        try {
          // アプリケーションのログ設定を確認
          if (!this.logManager.getAppNames().includes(appName)) {
            // ログ設定が存在しない場合はデフォルト設定で初期化
            this.logManager.setupAppLogs(appName, {
              namespace: processInfo.namespace || 'default',
            });
          }

          // ファイル監視を開始
          this.logManager.startWatching(appName);

          this.emit('log:setup', appName);
        } catch (error) {
          console.error(
            `[ProcessLogIntegrator] Failed to setup logs for ${appName}:`,
            error
          );
          this.emit('log:setup-error', appName, error);
        }
      }
    );

    // プロセス停止時のクリーンアップ
    this.processManager.on('process:stopped', (appName: string) => {
      try {
        // ファイル監視を停止
        this.logManager.stopWatching(appName);

        this.emit('log:cleanup', appName);
      } catch (error) {
        console.error(
          `[ProcessLogIntegrator] Failed to cleanup logs for ${appName}:`,
          error
        );
        this.emit('log:cleanup-error', appName, error);
      }
    });
  }

  /**
   * 統合状態の確認
   */
  public isIntegrationActive(): boolean {
    return this.isSetup;
  }

  /**
   * 統合統計情報の取得
   */
  public getIntegrationStats(): {
    isActive: boolean;
    managedApps: string[];
    bufferStats: Record<
      string,
      {
        entryCount: number;
        bufferSize: number;
        isBackpressured: boolean;
      }
    >;
  } {
    return {
      isActive: this.isSetup,
      managedApps: this.logManager.getAppNames(),
      bufferStats: this.logManager.getAllBufferStats(),
    };
  }

  /**
   * バックプレッシャー状態のチェック
   */
  public checkBackpressureStatus(): {
    hasBackpressure: boolean;
    backpressuredApps: string[];
  } {
    const bufferStats = this.logManager.getAllBufferStats();
    const backpressuredApps = Object.entries(bufferStats)
      .filter(([, stats]) => stats.isBackpressured)
      .map(([appName]) => appName);

    return {
      hasBackpressure: backpressuredApps.length > 0,
      backpressuredApps,
    };
  }

  /**
   * すべてのバッファを強制フラッシュ
   */
  public async flushAllBuffers(): Promise<void> {
    this.logManager.flushAllBuffers();
    this.emit('buffers:flushed', this.logManager.getAppNames());
  }

  /**
   * リソースのクリーンアップ
   */
  public async cleanup(): Promise<void> {
    // バッファをフラッシュ
    await this.flushAllBuffers();

    // 統合を停止
    this.teardownIntegration();

    // イベントリスナーをクリア
    this.removeAllListeners();
  }
}
