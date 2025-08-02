---
priority: 2
tags: ["refactor", "core-infra", "types", "simplification"]
description: "Core Types簡素化: 過剰実装の削除と基本型定義への回帰"
created_at: "2025-08-02T04:50:47Z"
started_at: null  # Do not modify manually
closed_at: null   # Do not modify manually
---

<ticket-info>

# Core Types Simplification - Core Types簡素化

## Prerequisite

- core-types-constants チケット（250801-154715）が完了していること
- 現在の過剰実装されたファイル群が存在していること
- TypeScript 環境が構築されていること
- 基本的なテストフレームワークが利用可能であること

## Overview

core-types-constants チケットで**スコープクリープ（過剰実装）**が発生し、基本的な型定義のみを要求していたにも関わらず、高度な実装詳細が含まれてしまった。現在のファイル群は合計2,376行（目標の約7倍）に膨れ上がっており、本来のチケット要件に戻すための簡素化作業が必要。

**問題のあるファイル**:
- `src/shared/ipc.ts` (1,074行) - 高度なIPC実装詳細が含まれている（本来はIPCチケットの範囲）
- `src/shared/logs.ts` (547行) - 高度なログ管理機能が含まれている
- `src/shared/config.ts` (429行) - 高度な設定ロード・バリデーション機能が含まれている
- `src/shared/process.ts` (326行) - 高度なプロセス監視機能が含まれている

**目標**: 合計300-400行程度の基本型定義のみに削減し、元のcore-types-constantsチケットの要求要件に回帰する。

## Tasks

**Note: When you check this ticket, check the completed tasks in the bullet list.**

Organize tasks into phases based on logical groupings or concerns. Create one or more phases as appropriate.
After completing each phase, refine the ticket and tasks as needed based on what you learned - break down the next steps into actionable tasks, and revise the ticket content accordingly.

### Prepare: Context Alignment

元のcore-types-constantsチケットの要求要件を確認し、現在の過剰実装を分析して適切な簡素化戦略を立てる。

- [ ] Carefully read the `current-ticket.md` to understand the task's objective and background.
- [ ] 元のcore-types-constantsチケット（250801-154715）の要求要件を詳細に分析
- [ ] 現在の過剰実装されたファイル群の内容を精査し、何が本来の要求範囲外かを特定
- [ ] 各ファイルから削除すべき高度な機能と残すべき基本型定義を分類
- [ ] 削除による既存テストへの影響とテスト修正方針を検討
- [ ] 簡素化後の型定義が元のチケット要件を満たすことを確認
- [ ] Explain the updates and decisions to the user and obtain their approval before proceeding.
- [ ] `git commit`

### Phase 1: IPC型定義の簡素化

`src/shared/ipc.ts` (1,074行) から高度なIPC実装詳細を削除し、基本的な型定義のみに削減する。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] 元のチケット要求に従い、基本的な型のみを残す:
  - IPCMessage interface (id, type, payload, timestamp)
  - CommandType union type (load, start, stop, restart, list, log, clear-log, exit)
  - IPCResponse interface (success, data, error)
- [ ] 削除する高度な機能:
  - 認証・認可システム（AuthenticationToken, AuthorizationLevel等）
  - ハートビート機能（HeartbeatMessage, HeartbeatConfig等）
  - 接続プール（ConnectionPool, LoadBalancingStrategy等）
  - 回路ブレーカー（CircuitBreakerConfig, CircuitBreakerState等）
  - 高度なエラーハンドリング（詳細なエラー分類等）
  - メッセージ圧縮・バージョニング機能
  - 接続監視・統計機能
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 2: ログ型定義の簡素化

`src/shared/logs.ts` (547行) から高度なログ管理機能を削除し、基本的な型定義のみに削減する。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] 元のチケット要求に従い、基本的な型のみを残す:
  - LogEntry interface (timestamp, level, message, app, namespace, type)
  - LogOptions interface (lines, human, stream等の基本オプション)
  - LogFormat type (basic, json, csv等の基本形式)
- [ ] 削除する高度な機能:
  - ログローテーション機能（LogRotationConfig等）
  - ログアーカイブ・圧縮機能（LogArchiveConfig等）
  - ログ検索・フィルタリング機能（LogSearchConfig等）
  - ログ統計・監視機能（LogStats, LogWatchConfig等）
  - 高度なストリーミング機能（LogStreamConfig等）
  - ファイル管理機能（LogFileInfo, LogFileConfig等）
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 3: 設定型定義の簡素化

`src/shared/config.ts` (429行) から高度な設定ロード・バリデーション機能を削除し、基本的な型定義のみに削減する。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] 元のチケット要求に従い、基本的な型のみを残す:
  - AppConfig interface (name, script, namespace, args, cwd, note, env, max_memory_restart, log_file, out_file, error_file)
  - ProcmanConfig interface (apps配列)
  - 基本的な型ガード（isAppConfig, isProcmanConfig）
- [ ] 削除する高度な機能:
  - 設定ローディング機能（ConfigLoader, ConfigLoadOptions等）
  - 詳細なバリデーション機能（validateAppConfig, validateProcmanConfig等）
  - 設定マージ・作成機能（createDefaultAppConfig, mergeAppConfigs等）
  - 設定監視・自動リロード機能
  - 高度なメモリサイズフォーマット機能（formatMemorySize等）
- [ ] parseMemorySize関数のみ基本機能として維持
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 4: プロセス型定義の簡素化

`src/shared/process.ts` (326行) から高度なプロセス監視機能を削除し、基本的な型定義のみに削減する。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] 元のチケット要求に従い、基本的な型のみを残す:
  - ProcessStatus type (stopped, starting, online, stopping, errored, max-memory)
  - ProcessInfo interface (name, namespace, status, pid, uptime, memory, cpu, restarts, note)
  - 基本的な型ガード（isValidProcessStatus, isProcessInfo）
- [ ] 削除する高度な機能:
  - プロセス監視・統計機能（ProcessStats, ProcessMonitorConfig等）
  - プロセスイベント・ログ機能（ProcessEvent, ProcessLogEntry等）
  - 高度なプロセス設定（ProcessStartOptions, ProcessStopOptions等）
  - リソース制限・健全性チェック機能
  - バックアップ・復旧機能
  - プロセス実行環境・クエリ機能
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Final Phase: Quality Assurance

- [ ] Run unit tests (./bin/test-unit.sh) and pass all tests (No exceptions)
- [ ] Run integration tests (./bin/test-integration.sh) and pass all tests (No exceptions)
- [ ] Review `## E2E test scenarios` and write E2E tests code
- [ ] Run E2E tests and pass all tests (No exceptions)
- [ ] Call code-review agent and append to `# Review` section
- [ ] Review and address all reviewer feedback
- [ ] Update documentation and this ticket
- [ ] Inform the user of the work, the results of the test, and the results of the review, and obtain permission to complete the work.

## Wireframes

{{
If this ticket involves the layout or content of a web page, include a simple mockup using HTML with Tailwind CSS v3.
Use an `html-preview` code block to display the design.

### User registration wireframe

```html-preview
<html>
<head>
  <script src="https://cdn.tailwindcss.com/3.4.16"></script>
</head>
<body class="bg-gray-100 p-4">
....
</body>
</html>
```

### User login wireframe

...
}}

## Unit and integration test cases

- 簡素化されたIPC型定義の型ガードテスト
- 簡素化されたログ型定義の基本機能テスト
- 簡素化された設定型定義のparseMemorySize機能テスト
- 簡素化されたプロセス型定義の型ガードテスト
- 型定義のコンパイルエラー検証テスト
- 基本的な型の一貫性テスト

## E2E test scenarios

- TypeScript コンパイル時の型チェックテスト（簡素化後）
- 基本的な型定義のみでの設定ファイル検証テスト
- 他のチケットで実装される機能との型互換性テスト

## Considerations

- **削除の影響範囲**: 高度な機能を削除する際の既存テストへの影響を最小限に抑える
- **型の一貫性**: 簡素化後も元のチケット要件で求められた型定義は完全に維持する
- **将来の拡張性**: 削除する機能は将来のチケットで再実装されることを前提とする
- **破壊的変更**: 簡素化は破壊的変更を伴うが、それが本来の要件への回帰であることを明確にする
- **テスト戦略**: 過剰実装されたテストは削除し、基本機能のテストのみ維持する

## Acceptance Criteria

- [ ] `src/shared/ipc.ts` が基本的なIPCMessage, CommandType, IPCResponse型のみを含むこと
- [ ] `src/shared/logs.ts` が基本的なLogEntry, LogOptions, LogFormat型のみを含むこと
- [ ] `src/shared/config.ts` が基本的なAppConfig, ProcmanConfig型とparseMemorySize関数のみを含むこと
- [ ] `src/shared/process.ts` が基本的なProcessStatus, ProcessInfo型のみを含むこと
- [ ] 簡素化後の総行数が300-400行程度に収まること
- [ ] 元のcore-types-constantsチケットの要求要件が全て満たされていること
- [ ] 認証、ハートビート、接続プール、ログローテーション等の高度な機能が完全に削除されていること
- [ ] TypeScript コンパイルエラーが発生しないこと
- [ ] 基本機能のテストが全て通ること
- [ ] Passed all unit/integration/E2E tests
- [ ] Addressed all reviewer feedback
- [ ] Update documents

## References

- tickets/done/250801-154715-core-types-constants.md (元のチケット要件)
- docs/spec.md (基本仕様書)
- docs/architecture.md (基本アーキテクチャ)
- src/shared/*.ts (現在の過剰実装されたファイル群)

## Parent ticket

- 250801-154715-core-types-constants.md (簡素化対象の元チケット)

## Child tickets

- 削除される高度な機能は、将来の専用チケット（IPC実装、ログ管理実装等）で個別に実装される

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

{{working notes.....}}

</working-notes>
