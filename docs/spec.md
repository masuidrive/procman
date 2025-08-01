# @masuidrive/procman 詳細仕様書

## 概要

@masuidrive/procmanは、Node.jsベースのプロセス管理デーモンツールです。開発環境における複数のサーバープロセスを統合的に管理し、開発者の生産性向上を目的としています。pm2の軽量版として、開発に必要な最小限の機能に絞って実装します。

### 主要機能

プロセスのライフサイクル管理（起動、停止、再起動）、設定ファイルベースの一括管理、構造化されたログの集約と管理、メモリ使用量によるプロセス自動再起動、namespaceによるプロセスのグループ管理を提供します。

## アーキテクチャ

### システム構成

デーモンプロセスがバックグラウンドで常駐し、CLIクライアントからの要求を受け付けてプロセスを管理します。各コンポーネントは以下の役割を担います。

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

### 通信方式

Unix系OS（Linux、macOS）ではUnix Domain Socket（`~/.masuidrive-procman/procman.sock`）を使用し、WindowsではNamed Pipe（`\\.\pipe\masuidrive-procman`）を使用します。この方式により、効率的かつセキュアなプロセス間通信を実現します。

### データ保存先

すべてのデータは`~/.masuidrive-procman/`ディレクトリ配下に保存されます。

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

## 設定ファイル仕様

### ファイル形式

設定ファイルはCommonJS形式のJavaScriptファイルとして記述します。

```javascript
// procman.config.js
module.exports = {
  apps: [
    {
      // 必須項目
      name: "firebase-emulator",     // アプリケーション識別名
      script: "firebase",            // 実行コマンド/スクリプト
      
      // オプション項目
      namespace: "dev",              // グループ識別子
      args: "emulators:start",       // コマンドライン引数
      cwd: "/path/to/project",       // 作業ディレクトリ
      note: "Firebase local emulator for development", // アプリケーションの説明
      env: {                         // 環境変数
        NODE_ENV: "development",
        PORT: "3000"
      },
      max_memory_restart: "300M",    // メモリ上限（K/M/G単位）
      log_file: "path/to/combined.jsonl",     // 統合ログ
      out_file: "path/to/stdout.jsonl",      // 標準出力ログ
      error_file: "path/to/stderr.jsonl"     // 標準エラーログ
    }
  ]
};
```

### 設定項目詳細

#### 必須項目

nameはアプリケーションの一意識別名で、英数字、ハイフン、アンダースコアのみ使用可能です。scriptは実行するコマンドまたはスクリプトファイルのパスを指定します。

#### オプション項目

| 項目 | 型 | デフォルト | 説明 |
|------|-----|------------|------|
| `namespace` | string | "default" | プロセスをグループ化するための識別子 |
| `args` | string | "" | コマンドライン引数 |
| `cwd` | string | process.cwd() | プロセスの作業ディレクトリ |
| `note` | string | "" | アプリケーションの説明（list表示用） |
| `env` | object | {} | 追加の環境変数（親プロセスの環境変数を継承） |
| `max_memory_restart` | string | null | メモリ使用量上限。超過時に自動再起動 |
| `log_file` | string | null | stdout/stderrの統合ログファイル |
| `out_file` | string | null | 標準出力専用ログファイル |
| `error_file` | string | null | 標準エラー専用ログファイル |

### ログファイル仕様

ログファイルはJSONL（JSON Lines）形式で保存されます。各行が独立したJSONオブジェクトとして記録され、以下の構造を持ちます。

```json
{
  "timestamp": 1672531200000,
  "level": "info",
  "message": "Server started on port 3000",
  "app": "firebase-emulator",
  "namespace": "dev",
  "type": "stdout"
}
```

ログファイルの優先順位は以下の通りです。out_fileとerror_fileが指定されている場合、これらが使用されlog_fileは無視されます。log_fileのみ指定されている場合、stdoutとstderrが同一ファイルに出力されます。どのログファイルも指定されていない場合、デフォルトパス（`~/.masuidrive-procman/app-logs/[name].jsonl`）に出力されます。

### メモリ上限の指定形式

メモリ上限は数値のみの場合バイト単位、Kまたはkでキロバイト、Mまたはmでメガバイト、Gまたはgでギガバイトを表します。例えば"300M"、"1G"、"512000K"のように指定します。

## コマンド仕様

### load - 設定ファイルの読み込み

```bash
npx -y @masuidrive/procman load <config-file>
```

設定ファイルを読み込み、デーモンプロセスを起動します。すでにデーモンが起動している場合は、すべてのプロセスを停止してから設定を再読み込みします。設定ファイルの構文検証を行い、既存デーモンの確認と停止、新しいデーモンの起動、設定の永続化を実行します。

### start - プロセスの起動

```bash
npx -y @masuidrive/procman start [target...]
```

指定されたアプリケーションまたはnamespaceのプロセスを起動します。targetを省略した場合は全プロセスを起動します。特定のアプリケーションを起動する場合は`npx -y @masuidrive/procman start firebase-emulator`、namespaceで一括起動する場合は`npx -y @masuidrive/procman start dev`、複数指定する場合は`npx -y @masuidrive/procman start app1 app2 dev`のように実行します。

### stop - プロセスの停止

```bash
npx -y @masuidrive/procman stop [target...]
```

指定されたアプリケーションまたはnamespaceのプロセスを停止します。targetを省略した場合は全プロセスを停止します。

### restart - プロセスの再起動

```bash
npx -y @masuidrive/procman restart [target...]
```

指定されたアプリケーションまたはnamespaceのプロセスを再起動します。targetを省略した場合は全プロセスを再起動します。

### exit - デーモンの終了

```bash
npx -y @masuidrive/procman exit
```

すべての管理プロセスを停止し、デーモン自体も終了します。

### list/ls - プロセス一覧表示

```bash
npx -y @masuidrive/procman list
npx -y @masuidrive/procman ls  # エイリアス
```

管理中のプロセス一覧をYAML形式で表示します。

```yaml
config_file: /home/user/project/procman.config.js
daemon_uptime: 2h 15m 30s
processes:
  - name: firebase-emulator
    namespace: dev
    note: Firebase local emulator for development
    status: online
    pid: 12345
    uptime: 1h 30m 15s
    memory: 125.5M
    cpu: 2.3%
    restarts: 0
    
  - name: api-server
    namespace: dev
    note: Backend API server
    status: stopped
    pid: null
    uptime: 0s
    memory: 0M
    cpu: 0%
    restarts: 3
```

### log - ログ表示

```bash
npx -y @masuidrive/procman log [-n <lines>] [--human] [--stream] <target>
```

指定されたアプリケーションまたはnamespaceのログを表示します。デフォルトでは最新100行のログをJSONL形式でそのまま出力します。

**オプション**
- `-n <lines>`: 表示する行数を指定（デフォルト: 100）
- `--human`: 人間が読みやすい形式で表示。`[アプリ名] YY/MM/DD HH:mm:ss > 本文`の形式で、アプリケーションごとに色分けして表示
- `--stream`: ログをリアルタイムで継続的に表示

**例**
```bash
# 最新100行のログをJSONL形式で表示
npx -y @masuidrive/procman log firebase-emulator

# 人間が読みやすい形式で最新50行を表示
npx -y @masuidrive/procman log -n 50 --human firebase-emulator

# リアルタイムでログをストリーミング表示
npx -y @masuidrive/procman log --stream --human dev
```

### clear-log - ログクリア

```bash
npx -y @masuidrive/procman clear-log <target>
```

指定されたアプリケーションまたはnamespaceのログファイルをクリアします。プロセスが実行中の場合でも、新しいログは継続して記録されます。

### help/prompt - 使用方法の表示

```bash
npx -y @masuidrive/procman help
npx -y @masuidrive/procman prompt  # エイリアス
```

@masuidrive/procmanの使用方法をMarkdown形式で出力します。このコマンドは、AIコーディングアシスタントにprocmanの使い方を説明する際に使用することを想定しています。出力内容には、基本的な使い方、設定ファイルの例、主要なコマンドとその用途、トラブルシューティングのヒントが含まれます。

出力されるMarkdownは、AIアシスタントが理解しやすいように構造化され、実際の使用例を豊富に含んでいます。これにより、開発者はAIアシスタントと効率的に協働してprocmanを活用できます。

## エラーメッセージ仕様

### 共通エラー

| エラーコード | メッセージ | 説明 |
|------------|----------|------|
| DAEMON_NOT_RUNNING | "Daemon is not running. Please run 'load' command first." | デーモンが起動していない |
| DAEMON_CONNECTION_FAILED | "Failed to connect to daemon: {error}" | デーモンとの通信失敗 |
| PERMISSION_DENIED | "Permission denied. Check file permissions for ~/.masuidrive-procman" | 権限エラー |

### loadコマンドのエラー

| エラーコード | メッセージ | 説明 |
|------------|----------|------|
| CONFIG_FILE_NOT_FOUND | "Configuration file not found: {filepath}" | 設定ファイルが存在しない |
| CONFIG_PARSE_ERROR | "Failed to parse configuration file: {error}" | 設定ファイルの構文エラー |
| CONFIG_VALIDATION_ERROR | "Configuration validation failed: {details}" | 設定内容の検証エラー |
| CONFIG_NO_APPS | "No applications defined in configuration" | apps配列が空または未定義 |
| CONFIG_DUPLICATE_NAME | "Duplicate application name: {name}" | アプリケーション名の重複 |

### start/stop/restartコマンドのエラー

| エラーコード | メッセージ | 説明 |
|------------|----------|------|
| PROCESS_NOT_FOUND | "Process or namespace not found: {target}" | 指定されたプロセスが存在しない |
| PROCESS_ALREADY_RUNNING | "Process already running: {name}" | すでに起動済み |
| PROCESS_NOT_RUNNING | "Process not running: {name}" | プロセスが起動していない |
| PROCESS_START_FAILED | "Failed to start process {name}: {error}" | プロセス起動失敗 |
| PROCESS_STOP_FAILED | "Failed to stop process {name}: {error}" | プロセス停止失敗 |

### logコマンドのエラー

| エラーコード | メッセージ | 説明 |
|------------|----------|------|
| LOG_FILE_NOT_FOUND | "Log file not found for: {target}" | ログファイルが存在しない |
| LOG_READ_ERROR | "Failed to read log file: {error}" | ログファイル読み取りエラー |
| INVALID_LINE_COUNT | "Invalid line count: {value}" | 無効な行数指定 |

### clear-logコマンドのエラー

| エラーコード | メッセージ | 説明 |
|------------|----------|------|
| LOG_CLEAR_FAILED | "Failed to clear log for {target}: {error}" | ログクリア失敗 |
| LOG_FILE_NOT_FOUND | "Log file not found for: {target}" | ログファイルが存在しない |

### exitコマンドのエラー

| エラーコード | メッセージ | 説明 |
|------------|----------|------|
| EXIT_TIMEOUT | "Timeout waiting for processes to stop" | プロセス停止のタイムアウト |
| EXIT_FAILED | "Failed to stop daemon: {error}" | デーモン停止失敗 |

## プロセス管理の詳細

### プロセス状態

各プロセスは以下の状態を持ちます。stoppedは停止中、startingは起動処理中、onlineは正常稼働中、stoppingは停止処理中、erroredはエラーにより停止、max-memoryはメモリ上限により再起動待機中を表します。

### 自動再起動機能

max_memory_restartが設定されている場合、定期的（30秒ごと）にメモリ使用量を監視し、上限を超えた場合は以下の手順で再起動します。まずgraceful shutdownシグナル（SIGTERM）を送信し、10秒待機します。プロセスが終了しない場合は強制終了（SIGKILL）を行い、5秒待機後にプロセスを再起動します。

### プロセス終了時の処理

プロセス終了時はSIGTERMシグナルを送信してgraceful shutdownを試みます。最大30秒待機し、プロセスが終了しない場合はSIGKILLで強制終了します。

## セキュリティ考慮事項

### ファイルパーミッション

Unix Domain Socketは0600（所有者のみ読み書き可能）、ログファイルは0644（所有者は読み書き、その他は読み取りのみ）に設定されます。設定ファイルはユーザーが管理しますが、推奨パーミッションは0600です。

### プロセス分離

各アプリケーションプロセスは独立して実行され、環境変数の分離によりプロセス間の干渉を防止します。デーモンプロセスは最小権限で実行されます。

## 制限事項

Windows環境でのシグナル処理は制限され、graceful shutdownが効かない場合があります。プロセス間の依存関係管理は未サポートです。クラスター機能（複数インスタンス起動）は未サポートです。

## サポートOS

- **Linux**: 完全サポート（Unix Domain Socket使用）
- **macOS**: 完全サポート（Unix Domain Socket使用）
- **Windows**: 基本サポート（Named Pipe使用、シグナル処理に制限あり）

## helpコマンドの出力例

procman helpコマンドは、以下のようなMarkdown形式のドキュメントを出力します。

~~~markdown
# @masuidrive/procman - Process Manager for Development

@masuidrive/procman is a lightweight process manager designed for managing development servers. It's a pm2 subset optimized for development environments.

## Quick Start

1. **Create configuration file** (procman.config.js)
   ```javascript
   module.exports = {
     apps: [
       {
         name: "api-server",
         script: "node",
         args: "server.js",
         cwd: "./backend",
         env: { PORT: "3000", NODE_ENV: "development" }
       },
       {
         name: "frontend",
         script: "npm",
         args: "run dev",
         cwd: "./frontend",
         namespace: "web"
       }
     ]
   };
   ```

2. **Load configuration and start**
   ```bash
   npx -y @masuidrive/procman load procman.config.js
   npx -y @masuidrive/procman start
   ```

## Common Commands

### Process Management
- `load <config-file>` - Load configuration and start daemon
- `start [app/namespace]` - Start processes
- `stop [app/namespace]` - Stop processes
- `restart [app/namespace]` - Restart processes
- `list` or `ls` - Show process status
- `exit` - Stop all processes and daemon

### Log Management
- `log <app/namespace>` - Show logs (last 100 lines)
- `log -n 50 <app>` - Show last 50 lines
- `log --human <app>` - Human-readable format
- `log --stream <app>` - Follow logs in real-time
- `clear-log <app>` - Clear log files

## Configuration Options

### Required
- `name` - Unique app identifier
- `script` - Command or script to execute

### Optional
- `namespace` - Group identifier (default: "default")
- `args` - Command arguments
- `cwd` - Working directory
- `env` - Environment variables
- `note` - App description for list display
- `max_memory_restart` - Auto-restart on memory limit (e.g., "300M")
- `log_file` - Combined stdout/stderr log
- `out_file` - Stdout only log
- `error_file` - Stderr only log

## Examples

### Start specific apps
```bash
# Start single app
npx -y @masuidrive/procman start api-server

# Start by namespace
npx -y @masuidrive/procman start web

# Start multiple
npx -y @masuidrive/procman start api-server frontend
```

### View logs
```bash
# JSON format (default)
npx -y @masuidrive/procman log api-server

# Human-readable with colors
npx -y @masuidrive/procman log --human api-server

# Stream logs
npx -y @masuidrive/procman log --stream --human web
```

### Advanced configuration
```javascript
module.exports = {
  apps: [{
    name: "firebase-emulator",
    script: "firebase",
    args: "emulators:start",
    namespace: "backend",
    note: "Firebase local emulator suite",
    env: {
      FIREBASE_PROJECT: "my-project"
    },
    max_memory_restart: "500M",
    out_file: "./logs/firebase-out.jsonl",
    error_file: "./logs/firebase-error.jsonl"
  }]
};
```

## Tips

- Logs are stored in JSONL format with unix timestamps
- Use namespaces to group related services
- The daemon runs in background and persists configuration
- All data is stored in ~/.masuidrive-procman/
- Use `note` field to add descriptions visible in `list` command

## Troubleshooting

- **"Daemon is not running"**: Run `load` command first
- **"Process already running"**: Check with `list`, then `stop` if needed
- **Permission denied**: Check ~/.masuidrive-procman/ permissions
- **Port in use**: Ensure your apps use different ports
~~~

この出力により、AIコーディングアシスタントはprocmanの使い方を理解し、適切なコマンドや設定ファイルの生成を支援できます。

## 今後の拡張予定

将来的な機能拡張として、プロセス間の依存関係定義、Webhookによる状態変更通知、Web UIダッシュボード、プロセスのCPU使用率制限、ログローテーション機能の実装を検討しています。