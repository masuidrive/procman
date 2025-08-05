# テスト戦略ガイドライン

このドキュメントは、@masuidrive/procmanプロジェクトにおける新しいテスト戦略を定義します。
t_wadaの助言に基づき、実装詳細に依存しない境界テストを中心とした体系を採用します。

**最終更新**: 2025-08-05  
**実装状況**: Phase 3完了 - 全テスト成功（Failed=0）

## 実装成果

### テスト結果サマリー

- **Unit Tests**: 269 passed | 12 skipped | 0 failed ✅
- **Integration Tests**: 63 passed | 14 skipped | 0 failed ✅
- **E2E Tests**: 57 passed | 1 skipped | 0 failed ✅
- **合計**: 389 passed | 27 skipped | 0 failed

### 実施した変更

1. **削除したテストファイル** (13ファイル)
   - 実装詳細に依存していたテストを完全削除
   - モック中心の単体テストを排除

2. **新規作成した境界テスト** (4ファイル)
   - ConfigLoader境界テスト: 11テストケース
   - ProcessManager境界テスト: 14テストケース
   - LogManager境界テスト: 18テストケース
   - IPC Communication境界テスト: 16テストケース

3. **追加したE2Eテスト** (26テストケース)
   - CLI操作の完全な動作検証
   - リアルタイムログ、並行処理、シグナル処理など

## 基本原則

### 1. 境界テスト中心主義

実装の詳細ではなく、モジュールの境界における振る舞いをテストします。

- ✅ **良い例**: ConfigLoaderが存在しないファイルに対してエラーを返すことを検証
- ❌ **悪い例**: ConfigLoaderの内部メソッドが特定の順序で呼ばれることを検証

### 2. 観察可能な振る舞いの検証

テストは、外部から観察可能な動作のみを検証します。

- ✅ **良い例**: プロセスが実際に起動し、そのPIDが取得できることを検証
- ❌ **悪い例**: 内部の状態管理オブジェクトのプロパティが更新されることを検証

### 3. 最小限のモック使用

可能な限り実際の実装を使用し、モックは外部依存（ネットワーク、ファイルシステムの特殊なケース）のみに限定します。

## テスト対象別ガイドライン

### ConfigLoader

**境界:**
- ファイルシステムとの境界（読み込み、監視）
- 設定データの検証境界

**テストケース例:**
```typescript
describe('ConfigLoader Boundary Tests', () => {
  test('should return default config when file does not exist', async () => {
    const loader = new ConfigLoader('/non/existent/path');
    const config = await loader.load();
    expect(config).toEqual(defaultConfig);
  });

  test('should throw validation error for invalid config format', async () => {
    // 実際の不正なファイルを作成してテスト
    await writeFile(configPath, 'invalid javascript');
    await expect(loader.load()).rejects.toThrow('Invalid configuration');
  });
});
```

### ProcessManager

**境界:**
- OSプロセスとの境界（spawn、kill、シグナル）
- プロセス状態の監視境界

**テストケース例:**
```typescript
describe('ProcessManager Boundary Tests', () => {
  test('should start process and return running status', async () => {
    const manager = new ProcessManager();
    const result = await manager.startProcess({
      name: 'test-app',
      script: 'node',
      args: ['-e', 'setInterval(() => {}, 1000)']
    });
    
    expect(result.status).toBe('running');
    expect(result.pid).toBeGreaterThan(0);
    
    // 実際のプロセスが存在することを確認
    expect(isProcessRunning(result.pid)).toBe(true);
    
    await manager.stopProcess('test-app');
  });
});
```

### LogManager

**境界:**
- ファイルシステムとの境界（書き込み、読み込み）
- ストリーム処理の境界

**テストケース例:**
```typescript
describe('LogManager Boundary Tests', () => {
  test('should write logs to file and read them back', async () => {
    const logManager = new LogManager(tempDir);
    logManager.setupAppLogs('test-app');
    
    const testMessage = 'Test log message';
    logManager.writeLog('test-app', 'stdout', testMessage);
    await logManager.flushBuffer('test-app');
    
    const logs = await logManager.readLogs('test-app', { limit: 1 });
    expect(logs[0].message).toBe(testMessage);
  });
});
```

### IPC通信

**境界:**
- プロセス間通信の境界
- メッセージプロトコルの境界

**テストケース例:**
```typescript
describe('IPC Boundary Tests', () => {
  test('should establish connection and exchange messages', async () => {
    const server = new IPCServer();
    await server.start();
    
    const client = new IPCClient();
    await client.connect();
    
    const response = await client.sendCommand({ type: 'ping' });
    expect(response).toEqual({ type: 'pong' });
    
    await client.disconnect();
    await server.stop();
  });
});
```

## エラーケースとエッジケース

### 実装済みのエッジケーステスト

Phase 3で以下のエッジケーステストを実装しました：

1. **異常な入力値**
   - null/undefined/空文字列の処理
   - 極端に大きな値（巨大ファイル、深いネスト）
   - 不正な型の入力

2. **リソース制限**
   - 最大プロセス数の制限
   - メモリ使用量の上限
   - ファイルディスクリプタの枯渇
   - ソケット接続数の上限

3. **競合状態**
   - 同時プロセス起動
   - ファイルの同時アクセス
   - 設定ファイルの並行変更

4. **システムエラー**
   - ファイルシステムの権限エラー
   - ディスクフル状態
   - ファイル破損
   - ネットワーク切断

### 共通パターン

1. **リソース不足**
   - ディスク容量不足
   - メモリ不足
   - ファイルディスクリプタ枯渇

2. **権限エラー**
   - 読み取り権限なし
   - 書き込み権限なし
   - 実行権限なし

3. **並行性の問題**
   - 同時アクセス
   - レースコンディション
   - デッドロック

### モジュール別エラーケース

**ConfigLoader:**
- 設定ファイルが途中で削除される
- 設定ファイルの形式が不正
- 循環参照を含む設定

**ProcessManager:**
- プロセスが即座に終了する
- プロセスがゾンビ化する
- シグナルが無視される

**LogManager:**
- ログファイルが巨大化する
- ログディレクトリが削除される
- 同時書き込みの競合

## アンチパターン

以下のようなテストは作成しないでください：

### 1. モックの検証

```typescript
// ❌ 悪い例
test('should call internal method', () => {
  const spy = vi.spyOn(manager, '_internalMethod');
  manager.publicMethod();
  expect(spy).toHaveBeenCalledTimes(1);
});
```

### 2. 実装詳細の検証

```typescript
// ❌ 悪い例
test('should update internal state', () => {
  manager.doSomething();
  expect(manager._privateState.flag).toBe(true);
});
```

### 3. 過度な結合

```typescript
// ❌ 悪い例
test('should work with specific implementation', () => {
  const manager = new ProcessManager();
  // ProcessManagerImplの具体的な実装に依存
  expect(manager.lifecycle).toBeInstanceOf(ProcessLifecycleManagerImpl);
});
```

## テスト環境のセットアップ

### 一時ディレクトリの使用

```typescript
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'procman-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});
```

### 軽量プロセスの使用

```typescript
const testProcess = {
  script: 'node',
  args: ['-e', 'console.log("test"); setTimeout(() => {}, 100)']
};
```

## テスト作成のベストプラクティス

### 1. tempディレクトリの活用

```typescript
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'procman-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});
```

### 2. 実プロセスの使用

```typescript
// 軽量なテスト用プロセス
const testApp = {
  name: 'test-app',
  script: process.execPath,  // nodeの実行ファイルパス
  args: ['-e', 'console.log("started"); setInterval(() => {}, 1000)']
};

// プロセスが確実に停止するよう、afterEachで処理
afterEach(async () => {
  await manager.stopAllProcesses();
});
```

### 3. 非同期処理の適切な待機

```typescript
// バッファフラッシュを待つ
await logManager.flushBuffer('app-name');

// プロセスの起動完了を待つ
const waitForProcessStart = async (pid: number, maxWait = 3000) => {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    if (isProcessRunning(pid)) return true;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return false;
};
```

### 4. クリーンアップの確実な実行

```typescript
// エラーが発生してもクリーンアップを実行
afterEach(async () => {
  try {
    await cleanup();
  } catch (error) {
    console.warn('Cleanup error:', error);
  }
});
```

## 移行戦略（完了）

✅ **Phase 1-3 完了**: 2025-08-05
- 既存テストの分析と分類
- 実装詳細テストの削除（94件→0件）
- 境界テストの実装
- 全テスト成功の達成

## 今後の運用方針

### 新規機能開発時

1. **境界テストから開始**: 機能の境界を明確にしてテストを書く
2. **実装詳細は避ける**: publicインターフェースのみをテスト
3. **実環境に近い条件**: モックは最小限に、実際の動作を確認

### 既存機能の修正時

1. **境界テストの追加**: 修正箇所の境界テストを先に書く
2. **リファクタリング耐性**: 実装を変えてもテストが壊れない設計
3. **エッジケースの考慮**: 通常ケースだけでなく異常系も網羅

### コードレビュー時のチェックポイント

- [ ] テストは境界での振る舞いを検証しているか？
- [ ] モックの使用は最小限か？
- [ ] 実装詳細に依存していないか？
- [ ] エラーケースは適切にテストされているか？
- [ ] クリーンアップは確実に実行されるか？

## 参考資料

- t_wadaの「質とスピード」
- Robert C. Martin "Clean Code" - Chapter 9: Unit Tests
- Kent Beck "Test Driven Development: By Example"
- @masuidrive/procman テスト移行実績（2025-08-05）