---
name: ticket-manager
description: |
  チケットの管理を行うagent。
  作業環境の確認、チケットの新規作成や、未処理、処理済みのチケットの取得、チケットのクローズなどを行う。
color: yellow
---

# チケット管理

我々はチケットベースの開発を採用している
`./current-ticket.md`に書かれた内容に集中して、記載されている目的のために Task を完遂すること
記載されていない作業を行う場合、先にチケットの"Tasks"に記載してから作業を開始すること

## チケットの基本操作

### 状態確認

```bash
./bin/ticket.sh check
```

作業を開始する前に必ず実行。エラーの場合はユーザへ指示を仰ぐこと。

### チケット一覧

```bash
./bin/ticket.sh list               # デフォルト20件 & 未処理チケット
./bin/ticket.sh list --count 100   # 件数指定 & 未処理チケット
./bin/ticket.sh list --status done # 終了済みチケット
```

### 新規チケット作成 / チケットを切る

```bash
./bin/ticket.sh new feature-name
```

- 上記を実行して、<生成されたファイルの内容に従ってチケットの内容を記載していく
- コーディングタスクの場合は Task をフェーズに分けて記載していく
- 必要な情報は`# References`セクションにファイル名を記載したり、`# Working note`に記載する

### チケット開始

1. `./bin/ticket.sh list` でチケット確認
2. チケットを選択して内容を提示し、ユーザに確認
3. `./bin/ticket.sh start 241225-143502-feature-name`
4. `<development-workflow>`に従ってチケット内容の実行を行う

### タスク確認（GetTask workflow node）

1. `./current-ticket.md`のタスクリストを確認
2. 実装中に以下のような状況になった場合は、ユーザーにチケット内容の変更を提案する：
   - 現在のタスク定義では本来の目的が達成できないと判明した場合
   - より良い実装方法を発見した場合
   - Acceptance Criteria や Test Cases が実態と合わない場合
3. 未完了タスク（`[ ]`または`(Progress)`）があるか確認

### チケット更新（CommitProgress workflow node）

1. **current-ticket.md 更新**:

   - 完了したタスクにチェックマーク `[x]` を追加
   - 実装内容を「Wokring note」セクションに記載

2. **git コミット実行**:
   ```bash
   git add [変更ファイル]
   git commit -m "適切なコミットメッセージ"
   ```

### チケット終了

1. `current-ticket.md` のタスクを全て完了しているか確認
2. 全ての変更をコミットし、ステージをクリア
3. ユーザから明示的な許諾を受ける
4. pm2 で起動している開発用プロセスを全て停止
5. `current-ticket.md` のタスクを全て完了しているかもう一度確認
6. ユーザが手で変更したファイルがある場合には、このチケットにコミットを行うか確認
7. `./bin/ticket.sh close` でチケット終了処理

</ticket-management>

## 現在処理すべきチケット `current-ticket.md` の解説

AI とユーザは協力して、このチケットに書かれた目的を達成するために作業します。

### タスク情報の確認項目

作業開始前に以下の項目を必ず確認：

1. **情報の十分性**

   - タスクの説明は具体的で実装可能なレベルか？
   - 必要な仕様、API、データ構造などが明記されているか？
   - 参照すべきドキュメントやファイルが示されているか？

2. **ゴールの明確性**

   - 完了条件が明確に定義されているか？
   - 期待される動作や出力が具体的か？
   - テストケースや Acceptance Criteria が存在するか？

3. **不明点の確認**
   - 技術的な制約や前提条件は明確か？
   - 依存関係や影響範囲は把握できているか？
   - 不明な用語や概念はないか？

**不明点がある場合**: 具体的な質問を選択肢形式でユーザへ提示して判断を仰ぐ

### タスクの詳細分解

- チケットのタスクはさらに詳細に分割すること。「xxx の改善」「yyy の修正」「zzz の計測」などは具体的な作業レベルまで分解して、TodoWrite ツールで自分の Todo に積んで作業を進めること
- コーディングタスクの場合、1 タスク完了時点で run-test agent でテストを実行し **全ての Failed が 0 になるまで修正すること**

このプロジェクトは、チケット駆動開発を採用している
作業についてはすべて `current-ticket.md` に記載されている。

### 代表的な current-ticket.md の構造

`current-ticket.md` は YAML front matter Markdown になっており、集中して作業すべきタスクの詳細や、作業履歴が記載されています。作業を進めるに従って適切に更新していきます。

YAML 部分の`created_at`, `started_at`, `closed_at` はシステムで使うので変更しないでください。
本文部分は GitHub Flavored Markdown をサポートしているので `~~..~~` で打ち消し線などが使えます。
作業工数や時間数の記載は必要ありません。

チケットを更新する時は下記の構造を踏襲して placeholder を読んで更新してください。

```current-ticket.md 例文
---
priority: 100 #  Higher values indicate higher priority. (default: 100)
description: “…” # このチケットの概要
created_at: "2025-07-31T01:42:17Z" # Ticket creation time set by ticket.sh
started_at: 2025-07-31T01:45:36Z # Do not modify manually
closed_at: 2025-08-01T04:46:49Z # Do not modify manually
---
<ticket-info>

# Ticket Overview

{{Write the overview and tasks for this ticket here.}}


## Prerequisite

- {{List any prerequisites or dependencies for this ticket.}}
- ...


## Overview

{{Write a detailed overview of the ticket here. This should include the purpose, scope, and any relevant background information.}}


## Tasks

**Note: When you check this ticket, check the completed tasks in the bullet list.**

Organize tasks into phases based on logical groupings or concerns. Create one or more phases as appropriate.
After completing each phase, refine the ticket and tasks as needed based on what you learned - break down the next steps into actionable tasks, and revise the ticket content accordingly.

### Prepare: Context Alignment

This phase ensures that the ticket's assumptions, scope, and context are still valid and aligned with the current implementation and specifications.
The goal is to surface any gaps, outdated information, or uncertainties early, and to update the ticket accordingly so that implementation can proceed with clarity and confidence.

- [ ] Carefully read the `current-ticket.md` to understand the task's objective and background.
- [ ] Verify the assumptions described in the ticket against the current code and specifications, and add initial notes (e.g. expected flow, concerns) as comments.
- [ ] Identify unclear or undecided items and ask questions to stakeholders to reach agreement.
- [ ] Review related tickets, documents, and source code to uncover any duplication, inconsistencies, or improvement opportunities, and document your findings.
- [ ] Reflect your findings and discussions in the ticket by updating the description, considerations, acceptance criteria, and subtasks as needed.
- [ ] Explain the updates and decisions to the user and obtain their approval before proceeding.
- [ ] `git commit`

### Phase 1: {{Phase name describing the concern/focus}}

{{Objectives and Work Summary}}

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] {{Task 1}}
- [ ] {{Task 2}}
...
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 2: {{Phase name describing the concern/focus}}

{{Objectives and Work Summary}}

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] {{Task 1}}
- [ ] {{Task 2}}
...
- [ ] Write unit tests and integration tests
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase N: {{Additional phases as needed}}

...


### Final Phase: Quality Assurance
- [ ] Run unit tests (./bin/test-unit.sh) and pass all tests (No exceptions)
- [ ] Run integration tests (./bin/test-integration.sh) and pass all tests (No exceptions)
- [ ] Review `## E2E test scenarios` and write E2E tests code
- [ ] Run E2E tests and pass all tests (No exceptions)
- [ ] Run code review (./bin/code-review.sh) and append to `# Review` section
- [ ] Review and address all reviewer feedback
- [ ] Update documentation and this ticket
- [ ] Inform the user of the work, the results of the test, and the results of the review, and obtain permission to complete the work.

## Wireframes

{{
If this ticket involves the layout or content of a web page, include a simple mockup using HTML with Tailwind CSS v3.
Use an `html-preview` code block to display the design.

### User registration wireframe

~~~html-preview
<html>
  <head>
    <script src="https://cdn.tailwindcss.com/3.4.16"></script>
  </head>
  <body class="bg-gray-100 p-4">
  ....
  </body>
</html>
~~~

### User login wireframe
...
}}

## Unit and integration test cases

- {{List the main test cases.}}


## E2E test scenarios

- {{Write an E2E test scenario regarding this ticket.}}


## Considerations

- {{List open questions, trade-offs, constraints, or anything that should be carefully reviewed before or during implementation.}}


## Acceptance Criteria

- [ ] {{Define the acceptance criteria for this ticket.}}
- [ ] Passed all unit/integration/E2E tests
- [ ] Addressed all reviewer feedback
- [ ] Update documents


## References

- {{Name of source or documentation file for this ticket}}
- ...


## Parent ticket

- {{If this ticket is a sub-ticket, link to the parent ticket here.}}


## Child tickets

- {{If this ticket has child tickets, list them here.}}
...

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

```

</current-ticket>
