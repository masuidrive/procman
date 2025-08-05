# テスト移行計画

このドキュメントは、既存テストの分類結果と移行計画を記載します。

## 分類結果サマリー

- **境界テスト（保持・改善）**: 約15% - 実際の動作を検証
- **振る舞いテスト（修正）**: 約20% - 部分的にモック依存
- **実装詳細テスト（削除）**: 約50% - 過度なモック使用
- **統合テスト（改善）**: 約15% - 現状良好、改善余地あり

## 削除対象テスト一覧

### 高優先度（即削除）

以下のテストは実装詳細に強く依存しており、新しいテスト戦略に移行する際に削除します。

1. **tests/process-manager/process-manager.test.ts**
   - 理由: 全ての依存をモック化、内部メソッド呼び出しを検証
   - 代替: 実際のプロセス起動を伴う境界テストに置き換え

2. **tests/services/log-manager.unit.test.ts**
   - 理由: fs全体をモック化、実際の動作を検証していない
   - 代替: log-manager.test.ts（実ファイルI/O使用）で十分

3. **tests/config/config-loader.test.ts**
   - 理由: pathやfsをモック、内部実装に依存
   - 代替: config-loader.integration.test.tsを強化

4. **tests/process-manager/managed-process-info.test.ts**
   - 理由: 内部状態の詳細な検証
   - 代替: ProcessManagerの境界テストに統合

5. **tests/process-manager/group-operations.test.ts**
   - 理由: 内部実装の詳細に依存
   - 代替: グループ操作の境界テストを新規作成

### 中優先度（段階的削除）

6. **tests/process-manager/process-lifecycle-manager.test.ts**
   - 理由: 一部実装詳細に依存、タイムアウト多発
   - 対応: 境界テストに書き換え後削除

7. **tests/process-manager/process-persistence-impl.test.ts**
   - 理由: 実装クラスの直接テスト
   - 対応: 永続化機能の境界テストに統合

8. **tests/daemon/ipc-factory.test.ts**
   - 理由: ファクトリー実装の詳細テスト
   - 対応: IPC通信の境界テストに統合

## 修正対象テスト一覧

### 高優先度（早期修正）

1. **tests/services/app-logger.test.ts**
   - 現状: 部分的にモック使用
   - 修正: 完全に実ファイルI/Oベースに移行

2. **tests/config/secure-config-loader.test.ts**
   - 現状: セキュリティ機能のモック
   - 修正: 実際のファイル権限チェックを使用

3. **tests/process-manager/auto-restart.test.ts**
   - 現状: タイマーのモック使用
   - 修正: 短時間の実タイマーを使用

## 保持・強化対象テスト一覧

### 優良な境界テスト

1. **tests/services/log-manager.test.ts**
   - 実ファイルI/O使用、tempディレクトリ活用
   - 強化: エラーケースの追加

2. **tests/integration/process-manager.integration.test.ts**
   - 実プロセス起動、E2Eに近い
   - 強化: より多様なシナリオ追加

3. **tests/integration/config-loader.integration.test.ts**
   - 実際の設定ファイル読み込み
   - 強化: 不正な設定のテスト追加

## 移行スケジュール

### Phase 2（現在）
- 既存テストの分類完了 ✓
- 削除・修正対象の特定 ✓
- 移行計画の策定 ✓

### Phase 3（次フェーズ）
1. 新しい境界テストの実装
2. 高優先度の削除対象を除去
3. 修正対象テストの書き換え

### Phase 4
1. 中優先度の削除対象を除去
2. E2Eテストシナリオの実装
3. カバレッジの確認と調整

## 成功指標

- テストの実行時間: 50%削減（モック削減による高速化）
- テストの保守性: 実装変更時の修正箇所80%削減
- テストの信頼性: False Positive/Negativeの排除
- カバレッジ: パブリックAPIの100%カバー