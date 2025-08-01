# @masuidrive/procman

Node.jsベースのプロセス管理デーモンツール。開発環境における複数のサーバープロセスを統合的に管理し、開発者の生産性向上を目的とする。pm2の軽量版として、開発に必要な最小限の機能に絞って実装。

## 概要

procmanは、開発環境でのプロセス管理を簡単にするためのCLIツールです。Unix Domain Socket（Linux/macOS）またはNamed Pipe（Windows）を使用してデーモンプロセスと通信し、複数のアプリケーションプロセスを効率的に管理します。

## 主要機能

- プロセスのライフサイクル管理（起動、停止、再起動）
- 設定ファイルベースの一括管理
- 構造化されたログの集約と管理
- メモリ使用量によるプロセス自動再起動
- namespaceによるプロセスのグループ管理

## サポートOS

- Linux（完全サポート）
- macOS（完全サポート）
- Windows（基本サポート）

## 開発環境セットアップ

### 必要な環境

- Node.js 18.x LTS

### インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd procman

# 依存関係をインストール
npm install
```

### ビルド

```bash
# プロジェクトをビルド
npm run build

# クリーンビルド（distディレクトリを削除してからビルド）
npm run clean && npm run build
```

### ローカル開発

```bash
# グローバル使用のためにローカルインストール
npm link

# procmanコマンドをグローバルで使用可能
procman --help
```

### 利用可能なスクリプト

- `npm run build` - TypeScriptをJavaScriptにコンパイル
- `npm run dev` - 開発モードでCLIを実行
- `npm run clean` - ビルド成果物を削除
- `npm run test` - テストをウォッチモードで実行
- `npm run test:run` - テストを一度実行
- `npm run test:coverage` - カバレッジレポート付きでテスト実行
- `npm run lint` - ESLintを実行
- `npm run lint:fix` - ESLintで自動修正
- `npm run format` - Prettierでコードフォーマット
- `npm run format:check` - コードフォーマットをチェック

### 基本的な使用方法

`npm link`を実行後、CLIを使用できます：

```bash
# ヘルプを表示
procman --help

# バージョンを表示
procman --version

# プロセス状態を表示（プレースホルダー）
procman status

# サービスを開始（プレースホルダー）
procman start <service-name>

# サービスを停止（プレースホルダー）
procman stop <service-name>
```

### アーキテクチャ

このCLIツールは以下で構築されています：

- **TypeScript** - 型安全性とモダンなJavaScript機能
- **Commander.js** - CLIフレームワーク
- **Vitest** - テストフレームワーク
- **ESLint + Prettier** - コード品質とフォーマット

### 開発

プロジェクトは厳密なTypeScript設定に従い、コード品質のためESLintとPrettierを使用しています。全てのコミットはリントとフォーマットチェックを通す必要があります。

```bash
# 全てのチェックを実行
./bin/test-unit.sh
./bin/test-integration.sh
```

このプロジェクトは devcontainer を使用して開発します。詳細は `./bin/README.md` を参照してください。