# テストの書き方ガイド

このガイドは、@masuidrive/procmanプロジェクトで境界テストを書くための実践的な指針を提供します。

## 基本構造

### テストファイルの配置

```
tests/
├── boundary/           # 境界テスト
│   ├── config-loader-boundary.test.ts
│   ├── process-manager-boundary.test.ts
│   ├── log-manager-boundary.test.ts
│   └── ipc-communication-boundary.test.ts
├── integration/        # 統合テスト
└── e2e/               # E2Eテスト
```

### テストファイルのテンプレート

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('[Module] Boundary Tests', () => {
  let tempDir: string;
  let module: ModuleUnderTest;

  beforeEach(() => {
    // テスト用の一時ディレクトリを作成
    tempDir = mkdtempSync(join(tmpdir(), 'procman-test-'));
    module = new ModuleUnderTest(tempDir);
  });

  afterEach(async () => {
    // リソースのクリーンアップ
    await module.cleanup?.();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('正常系', () => {
    test('should handle normal case', async () => {
      // Arrange
      const input = prepareInput();
      
      // Act
      const result = await module.process(input);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('success');
    });
  });

  describe('エラーケース', () => {
    test('should handle error case', async () => {
      // 不正な入力でエラーが発生することを確認
      await expect(module.process(null)).rejects.toThrow();
    });
  });
});
```

## 具体的な実装例

### 1. ファイルI/O境界のテスト

```typescript
describe('ConfigLoader File I/O Boundary', () => {
  test('should handle missing config file', async () => {
    const loader = new ConfigLoader('/non/existent/path.js');
    
    // ファイルが存在しない場合のエラーハンドリング
    await expect(loader.load()).rejects.toThrow('Config file not found');
  });

  test('should load valid config file', async () => {
    // 実際のファイルを作成
    const configPath = join(tempDir, 'config.js');
    fs.writeFileSync(configPath, `
      module.exports = {
        apps: [{
          name: 'test-app',
          script: 'app.js'
        }]
      };
    `);
    
    const loader = new ConfigLoader(configPath);
    const config = await loader.load();
    
    expect(config.apps).toHaveLength(1);
    expect(config.apps[0].name).toBe('test-app');
  });
});
```

### 2. プロセス境界のテスト

```typescript
describe('ProcessManager Process Boundary', () => {
  test('should start and stop real process', async () => {
    // 実際のプロセスを起動
    const app = {
      name: 'test-app',
      script: process.execPath,
      args: ['-e', 'setInterval(() => console.log("alive"), 100)']
    };
    
    const result = await manager.startProcess(app);
    expect(result.status).toBe('online');
    expect(result.pid).toBeGreaterThan(0);
    
    // プロセスが実際に動作していることを確認
    const isRunning = await checkProcessRunning(result.pid);
    expect(isRunning).toBe(true);
    
    // プロセスを停止
    await manager.stopProcess(app.name);
    
    // プロセスが停止したことを確認
    await waitForProcessStop(result.pid);
    const isStopped = await checkProcessRunning(result.pid);
    expect(isStopped).toBe(false);
  });
});
```

### 3. 非同期処理のテスト

```typescript
describe('LogManager Async Operations', () => {
  test('should handle buffered writes', async () => {
    const logManager = new LogManager(tempDir);
    const appName = 'test-app';
    
    // ログセットアップ
    logManager.setupAppLogs(appName);
    
    // 複数のログを書き込み
    for (let i = 0; i < 10; i++) {
      logManager.writeLog(appName, 'stdout', `Log line ${i}`);
    }
    
    // バッファのフラッシュを待つ
    await logManager.flushBuffer(appName);
    
    // ログファイルを読み込んで確認
    const logPath = join(tempDir, appName, 'out.log');
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    
    expect(lines).toHaveLength(10);
    expect(lines[0]).toContain('Log line 0');
    expect(lines[9]).toContain('Log line 9');
  });
});
```

## エッジケースのテストパターン

### 1. null/undefined入力

```typescript
test('should handle null input gracefully', async () => {
  // nullやundefinedの入力に対して適切にエラーを返す
  await expect(module.process(null)).rejects.toThrow('Invalid input');
  await expect(module.process(undefined)).rejects.toThrow('Invalid input');
});
```

### 2. リソース制限

```typescript
test('should handle resource limits', async () => {
  // 多数のリソースを作成してリミットをテスト
  const promises = [];
  
  for (let i = 0; i < 100; i++) {
    promises.push(module.createResource(`resource-${i}`));
  }
  
  // 一定数以上でエラーになることを確認
  const results = await Promise.allSettled(promises);
  const rejected = results.filter(r => r.status === 'rejected');
  
  expect(rejected.length).toBeGreaterThan(0);
  expect(rejected[0].reason).toMatch(/limit exceeded/i);
});
```

### 3. 競合状態

```typescript
test('should handle concurrent operations', async () => {
  // 同時に同じリソースにアクセス
  const operations = Array(10).fill(null).map(() => 
    module.updateResource('shared-resource', Math.random())
  );
  
  // 全ての操作が完了することを確認
  const results = await Promise.all(operations);
  
  // 最後の値が設定されていることを確認
  const finalValue = await module.getResource('shared-resource');
  expect(results).toContain(finalValue);
});
```

## ヘルパー関数

### プロセス管理用ヘルパー

```typescript
// プロセスが実行中かチェック
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// プロセスの停止を待つ
async function waitForProcessStop(pid: number, timeout = 5000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (!isProcessRunning(pid)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Process ${pid} did not stop within ${timeout}ms`);
}
```

### ファイル操作用ヘルパー

```typescript
// ファイルが作成されるまで待つ
async function waitForFile(filePath: string, timeout = 3000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (fs.existsSync(filePath)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  throw new Error(`File ${filePath} was not created within ${timeout}ms`);
}

// ファイルサイズが安定するまで待つ
async function waitForFileStable(filePath: string, stableTime = 100): Promise<void> {
  let lastSize = -1;
  let stableCount = 0;
  
  while (stableCount < 3) {
    await new Promise(resolve => setTimeout(resolve, stableTime));
    
    const stats = fs.statSync(filePath);
    if (stats.size === lastSize) {
      stableCount++;
    } else {
      stableCount = 0;
      lastSize = stats.size;
    }
  }
}
```

## アンチパターンと対策

### ❌ 避けるべきパターン

```typescript
// 悪い例：実装詳細に依存
test('should call internal method', () => {
  const spy = vi.spyOn(module, '_privateMethod');
  module.publicMethod();
  expect(spy).toHaveBeenCalledWith('expected');
});

// 悪い例：過度なモック
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('mocked content'),
  writeFileSync: vi.fn()
}));
```

### ✅ 推奨パターン

```typescript
// 良い例：境界での振る舞いをテスト
test('should process file correctly', async () => {
  // 実際のファイルを使用
  const inputPath = join(tempDir, 'input.txt');
  fs.writeFileSync(inputPath, 'test content');
  
  // 公開APIを通じて処理
  const result = await module.processFile(inputPath);
  
  // 観察可能な結果を検証
  expect(result.status).toBe('success');
  expect(result.processedLines).toBe(1);
});
```

## デバッグのヒント

### 1. テスト実行時の出力確認

```typescript
// デバッグ用の出力を有効化
test('debugging test', async () => {
  // 環境変数でデバッグモードを制御
  if (process.env.DEBUG_TEST) {
    console.log('Debug info:', someValue);
  }
  
  // テストの実行
  const result = await module.process(input);
  
  // 失敗時の詳細情報
  expect(result).toMatchObject({
    status: 'success'
  }, `Failed with result: ${JSON.stringify(result, null, 2)}`);
});
```

### 2. タイムアウトの調整

```typescript
// 長時間実行されるテストのタイムアウト設定
test('long running test', async () => {
  // テストケースレベルでタイムアウトを設定
  await expect(longRunningOperation()).resolves.toBe('completed');
}, { timeout: 30000 }); // 30秒
```

### 3. 一時的なテストスキップ

```typescript
// 調査中のテストを一時的にスキップ
test.skip('flaky test under investigation', async () => {
  // このテストは現在調査中
});

// 条件付きスキップ
test.skipIf(process.platform === 'win32')('unix-only test', async () => {
  // Unix系OSでのみ実行
});
```

## まとめ

境界テストを書く際の重要なポイント：

1. **実際のリソースを使用する** - モックは最小限に
2. **公開APIのみをテストする** - 実装詳細には触れない
3. **観察可能な結果を検証する** - 外部から見える振る舞いに注目
4. **クリーンアップを確実に行う** - リソースリークを防ぐ
5. **エッジケースを網羅する** - 正常系だけでなく異常系も重要

これらの原則に従うことで、保守性が高く、実装の変更に強いテストスイートを構築できます。