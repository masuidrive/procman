# Procman 機能分析と技術的特徴

## 主要機能

### 1. プロセス管理機能
- **プロセスのライフサイクル管理**
  - start/stop/restart コマンドによる制御
  - 設定ファイルベースの一括起動
  - グレースフルシャットダウン対応
  
- **namespace によるグループ管理**
  - プロジェクト単位でのプロセス整理
  - 一括操作（--all, --namespace オプション）

### 2. メモリ管理機能
- **プロセス単位のメモリ制限** (`max_memory_restart`)
  - PM2互換の設定形式（例: '500M', '1G'）
  - 30秒間隔でのメモリチェック（PM2標準）
  - 制限超過時の自動再起動

- **メモリリーク防止機構**
  - EventCleanupHelper クラスによるリスナー管理
  - 確実なリソース解放（Disposableパターン）
  - シャットダウン時の状態保存

### 3. ログ管理
- **構造化ログ** (JSONL形式)
  - stdout/stderr の分離記録
  - タイムスタンプ付き
  - リアルタイムストリーミング対応

### 4. IPC通信
- **クロスプラットフォーム対応**
  - Unix: Unix Domain Socket
  - Windows: Named Pipe
  - JSON over socket/pipe プロトコル

## 技術的特徴

### アーキテクチャ
```
CLI Client ←→ IPC ←→ Daemon Process ←→ Managed Processes
```

### 技術スタック
- **言語**: TypeScript/Node.js
- **CLIフレームワーク**: Commander.js
- **テスト**: Vitest
- **コード品質**: ESLint + Prettier
- **ビルド**: TypeScript Compiler

### 設計思想
1. **シンプルさ優先**
   - 開発環境に必要な最小限の機能
   - 複雑な設定を排除

2. **AI フレンドリー**
   - Claude Codeが扱いやすい設計
   - 適切に終了するログストリーミング
   - 明確なエラーメッセージ

3. **堅牢性**
   - 包括的なテストカバレッジ
   - t_wada方式のテスト設計
   - Uncle Bob推奨のクリーンコード

## pm2との比較

### Procmanの優位性
| 機能 | Procman | pm2 | 差別化ポイント |
|------|---------|-----|------------|
| **ログストリーミング** | 適切に終了 | タイムアウトまで待機 | Claude Code対応 |
| **デーモン単独起動** | 可能 | 不可 | 柔軟な運用 |
| **機能セット** | 最小限 | 多機能 | シンプルで学習コスト低 |
| **namespace** | 標準搭載 | プラグイン | グループ管理が容易 |
| **AI エージェント対応** | 最適化済み | 非対応 | Vibe Coding向け |

### 類似ツールとの比較
- **Forever**: namespace未実装、開発停滞
- **nodemon**: 開発用途限定、プロセス管理機能不足
- **systemd**: OS依存、開発環境には過剰

## 実装上の工夫点

### 1. メモリ管理の工夫
```typescript
// EventCleanupHelper による確実なリスナー解放
class EventCleanupHelper {
  private subscriptions: Map<EventEmitter, Map<string, Function>>;
  
  track(emitter, event, listener) {
    // リスナーを追跡
  }
  
  async dispose() {
    // 全リスナーを解放
  }
}
```

### 2. グレースフルシャットダウン
- 状態の永続化 (`shutdown-state.json`)
- コネクションドレイニング
- 段階的なシグナル送信 (SIGTERM → SIGKILL)

### 3. エラーハンドリング
- 非同期処理の適切なエラーキャッチ
- プロセス異常終了時の自動復旧
- IPC通信エラーの適切な処理

## ユースケース

### 1. マイクロサービス開発
```javascript
// procman.config.js
module.exports = {
  apps: [
    { name: 'api', script: './api/server.js', namespace: 'backend' },
    { name: 'auth', script: './auth/server.js', namespace: 'backend' },
    { name: 'web', script: './web/server.js', namespace: 'frontend' },
  ]
};
```

### 2. AI エージェント開発環境
- ticket.sh との連携
- Claude Code でのプロセス管理
- Vibe Coding ワークフロー

### 3. フルスタック開発
- フロントエンド・バックエンド同時起動
- データベース・キャッシュサーバー管理
- 開発サーバーの統合管理

## パフォーマンス特性
- **CPU使用率**: < 0.1%（30秒間隔のチェック）
- **メモリ使用量**: 2-5MB（監視インフラ）
- **起動時間**: < 100ms
- **IPC レイテンシ**: < 5ms

## セキュリティ
- Unix Socket/Named Pipe の適切な権限設定
- 設定ファイル読み込み時のパス検証
- 最小権限でのデーモン実行
- プロセス間の分離

## 今後の拡張可能性
- クラスター機能
- ウェブUI
- メトリクス収集
- プラグインシステム
- リモート管理