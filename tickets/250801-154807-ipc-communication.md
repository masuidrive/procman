---
priority: 120
tags: ["core-infra", "ipc", "communication"]
description: "Unix Domain Socket/Named PipeベースのIPC通信基盤の実装"
created_at: "2025-08-01T15:48:07Z"
started_at: null # Do not modify manually
closed_at: null # Do not modify manually
---

# IPC Communication Infrastructure - IPC 通信基盤

## Overview

CLI Client と Daemon Process 間の通信を行う IPC（Inter-Process Communication）基盤を実装する。PoC で検証済みの Unix Domain Socket（Unix 系）/Named Pipe（Windows）を使用し、JSON ベースのメッセージ交換システムを構築する。

## Prerequisite

- プロジェクト基盤設定チケットが完了していること
- 基本型定義とシステム定数チケットが完了していること
- TypeScript 環境が整備されていること
- PoC の実装結果とその改善点が把握されていること

## Tasks

### Prepare: Context Alignment

- [ ] PoC の IPC 通信実装結果を確認し、改善点を整理する
- [ ] 仕様書の IPC 通信要件を再確認する
- [ ] プラットフォーム別の実装方針を決定する（Unix Socket vs Named Pipe）
- [ ] エラーハンドリングと再接続戦略を設計する
- [ ] `git commit`

### Phase 1: IPC 基盤クラスの実装

- [ ] IPCServer 基底クラスを実装
  - サーバー起動・停止のライフサイクル管理
  - クライアント接続の受け付けと管理
  - メッセージルーティングの基盤
- [ ] IPCClient 基底クラスを実装
  - サーバーへの接続・切断処理
  - メッセージ送信・レスポンス受信の管理
  - 接続状態の監視
- [ ] メッセージプロトコルの実装
  - JSON メッセージのシリアライズ・デシリアライズ
  - メッセージ区切り文字の適切な処理（PoC の改善点対応）
  - メッセージ ID 生成とレスポンス管理
- [ ] `git commit`

### Phase 2: Unix Domain Socket 実装

- [ ] UnixSocketServer の実装
  - Unix Domain Socket の作成と バインド
  - ソケットファイルのパーミッション設定（0600）
  - 複数クライアント接続の管理
- [ ] UnixSocketClient の実装
  - Unix Domain Socket への接続
  - 接続エラーの適切な処理
  - 再接続機能の実装
- [ ] ソケットファイルのクリーンアップ処理を実装
- [ ] `git commit`

### Phase 3: Named Pipe 実装（Windows 対応）

- [ ] NamedPipeServer の実装
  - Named Pipe の作成と設定
  - Windows 固有のセキュリティ設定
  - クライアント接続の管理
- [ ] NamedPipeClient の実装
  - Named Pipe への接続
  - Windows 固有のエラーハンドリング
  - 再接続機能の実装
- [ ] プラットフォーム検出と IPC 方式の自動選択
- [ ] `git commit`

### Phase 4: メッセージハンドリングシステム

- [ ] メッセージハンドラーの登録・実行システムを実装
- [ ] コマンドタイプ別のメッセージルーティングを実装
- [ ] 非同期メッセージ処理の実装
- [ ] エラーレスポンスの標準化
- [ ] リクエスト・レスポンスのタイムアウト処理
- [ ] `git commit`

### Phase 5: 接続管理と信頼性向上

- [ ] 接続プールの実装
- [ ] ハートビート機能の実装
- [ ] 接続断絶時の自動再接続
- [ ] 接続状態の監視とログ出力
- [ ] Graceful shutdown の実装
- [ ] `git commit`

### Phase 6: エラーハンドリングとロバスト性

- [ ] IPC 通信のエラー分類と処理
- [ ] 接続失敗時のリトライロジック
- [ ] タイムアウト処理の実装
- [ ] デッドロック検出と回避
- [ ] リソースリークの防止
- [ ] `git commit`

### Final Phase: Quality Assurance

- [ ] Unix Domain Socket の動作テスト（Linux/macOS 環境で）
- [ ] Named Pipe の動作テスト（可能であれば Windows 環境で）
- [ ] 複数クライアント接続のテスト
- [ ] 大量メッセージ送信時の安定性テスト（PoC の改善点検証）
- [ ] エラーケースの網羅的テスト
- [ ] メモリリークのテスト
- [ ] パフォーマンステスト（接続時間、スループット）
- [ ] `git commit`

## Unit and integration test cases

- IPC メッセージのシリアライズ・デシリアライズテスト
- Unix Socket/Named Pipe の接続・切断テスト
- 複数メッセージ連続送信テスト（PoC の改善点確認）
- エラーケースのハンドリングテスト
- 接続プールとハートビートのテスト
- タイムアウトとリトライロジックのテスト

## E2E test scenarios

- CLI Client から Daemon Process への基本通信テスト
- ネットワーク断絶時の再接続テスト
- 長時間接続での安定性テスト
- プラットフォーム間での互換性テスト

## Considerations

- **プラットフォーム対応**: Unix と Windows の差異を吸収する抽象化レイヤー
- **セキュリティ**: ソケットファイルの適切なパーミッション設定
- **パフォーマンス**: 大量メッセージ処理時のメモリ効率
- **信頼性**: 接続断絶やプロセス終了時の適切なクリーンアップ
- **デバッグ性**: IPC 通信の状態とエラーの可視化

## Acceptance Criteria

- [ ] Unix Domain Socket で CLI-Daemon 間の通信が正常に動作すること
- [ ] Named Pipe で Windows 環境での通信が動作すること（可能な範囲で）
- [ ] 複数の CLI クライアントが同時接続できること
- [ ] メッセージの連続送信でパースエラーが発生しないこと
- [ ] 接続断絶時の自動再接続が動作すること
- [ ] 全てのエラーケースが適切にハンドリングされること
- [ ] メモリリークやリソースリークがないこと
- [ ] 単体・統合テストが全て通ること

## References

- docs/spec.md (通信方式)
- docs/architecture.md (IPC Server 設計)
- docs/poc-results.md (IPC 通信 PoC の結果と改善点)
- Node.js documentation (net, fs modules)
- 型定義ファイル（IPCMessage, CommandType 等）

## Parent ticket

- 250801-154715-core-types-constants.md

## Child tickets

- 次フェーズ: 設定ファイル読み込み機能の実装
