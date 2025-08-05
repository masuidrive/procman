---
priority: 10
tags: ['npm', 'publishing', 'release']
description: 'npmパッケージ公開準備'
created_at: '2025-08-05T05:40:53Z'
started_at: null # Do not modify manually
closed_at: null # Do not modify manually
---

<ticket-info>

# Ticket Overview

@masuidrive/procmanをnpmに公開するための準備作業。package.jsonの整備、ドキュメント作成、公開設定、初回リリースを行う。

## Prerequisite

- 全ての機能実装が完了していること
- 全てのテスト（単体、結合、E2E）が通っていること
- コードレビューが完了していること

## Overview

このチケットは @masuidrive/procman パッケージをnpmに公開するための準備作業を行います。パッケージの正式な公開に向けて、package.jsonの設定を整備し、必要なドキュメントを作成し、継続的な公開プロセスを確立します。

主な作業内容：

1. package.jsonに必要なメタデータを追加（description、keywords、author、license、repository等）
2. npmパッケージとして配布するためのエントリーポイントの設定
3. README.mdを作成し、インストール方法、使用方法、APIリファレンスを記載
4. MITライセンスファイルの追加
5. .npmignoreを設定し、不要なファイルを公開から除外
6. CHANGELOGを作成し、バージョン管理の準備
7. GitHub Actionsによる自動公開ワークフローの設定
8. 初回リリース（v0.1.0）の実施

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

### Phase 1: package.json整備とメタデータ設定

パッケージの基本情報を整備し、npmへ公開可能な状態にする。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] package.jsonを確認し、現在の設定を把握
- [ ] 必要なフィールドを追加（description、keywords、author、license、repository、homepage、bugs）
- [ ] mainとtypesエントリーポイントの設定を確認・修正
- [ ] filesフィールドで配布するファイルを明示的に指定
- [ ] 依存関係を精査し、devDependenciesとdependenciesを適切に分類
- [ ] peerDependenciesが必要な場合は設定
- [ ] scriptsセクションにprepublishOnlyとprepackを追加
- [ ] engineフィールドでNode.jsの最小バージョンを指定
- [ ] Run `./bin/test-unit.sh` and `./bin/test-integration.sh` and fix all Failed
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 2: ドキュメントとライセンスの作成

ユーザー向けドキュメントとライセンスファイルを作成する。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] README.mdを作成
  - [ ] プロジェクトの概要と特徴を記載
  - [ ] インストール方法（npm install @masuidrive/procman）
  - [ ] クイックスタートガイド
  - [ ] 基本的な使用例
  - [ ] APIリファレンス（主要なクラスとメソッド）
  - [ ] 設定オプションの説明
  - [ ] トラブルシューティング
  - [ ] Contributing guidelines
- [ ] MITライセンスファイル（LICENSE）を作成
- [ ] CHANGELOG.mdを作成し、初回リリースの内容を記載
- [ ] .npmignoreファイルを作成し、テストファイル、ソースマップ、開発用設定などを除外
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 3: 公開設定とCI/CD

GitHub Actionsによる自動公開の設定と初回リリースの準備。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] GitHub Actionsワークフローを作成（.github/workflows/npm-publish.yml）
  - [ ] タグプッシュ時に自動的にnpmへ公開
  - [ ] テスト実行とビルドの確認
  - [ ] npm公開用のシークレット設定方法をドキュメント化
- [ ] リリースプロセスのドキュメントを作成（docs/release-process.md）
- [ ] バージョニング戦略の決定と文書化（semantic versioning）
- [ ] npm公開前のチェックリストを作成
- [ ] Discuss the results, including review feedback, with the user, and refine the ticket and tasks as needed based on the discussion.
- [ ] `git commit`

### Phase 4: 初回リリース実施

実際にv0.1.0をリリースする。

- [ ] Carefully read the `current-ticket.md` file and understand the content of the task.
- [ ] npm packでパッケージ内容を確認
- [ ] パッケージサイズと含まれるファイルを検証
- [ ] npm publishのドライラン実行（--dry-run）
- [ ] バージョンタグを作成（v0.1.0）
- [ ] 実際のnpm公開実施
- [ ] 公開後の動作確認（別プロジェクトでインストールして確認）
- [ ] GitHubリリースノートを作成
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

（このチケットにはUIは含まれません）

## Unit and integration test cases

- 既存のテストが全て通ることを確認
- パッケージビルドが正常に完了することを確認
- エントリーポイントが正しく設定されていることを確認

## E2E test scenarios

- npm公開後、別のプロジェクトで`npm install @masuidrive/procman`を実行してインストール確認
- インストール後、基本的な機能が動作することを確認
- TypeScript型定義が正しく認識されることを確認

## Considerations

- npmアカウントが必要（@masuidriveスコープの管理権限）
- GitHub Secretsにnpm公開用トークンを設定する必要あり
- 初回は手動での確認を推奨
- パッケージ名の可用性を事前に確認
- 公開後の取り消しは24時間以内のみ可能
- セキュリティ面で機密情報が含まれていないことを確認

## Acceptance Criteria

- [ ] package.jsonに必要な全てのメタデータが設定されている
- [ ] README.mdが完成し、ユーザーが使い始めるのに十分な情報が含まれている
- [ ] LICENSEファイルが追加されている
- [ ] .npmignoreが適切に設定され、不要なファイルが除外されている
- [ ] GitHub Actionsによる自動公開が設定されている
- [ ] v0.1.0がnpmに公開され、インストール可能になっている
- [ ] Passed all unit/integration/E2E tests
- [ ] Addressed all reviewer feedback
- [ ] Update documents

## References

- [npm公式ドキュメント](https://docs.npmjs.com/)
- [package.jsonのフィールド説明](https://docs.npmjs.com/cli/v10/configuring-npm/package-json)
- [semantic versioning](https://semver.org/)
- 現在のpackage.json
- 既存のビルド設定

## Parent ticket

- なし

## Child tickets

- なし

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

- npmアカウントが必要（@masuidriveスコープの管理権限）
- GitHub Secretsにnpm公開用トークンを設定する必要あり
- 初回はユーザーによる手動公開も検討

</working-notes>
