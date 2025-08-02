---
priority: 5
tags: ["process-management", "core", "lifecycle"]
description: "child_process.spawnベースのプロセス管理コア機能とライフサイクル管理の実装"
created_at: "2025-08-01T15:50:06Z"
started_at: null # Do not modify manually
closed_at: null # Do not modify manually
---

# Process Manager - プロセス管理コア機能

## Overview

@masuidrive/procman の中核となるプロセス管理機能を実装する。PoC で検証済みの child_process.spawn ベースのプロセス管理システムを構築し、プロセスのライフサイクル管理、監視、自動再起動機能を提供する。

## Prerequisite

- フェーズ 1 の全チケット（プロジェクト基盤、型定義、IPC 通信、設定読み込み）が完了していること
- TypeScript 環境とテスト環境が整備されていること
- PoC のプロセス管理実装結果が把握されていること

## Tasks

### Prepare: Context Alignment

- [ ] PoC のプロセス管理実装結果を確認し、実装パターンを整理する
- [ ] 仕様書のプロセス管理要件を再確認する
- [ ] プロセス状態の管理方法を設計する
- [ ] メモリ監視と自動再起動の戦略を確認する
- [ ] `git commit`

### Phase 1: プロセス管理基盤の実装

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.  
- [ ] ProcessManager クラスの基本構造を実装
  - プロセス一覧の管理（Map<string, ProcessInfo>）
  - プロセス状態の追跡
  - イベントエミッターの実装
- [ ] ProcessInfo クラスの実装
  - プロセス基本情報の管理
  - 統計情報の収集（稼働時間、再起動回数）
  - 状態変更の記録
- [ ] プロセス設定の管理機能を実装
  - AppConfig からプロセス設定への変換
  - 環境変数の準備
  - 作業ディレクトリの設定
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 2: プロセス起動・停止機能

- [ ] プロセス起動機能を実装
  - child_process.spawn による起動
  - stdout/stderr の適切なキャプチャ設定
  - プロセス状態の初期化
  - エラーハンドリング（起動失敗時）
- [ ] プロセス停止機能を実装
  - Graceful shutdown (SIGTERM 送信)
  - 強制終了 (SIGKILL 送信)
  - タイムアウト処理（30 秒 → 強制）
  - プロセス状態の更新
- [ ] プロセス再起動機能を実装
  - 停止 → 起動の連続処理
  - 再起動回数のカウント
  - 再起動履歴の管理
- [ ] `git commit`

### Phase 3: プロセス監視システム

- [ ] プロセス生存監視を実装
  - 定期的なプロセス状態チェック（5 秒間隔）
  - プロセス終了の検出
  - 異常終了の記録とログ出力
- [ ] メモリ使用量監視を実装
  - process.memoryUsage() による取得
  - 定期的な使用量記録
  - メモリ統計の管理
- [ ] CPU 使用率監視を実装
  - システムレベルの使用率取得
  - プロセス別使用率の追跡
  - パフォーマンス統計の管理
- [ ] `git commit`

### Phase 4: 自動再起動機能

- [ ] メモリ制限による再起動を実装
  - max_memory_restart 設定の監視
  - メモリ制限超過時の自動再起動
  - 再起動条件の詳細ログ出力
- [ ] 異常終了時の自動再起動を実装
  - 意図しない終了の検出
  - 再起動の可否判定
  - 連続失敗時の再起動停止
- [ ] 再起動制御機能を実装
  - 再起動間隔の制御
  - 最大再起動回数の制限
  - バックオフ戦略の実装
- [ ] `git commit`

### Phase 5: 複数プロセス管理

- [ ] プロセスグループ管理を実装
  - namespace によるグループ化
  - グループ単位での操作（一括起動・停止）
  - グループ状態の集約
- [ ] 並行処理制御を実装
  - 複数プロセスの同時起動・停止
  - 操作の並行実行とエラーハンドリング
  - デッドロック防止
- [ ] 依存関係管理の基盤を実装（将来拡張用）
  - プロセス間の依存関係定義
  - 起動順序の制御
  - 依存プロセス監視
- [ ] `git commit`

### Phase 6: プロセス情報の永続化

- [ ] プロセス状態の永続化機能を実装
  - processes.json ファイルでの状態保存
  - 起動時の状態復元
  - 状態変更の逐次保存
- [ ] プロセス履歴の管理を実装
  - 起動・停止履歴の記録
  - 再起動履歴の保存
  - 統計情報の永続化
- [ ] データバックアップと復旧を実装
  - 設定バックアップの管理
  - データ破損時の復旧処理
- [ ] `git commit`

### Final Phase: Quality Assurance

- [ ] Run unit tests (./bin/test-unit.sh) and pass all tests (No exceptions)
- [ ] Run integration tests (./bin/test-integration.sh) and pass all tests (No exceptions)
- [ ] Review `## E2E test scenarios` and write E2E tests code
- [ ] Run E2E tests and pass all tests (No exceptions)
- [ ] Call code-review agent and append to `# Review` section
- [ ] Review and address all reviewer feedback
- [ ] Update documentation and this ticket
- [ ] Inform the user of the work, the results of the test, and the results of the review, and obtain permission to complete the work.

## Wireframes

{{このチケットはプロセス管理コア機能の実装のため、UIワイヤーフレームは不要}}

## Unit and integration test cases

- プロセス起動・停止の基本動作テスト
- メモリ・CPU 監視機能のテスト
- 自動再起動機能のテスト（メモリ制限、異常終了）
- 複数プロセス同時管理のテスト
- プロセス状態永続化のテスト
- グループ操作（namespace）のテスト
- エラーケース（起動失敗、権限不足等）のテスト

## E2E test scenarios

- 設定ファイル読み込み → プロセス起動 → 監視 → 停止の完全フローテスト
- メモリ制限超過による自動再起動のテスト
- システム再起動後の状態復元テスト

## Considerations

- **信頼性**: プロセス異常終了やシステム障害時の適切な対応
- **パフォーマンス**: 大量プロセス管理でのスケーラビリティ
- **リソース管理**: メモリリークやファイルディスクリプタリークの防止
- **セキュリティ**: プロセス実行権限とサンドボックス化
- **デバッグ性**: プロセス状態と動作履歴の可視化

## Acceptance Criteria

- [ ] child_process.spawn でプロセスが正常に起動・停止できること
- [ ] プロセスの生存監視が正常に動作すること
- [ ] メモリ・CPU 使用量の監視が正確に動作すること
- [ ] メモリ制限による自動再起動が正常に動作すること
- [ ] 複数プロセスの同時管理が安定動作すること
- [ ] プロセス状態の永続化・復元が正常に動作すること
- [ ] 全てのエラーケースが適切にハンドリングされること
- [ ] メモリリークやリソースリークがないこと
- [ ] 単体・統合テストが全て通ること

## References

- docs/spec.md (プロセス管理の詳細)
- docs/architecture.md (Process Manager 設計)
- docs/poc-results.md (プロセス管理 PoC の結果)
- Node.js documentation (child_process, process modules)

## Parent ticket

- 250801-154902-config-loader.md

## Child tickets

- 次フェーズ: ログ管理システムの実装

## Review

Please list here in full any remarks received from reviewers.
Any corrections should also be added to the Tasks section at the top.

## Working notes

Additional notes or requirements.

- Always organize work into phases. Do not proceed with tasks without proper phase division.
- Before starting any work not listed in the Tasks section, first add it as a checkbox item under the appropriate phase, then begin the work.
- No work should be done without being tracked as a task checkbox.

### Prepare

{{working notes.....}}
