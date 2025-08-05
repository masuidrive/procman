# テストアンチパターンと推奨パターン

このドキュメントは、@masuidrive/procmanプロジェクトで避けるべきテストパターンと、代わりに使用すべき推奨パターンを示します。

## 1. 過度なモック使用

### ❌ アンチパターン：全ての依存をモック化

```typescript
// 悪い例：ファイルシステム全体をモック
import { vi } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('mocked content'),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn()
}));

test('should read config', () => {
  const config = configLoader.load();
  
  // モックの呼び出しを検証（実装詳細）
  expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/config.js');
});
```

**問題点：**
- 実際のファイルI/Oの動作を検証していない
- モックの設定が実装詳細に依存
- リファクタリング時にテストが壊れやすい

### ✅ 推奨パターン：実際のファイルシステムを使用

```typescript
// 良い例：一時ディレクトリで実際のファイル操作
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('should read config from file', async () => {
  // 実際のファイルを作成
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  const configPath = join(tempDir, 'config.js');
  
  writeFileSync(configPath, `
    module.exports = {
      apps: [{ name: 'test-app', script: 'app.js' }]
    };
  `);
  
  // 実際のファイルから読み込み
  const config = await configLoader.load(configPath);
  
  // 結果を検証（振る舞い）
  expect(config.apps[0].name).toBe('test-app');
});
```

## 2. 実装詳細への依存

### ❌ アンチパターン：内部メソッドの呼び出し検証

```typescript
// 悪い例：内部メソッドの呼び出しを検証
test('should call lifecycle methods in order', async () => {
  const spy1 = vi.spyOn(manager.lifecycle, 'startProcess');
  const spy2 = vi.spyOn(manager.monitor, 'trackProcess');
  const spy3 = vi.spyOn(manager.persistence, 'saveState');
  
  await manager.start('app');
  
  // 内部メソッドの呼び出し順序を検証
  expect(spy1).toHaveBeenCalledBefore(spy2);
  expect(spy2).toHaveBeenCalledBefore(spy3);
});
```

**問題点：**
- 内部実装の変更でテストが失敗する
- パブリックAPIの振る舞いを検証していない
- リファクタリングが困難

### ✅ 推奨パターン：観察可能な振る舞いを検証

```typescript
// 良い例：外部から観察可能な結果を検証
test('should start process successfully', async () => {
  // プロセスを起動
  const result = await manager.start({
    name: 'test-app',
    script: process.execPath,
    args: ['-e', 'console.log("started"); setInterval(() => {}, 1000)']
  });
  
  // 観察可能な結果を検証
  expect(result.status).toBe('online');
  expect(result.pid).toBeGreaterThan(0);
  
  // プロセスが実際に動作していることを確認
  const isRunning = isProcessRunning(result.pid);
  expect(isRunning).toBe(true);
});
```

## 3. 同期的なテストで非同期処理を扱う

### ❌ アンチパターン：タイミングに依存したテスト

```typescript
// 悪い例：固定の待機時間
test('should write log', () => {
  logManager.writeLog('app', 'test message');
  
  // 固定時間待機（不安定）
  setTimeout(() => {
    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('test message');
  }, 1000);
});
```

**問題点：**
- テストが不安定（flaky）
- 実行時間が長い
- 環境によって失敗する可能性

### ✅ 推奨パターン：適切な非同期処理

```typescript
// 良い例：明示的な待機と確認
test('should write and flush log', async () => {
  logManager.writeLog('app', 'test message');
  
  // バッファのフラッシュを待つ
  await logManager.flushBuffer('app');
  
  // ファイルの内容を確認
  const content = await fs.promises.readFile(logPath, 'utf-8');
  expect(content).toContain('test message');
});

// ポーリングが必要な場合
async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Timeout waiting for condition');
}
```

## 4. グローバル状態への依存

### ❌ アンチパターン：グローバル変数やシングルトンの使用

```typescript
// 悪い例：グローバル状態を変更
let globalConfig: Config;

beforeAll(() => {
  globalConfig = loadConfig();
  process.env.NODE_ENV = 'test'; // グローバル環境変数を変更
});

test('should use test config', () => {
  const result = processWithConfig();
  expect(result.env).toBe('test');
});
```

**問題点：**
- テスト間で状態が共有される
- 並列実行時に問題が発生
- テストの独立性が失われる

### ✅ 推奨パターン：テストごとに独立した環境

```typescript
// 良い例：各テストで独立した設定
describe('Config Tests', () => {
  let originalEnv: string | undefined;
  
  beforeEach(() => {
    // 元の値を保存
    originalEnv = process.env.NODE_ENV;
  });
  
  afterEach(() => {
    // 元の値を復元
    if (originalEnv !== undefined) {
      process.env.NODE_ENV = originalEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });
  
  test('should use test config', () => {
    // このテストのみで環境変数を設定
    process.env.NODE_ENV = 'test';
    
    const config = new ConfigLoader().load();
    expect(config.env).toBe('test');
  });
});
```

## 5. エラーケースの不適切なテスト

### ❌ アンチパターン：例外を投げるだけのテスト

```typescript
// 悪い例：エラーの詳細を検証しない
test('should throw error', () => {
  expect(() => {
    configLoader.load('invalid-path');
  }).toThrow(); // どんなエラーでもパスしてしまう
});
```

**問題点：**
- 期待するエラーかどうか不明
- エラーメッセージの変更を検知できない
- デバッグが困難

### ✅ 推奨パターン：具体的なエラーを検証

```typescript
// 良い例：エラーの詳細を検証
test('should throw specific error for missing file', async () => {
  const loader = new ConfigLoader('/non/existent/path.js');
  
  // エラーメッセージとタイプを検証
  await expect(loader.load()).rejects.toThrow(
    new Error('Config file not found: /non/existent/path.js')
  );
  
  // またはカスタムエラークラスを検証
  await expect(loader.load()).rejects.toBeInstanceOf(ConfigNotFoundError);
});

// エラーの詳細情報も検証
test('should include error details', async () => {
  try {
    await loader.load('/invalid/config.js');
    fail('Should have thrown an error');
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe('INVALID_CONFIG');
    expect(error.details).toContain('apps array is required');
  }
});
```

## 6. 不適切なクリーンアップ

### ❌ アンチパターン：リソースの解放漏れ

```typescript
// 悪い例：プロセスを停止しない
test('should start process', async () => {
  const result = await manager.start('test-app');
  expect(result.status).toBe('online');
  // プロセスが起動したまま残る！
});
```

**問題点：**
- リソースリーク
- 次のテストに影響
- CI環境でのビルド失敗

### ✅ 推奨パターン：確実なクリーンアップ

```typescript
// 良い例：afterEachで確実にクリーンアップ
describe('Process Tests', () => {
  const manager = new ProcessManager();
  const startedProcesses: string[] = [];
  
  afterEach(async () => {
    // 起動したプロセスを全て停止
    for (const name of startedProcesses) {
      try {
        await manager.stop(name);
      } catch (error) {
        // すでに停止している場合は無視
        console.warn(`Cleanup warning: ${error.message}`);
      }
    }
    startedProcesses.length = 0;
    
    // その他のリソースもクリーンアップ
    await manager.cleanup();
  });
  
  test('should start process', async () => {
    const name = 'test-app';
    const result = await manager.start(name);
    startedProcesses.push(name);
    
    expect(result.status).toBe('online');
  });
});
```

## 7. データ駆動テストの誤用

### ❌ アンチパターン：意味のないパラメータ化

```typescript
// 悪い例：テストケースが不明確
[1, 2, 3, 4, 5].forEach(num => {
  test(`should process ${num}`, () => {
    const result = processor.process(num);
    expect(result).toBe(num * 2);
  });
});
```

**問題点：**
- テストの意図が不明確
- 境界値が含まれていない
- エラーケースがない

### ✅ 推奨パターン：意味のあるテストケース

```typescript
// 良い例：境界値とエラーケースを含む
describe('Process number validation', () => {
  const testCases = [
    { input: 0, expected: 0, description: '最小値' },
    { input: 1, expected: 2, description: '正常値' },
    { input: 100, expected: 200, description: '大きな値' },
    { input: -1, shouldThrow: true, description: '負の値' },
    { input: null, shouldThrow: true, description: 'null値' },
    { input: Infinity, shouldThrow: true, description: '無限大' }
  ];
  
  testCases.forEach(({ input, expected, shouldThrow, description }) => {
    test(`should handle ${description}: ${input}`, () => {
      if (shouldThrow) {
        expect(() => processor.process(input)).toThrow();
      } else {
        expect(processor.process(input)).toBe(expected);
      }
    });
  });
});
```

## まとめ

### 避けるべきこと

1. **過度なモック** - 実際の動作を隠蔽する
2. **実装詳細の検証** - リファクタリングを困難にする
3. **不安定なタイミング** - テストをflakyにする
4. **グローバル状態** - テストの独立性を損なう
5. **不完全なエラー処理** - バグを見逃す
6. **リソースリーク** - 環境を汚染する
7. **意味のないテスト** - 保守コストを増やす

### 推奨すること

1. **実際のリソースを使用** - 真の動作を検証
2. **公開APIをテスト** - 安定したインターフェース
3. **適切な非同期処理** - 確実な検証
4. **独立したテスト環境** - 並列実行可能
5. **具体的なエラー検証** - 問題の早期発見
6. **確実なクリーンアップ** - 環境の清潔性
7. **意味のあるテストケース** - 理解しやすく保守しやすい

これらのガイドラインに従うことで、より信頼性が高く、保守しやすいテストスイートを構築できます。