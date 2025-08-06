---
priority: 6
tags: ["e2e-test", "stability", "concurrent", "signal", "stress-test"]
description: "E2Eテストの高度なシナリオ修正（並行処理・シグナル・ストレステスト）"
created_at: "2025-08-06T08:49:36Z"
started_at: null  # Do not modify manually
closed_at: null   # Do not modify manually
---

<ticket-info>

# Ticket Overview

E2Eテストの高度なシナリオ（並行処理、シグナルハンドリング、ストレステスト）における11件の失敗を修正し、E2Eテストの成功率を83%から100%に向上させる。

## Prerequisite

- 基本的なE2Eテストが83%（54/65）成功していること
- デーモンプロセスの基本機能が動作していること
- procman CLIコマンドの基本操作が実装済みであること

## Overview

前回のE2E改善作業により、テスト成功率を35%から83%まで向上させることができました。しかし、現在も11件のテストが失敗しており、これらはすべて高度なシナリオに関連しています：

**現在の失敗状況（11件）**
1. **Concurrent Operations（3件）** - 複数コマンドの同時実行時にエラー
2. **Stress Testing（1件）** - 50個の同時操作でシステムが不安定
3. **Signal Handling（3件）** - SIGINT/SIGTERMの処理が不完全
4. **Real-world Scenarios（3件）** - デーモンがready状態にならない
5. **Performance Testing（1件）** - デーモンのreadiness確認がタイムアウト

これらの問題は、プロダクション環境での信頼性に直接影響するため、修正が必要です。ただし、基本機能は正常に動作しているため、優先度は6（重要だが緊急度は中程度）としています。

## Tasks

**Note: When you check this ticket, check the completed tasks in the bullet list.**

Organize tasks into phases based on logical groupings or concerns. Create one or more phases as appropriate.
After completing each phase, refine the ticket and tasks as needed based on what you learned - break down the next steps into actionable tasks, and revise the ticket content accordingly.

### Prepare: 現状分析と問題の特定

E2Eテストの失敗パターンを詳細に分析し、根本原因を特定する。

- [ ] Carefully read the `current-ticket.md` to understand the task's objective and background.
- [ ] E2Eテストログ（`./log/test-e2e-*.log`）を確認し、11件の失敗の詳細を分析
- [ ] 失敗している各テストケースのコードを読み、期待される動作を理解
- [ ] デーモンプロセスのコード（`src/daemon/`）を確認し、問題の可能性がある箇所を特定
- [ ] IPC通信とプロセス管理の実装を確認し、並行処理での問題点を洗い出し
- [ ] シグナルハンドリングの実装状況を確認
- [ ] 分析結果を「Working notes」セクションに記載
- [ ] `git commit`

### Phase 1: 並行処理の安定性向上

複数のコマンドを同時実行した際の問題を修正し、並行処理の安定性を確保する。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] IPCメッセージの処理にキューイングメカニズムを実装
- [ ] コマンド実行時のロック機構を見直し、デッドロックを防ぐ
- [ ] メッセージIDによるリクエスト/レスポンスの正確なマッチングを実装
- [ ] 並行処理時のエラーハンドリングを強化
- [ ] Concurrent Operationsテスト（3件）が成功することを確認
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Run `./bin/test-e2e.sh --filter "Concurrent"` to verify fixes
- [ ] `git commit`

### Phase 2: シグナルハンドリングの改善

SIGINT、SIGTERM等のシグナル処理を正しく実装し、グレースフルシャットダウンを確保する。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] シグナルハンドラーの登録と解除のタイミングを見直し
- [ ] グレースフルシャットダウンのシーケンスを実装
- [ ] 実行中のタスクの適切な終了処理を追加
- [ ] IPCソケットのクリーンアップ処理を強化
- [ ] Signal Handlingテスト（3件）が成功することを確認
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Run `./bin/test-e2e.sh --filter "Signal"` to verify fixes
- [ ] `git commit`

### Phase 3: デーモンの起動とReady状態の改善

デーモンプロセスの起動処理を安定化し、Ready状態への遷移を確実にする。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] デーモンの初期化シーケンスを見直し、エラー処理を強化
- [ ] Ready状態の判定ロジックを改善（PIDファイル、IPCソケット、ヘルスチェック）
- [ ] 起動タイムアウトの適切な設定と再試行メカニズムの実装
- [ ] ログ出力を改善し、起動失敗時の原因を明確化
- [ ] Real-world Scenariosテスト（3件）が成功することを確認
- [ ] Performance Testingテスト（1件）が成功することを確認
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Run `./bin/test-e2e.sh --filter "Real-world|Performance"` to verify fixes
- [ ] `git commit`

### Phase 4: ストレステスト対応

高負荷環境での安定性を確保し、50個の同時操作に耐えられるようにする。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] リソース制限（ファイルディスクリプタ、メモリ）の見直し
- [ ] コネクションプールの実装またはリクエストのスロットリング
- [ ] バックプレッシャー機構の実装
- [ ] エラー時の適切なリトライとタイムアウト処理
- [ ] Stress Testingテスト（1件）が成功することを確認
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Run `./bin/test-e2e.sh --filter "Stress"` to verify fixes
- [ ] `git commit`

### Final Phase: Quality Assurance

- [ ] Run unit tests (./bin/test-unit.sh) and pass all tests (No exceptions)
- [ ] Run integration tests (./bin/test-integration.sh) and pass all tests (No exceptions)
- [ ] Run E2E tests (./bin/test-e2e.sh) and confirm all 65 tests pass (100% success rate)
- [ ] 並行処理、シグナル、ストレステストを個別に再実行して安定性を確認
- [ ] パフォーマンステストの実行時間が基準値以内であることを確認
- [ ] Call code-review agent and append to `# Review` section
- [ ] Review and address all reviewer feedback
- [ ] Update documentation and this ticket
- [ ] Inform the user of the work, the results of the test, and the results of the review, and obtain permission to complete the work.

## Wireframes

本チケットはバックエンドの安定性改善のため、UIワイヤーフレームは不要です。

## Unit and integration test cases

- **並行処理テスト**: 複数のIPCメッセージが同時に処理されることを確認
- **シグナルハンドリングテスト**: SIGINT/SIGTERM受信時の適切な終了処理を確認
- **デーモン起動テスト**: 様々な条件下でのデーモン起動とReady状態への遷移を確認
- **リソース制限テスト**: 高負荷時のリソース使用量とエラーハンドリングを確認
- **タイムアウトテスト**: 各種タイムアウト処理が正しく動作することを確認

## E2E test scenarios

**修正対象の失敗テスト（11件）**

1. **Concurrent Operations（3件）**
   - 複数のプロセスを同時に起動
   - 同時に複数のコマンドを実行
   - 並行してステータス確認とプロセス操作を実行

2. **Stress Testing（1件）**
   - 50個のプロセスを同時に起動し、全てが正常に動作することを確認

3. **Signal Handling（3件）**
   - SIGINTを送信してグレースフルシャットダウンを確認
   - SIGTERMを送信して強制終了を確認
   - 複数のシグナルを連続して送信した際の動作確認

4. **Real-world Scenarios（3件）**
   - デーモンが起動してReady状態になることを確認
   - デーモン再起動時の状態復元を確認
   - 異常終了後の自動復旧を確認

5. **Performance Testing（1件）**
   - デーモンが5秒以内にReady状態になることを確認

## Considerations

- **パフォーマンスとの トレードオフ**: 並行処理の安全性を高めると、パフォーマンスが若干低下する可能性がある
- **既存機能への影響**: 修正により既存の基本機能が影響を受けないよう、慎重にテストする必要がある
- **プラットフォーム依存**: シグナル処理はOSによって挙動が異なる可能性があるため、Linux環境での動作を優先
- **タイムアウト値の調整**: CI環境とローカル環境でパフォーマンスが異なるため、適切な余裕を持たせる
- **エラーメッセージの改善**: デバッグを容易にするため、エラーメッセージは具体的で追跡可能にする

## Acceptance Criteria

- [ ] E2Eテストの成功率が100%（65/65）になること
- [ ] 並行処理関連のテスト3件がすべて成功すること
- [ ] シグナルハンドリング関連のテスト3件がすべて成功すること
- [ ] Real-worldシナリオのテスト3件がすべて成功すること
- [ ] ストレステスト（50同時操作）が成功すること
- [ ] パフォーマンステスト（5秒以内のReady）が成功すること
- [ ] 既存の成功していたテストが引き続き成功すること（リグレッションなし）
- [ ] Passed all unit/integration/E2E tests
- [ ] Addressed all reviewer feedback
- [ ] Update documents

## References

- `src/daemon/daemon-manager.ts` - デーモンプロセス管理の実装
- `src/daemon/ipc-server.ts` - IPC通信サーバーの実装
- `src/daemon/signal-handler.ts` - シグナルハンドリングの実装
- `tests/e2e/concurrent.test.ts` - 並行処理のE2Eテスト
- `tests/e2e/signal.test.ts` - シグナルハンドリングのE2Eテスト
- `tests/e2e/stress.test.ts` - ストレステスト
- `./log/test-e2e-*.log` - E2Eテストの実行ログ

## Parent ticket

- なし（独立したチケット）

## Child tickets

- なし

</ticket-info>
<review>

## Review

Please list here in full any remarks received from reviewers.
Any corrections should also be added to the Tasks section at the top.

</review>
<working-notes>

## Working notes

Additional notes or requirements.

- Always organize work into phases. Do not proceed with tasks without proper phase division.
- Before starting any work not listed in the Tasks section, first add it as a checkbox item under the appropriate phase, then begin the work.
- No work should be done without being tracked as a task checkbox.

### Prepare

**現状の成功率**: 83%（54/65テスト成功）

**失敗しているテストカテゴリ**:
- Concurrent Operations: 3件失敗
- Stress Testing: 1件失敗  
- Signal Handling: 3件失敗
- Real-world Scenarios: 3件失敗
- Performance Testing: 1件失敗

**改善前の状況**: 35%の成功率から83%まで改善済み。基本機能は安定して動作している。

### 技術的な注意点

- **境界テスト重視**: t_wadaの教えに従い、実装詳細ではなく境界（インターフェース）の振る舞いをテストする
- **単一責任の原則**: Uncle Bobの原則に従い、各修正は単一の責任を持つようにする
- **テスト駆動**: 失敗しているテストを理解してから修正を行う（Test-First thinking）
- **リファクタリング**: 修正と同時に、コードの可読性と保守性を向上させる

</working-notes>
