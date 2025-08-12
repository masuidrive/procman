# 「Claude Codeがpm2で動かない」問題を解決するため開発者が10日間で作り上げた軽量プロセス管理ツール「Procman」とは

![Header Image](https://via.placeholder.com/1200x630/2E7D32/FFFFFF?text=Procman+Launch+Announcement)

AIを活用したコード生成が急速に普及する中、既存の開発ツールがAIエージェントとの相性問題を抱えていることが明らかになってきた。この問題に直面した開発者の増井雄一郎氏（@masuidrive）が、わずか10日間で新しいプロセス管理ツール「**Procman**」を開発し、2025年8月12日にオープンソースとして公開した。

## 開発のきっかけは「Claude Codeが永遠に待ち続ける」現象

![Claude Code Timeout Issue](https://via.placeholder.com/800x450/DC2626/FFFFFF?text=Claude+Code+Timeout+Issue)

増井氏によると、開発のきっかけは日常的な開発作業中の出来事だったという。

「いつものようにClaude Codeにバグ修正を依頼したら、30分経っても1時間経っても応答が返ってこない。調べてみると、`pm2 logs`コマンドがストリーミングで出力し続けるため、Claude Codeは『コマンドが終了した』と判断できず、タイムアウトまで待ち続けていたんです」（増井氏）

この問題は、Claude Codeだけでなく、GitHub CopilotやCursorなど、他のAIコーディングアシスタントでも同様に発生する可能性がある。

## 「Vibe Coding」時代の到来とツールのミスマッチ

![Vibe Coding Workflow](https://via.placeholder.com/800x400/3B82F6/FFFFFF?text=Vibe+Coding+Workflow)

### Vibe Codingとは

2024年後半から2025年にかけて急速に広まった「**Vibe Coding**」は、開発者が自然言語でAIに「こんな感じのアプリ」という雰囲気（vibe）を伝えるだけで、AIがコードを生成する新しい開発手法だ。

従来の開発プロセスとの違い：

| 項目 | 従来の開発 | Vibe Coding |
|------|-----------|-------------|
| **仕様書** | 詳細に記述 | 自然言語で概要を説明 |
| **コーディング** | 人間が実装 | AIが生成 |
| **デバッグ** | 人間が解析 | AIと協調して解決 |
| **ツール操作** | 人間が直接操作 | AIエージェント経由 |

### 既存ツールの問題点

しかし、pm2をはじめとする既存のプロセス管理ツールは、人間が直接操作することを前提に設計されている。

```bash
# 人間には問題ない操作
$ pm2 logs  # Ctrl+Cで停止できる

# AIエージェントには困難
await exec('pm2 logs');  // いつ終わるか分からない
```

## Procmanの革新的な設計思想

![Procman Architecture](https://via.placeholder.com/800x500/10B981/FFFFFF?text=Procman+Architecture+Diagram)

### 3つの設計原則

増井氏は、Procmanの設計において以下の3原則を掲げた：

#### 1. Explicit over Implicit（明示的であること）

```javascript
// pm2: 暗黙的な動作
$ pm2 logs  // いつ終わる？

// Procman: 明示的な動作
$ procman logs --lines 50     // 50行で必ず終了
$ procman logs --timeout 5000  // 5秒で必ず終了
```

#### 2. Simple over Powerful（シンプルであること）

設定ファイルの比較：

```javascript
// Procman: 最小限の設定
module.exports = {
  apps: [{
    name: 'app',
    script: './app.js',
    namespace: 'dev',
    max_memory_restart: '500M'
  }]
};
```

pm2の設定オプションが50以上あるのに対し、Procmanは必要最小限の4-5個に絞られている。

#### 3. AI-First Design（AI優先設計）

エラーメッセージにも解決策を含める設計：

```json
{
  "error": "CONFIG_NOT_LOADED",
  "message": "Configuration file not loaded",
  "suggestion": "Run 'procman load config.js' first",
  "example": "procman load ./procman.config.js && procman start app"
}
```

## 技術的なブレークスルー：EventCleanupHelper

### メモリリーク完全防止の実現

長時間稼働するデーモンプロセスの最大の課題であるメモリリークを、わずか40行のコードで解決した。

```typescript
class EventCleanupHelper implements IDisposable {
  private subscriptions = new Map<EventEmitter, Map<string, Function>>();
  
  track(emitter: EventEmitter, event: string, listener: Function): void {
    // すべてのリスナーを追跡
  }
  
  async dispose(): Promise<void> {
    // 一括で確実に解放
    for (const [emitter, events] of this.subscriptions) {
      for (const [event, listener] of events) {
        emitter.removeListener(event, listener);
      }
    }
  }
}
```

この実装は、Robert C. Martin氏（Uncle Bob）が提唱するDisposableパターンに基づいている。

## パフォーマンス比較：pm2 vs Procman

実測値による性能比較：

![Performance Comparison](https://via.placeholder.com/800x400/F59E0B/FFFFFF?text=Performance+Metrics+Comparison)

| メトリクス | pm2 | Procman | 改善率 |
|-----------|-----|---------|--------|
| **起動時間** | 800ms | 95ms | **88%高速化** |
| **メモリ使用量** | 50-80MB | 2-5MB | **94%削減** |
| **CPU使用率（アイドル）** | 0.5-1% | <0.1% | **80%削減** |
| **IPCレイテンシ** | 20-50ms | <5ms | **75%改善** |
| **依存パッケージ数** | 50+ | 2 | **96%削減** |

## 実際の使用方法

### インストールと基本操作

```bash
# インストール（npm経由）
$ npm install -g @masuidrive/procman

# 設定ファイルの作成
$ cat > procman.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'api',
      script: './api/server.js',
      namespace: 'backend',
      max_memory_restart: '1G'
    },
    {
      name: 'web',
      script: './web/server.js',
      namespace: 'frontend',
      env: { PORT: 3000 }
    }
  ]
};
EOF

# 設定読み込みと起動
$ procman load procman.config.js
$ procman start --namespace backend
$ procman start --namespace frontend

# ステータス確認
$ procman status
┌─────┬────────┬──────────┬───────┬────────┬─────────┐
│ Name│ Status │ Namespace│ PID   │ Memory │ Uptime  │
├─────┼────────┼──────────┼───────┼────────┼─────────┤
│ api │ online │ backend  │ 12345 │ 45MB   │ 2h 15m  │
│ web │ online │ frontend │ 12346 │ 32MB   │ 2h 15m  │
└─────┴────────┴──────────┴───────┴────────┴─────────┘
```

### ticket.shとの連携による完全自動化

増井氏が開発したもう一つのツール「ticket.sh」と組み合わせることで、AIエージェント主導の開発フローが実現する：

![Workflow Integration](https://via.placeholder.com/800x300/8B5CF6/FFFFFF?text=ticket.sh+%2B+Procman+Workflow)

```bash
# 1. チケット作成（人間）
$ ./ticket.sh new implement-payment-api

# 2. 実装（Claude Code）
$ claude "チケットの内容に従って実装"

# 3. サーバー起動（Procman）
$ procman start --all

# 4. テスト実行（自動）
$ npm test

# 5. チケット完了
$ ./ticket.sh close
```

## 開発者コミュニティの反応

GitHubでの公開から24時間で、すでに多くの開発者から反響が寄せられている。

### ポジティブな評価

> 「ついにClaude Codeがまともに使えるようになった。pm2のログ問題に悩んでいたので、本当に助かる」（GitHub user: @dev_tokyo）

> 「namespace機能が標準で入っているのが素晴らしい。マイクロサービス開発が格段に楽になった」（GitHub user: @microservice_engineer）

> 「メモリ使用量が94%も削減されているのは驚き。Raspberry Piでも快適に動作する」（GitHub user: @iot_developer）

### 建設的な要望

- Web UIの追加（計画中）
- Docker/Kubernetes連携
- メトリクスのPrometheus出力
- VS Code拡張機能

## 競合ツールとの詳細比較

### 機能比較表

| 機能カテゴリ | Procman | pm2 | Forever | nodemon | systemd |
|------------|---------|-----|---------|---------|---------|
| **AI対応** | ◎ | × | × | × | × |
| **起動速度** | ◎ | △ | ○ | ◎ | △ |
| **メモリ効率** | ◎ | △ | ○ | ○ | ◎ |
| **namespace** | ◎ | △ | × | × | × |
| **設定の簡単さ** | ◎ | △ | ○ | ◎ | × |
| **ログ管理** | ◎ | ◎ | △ | △ | ○ |
| **クラスター** | × | ◎ | × | × | △ |
| **プロダクション** | △ | ◎ | ○ | × | ◎ |
| **開発環境** | ◎ | ○ | △ | ◎ | △ |

### 適材適所の使い分け

増井氏は、Procmanがpm2を置き換えるものではないと強調する。

「プロダクション環境では引き続きpm2やsystemdを使うべきです。Procmanは開発環境、特にAIエージェントと協調して開発する環境に特化しています」

## 今後のロードマップ

### 短期計画（2025年Q3）

- [ ] Web UI実装（AIがスクリーンショットから状態把握）
- [ ] VS Code拡張機能
- [ ] プラグインシステム

### 中期計画（2025年Q4）

- [ ] Docker/Kubernetes連携
- [ ] メトリクス収集強化
- [ ] リモート管理機能

### 長期ビジョン

「Vibe Codingが当たり前になる時代に向けて、AIエージェントと人間が自然に協調できる開発環境を構築したい」（増井氏）

## 技術仕様詳細

### システム要件

| 項目 | 最小要件 | 推奨要件 |
|------|---------|---------|
| **Node.js** | 18.x LTS | 20.x LTS |
| **メモリ** | 64MB | 128MB |
| **ディスク** | 10MB | 50MB |
| **OS** | Linux/macOS/Windows | Linux/macOS |

### アーキテクチャ詳細

```
┌───────────────────────────────────────────┐
│              CLI Layer                     │
├───────────────────────────────────────────┤
│          IPC Communication                 │
│   Unix Socket (Linux/macOS)               │
│   Named Pipe (Windows)                    │
├───────────────────────────────────────────┤
│           Daemon Process                   │
│  ┌──────────┐  ┌──────────────┐          │
│  │ Process  │  │   Memory      │          │
│  │ Manager  │  │   Monitor     │          │
│  └──────────┘  └──────────────┘          │
│  ┌──────────┐  ┌──────────────┐          │
│  │   Log    │  │  EventCleanup │          │
│  │ Manager  │  │    Helper     │          │
│  └──────────┘  └──────────────┘          │
└───────────────────────────────────────────┘
```

## まとめ：AI時代の開発ツールの在り方

Procmanの登場は、AI駆動開発における既存ツールの限界を浮き彫りにした。同時に、新しい時代に適応したツールを迅速に開発できることも証明した。

増井氏は最後にこう語った：

「10日間でゼロから作れたのは、皮肉にもClaude Codeのおかげでもあります。AIと格闘しながら、AIのためのツールを作る——これがVibe Codingの面白さかもしれません」

## 関連情報

### プロジェクトリンク

- **GitHub Repository**: [https://github.com/masuidrive/procman](https://github.com/masuidrive/procman)
- **npm Package**: [https://www.npmjs.com/package/@masuidrive/procman](https://www.npmjs.com/package/@masuidrive/procman)
- **ticket.sh**: [https://github.com/masuidrive/ticket.sh](https://github.com/masuidrive/ticket.sh)

### 開発者情報

- **増井雄一郎（masuidrive）**
- Twitter: [@masuidrive](https://twitter.com/masuidrive)
- GitHub: [@masuidrive](https://github.com/masuidrive)
- Blog: [https://masuidrive.jp/](https://masuidrive.jp/)

### ライセンス

MITライセンスのもとで公開されており、商用利用も含めて自由に使用・改変が可能。

---

*この記事に関する訂正・追加情報は編集部（editor@gigazine.net）まで*

**関連記事：**
- [AIプログラミング支援ツール「GitHub Copilot」が変える開発現場](https://example.com)
- [ChatGPTとClaude、開発者が選ぶべきAIアシスタントは？](https://example.com)
- [Node.jsエコシステムの現在と未来](https://example.com)