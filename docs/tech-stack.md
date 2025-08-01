# procman - プロセス管理デーモンツール

## ステータス
- 承認済み

## プロジェクト名
@masuidrive/procman

## 概要
Node.jsベースのプロセス管理デーモンツール。開発環境における複数のサーバープロセスを統合的に管理し、開発者の生産性向上を目的とする。pm2の軽量版として、開発に必要な最小限の機能に絞って実装。

## 選定した技術
- 言語: Node.js 18.x LTS + TypeScript
- パッケージ形式: npmパッケージ（@masuidrive/procman）
- 設定ファイル: CommonJS（JavaScript）
- ログ形式: JSONL（JSON Lines）
- IPC通信: Unix Domain Socket（Unix系）/ Named Pipe（Windows）
- テストフレームワーク: Vitest
- Linter/Formatter: ESLint + Prettier
- プロセス管理: Node.js標準API（child_process, process）
- CLI引数解析: Commander.js

## 実行環境
- プラットフォーム: Node.js（Linux、macOS、Windows対応）
- パッケージ配布: npm registry
- 実行方式: CLI（npx -y @masuidrive/procman）

## 技術選定経緯
- Node.js 18.x LTS: Claude Code CLIと同じ環境で安定性重視
- TypeScript: 型安全性を重視、大規模開発への対応
- Vitest: 高速でES Modules完全対応、Jest互換API
- ESLint + Prettier: 定番の組み合わせでコード品質担保
- 設定ファイルはJavaScript: ユーザーの書きやすさを優先

## note
- プロジェクトはTypeScriptで開発するが、ユーザーが書く設定ファイル（procman.config.js）はJavaScriptのままとする
- 既存の仕様書に記載された機能要件とアーキテクチャは維持
- npm パッケージとして配布し、npx経由で実行する形式