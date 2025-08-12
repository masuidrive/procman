# Claude Codeのために作ったプロセス管理ツール「Procman」の設計と実装

## はじめに - なぜ今さら新しいプロセス管理ツールを作ったのか

2025年、AI駆動開発（Vibe Coding）が本格化する中で、私は意外な問題に直面していました。最先端のAIエージェント「Claude Code」が、10年以上の歴史を持つ定番ツール「pm2」をうまく扱えなかったのです。

```bash
# Claude Codeがタイムアウトするまで待ち続ける問題のコマンド
$ pm2 logs
```

このコマンドを実行すると、Claude Codeはログの出力が終わるのを永遠に待ち続けます。コード生成が終わったと思って確認すると、実はまだログの出力を待っていた——この瞬間、「これは自分で作るしかない」と決意しました。

## Vibe Codingという新しい開発スタイル

まず、なぜこの問題が重要なのか説明させてください。

Vibe Coding は、2024年後半から2025年にかけて登場した革新的な開発手法です。開発者は自然言語で「アプリの雰囲気（vibe）」をAIに伝え、詳細な仕様書を書くことなく、直感的な指示でコードを生成させます。開発者は戦略レベルに集中し、実装はAIが担当するのです。

私は[ticket.sh](https://github.com/masuidrive/ticket.sh)というCoding Agent向けのチケット管理システムも開発しており、AIエージェントとの協調作業を日々実践しています。その中で、既存のツールがAIエージェントを想定していない設計であることが大きな障害となっていました。

## 技術選定 - シンプルさと互換性のバランス

### なぜNode.js/TypeScriptなのか

pm2との互換性を考慮し、同じNode.jsエコシステムで実装することにしました。TypeScriptを選んだのは、型安全性によってAIエージェントがより正確にコードを理解・生成できるためです。

```typescript
// 型定義によりAIが理解しやすい構造
interface ProcessConfig {
  name: string;
  script: string;
  max_memory_restart?: string;  // PM2互換: '500M', '1G' など
  namespace?: string;            // プロジェクト単位の管理
  env?: Record<string, string>;
}
```

### Commander.jsの採用理由

CLIフレームワークとしてCommander.jsを選んだのは、以下の理由からです：

1. **宣言的な定義** - AIが理解しやすい
2. **豊富なドキュメント** - AIの学習データに含まれている
3. **軽量** - 開発環境での使用に適している

## アーキテクチャ - AIフレンドリーな設計

### 全体構成

```
┌─────────────┐     IPC通信      ┌──────────────┐
│ CLI Client  │ <--------------> │ Daemon Process│
└─────────────┘                  └──────┬───────┘
                                        │
                                        ▼
                                 ┌──────────────┐
                                 │Managed Procs │
                                 └──────────────┘
```

この構成の特徴は、各コンポーネントが明確に分離されていることです。AIエージェントは一つのコンポーネントに集中して作業でき、副作用を最小限に抑えられます。

### IPC通信の実装

クロスプラットフォーム対応のIPC通信を実装しました：

```typescript
// Unix系ではUnix Domain Socket、WindowsではNamed Pipe
const ipcPath = process.platform === 'win32' 
  ? '\\\\.\\pipe\\masuidrive-procman'
  : path.join(os.homedir(), '.masuidrive-procman', 'procman.sock');

// JSON over socketでシンプルなプロトコル
interface IPCMessage {
  command: string;
  args?: any;
  id: string;  // 非同期応答の追跡
}
```

## 最も苦労した点 - メモリリーク対策

### EventEmitterの罠

Node.jsのEventEmitterは便利ですが、リスナーの解放を忘れるとメモリリークの原因となります。特に長時間稼働するデーモンプロセスでは致命的です。

### EventCleanupHelper - Disposableパターンの実装

Uncle Bob（Robert C. Martin）の推奨するDisposableパターンを実装しました：

```typescript
class EventCleanupHelper {
  private subscriptions = new Map<EventEmitter, Map<string, Function>>();

  track(emitter: EventEmitter, event: string, listener: Function): void {
    if (!this.subscriptions.has(emitter)) {
      this.subscriptions.set(emitter, new Map());
    }
    this.subscriptions.get(emitter)!.set(event, listener);
    emitter.on(event, listener);
  }

  async dispose(): Promise<void> {
    for (const [emitter, events] of this.subscriptions) {
      for (const [event, listener] of events) {
        emitter.removeListener(event, listener);
      }
    }
    this.subscriptions.clear();
  }
}
```

このヘルパークラスにより、40行程度のコードで完全なメモリリーク防止を実現しました。

## pm2との差別化ポイント

### 1. ストリーミングログの適切な終了

```typescript
// Procmanでは、ログストリーミングが適切に終了する
class LogManager {
  async streamLogs(appName: string, options: LogOptions): Promise<void> {
    const stream = this.createLogStream(appName);
    
    // タイムアウトや行数制限で自動終了
    if (options.lines) {
      stream.pipe(take(options.lines));
    }
    
    return new Promise((resolve) => {
      stream.on('end', resolve);
      // AIエージェントが永遠に待たないように
      setTimeout(resolve, options.timeout || 5000);
    });
  }
}
```

### 2. namespace機能の標準実装

```javascript
// procman.config.js
module.exports = {
  apps: [
    { name: 'api', script: './api/server.js', namespace: 'backend' },
    { name: 'web', script: './web/server.js', namespace: 'frontend' },
  ]
};

// namespace単位での操作
$ procman start --namespace backend
$ procman stop --namespace frontend
```

### 3. デーモン単独起動

pm2と異なり、アプリケーションを起動せずにデーモンだけを起動できます：

```bash
$ procman daemon start  # デーモンのみ起動
$ procman load config.js  # 後から設定を読み込み
```

## 実際の使用例 - Vibe Codingワークフロー

### ticket.shとの連携

```bash
# 新しいチケットを作成
$ ./ticket.sh new implement-api-endpoint

# Claude Codeがチケットに基づいて開発
# procmanが開発サーバーを管理
$ procman load dev-config.js
$ procman start --all

# ログを確認（AIフレンドリーな出力）
$ procman logs api --lines 50  # 50行で自動終了
```

### 開発環境の統合管理

```javascript
// dev-config.js
module.exports = {
  apps: [
    {
      name: 'backend',
      script: 'npm',
      args: 'run dev:server',
      cwd: './backend',
      namespace: 'dev',
      max_memory_restart: '1G'
    },
    {
      name: 'frontend',
      script: 'npm',
      args: 'run dev',
      cwd: './frontend',
      namespace: 'dev',
      env: {
        PORT: 3000,
        API_URL: 'http://localhost:8080'
      }
    },
    {
      name: 'database',
      script: 'docker-compose',
      args: 'up postgres redis',
      namespace: 'infra'
    }
  ]
};
```

## テスト駆動開発での工夫

t_wada氏のテスト設計哲学に従い、境界値テストを重視しました：

```typescript
describe('MemoryMonitor', () => {
  test('should restart process when memory exceeds limit', async () => {
    const monitor = new MemoryMonitor();
    const process = createMockProcess({ rss: 500 * 1024 * 1024 }); // 500MB
    
    monitor.setLimit(process.name, '400M');
    const restartSpy = vi.fn();
    monitor.on('restart', restartSpy);
    
    await monitor.check();
    
    expect(restartSpy).toHaveBeenCalledWith(process.name);
  });
});
```

## パフォーマンスとリソース使用

開発環境での使用を前提に、最小限のリソース使用を実現：

- **CPU使用率**: < 0.1%（30秒間隔のチェック）
- **メモリ使用量**: 2-5MB（監視インフラ）
- **起動時間**: < 100ms
- **IPC レイテンシ**: < 5ms

## 今後の展望

### 短期的な改善

現在は自分で使いながら改善を続けています。特に以下の機能を検討中です：

- Web UIの追加（AIエージェントがスクリーンショットから状態を理解）
- プラグインシステム（カスタムモニタリング）
- より詳細なメトリクス収集

### 長期的なビジョン

Vibe Codingが普及するにつれ、AIエージェント向けのツールエコシステムが必要になります。procmanとticket.shは、その基盤の一部として貢献できればと考えています。

## まとめ - 10日間の開発で学んだこと

「Claude Codeがポンコツで10日もかかった」と最初は思いましたが、この経験を通じて多くを学びました：

1. **AIエージェントの限界を理解し、適切なツールで補完する重要性**
2. **既存ツールの「当たり前」がAIには通用しないこと**
3. **プロンプトエンジニアリングの進化（CLAUDE.mdの改善）**
4. **シンプルな設計が最も強力であること**

procmanは、AIエージェントと人間が協調して開発を進める新しい時代のためのツールです。もしあなたもVibe Codingを実践しているなら、ぜひ試してみてください。

## リンク

- **GitHub**: [https://github.com/masuidrive/procman](https://github.com/masuidrive/procman)
- **ticket.sh**: [https://github.com/masuidrive/ticket.sh](https://github.com/masuidrive/ticket.sh)
- **npm**: `npm install -g @masuidrive/procman`

## 技術スタック

- Node.js 18.x LTS
- TypeScript 5.x
- Commander.js
- Vitest（テスト）
- ESLint + Prettier（コード品質）

---

*この記事は、Claude Codeと共に10日間かけて開発したprocmanの技術的な側面を解説しました。Vibe Codingという新しい開発手法に興味がある方は、ぜひticket.shと組み合わせて使ってみてください。質問やフィードバックは[GitHub Issues](https://github.com/masuidrive/procman/issues)でお待ちしています。*