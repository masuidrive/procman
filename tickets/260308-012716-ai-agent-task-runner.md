---
priority: 1
tags: [feature, cli]
description: "AI agent向けタスク実行管理機能 (procman run)"
created_at: "2026-03-08T01:27:16Z"
started_at: null  # Do not modify manually
closed_at: null   # Do not modify manually
---

<ticket-info>

# AI agent向けタスク実行管理機能 (procman run)

AI coding agent (Claude Code, Codex等) がバックグラウンドタスクを実行・管理するための機能を追加する。
既存のサービス管理(常駐プロセス)とは異なり、一回限りのコマンド実行に特化する。
ゾンビプロセス防止、ログキャプチャ、終了コード追跡を提供する。

## Prerequisite

- Dependencies:
    - 既存の procman コードベース
    - ZombieReaper (既存実装)
    - LogManager (既存実装)

## Overview

### 背景
AI agentがバックグラウンドでコマンド実行する際、以下の問題がある:
- プロセスがゾンビ化する
- ログが追えない
- 終了状態が分からない

### 機能概要

1. `procman run "<command>" --json` — コマンドをバックグラウンド実行、タスクIDを返す
2. `procman task status <id> --json` — タスクの状態・exit codeを取得
3. `procman task log <id> [options] --json` — ログ取得(待機機能付き)
4. `procman task list --json` — タスク一覧
5. `procman task kill <id>` — タスク停止

### ログ待機機能
- `--wait-lines N` — N行出力されるまで待つ
- `--wait-match "regex"` — 正規表現にマッチする行が出るまで待つ
- `--wait-exit` — プロセス完了まで待つ
- `--timeout Ns` — タイムアウト(必須)
- 全てタイムアウト付き、JSON出力対応

### 出力形式
全コマンドで `--json` オプションをサポートし、agent向けの機械可読出力を返す。

## Tasks

**Rule:** Follow the exact task order defined by the user. Changing order or adding tasks requires main agent/user approval.

### Phase 1: タスク管理基盤
- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] TaskManager クラス設計・実装 (src/process-manager/task-manager.ts)
  - タスク登録、プロセス起動、状態管理
  - exit code追跡
  - stdout/stderrキャプチャ
  - 完了タスクの自動クリーンアップ
- [ ] TaskInfo 型定義 (src/shared/task.ts)
  - id, command, status, exit_code, pid, started_at, finished_at, duration_ms
- [ ] デーモンにTaskManagerを統合
- [ ] IPC コマンド追加: run-task, task-status, task-list, task-kill
- [ ] Run tests → All executed, 0 failed
- [ ] git commit

### Phase 2: CLI コマンド実装
- [ ] `procman run` コマンド (src/cli/commands/run.ts)
  - デーモンが起動していなければ自動起動
  - --json でJSON出力
  - --name でタスク名指定 (省略時は自動生成)
- [ ] `procman task status` コマンド (src/cli/commands/task.ts)
- [ ] `procman task list` コマンド
- [ ] `procman task kill` コマンド
- [ ] Run tests → All executed, 0 failed
- [ ] git commit

### Phase 3: ログ待機機能
- [ ] `procman task log` コマンド (src/cli/commands/task-log.ts)
  - 基本ログ出力
  - --wait-lines N: N行出力まで待機
  - --wait-match "regex": 正規表現マッチまで待機
  - --wait-exit: プロセス完了まで待機
  - --timeout Ns: タイムアウト (必須パラメータ)
  - --json: JSON出力
- [ ] IPC streaming対応 (ログのリアルタイム送信)
- [ ] Run tests → All executed, 0 failed
- [ ] git commit

### Phase 4: テスト
- [ ] TaskManager ユニットテスト
- [ ] CLI コマンドユニットテスト
- [ ] ログ待機機能のテスト (wait-lines, wait-match, timeout)
- [ ] E2Eテスト: run → status → log → kill フロー
- [ ] Run tests → All executed, 0 failed
- [ ] git commit

### QA Phase: Quality Assurance
- [ ] Run full tests: `npm run test:run` → All executed, 0 failed
- [ ] Run linter → 0 errors
- [ ] User final approval before closing

## Unit and integration test cases

- TaskManager: タスク登録・起動・状態遷移
- TaskManager: exit code追跡 (正常終了、異常終了)
- TaskManager: stdout/stderrキャプチャ
- TaskManager: タスク停止 (SIGTERM → SIGKILL)
- CLI: --json出力フォーマット
- ログ待機: --wait-lines で指定行数まで待機
- ログ待機: --wait-match で正規表現マッチまで待機
- ログ待機: --wait-exit でプロセス完了まで待機
- ログ待機: タイムアウト時のレスポンス
- ゾンビプロセス防止

## E2E test scenarios

- run → task status → task log → task kill の一連フロー
- 正常終了するタスクの実行と結果取得
- タイムアウト動作の確認
- 複数タスクの同時実行

## Considerations

- 既存のサービス管理(load/start/stop)とは独立した機能として実装
- ZombieReaperの既存実装を活用
- LogManagerの既存実装をログキャプチャに活用
- タスクIDは短いランダム文字列 (例: task-a1b2c3)
- 完了タスクは一定時間後に自動クリーンアップ

## Acceptance Criteria

- [ ] `procman run "command" --json` でタスク起動できること
- [ ] `procman task status <id> --json` で状態・exit code取得できること
- [ ] `procman task log <id> --wait-match "pattern" --timeout 30s --json` でパターンマッチまで待機できること
- [ ] `procman task log <id> --wait-exit --timeout 60s --json` で完了まで待機できること
- [ ] タイムアウト時に適切なJSON応答が返ること
- [ ] ゾンビプロセスが残らないこと
- [ ] All tests executed with 0 failed
- [ ] Linter: 0 errors
- [ ] User has approved completion

## References

- 既存コード: src/process-manager/, src/cli/commands/
- ZombieReaper: src/process-manager/zombie-reaper.ts
- LogManager: src/process-manager/log-manager.ts

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

</working-notes>

</ticket-info>
