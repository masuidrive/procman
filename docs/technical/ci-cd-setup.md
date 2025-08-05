# CI/CD設定ガイド

このドキュメントは、@masuidrive/procmanプロジェクトのCI/CD設定に関する推奨事項をまとめています。

## 推奨されるCI/CDパイプライン

### GitHub Actions設定例

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ESLint
        run: npm run lint

  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [18, 20]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
        
      - name: Run integration tests
        run: npm run test:integration
        
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload coverage
        if: matrix.os == 'ubuntu-latest' && matrix.node-version == '20'
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: dist
          path: dist/
```

## package.jsonのスクリプト設定

現在のテスト戦略に基づいた推奨スクリプト：

```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:unit": "./bin/test-unit.sh",
    "test:integration": "./bin/test-integration.sh",
    "test:e2e": "./bin/test-e2e.sh",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src tests --ext .ts",
    "lint:fix": "eslint src tests --ext .ts --fix",
    "build": "tsc",
    "build:watch": "tsc --watch",
    "clean": "rm -rf dist coverage",
    "prepublishOnly": "npm run clean && npm run build && npm test"
  }
}
```

## テスト実行の最適化

### 1. 並列実行

```yaml
# 境界テストは独立性が高いため並列実行可能
test:
  strategy:
    matrix:
      test-type: [boundary, integration, e2e]
  steps:
    - name: Run ${{ matrix.test-type }} tests
      run: npm run test:${{ matrix.test-type }}
```

### 2. キャッシュの活用

```yaml
- name: Cache node modules
  uses: actions/cache@v3
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

### 3. 条件付き実行

```yaml
# ドキュメントのみの変更時はテストをスキップ
- name: Check for code changes
  id: code-changes
  uses: dorny/paths-filter@v2
  with:
    filters: |
      src:
        - 'src/**'
        - 'tests/**'
        - 'package*.json'
        - 'tsconfig.json'

- name: Run tests
  if: steps.code-changes.outputs.src == 'true'
  run: npm test
```

## 環境別の考慮事項

### Linux (Ubuntu)

- デフォルト環境として最も安定
- Unixドメインソケットのテストが完全に動作
- 最も高速なテスト実行

### macOS

- Unixドメインソケットは動作するが、一部パス長の制限あり
- ファイルシステムの大文字小文字の扱いに注意

### Windows

- 名前付きパイプのテストが必要
- パス区切り文字の違いに注意
- 一部のシグナル処理が異なる

## セキュリティ設定

### 1. Dependabot設定

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

### 2. CodeQL分析

```yaml
# .github/workflows/codeql.yml
name: "CodeQL"

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '30 1 * * 0'

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: github/codeql-action/init@v2
      with:
        languages: javascript, typescript
    - uses: github/codeql-action/analyze@v2
```

## リリースプロセス

### 自動リリースワークフロー

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Run tests
        run: npm test
      
      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            dist/**
            CHANGELOG.md
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## モニタリングとレポート

### 1. テストカバレッジ

- Codecovまたは Coverallsを使用
- 境界テストのカバレッジを重視
- パブリックAPIのカバレッジ目標: 90%以上

### 2. パフォーマンス監視

```yaml
- name: Benchmark tests
  run: |
    npm run test:benchmark
    
- name: Upload benchmark results
  uses: benchmark-action/github-action-benchmark@v1
  with:
    tool: 'customBiggerIsBetter'
    output-file-path: benchmark-results.json
    github-token: ${{ secrets.GITHUB_TOKEN }}
    auto-push: true
```

### 3. 通知設定

- PR作成時: 自動テスト実行
- マージ時: フルテストスイート実行
- リリース時: 全環境でのテスト実行

## ローカル開発との統合

### pre-commitフック

```json
// .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npm run lint
npm run test:unit
```

### VS Code統合

```json
// .vscode/settings.json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "vitest.enable": true,
  "vitest.commandLine": "npm run test:watch"
}
```

## トラブルシューティング

### よくある問題

1. **タイムアウトエラー**
   - CI環境では長めのタイムアウトを設定
   - `--timeout 30000`オプションを追加

2. **メモリ不足**
   - Node.jsのメモリ制限を増やす
   - `NODE_OPTIONS="--max-old-space-size=4096"`

3. **並行実行の問題**
   - ポート番号の競合を避ける
   - 一時ディレクトリを分離する

## 今後の改善提案

1. **マトリックステストの拡充**
   - より多くのNode.jsバージョンでテスト
   - 異なるOSバージョンでのテスト

2. **パフォーマンステスト**
   - プロセス起動時間の計測
   - メモリ使用量の監視

3. **セキュリティスキャン**
   - 依存関係の脆弱性チェック
   - ソースコードの静的解析

4. **自動化の強化**
   - CHANGELOGの自動生成
   - バージョンバンプの自動化
   - リリースノートの自動作成

これらの設定により、安定した開発フローと高品質なリリースプロセスを実現できます。