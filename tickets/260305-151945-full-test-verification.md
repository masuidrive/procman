---
priority: 1
tags: ['test', 'qa']
description: 'コードレビュー改善後のフルテスト実行と修正'
created_at: "2026-03-05T15:19:45Z"
started_at: null  # Do not modify manually
closed_at: null   # Do not modify manually
---

<ticket-info>

# Ticket Overview

前チケット（260305-131808-code-review）で8ファイル分割・any型削減・リファクタリングを実施したが、コアテスト（446件）のみで検証しフルテストを実行していなかった。全テストスイート（unit/integration/e2e）を実行し、失敗があれば修正する。

## Prerequisite

- コードレビュー改善チケット完了済み（mainにマージ済み）

## Overview

フルテストを実行し、リファクタリングによる回帰がないことを確認する。失敗テストがあればコード側またはテスト側を修正する。

## Tasks

**Note: When you check this ticket, check the completed tasks in the bullet list.**

### Phase 1: フルテスト実行

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] `npm run test:run` でフルテスト実行（全テストスイート）
- [ ] 失敗テストの一覧を記録
- [ ] 失敗がリファクタリング起因かpre-existing（元から不安定）かを分類

### Phase 2: テスト修正

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] リファクタリング起因の失敗テストを修正
- [ ] pre-existingの不安定テストは原因を記録（修正はスコープ外）
- [ ] Run full tests: `npm run test:run` → リファクタリング起因の失敗が0
- [ ] `git commit`

### Phase 3: リンター確認

- [ ] `npx eslint src/**/*.ts` → 0 errors
- [ ] 問題があれば修正してコミット

### QA Phase: Quality Assurance

- [ ] Run full tests: `npm run test:run` → All executed, 0 failed (pre-existing除く)
- [ ] Run linter → 0 errors
- [ ] テスト結果のサマリーをWorking notesに記録
- [ ] User final approval before closing

## Unit and integration test cases

- 既存全テストが通ること（unit/integration/e2e）

## E2E test scenarios

- 全E2Eテストが通ること

## Considerations

- タイムアウトが長いテスト（e2e）はCI環境と異なる挙動の可能性あり
- pre-existingの不安定テストは無理に修正しない（別チケットで対応）

## Acceptance Criteria

- [ ] フルテスト実行済み
- [ ] リファクタリング起因の失敗が0件
- [ ] Linter: 0 errors
- [ ] User has approved completion

## References

- 前チケット: tickets/done/260305-131808-code-review.md

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
