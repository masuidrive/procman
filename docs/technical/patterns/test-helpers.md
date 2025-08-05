# テストヘルパーとユーティリティ

このドキュメントは、@masuidrive/procmanプロジェクトのテストで使用する共通ヘルパー関数とユーティリティを説明します。

## ファイル配置

```
tests/
├── helpers/
│   ├── process-helpers.ts    # プロセス管理関連
│   ├── file-helpers.ts       # ファイル操作関連
│   ├── async-helpers.ts      # 非同期処理関連
│   └── test-fixtures.ts      # テストフィクスチャ
└── boundary/
    └── *.test.ts
```

## プロセス管理ヘルパー

### process-helpers.ts

```typescript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * プロセスが実行中かチェック
 * @param pid プロセスID
 * @returns 実行中ならtrue
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // kill(0)はプロセスの存在確認のみ行う
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * プロセスが停止するまで待機
 * @param pid プロセスID
 * @param timeout タイムアウト時間（ミリ秒）
 */
export async function waitForProcessStop(
  pid: number,
  timeout = 5000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (!isProcessRunning(pid)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Process ${pid} did not stop within ${timeout}ms`);
}

/**
 * プロセスが開始するまで待機
 * @param pid プロセスID  
 * @param timeout タイムアウト時間（ミリ秒）
 */
export async function waitForProcessStart(
  pid: number,
  timeout = 5000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (isProcessRunning(pid)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  throw new Error(`Process ${pid} did not start within ${timeout}ms`);
}

/**
 * ポート使用中かチェック
 * @param port ポート番号
 * @returns 使用中ならtrue
 */
export async function isPortInUse(port: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      process.platform === 'win32'
        ? `netstat -na | findstr :${port}`
        : `lsof -i :${port}`
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * 利用可能なポートを取得
 * @param startPort 開始ポート番号
 * @returns 利用可能なポート番号
 */
export async function getAvailablePort(startPort = 3000): Promise<number> {
  let port = startPort;
  
  while (await isPortInUse(port)) {
    port++;
    if (port > 65535) {
      throw new Error('No available ports');
    }
  }
  
  return port;
}

/**
 * プロセスを強制終了
 * @param pid プロセスID
 */
export async function forceKillProcess(pid: number): Promise<void> {
  if (!isProcessRunning(pid)) return;
  
  try {
    if (process.platform === 'win32') {
      await execAsync(`taskkill /F /PID ${pid}`);
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch (error) {
    // プロセスがすでに終了している場合は無視
    if (!error.message?.includes('No such process')) {
      throw error;
    }
  }
}
```

## ファイル操作ヘルパー

### file-helpers.ts

```typescript
import { 
  mkdtempSync, 
  rmSync, 
  existsSync, 
  statSync,
  readFileSync,
  writeFileSync 
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * テスト用一時ディレクトリを作成
 * @param prefix ディレクトリ名のプレフィックス
 * @returns 作成されたディレクトリパス
 */
export function createTempDir(prefix = 'procman-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * ディレクトリを安全に削除
 * @param dirPath ディレクトリパス
 */
export function removeDirSafely(dirPath: string): void {
  try {
    if (existsSync(dirPath)) {
      rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn(`Failed to remove directory ${dirPath}:`, error);
  }
}

/**
 * ファイルが作成されるまで待機
 * @param filePath ファイルパス
 * @param timeout タイムアウト時間（ミリ秒）
 */
export async function waitForFile(
  filePath: string,
  timeout = 3000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (existsSync(filePath)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  throw new Error(`File ${filePath} was not created within ${timeout}ms`);
}

/**
 * ファイルサイズが安定するまで待機
 * @param filePath ファイルパス
 * @param stableTime 安定と判断する時間（ミリ秒）
 */
export async function waitForFileStable(
  filePath: string,
  stableTime = 100
): Promise<void> {
  let lastSize = -1;
  let stableCount = 0;
  const requiredStableChecks = 3;
  
  while (stableCount < requiredStableChecks) {
    await new Promise(resolve => setTimeout(resolve, stableTime));
    
    if (!existsSync(filePath)) {
      throw new Error(`File ${filePath} does not exist`);
    }
    
    const stats = statSync(filePath);
    if (stats.size === lastSize) {
      stableCount++;
    } else {
      stableCount = 0;
      lastSize = stats.size;
    }
  }
}

/**
 * ファイルの内容が条件を満たすまで待機
 * @param filePath ファイルパス
 * @param condition 条件関数
 * @param timeout タイムアウト時間（ミリ秒）
 */
export async function waitForFileContent(
  filePath: string,
  condition: (content: string) => boolean,
  timeout = 5000
): Promise<string> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      if (condition(content)) {
        return content;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(
    `File ${filePath} did not meet condition within ${timeout}ms`
  );
}

/**
 * テスト用設定ファイルを作成
 * @param dirPath ディレクトリパス
 * @param config 設定オブジェクト
 * @returns 作成されたファイルパス
 */
export function createTestConfig(
  dirPath: string,
  config: any
): string {
  const configPath = join(dirPath, 'config.js');
  const content = `module.exports = ${JSON.stringify(config, null, 2)};`;
  writeFileSync(configPath, content);
  return configPath;
}
```

## 非同期処理ヘルパー

### async-helpers.ts

```typescript
/**
 * 条件が満たされるまで待機
 * @param condition 条件関数
 * @param timeout タイムアウト時間（ミリ秒）
 * @param interval チェック間隔（ミリ秒）
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * 指定時間待機
 * @param ms ミリ秒
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * タイムアウト付きでPromiseを実行
 * @param promise 実行するPromise
 * @param timeout タイムアウト時間（ミリ秒）
 * @param errorMessage エラーメッセージ
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeout);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

/**
 * リトライ付きで関数を実行
 * @param fn 実行する関数
 * @param maxRetries 最大リトライ回数
 * @param retryDelay リトライ間隔（ミリ秒）
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  retryDelay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries) {
        await delay(retryDelay);
      }
    }
  }
  
  throw lastError!;
}

/**
 * 並列実行数を制限してPromiseを実行
 * @param items 処理する項目
 * @param fn 処理関数
 * @param concurrency 同時実行数
 */
export async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 5
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const promise = fn(items[i], i).then(result => {
      results[i] = result;
    });
    
    executing.push(promise);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex(p => p === promise),
        1
      );
    }
  }
  
  await Promise.all(executing);
  return results;
}
```

## テストフィクスチャ

### test-fixtures.ts

```typescript
/**
 * 基本的なアプリケーション設定
 */
export const TEST_APP_CONFIG = {
  name: 'test-app',
  script: process.execPath,
  args: ['-e', 'console.log("started"); setInterval(() => {}, 1000)']
};

/**
 * 即座に終了するアプリケーション
 */
export const QUICK_EXIT_APP_CONFIG = {
  name: 'quick-exit-app',
  script: process.execPath,
  args: ['-e', 'console.log("exit"); process.exit(0)']
};

/**
 * エラーで終了するアプリケーション
 */
export const ERROR_APP_CONFIG = {
  name: 'error-app',
  script: process.execPath,
  args: ['-e', 'throw new Error("Test error")']
};

/**
 * 大量のログを出力するアプリケーション
 */
export const VERBOSE_APP_CONFIG = {
  name: 'verbose-app',
  script: process.execPath,
  args: ['-e', `
    let count = 0;
    setInterval(() => {
      console.log(\`Log line \${count++}\`);
      if (count > 100) process.exit(0);
    }, 10);
  `]
};

/**
 * メモリを消費するアプリケーション
 */
export const MEMORY_HOG_APP_CONFIG = {
  name: 'memory-hog-app',
  script: process.execPath,
  args: ['-e', `
    const arrays = [];
    setInterval(() => {
      arrays.push(new Array(1024 * 1024).fill('x'));
    }, 100);
  `],
  max_memory_restart: '50M'
};

/**
 * 複数のアプリケーション設定
 */
export const MULTI_APP_CONFIG = {
  apps: [
    { ...TEST_APP_CONFIG, name: 'app-1' },
    { ...TEST_APP_CONFIG, name: 'app-2' },
    { ...TEST_APP_CONFIG, name: 'app-3' }
  ]
};

/**
 * エッジケース用の設定
 */
export const EDGE_CASE_CONFIGS = {
  emptyName: { ...TEST_APP_CONFIG, name: '' },
  nullScript: { ...TEST_APP_CONFIG, script: null as any },
  hugeArgs: { 
    ...TEST_APP_CONFIG, 
    args: new Array(1000).fill('-e').concat(['true']) 
  },
  invalidMemory: { 
    ...TEST_APP_CONFIG, 
    max_memory_restart: 'invalid' 
  }
};
```

## 使用例

### 基本的なテストセットアップ

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createTempDir, removeDirSafely } from '../helpers/file-helpers';
import { waitForProcessStart, isProcessRunning } from '../helpers/process-helpers';
import { TEST_APP_CONFIG } from '../helpers/test-fixtures';

describe('Process Manager Tests', () => {
  let tempDir: string;
  let manager: ProcessManager;
  
  beforeEach(() => {
    tempDir = createTempDir();
    manager = new ProcessManager(tempDir);
  });
  
  afterEach(async () => {
    await manager.stopAllProcesses();
    removeDirSafely(tempDir);
  });
  
  test('should start process', async () => {
    const result = await manager.startProcess(TEST_APP_CONFIG);
    
    // プロセスの起動を待つ
    await waitForProcessStart(result.pid);
    
    expect(isProcessRunning(result.pid)).toBe(true);
  });
});
```

### 非同期処理のテスト

```typescript
import { waitForCondition, withTimeout } from '../helpers/async-helpers';
import { waitForFileContent } from '../helpers/file-helpers';

test('should write logs', async () => {
  const logPath = join(tempDir, 'app.log');
  
  // ログファイルに特定の内容が書き込まれるまで待つ
  const content = await waitForFileContent(
    logPath,
    content => content.includes('Application started'),
    3000
  );
  
  expect(content).toContain('Application started');
});

test('should handle timeout', async () => {
  // タイムアウト付きで処理を実行
  await expect(
    withTimeout(
      longRunningOperation(),
      1000,
      'Operation took too long'
    )
  ).rejects.toThrow('Operation took too long');
});
```

### エッジケースのテスト

```typescript
import { EDGE_CASE_CONFIGS } from '../helpers/test-fixtures';

describe('Edge Cases', () => {
  Object.entries(EDGE_CASE_CONFIGS).forEach(([name, config]) => {
    test(`should handle ${name}`, async () => {
      await expect(
        manager.startProcess(config)
      ).rejects.toThrow();
    });
  });
});
```

## ベストプラクティス

### 1. ヘルパーの再利用

共通の処理は必ずヘルパー関数として切り出し、テスト間で再利用します。

### 2. タイムアウトの設定

環境による差を考慮し、適切なタイムアウトを設定します：
- ローカル開発: 短めのタイムアウト（1-3秒）
- CI環境: 長めのタイムアウト（5-10秒）

### 3. エラーハンドリング

ヘルパー関数では明確なエラーメッセージを提供します：

```typescript
throw new Error(
  `Process ${pid} did not stop within ${timeout}ms. ` +
  `Current state: ${getCurrentState(pid)}`
);
```

### 4. クリーンアップの保証

afterEachでのクリーンアップは、エラーが発生しても実行されるようにします：

```typescript
afterEach(async () => {
  try {
    await cleanup();
  } catch (error) {
    console.warn('Cleanup error:', error);
  }
});
```

### 5. プラットフォーム対応

OS依存の処理は適切に分岐します：

```typescript
if (process.platform === 'win32') {
  // Windows specific
} else {
  // Unix-like specific  
}
```

これらのヘルパーとユーティリティを活用することで、一貫性のある保守しやすいテストコードを書くことができます。