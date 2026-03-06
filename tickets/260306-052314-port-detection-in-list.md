---
priority: 2
tags: ['cli', 'feature']
description: 'listコマンドで各プロセスのLISTENポートを自動検出・表示'
created_at: "2026-03-06T05:23:14Z"
started_at: null  # Do not modify manually
closed_at: null   # Do not modify manually
---

<ticket-info>

# Ticket Overview

`procman list` で各プロセスがLISTENしているポート番号を自動検出して表示する。PIDから`lsof`（macOS）または`ss`（Linux）を使ってLISTENポートを取得し、listの出力に表示する。

## Prerequisite

- なし（既存機能の拡張のみ）

## Overview

1. **ポート検出ユーティリティ作成** — PIDを受け取り、そのプロセスがLISTENしているポート一覧を返す
   - macOS: `lsof -i -P -n -p <pid>` でLISTEN行を抽出
   - Linux: `ss -tlnp` からPIDでフィルタ
   - Windows: 非対応（空配列を返す）
2. **ProcessInfo型にports追加** — `ports?: number[]` フィールドを追加
3. **daemon側でlist応答時にポート情報を付与** — onlineプロセスのPIDからポートを検出
4. **listコマンドの表示にPORTカラム追加** — table/json/yaml全フォーマットに反映

### 対象ファイル

- `src/utils/port-detector.ts` — 新規作成（ポート検出ユーティリティ）
- `src/shared/process.ts` — ProcessInfoにports追加
- `src/daemon/daemon-queries.ts` or `src/daemon/process-command-handlers.ts` — list応答にポート情報付与
- `src/cli/commands/list.ts` — 表示にPORTカラム追加

## Tasks

**Note: When you check this ticket, check the completed tasks in the bullet list.**

### Prepare: Context Alignment

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] `src/shared/process.ts`（ProcessInfo型）を確認
- [ ] `src/daemon/daemon-queries.ts`, `src/daemon/process-command-handlers.ts`（list応答）を確認
- [ ] `src/cli/commands/list.ts`（表示処理）を確認
- [ ] macOS `lsof -i -P -n -p <pid>` の出力形式を確認

### Phase 1: ポート検出ユーティリティ

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] テスト作成（Red）:
  - パースロジック: lsof/ss出力文字列のモックでparseLsofOutput/parseSsOutputをテスト
  - コマンド実行層: execFileモックでタイムアウト・エラー・権限不足をテスト
  - 実機テスト: テスト内でHTTPサーバ起動 → detectListeningPorts(pid) → ポート検出確認
- [ ] `src/utils/port-detector.ts` 作成:
  - パース関数（純粋関数）: `parseLsofOutput(stdout)`, `parseSsOutput(stdout)`
  - コマンド実行: `detectListeningPorts(pid, options?)` — execFileをDI可能に
  - macOS: `lsof -i -P -n -p <pid>` → LISTEN行を抽出
  - Linux: `ss -tlnp` → PIDでフィルタ
  - プラットフォーム判定: `process.platform`
  - エラー時は空配列、タイムアウト1秒
- [ ] テスト通過を確認（Green）
- [ ] Run tests → All executed, 0 failed
- [ ] `git commit`

### Phase 2: ProcessInfo型拡張とdaemon側のポート情報付与

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] `src/shared/process.ts` の `ProcessInfo` に `ports?: number[]` を追加
- [ ] daemon側のlist応答処理で、onlineプロセスに対してポート検出を実行
  - 並列実行: `Promise.all` で全プロセスのポートを同時検出
  - パフォーマンス: 検出は非同期、list応答を遅くしすぎない
- [ ] 既存テストが壊れないことを確認
- [ ] Run tests → All executed, 0 failed
- [ ] `git commit`

### Phase 3: listコマンドの表示にポート情報を追加

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] table表示: ステータス行にポート番号を表示（例: `:3000, :8080`）
- [ ] json/yaml表示: portsフィールドがそのまま出力されることを確認
- [ ] ポートがない場合は何も表示しない（省略）
- [ ] Run tests → All executed, 0 failed
- [ ] `git commit`

### QA Phase: Quality Assurance

- [ ] Run full tests: `npm run test:run` → All executed, 0 failed
- [ ] Run linter: `npx eslint src/**/*.ts` → 0 errors
- [ ] `npx tsx src/cli/index.ts list` の出力にポート情報が含まれることを確認（daemon起動時）
- [ ] User final approval before closing

## Unit and integration test cases

- `detectListeningPorts(pid)` がLISTENポートを正しく返すこと
- `detectListeningPorts` がエラー時に空配列を返すこと（プロセス不存在、権限不足）
- `detectListeningPorts` がタイムアウト時に空配列を返すこと
- `lsof` / `ss` 出力パースのユニットテスト（モック出力でテスト）
- ProcessInfoのports追加で既存テストが壊れないこと
- list表示にポート情報が反映されること

## E2E test scenarios

- 既存E2Eテストが壊れないこと

## Considerations

- `lsof` は実行に権限が必要な場合がある（自分のプロセスのみ可能）
- ポート検出はlist応答の速度に影響する可能性がある → タイムアウト1秒
- `ports` フィールドはoptional（後方互換性維持）
- Windows環境では非対応（空配列を返す）

## Acceptance Criteria

- [ ] macOSでLISTENポートが自動検出されること
- [ ] Linuxでも動作すること（`ss` コマンド使用）
- [ ] `procman list` でポート情報が表示されること
- [ ] ポート検出失敗時にlist全体が壊れないこと
- [ ] All tests executed with 0 failed
- [ ] Linter: 0 errors
- [ ] User has approved completion

## References

- `src/shared/process.ts` — ProcessInfo型
- `src/cli/commands/list.ts` — list表示処理
- `src/daemon/daemon-queries.ts` — daemon側list応答
- `lsof(8)` manpage、`ss(8)` manpage

<review>

## Review

</review>
<working-notes>

## Working notes

- Always organize work into phases. Do not proceed with tasks without proper phase division.
- Before starting any work not listed in the Tasks section, first add it as a checkbox item under the appropriate phase, then begin the work.
- No work should be done without being tracked as a task checkbox.

</working-notes>

</ticket-info>
