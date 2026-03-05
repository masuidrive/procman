---
priority: 3
tags: ['cli', 'ux']
description: 'CLI引数なし・-h実行時にアプリの説明を表示'
created_at: "2026-03-05T15:18:07Z"
started_at: null  # Do not modify manually
closed_at: null   # Do not modify manually
---

<ticket-info>

# Ticket Overview

procmanを引数なしまたは`-h`で起動した際に、アプリの役割・主な使い方がわかる説明を表示する。現状はcommanderのデフォルトヘルプのみで、このアプリが何をするものかが伝わらない。

## Prerequisite

- なし（既存CLI実装の改修のみ）

## Overview

以下の改善を行う：

1. **commander の description を充実させる** — 「Process Manager CLI Tool」ではなく、このアプリが何をするか（開発環境での複数プロセス管理、Procfileライクな設定、自動再起動、メモリ監視、ログ管理など）を簡潔に説明
2. **引数なし実行時の出力改善** — commanderのデフォルトヘルプにアプリの概要説明とクイックスタートを追加
3. **`-h`/`--help` の出力改善** — 同上
4. **`help`コマンドのpackage.json読み込みパス修正** — `tsx`実行時と`dist/`実行時でパスが異なる問題を修正（現在`tsx`で動かない）

### 対象ファイル

- `src/cli/index.ts` — description変更
- `src/cli/parser.ts` — commander設定、引数なし時の動作
- `src/cli/commands/help.ts` — package.jsonパス修正、概要説明の改善

## Tasks

**Note: When you check this ticket, check the completed tasks in the bullet list.**

### Prepare: Context Alignment

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] `src/cli/index.ts`, `src/cli/parser.ts`, `src/cli/commands/help.ts` を確認
- [ ] `npx tsx src/cli/index.ts` と `npx tsx src/cli/index.ts -h` の現状出力を確認
- [ ] package.jsonパス問題（tsx vs dist）を確認

### Phase 1: commander description改善と引数なし時の出力

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] `src/cli/index.ts` の description をアプリの役割がわかる文言に変更
- [ ] 引数なし実行時にアプリ概要 + Quick Start + コマンド一覧が表示されるようにする
- [ ] `-h`/`--help` で同様の情報が表示されることを確認
- [ ] Run full tests → All executed, 0 failed
- [ ] `git commit`

### Phase 2: help コマンドの package.json パス修正

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] `src/cli/commands/help.ts` の `createRequire` パスを tsx/dist 両対応にする
- [ ] `npx tsx src/cli/index.ts help` で正常動作を確認
- [ ] `npm run build && node dist/src/cli/index.js help` でも正常動作を確認
- [ ] Run full tests → All executed, 0 failed
- [ ] `git commit`

### QA Phase: Quality Assurance

- [ ] Run full tests: `npm run test:run` → All executed, 0 failed
- [ ] Run linter: `npx eslint src/**/*.ts` → 0 errors
- [ ] `npx tsx src/cli/index.ts` の出力を確認
- [ ] `npx tsx src/cli/index.ts -h` の出力を確認
- [ ] `npx tsx src/cli/index.ts help` の出力を確認
- [ ] User final approval before closing

## Unit and integration test cases

- CLIテストで引数なし実行時の出力にアプリ説明が含まれることを確認
- helpコマンドがtsx/dist両方で動作すること

## E2E test scenarios

- 既存E2Eテストが壊れないこと

## Considerations

- 表示テキストは英語（既存コードに合わせる）
- 出力が長すぎないこと（ターミナル1画面以内が理想）
- package.json読み込みはtsx実行時・dist実行時の両方で動くようにする

## Acceptance Criteria

- [ ] 引数なし実行でアプリの役割・使い方がわかる
- [ ] `-h` で同様の情報が表示される
- [ ] `help`コマンドがtsx/dist両方で動作する
- [ ] All tests executed with 0 failed
- [ ] Linter: 0 errors
- [ ] User has approved completion

## References

- `src/cli/index.ts`, `src/cli/parser.ts`, `src/cli/commands/help.ts`
- README.md（アプリ概要の参考）

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
