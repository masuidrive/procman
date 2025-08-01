# procman アーキテクチャ設計書

## システム構成

### 全体アーキテクチャ

```
┌─────────────────┐     ┌─────────────────┐
│   CLI Client    │     │  管理対象プロセス   │
│  (コマンドライン)  │     │   (複数起動可).    │
└────────┬────────┘     └────────┬────────┘
         │ IPC通信                │
         │ (Unix Socket/         │ spawn/監視
         │  Named Pipe)          │
         ▼                       ▼
┌────────────────────────────────────────┐
│          Daemon Process                │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │ IPC Server  │  │ Process Manager │  │
│  └─────────────┘  └─────────────────┘  │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │Config Loader│  │  Log Manager    │  │
│  └─────────────┘  └─────────────────┘  │
└────────────────────────────────────────┘
```

### コンポーネント詳細

#### 1. CLI Client
- **役割**: ユーザーからのコマンドを受け付け、デーモンに転送
- **実装**: Commander.js を使用したCLI
- **通信**: IPC経由でデーモンとやり取り

#### 2. Daemon Process
- **役割**: バックグラウンドで常駐し、プロセス管理を実行
- **起動**: CLI の load コマンドで起動
- **永続化**: PIDファイル、設定、プロセス状態を保存

#### 3. IPC Server
- **役割**: CLI Client との通信を担当
- **実装**:
  - Unix: Unix Domain Socket (`~/.masuidrive-procman/procman.sock`)
  - Windows: Named Pipe (`\\\\.\\pipe\\masuidrive-procman`)
- **プロトコル**: JSON over socket/pipe

#### 4. Process Manager
- **役割**: 子プロセスのライフサイクル管理
- **機能**:
  - spawn によるプロセス起動
  - プロセス監視（生存確認、メモリ使用量）
  - シグナル処理（SIGTERM → SIGKILL）
  - 自動再起動

#### 5. Config Loader
- **役割**: 設定ファイルの読み込みと検証
- **実装**: require() による動的読み込み
- **セキュリティ**: 設定ファイルのパス検証

#### 6. Log Manager
- **役割**: アプリケーションログの集約と管理
- **実装**: 
  - stdout/stderr のキャプチャ
  - JSONL形式での保存
  - リアルタイムストリーミング

## データフロー

### 1. 設定読み込みフロー
```
CLI load command
↓
Config Loader → 設定ファイル読み込み
↓
Process Manager → プロセス定義の登録
↓
永続化 → processes.json
```

### 2. プロセス起動フロー
```
CLI start command
↓
IPC Server → コマンド受信
↓
Process Manager → child_process.spawn
↓
Log Manager → stdout/stderr キャプチャ開始
↓
プロセス監視開始
```

### 3. ログストリーミングフロー
```
子プロセス stdout/stderr
↓
Log Manager → JSONL形式で記録
↓
CLI log --stream → ファイル監視
↓
リアルタイム出力
```

## ディレクトリ構造

### データ保存先
```
~/.masuidrive-procman/
├── procman.sock         # Unix Domain Socket (Unix系のみ)
├── daemon.log           # デーモンプロセスのログ
├── daemon.pid           # デーモンのPIDファイル
├── processes.json       # プロセス状態の永続化ファイル
└── app-logs/            # アプリケーションログディレクトリ
    ├── [app-name].jsonl
    ├── [app-name]-out.jsonl
    └── [app-name]-error.jsonl
```

### プロジェクト構造（予定）
```
src/
├── cli/                 # CLI Client
│   ├── index.ts        # エントリーポイント
│   ├── commands/       # 各コマンドの実装
│   └── client.ts       # IPC Client
├── daemon/             # Daemon Process
│   ├── index.ts        # デーモンエントリーポイント
│   ├── ipc-server.ts   # IPC Server
│   ├── process-manager.ts  # Process Manager
│   ├── config-loader.ts    # Config Loader
│   └── log-manager.ts      # Log Manager
├── shared/             # 共通モジュール
│   ├── types.ts        # 型定義
│   ├── constants.ts    # 定数
│   └── utils.ts        # ユーティリティ
└── types/              # 型定義ファイル
```

## 技術的な設計方針

### 1. エラーハンドリング
- すべての非同期処理で適切なエラーハンドリング
- プロセス異常終了時の自動復旧
- IPC通信エラーの適切な処理

### 2. セキュリティ
- Unix Socket/Named Pipe の適切な権限設定
- 設定ファイル読み込み時のパス検証
- 最小権限でのデーモン実行

### 3. パフォーマンス
- 非同期処理の適切な使用
- メモリ使用量の監視と制限
- ログファイルサイズの制御

### 4. テスタビリティ
- 各コンポーネントの独立性
- モックしやすいインターフェース設計
- 統合テストの容易性