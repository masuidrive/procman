<instruction>
この指示を実行するには、@CLAUDE.mdでカスタムプロンプトが必須。
@CLAUDE.mdがない場合には、設定を促してこの処理を終了すること。

開発環境としてdevcontainerを作成しましたので、その続きとして下記の引き継ぎを受け取り実行すること。
CLAUDE.mdにタスクの実行ルールやドキュメンテーションルールの記載があれば、それに従うこと。

この引き継ぎ項目は、完璧ではないので盲目的に実行せず、一つずつユーザに説明し、許可をとって実行すること。
</instruction>

<handover>
# procman プロジェクト開発環境セットアップ引き継ぎ

## 1. プロジェクト初期化

### 1.1 Node.jsプロジェクトの初期化
```bash
npm init -y
```
- procman用のpackage.json設定
- name: "@masuidrive/procman" 
- version: "0.1.0"
- description: "Process manager daemon tool for development"
- main: "dist/index.js"
- bin: { "procman": "dist/cli.js" }

### 1.2 TypeScript設定
```bash
npm install -D typescript @types/node tsx
npx tsc --init
```
- tsconfig.jsonの設定調整（ES2022, Node.js 18対応）
- outDir: "dist", rootDir: "src"
- strict mode有効化

### 1.3 開発依存関係のインストール
```bash
npm install -D vitest eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install commander
```

### 1.4 設定ファイルの作成
- .eslintrc.js（TypeScript用ESLint設定）
- .prettierrc（コードフォーマット設定）
- vitest.config.ts（テスト設定）

## 2. プロジェクト構造の作成

### 2.1 ディレクトリ構造の作成
```bash
mkdir -p src/{cli,daemon,lib,types}
mkdir -p test/{unit,integration}
```

### 2.2 基本ファイルの作成
- src/index.ts（メインエントリーポイント）
- src/cli.ts（CLI実行ファイル）
- src/types/index.ts（型定義）

## 3. 開発環境確認

### 3.1 依存関係のインストール確認
```bash
./bin/install-deps.sh
```

### 3.2 TypeScriptコンパイル確認
```bash
npx tsc --noEmit
```

### 3.3 テスト環境の確認
```bash
./bin/test-unit.sh
```

## 4. Gitセットアップ

### 4.1 初期コミット（必要に応じて）
```bash
git add .
git commit -m "feat: Initial project setup with devcontainer"
```

## 5. 開発開始準備完了

以上で procman プロジェクトの開発環境セットアップが完了します。
次はプロジェクトの実装フェーズに進んでください。

### 利用可能なコマンド
- `./bin/test-unit.sh` - 型チェック、リント、ユニットテスト
- `./bin/test-integration.sh` - 統合テスト
- `./bin/claude.sh` - Claude Code実行
- `./bin/ticket.sh` - チケット管理

技術仕様書: `docs/tech-stack.md`
プロジェクト仕様: `docs/spec.md`
</handover>