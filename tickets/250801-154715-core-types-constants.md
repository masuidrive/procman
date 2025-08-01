---
priority: 2
tags: ["core-infra", "types"]
description: "プロセス管理、IPC通信、設定ファイルの基本型定義とシステム定数の実装"
created_at: "2025-08-01T15:47:15Z"
started_at: null # Do not modify manually
closed_at: null # Do not modify manually
---

# Core Types and Constants - 基本型定義とシステム定数

## Overview

@masuidrive/procman で使用する中核的な型定義とシステム定数を実装する。プロセス管理、IPC 通信、設定ファイル、ログ管理に関する型安全性を担保し、システム全体の一貫性を保つ基盤を構築する。

## Prerequisite

- プロジェクト基盤設定チケットが完了していること
- TypeScript 環境が構築されていること
- 仕様書のデータ構造が把握されていること

## Tasks

### Prepare: Context Alignment

- [ ] 仕様書とアーキテクチャ設計書から必要な型定義を洗い出す
- [ ] PoC で使用されたデータ構造を確認・整理する
- [ ] システム全体で使用する定数を特定する
- [ ] 型定義の依存関係を整理し、実装順序を決定する
- [ ] `git commit`

### Phase 1: プロセス管理関連の型定義

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] プロセス状態の型定義を実装
  ```typescript
  type ProcessStatus =
    | "stopped"
    | "starting"
    | "online"
    | "stopping"
    | "errored"
    | "max-memory";
  ```
- [ ] プロセス情報の型定義を実装
  ```typescript
  interface ProcessInfo {
    name: string;
    namespace: string;
    status: ProcessStatus;
    pid: number | null;
    uptime: number;
    memory: number;
    cpu: number;
    restarts: number;
    note?: string;
  }
  ```
- [ ] プロセス管理操作の型定義を実装
- [ ] メモリ制限に関する型定義を実装
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 2: 設定ファイル関連の型定義

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] アプリケーション設定の型定義を実装
  ```typescript
  interface AppConfig {
    name: string;
    script: string;
    namespace?: string;
    args?: string;
    cwd?: string;
    note?: string;
    env?: Record<string, string>;
    max_memory_restart?: string;
    log_file?: string;
    out_file?: string;
    error_file?: string;
  }
  ```
- [ ] プロジェクト設定全体の型定義を実装
  ```typescript
  interface ProcmanConfig {
    apps: AppConfig[];
  }
  ```
- [ ] 設定ファイル検証用の型ガードを実装
- [ ] メモリサイズパースのユーティリティ型を実装
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 3: IPC 通信関連の型定義

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] IPC メッセージの基本型定義を実装
  ```typescript
  interface IPCMessage {
    id: string;
    type: string;
    payload: any;
    timestamp: number;
  }
  ```
- [ ] コマンドタイプの型定義を実装
  ```typescript
  type CommandType =
    | "load"
    | "start"
    | "stop"
    | "restart"
    | "list"
    | "log"
    | "clear-log"
    | "exit";
  ```
- [ ] レスポンス形式の型定義を実装
- [ ] エラーレスポンスの型定義を実装
- [ ] ログストリーミング用の型定義を実装
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 4: ログ管理関連の型定義

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] ログエントリの型定義を実装
  ```typescript
  interface LogEntry {
    timestamp: number;
    level: "info" | "warn" | "error";
    message: string;
    app: string;
    namespace: string;
    type: "stdout" | "stderr";
  }
  ```
- [ ] ログオプションの型定義を実装
- [ ] ログ出力形式の型定義を実装
- [ ] ログファイル管理の型定義を実装
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 5: システム定数の実装

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] ファイルパスの定数を実装
  ```typescript
  export const PROCMAN_DIR = "~/.masuidrive-procman";
  export const SOCKET_PATH = "~/.masuidrive-procman/procman.sock";
  export const PID_FILE = "~/.masuidrive-procman/daemon.pid";
  ```
- [ ] デフォルト値の定数を実装
- [ ] タイムアウト値の定数を実装
- [ ] エラーコードの定数を実装
- [ ] プラットフォーム固有の定数を実装
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 6: エラー管理の型定義

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] エラーコードの型定義を実装
- [ ] エラーメッセージの型定義を実装
- [ ] カスタムエラークラスの型定義を実装
- [ ] エラーハンドリング用のユーティリティ型を実装
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Final Phase: Quality Assurance

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] 全ての型定義のコンパイルエラーがないことを確認
- [ ] 型定義のエクスポートが適切に行われているか確認
- [ ] 循環参照がないことを確認
- [ ] 型定義の一貫性をチェック
- [ ] 単体テストで型定義の動作を検証
- [ ] JSDOComment で型定義のドキュメントを追加
- [ ] Run unit tests (./bin/test-unit.sh) and pass all tests (No exceptions)
- [ ] Run integration tests (./bin/test-integration.sh) and pass all tests (No exceptions)
- [ ] Run code review (./bin/code-review.sh) and append to `# Review` section
- [ ] Review and address all reviewer feedback
- [ ] Update documentation and this ticket
- [ ] Inform the user of the work, the results of the test, and the results of the review, and obtain permission to complete the work.
- [ ] `git commit`

## Wireframes

{{このチケットは型定義とシステム定数の実装のため、UIワイヤーフレームは不要}}

## Unit and integration test cases

- 型ガード関数のテスト
- 設定ファイル検証のテスト
- メモリサイズパースのテスト
- 定数値の正当性テスト
- エラーオブジェクトの生成テスト

## E2E test scenarios

- TypeScript コンパイル時の型チェックテスト
- 実際の設定ファイルでの型検証テスト

## Considerations

- 将来の機能拡張を考慮した拡張性のある型設計
- 型安全性を保ちながらも使いやすさを重視
- 外部ライブラリとの型の互換性
- パフォーマンスに影響する型定義は避ける
- プラットフォーム固有の型定義は条件分岐で対応

## Acceptance Criteria

- [ ] 全ての型定義が TypeScript でコンパイルエラーなく動作すること
- [ ] 仕様書に記載された全データ構造の型が定義されていること
- [ ] 型ガード関数が正常に動作すること
- [ ] システム定数が適切に定義・エクスポートされていること
- [ ] 循環参照やその他の型定義エラーがないこと
- [ ] 単体テストが全て通ること

## References

- docs/spec.md (設定ファイル仕様、ログファイル仕様)
- docs/architecture.md (データフロー)
- docs/poc-results.md (実装パターン)
- TypeScript Handbook (Type Guards, Utility Types)

## Parent ticket

- 250801-154621-project-setup.md

## Child tickets

- {{If this ticket has child tickets, list them here.}}

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
