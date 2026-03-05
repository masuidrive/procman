# @masuidrive/procman

[![npm version](https://badge.fury.io/js/@masuidrive%2Fprocman.svg)](https://www.npmjs.com/package/@masuidrive/procman)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

Node.jsベースのプロセス管理デーモンツール。開発環境における複数のサーバープロセスを統合的に管理し、開発者の生産性向上を目的とする。pm2の軽量版として、開発に必要な最小限の機能に絞って実装。

## 概要

procmanは、開発環境でのプロセス管理を簡単にするためのCLIツールです。Unix Domain Socket（Linux/macOS）またはNamed Pipe（Windows）を使用してデーモンプロセスと通信し、複数のアプリケーションプロセスを効率的に管理します。

## 主要機能

- プロセスのライフサイクル管理（起動、停止、再起動）
- 設定ファイルベースの一括管理
- 構造化されたログの集約と管理
- メモリ使用量によるプロセス自動再起動
- namespaceによるプロセスのグループ管理
- メモリリーク検出と防止機能

## インストール

### npmから公開パッケージをインストール

```bash
# グローバルインストール（CLIとして使用）
npm install -g @masuidrive/procman

# ローカルプロジェクトにインストール
npm install @masuidrive/procman
```

### 使用方法

グローバルインストール後、`procman`コマンドが使用可能になります：

```bash
# ヘルプを表示
procman --help

# バージョンを表示
procman --version

# プロセス状態を表示
procman status

# 設定ファイルを使ってプロセスを起動
procman start <service-name>

# プロセスを停止
procman stop <service-name>

# ヘルスチェック（メモリ使用状況含む）
procman health
```

## サポートOS

- Linux（完全サポート）
- macOS（完全サポート）
- Windows（基本サポート）

## 設定ファイル例

procmanは設定ファイルを使用してプロセスを管理します：

```javascript
// procman.config.js
module.exports = {
  apps: [{
    name: 'my-app',
    script: './app.js',
    max_memory_restart: '500M'  // 500MB超過で自動再起動
  }]
};
```

### メモリ管理機能

procmanはPM2互換のメモリ管理機能を提供し、長期稼働でも安定した動作を実現します：

- **プロセスメモリ制限**: `max_memory_restart` オプションでプロセス毎のメモリ上限を設定
- **自動再起動**: メモリ制限を超えたプロセスを自動的に再起動
- **EventEmitterリーク防止**: シンプルなクリーンアップパターンで確実なリスナー解放
- **グレースフルシャットダウン**: 状態保存とコネクションドレイニング
- **ヘルスチェック**: `procman health` でメモリ使用状況を監視

詳細は [Memory Management Documentation](docs/technical/memory-management.md) を参照してください。

## 開発者向け情報

### 開発環境セットアップ

#### 必要な環境

- Node.js 18.x LTS

#### ローカル開発

```bash
# リポジトリをクローン
git clone <repository-url>
cd procman

# 依存関係をインストール
npm install

# プロジェクトをビルド
npm run build

# ローカルでテスト使用
npm link
procman --help
```

#### 利用可能なスクリプト

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