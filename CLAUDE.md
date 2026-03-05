# エンジニア作業指示書

このドキュメントは、AI エンジニア（あなた）のための包括的な作業指示書です。
開発フローに従って、高品質なコードを効率的に実装することが目的です。
科学的手法を大事に、常に観察、仮説の構築、実験、検証、考察を行ってください。 **特にdebugなどの問題解決では科学的手法を忘れないように。**


## チケット管理

我々はチケットベースの開発を採用しています。

`./current-ticket.md`に書かれた内容に集中して、記載されている目的のために `## Task` を完遂すること

記載されていない作業を行う場合、先にチケットの`## Tasks`に記載してから作業を開始すること(`add-task`ノード)

チケットの作成や取り出し、クローズは `ticket-manager agent` に実行を明確に指示すること

### チケットの処理

1. `./current-ticket.md`のタスクリストを確認
2. チケットファイルがない場合は、チケット作業中ではないので作業をどう進めるかユーザに確認してください (`other-task`ノード)
3. 実装中に以下のような状況になった場合は、ユーザーにチケット内容の変更を提案する：
   - 現在のタスク定義では本来の目的が達成できないと判明した場合
   - より良い実装方法を発見した場合
   - Acceptance Criteria や Test Cases が実態と合わない場合
4. 未完了タスク（`[ ]`または`(Progress)`）があるか確認

### チケット更新

- `current-ticket.md`を更新
  - 完了したタスクにチェックマーク `[x]` を追加
  - 実装内容を「Wokring note」セクションに記載
- git commitを行う

### チケット終了

1. `current-ticket.md` のタスクを全て完了しているか確認
2. **フルテストを実行** — `npm run test:run` で全テストスイートを実行し、全て通ることを確認（部分テストは不可）
3. 全ての変更をコミットし、ステージをクリア
4. ユーザから明示的な許諾を受ける
5. 起動している開発用プロセス、テスト用プロセスがある場合は全て停止
6. `current-ticket.md` のタスクを全て完了しているかもう一度確認
7. ユーザが手で変更したファイルがある場合には、このチケットにコミットを行うか確認
8. `ticket-manager agent`にチケット終了を実行を明確に指示
9. 処理の中でブランチが移動されたり、ファイルが変更されます

</ticket-management>

<git-management>

# Git 管理

## ブランチ戦略

- `main`/`master`/`develop`: デフォルトブランチ (正確には`.ticket-config.yaml`を参照)
- `feature/*`: 機能開発ブランチ（チケットシステムが自動作成）
- `hotfix/*`: 緊急修正用

## コミットルール

### メッセージフォーマット

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

- feat: 新機能
- fix: バグ修正
- docs: ドキュメントのみの変更
- style: コードの意味に影響しない変更
- refactor: バグ修正や機能追加を伴わないコード変更
- test: テストの追加や修正
- chore: ビルドプロセスやツールの変更

### 例

```
feat(auth): Add OAuth2 login support

- Implement Google OAuth2 integration
- Add user session management
- Update login UI components
```

## 作業時の注意

- 機能追加は必ず feature ブランチで行う
- コミット前に差分を確認
- current-ticket.md はコミットしない（.gitignore に含まれているはず）

</git-management>

<documentation>
# ドキュメント管理

## ドキュメント参照タイミング

### 実装前の確認

- 機能の仕様確認 → `docs/product/features/`
- システム全体の設計確認 → `docs/technical/architecture.md`
- 既存のパターン確認 → `docs/technical/patterns/`
- API 設計方針 → `docs/technical/api-guide.md`
- データベース設計 → `docs/technical/database.md`

### 実装中の確認

- エラーハンドリング方法 → `docs/technical/patterns/error-handling.md`
- 認証・認可の実装 → `docs/technical/patterns/auth-middleware.md`
- ログ出力方法 → `docs/technical/patterns/logging.md`
- 外部ライブラリの使い方 → `docs/references/vendors/`
- デバッグ情報 → `docs/development/debug_strategies.md`

### トラブル時の確認

- 既知の問題と解決策 → `docs/operations/troubleshooting/`
- 過去の技術的決定 → `docs/decisions/`

## ドキュメント更新ルール

### 更新が必要な場合

- 新機能 → `product/features/` に新規ファイル追加 + README.md 更新
- 設計変更 → `architecture.md` または `patterns/`
- API 変更 → `api-guide.md`
- 重要な決定 → `decisions/` に新規ファイル + README.md 更新

### 更新が不要な場合

- 単純なバグ修正（頻出なら `troubleshooting/` に追記）
- テストの追加のみ

## ドキュメント構造の基本思想

**シンプルに、実用的に、探しやすく。** 過度に細分化せず、関連情報はまとめて配置する。

</documentation>
