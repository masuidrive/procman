---
priority: 1
tags: ['bug', 'cli']
description: 'npx実行時にdaemon-main.jsのパス解決がprocess.cwd()ベースで失敗する'
created_at: "2026-03-06T08:08:46Z"
started_at: null  # Do not modify manually
closed_at: null   # Do not modify manually
---

<ticket-info>

# Ticket Overview

`npx -y @masuidrive/procman load config.js` でdaemonを起動しようとすると、`daemon-main.js`のパス解決が `process.cwd()` + `dist/src/daemon/daemon-main.js` でハードコードされているため、npxのキャッシュディレクトリではなくユーザのCWDの`dist/`を探してしまい起動に失敗する。

## Prerequisite

- なし

## Overview

### 原因

`src/cli/commands/load.ts` L169:
```ts
resolve(process.cwd(), 'dist/src/daemon/daemon-main.js')
```

`process.cwd()` はユーザのプロジェクトディレクトリを返すため、npx経由だとprocmanの`dist/`が存在しない。

### 修正方針

`import.meta.url`（ESM）または `__dirname`（CJS）を使ってパッケージ自体のインストールパスからの相対パスで`daemon-main.js`を解決する。

```ts
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// load.ts is at dist/src/cli/commands/load.js
// daemon-main.js is at dist/src/daemon/daemon-main.js
const daemonMainPath = path.resolve(__dirname, '../../daemon/daemon-main.js');
```

### 対象ファイル

- `src/cli/commands/load.ts` — daemon-main.jsのパス解決修正
- DEBUGログも合わせて修正またはクリーンアップ

## Tasks

**Note: When you check this ticket, check the completed tasks in the bullet list.**

### Phase 1: daemon-main.jsパス解決修正

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] `src/cli/commands/load.ts` の `process.cwd()` ベースのパスを `import.meta.url` ベースに修正
- [ ] DEBUGログをクリーンアップ（本番不要なものを削除）
- [ ] `npm run build` で正常ビルド確認
- [ ] `npx tsx src/cli/index.ts load` でtsx実行確認
- [ ] `node dist/src/cli/index.js load` でdist実行確認
- [ ] Run tests → All executed, 0 failed
- [ ] `git commit`

### QA Phase: Quality Assurance

- [ ] Run full tests: `npm run test:run` → All executed, 0 failed
- [ ] Run linter → 0 errors
- [ ] User final approval before closing

## Unit and integration test cases

- 既存テストが壊れないこと

## E2E test scenarios

- 既存E2Eテストが壊れないこと

## Considerations

- tsx実行時とdist実行時の両方でパスが正しく解決されること
- `import.meta.url` はESMで使えるが、コンパイル後のCJSでも動くか確認

## Acceptance Criteria

- [ ] npx経由でdaemon-main.jsが見つかるパス解決になっていること
- [ ] tsx実行・dist実行の両方で動作すること
- [ ] All tests executed with 0 failed
- [ ] Linter: 0 errors
- [ ] User has approved completion

## References

- `src/cli/commands/load.ts` L140-179 — 問題箇所

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
