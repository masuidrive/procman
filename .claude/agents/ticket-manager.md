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

- 上記を実行して、生成されたファイルの内容に従ってチケットの内容を記載していく
- `<example-current-ticket>`に書かれているタスクや説明文は、プロジェクトで可能な限りは残す。
  - ex) CLI ツールなどは E2E テストがないので、test-e2e.sh の実行タスクをは削除する
  - ex) ドキュメント更新タスクや調査タスクなどでは、テストの実行は削除する
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

更新する時なども、 @.ticket-config.yaml の `defualt_content` を読んで、この内容に沿ってチケットを書いてください。

<example-current-ticket>
```current-ticket.md 例文
---
priority: 5 #  Lower values indicate higher priority. (default: 5)
description: “…” # このチケットの概要
created_at: "2025-07-31T01:42:17Z" # Ticket creation time set by ticket.sh
started_at: 2025-07-31T01:45:36Z # Do not modify manually
closed_at: 2025-08-01T04:46:49Z # Do not modify manually
---
{{.ticket-config.yamlのdefault_contentの内容}}
```
</example-current-ticket>

</current-ticket>
