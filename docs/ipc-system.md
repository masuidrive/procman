# IPC通信システム包括ドキュメント

## 概要

procmanプロジェクトのIPC（Inter-Process Communication）システムは、CLI ClientとDaemon Process間の通信を行う高性能で信頼性の高い通信基盤です。Unix Domain Socket（Unix系）とNamed Pipe（Windows）を使用し、JSONベースのメッセージ交換システムを提供します。

## システム特徴

### 🔗 クロスプラットフォーム対応
- **Unix系**: Unix Domain Socket (`~/.masuidrive-procman/procman.sock`)
- **Windows**: Named Pipe (`\\.\pipe\masuidrive-procman`)
- 自動プラットフォーム検出と適切な通信方式の選択

### 🏗️ 高度なアーキテクチャ
- **接続プール**: 複数クライアント接続の効率的な管理
- **ハートビート機能**: 接続状態の監視と健全性チェック
- **自動再接続**: 指数バックオフによる智能的な再接続
- **回路ブレーカー**: 障害時の適切なフォールバック処理
- **認証・認可**: トークンベースのセキュリティシステム

### 🛡️ 信頼性とロバスト性
- **メッセージ圧縮**: 大きなペイロードの効率的な転送
- **メッセージバージョニング**: 後方互換性の保証
- **エラーハンドリング**: 包括的なエラー分類と処理
- **Graceful Shutdown**: 適切なリソースクリーンアップ

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                         IPC システム                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │   CLI Client    │    │   Daemon        │                     │
│  │                 │    │   Process       │                     │
│  └─────────────────┘    └─────────────────┘                     │
│           │                       │                              │
│           │ JSON Messages over    │                              │
│           │ Unix Socket/          │                              │
│           │ Named Pipe            │                              │
│           └───────────────────────┘                              │
├─────────────────────────────────────────────────────────────────┤
│                      通信レイヤー                               │
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │ UnixSocketClient│              │ UnixSocketServer│           │
│  │ NamedPipeClient │              │ NamedPipeServer │           │
│  └─────────────────┘              └─────────────────┘           │
├─────────────────────────────────────────────────────────────────┤
│                      高度な機能                                  │
│  ┌───────────────┐ ┌──────────────┐ ┌─────────────────┐        │
│  │ ConnectionPool│ │ HeartbeatSys │ │ ReconnectionSys │        │
│  └───────────────┘ └──────────────┘ └─────────────────┘        │
│  ┌───────────────┐ ┌──────────────┐ ┌─────────────────┐        │
│  │ AuthSystem    │ │ MessageProtocol│ │ GracefulShutdown│        │
│  └───────────────┘ └──────────────┘ └─────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## APIリファレンス

### 基本クラス

#### IPCServerBase
サーバー機能の基底クラス

```typescript
abstract class IPCServerBase extends EventEmitter {
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract isServerListening(): boolean;
  
  // メッセージハンドラー登録
  registerHandler(type: CommandType, handler: MessageHandler): void;
  
  // クライアント管理
  getConnections(): Connection[];
  broadcastToClients(message: IPCMessage): void;
}
```

#### IPCClientBase
クライアント機能の基底クラス

```typescript
abstract class IPCClientBase extends EventEmitter {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): boolean;
  
  // メッセージ送信
  send(message: IPCMessage): Promise<IPCMessage | null>;
  sendRequest(type: CommandType, payload: any, options?: RequestOptions): Promise<IPCMessage>;
}
```

### プラットフォーム固有実装

#### UnixSocketServer / UnixSocketClient
Unix Domain Socket実装

```typescript
class UnixSocketServer extends IPCServerBase {
  constructor(socketPath: string, options?: UnixSocketServerOptions);
}

class UnixSocketClient extends IPCClientBase {
  constructor(socketPath: string, options?: UnixSocketClientOptions);
}
```

#### NamedPipeServer / NamedPipeClient
Windows Named Pipe実装

```typescript
class NamedPipeServer extends IPCServerBase {
  constructor(pipeName: string, options?: NamedPipeServerOptions);
}

class NamedPipeClient extends IPCClientBase {
  constructor(pipeName: string, options?: NamedPipeClientOptions);
}
```

### ファクトリーパターン

#### IPCFactory
プラットフォーム自動選択

```typescript
class IPCFactory {
  static createServer(options?: IPCServerOptions): IPCServerBase;
  static createClient(options?: IPCClientOptions): IPCClientBase;
}
```

### 高度な機能

#### ConnectionPool
接続プール管理

```typescript
class ConnectionPool extends EventEmitter {
  constructor(connectionFactory: ConnectionFactory, options?: ConnectionPoolOptions);
  
  async acquire(): Promise<PooledConnection>;
  release(connection: PooledConnection): void;
  getStats(): PoolStats;
  
  // ロードバランシング戦略
  setLoadBalancingStrategy(strategy: LoadBalancingStrategy): void;
}
```

#### HeartbeatSystem
ハートビート機能

```typescript
class HeartbeatSystem extends EventEmitter {
  constructor(options?: HeartbeatOptions);
  
  start(): void;
  stop(): void;
  handleHeartbeatMessage(message: HeartbeatMessage): HeartbeatMessage | null;
  getHealth(): ConnectionHealth;
  getStats(): HeartbeatStats;
}
```

#### ReconnectionSystem
自動再接続機能

```typescript
class ReconnectionSystem extends EventEmitter {
  constructor(options?: ReconnectionOptions);
  
  async startReconnection(connectionFunc: () => Promise<void>): Promise<void>;
  stopReconnection(): void;
  getStats(): ReconnectionStats;
  getCircuitBreakerState(): CircuitBreakerState;
}
```

#### AuthSystem
認証・認可システム

```typescript
class AuthSystem {
  constructor(options?: AuthSystemOptions);
  
  createChallenge(): AuthChallenge;
  async authenticate(response: AuthResponse): Promise<AuthResult>;
  validateToken(token: AuthToken): { valid: boolean; error?: string };
  checkPermission(token: AuthToken, permission: Permission): boolean;
}
```

## 使用例

### 基本的なサーバー・クライアント通信

```typescript
import { IPCFactory, createIPCMessage } from '@masuidrive/procman';

// サーバー側
const server = IPCFactory.createServer();

// メッセージハンドラー登録
server.registerHandler('status', async (message, connection) => {
  return {
    type: 'status_response',
    id: generateId(),
    payload: { status: 'running', processes: [] },
    requestId: message.id
  };
});

await server.start();

// クライアント側
const client = IPCFactory.createClient();
await client.connect();

const response = await client.sendRequest('status', {});
console.log('Server status:', response.payload);

await client.disconnect();
await server.stop();
```

### 接続プールの使用

```typescript
import { ConnectionPool, IPCFactory } from '@masuidrive/procman';

const pool = new ConnectionPool(
  () => IPCFactory.createClient(),
  {
    minConnections: 2,
    maxConnections: 10,
    loadBalancingStrategy: LoadBalancingStrategy.LEAST_CONNECTIONS
  }
);

// 接続の取得と使用
const connection = await pool.acquire();
try {
  const response = await connection.client.sendRequest('list_processes', {});
  console.log('Processes:', response.payload);
} finally {
  pool.release(connection);
}

await pool.close();
```

### ハートビート機能の使用

```typescript
import { HeartbeatSystem } from '@masuidrive/procman';

const heartbeat = new HeartbeatSystem({
  interval: 30000,    // 30秒間隔
  timeout: 10000,     // 10秒タイムアウト
  maxMissed: 3        // 3回まで失敗許容
});

heartbeat.on('connectionDead', (stats) => {
  console.log('Connection lost, attempting reconnection...');
  // 再接続処理をトリガー
});

heartbeat.start();
```

### 自動再接続の使用

```typescript
import { ReconnectionSystem, ReconnectionStrategy } from '@masuidrive/procman';

const reconnection = new ReconnectionSystem({
  strategy: ReconnectionStrategy.EXPONENTIAL_BACKOFF,
  initialDelay: 1000,
  maxDelay: 60000,
  maxAttempts: 10,
  enableCircuitBreaker: true
});

reconnection.on('reconnectionSuccess', () => {
  console.log('Successfully reconnected');
});

// 接続失敗時の再接続開始
await reconnection.startReconnection(async () => {
  await client.connect();
});
```

### 認証システムの使用

```typescript
import { AuthSystem, UserRole } from '@masuidrive/procman';

const auth = new AuthSystem({
  secretKey: 'my-secret-key',
  tokenExpirationMs: 24 * 60 * 60 * 1000 // 24時間
});

// ユーザー作成
const user = await auth.createUser('admin', 'password', UserRole.ADMIN);

// 認証チャレンジ作成
const challenge = auth.createChallenge();

// 認証実行（実際のアプリでは適切な署名計算が必要）
const authResult = await auth.authenticate({
  challengeId: challenge.challengeId,
  signature: 'calculated-signature',
  username: 'admin'
});

if (authResult.success) {
  console.log('Authentication successful', authResult.token);
}
```

## メッセージプロトコル

### 標準メッセージ形式

```typescript
interface IPCMessage {
  type: CommandType;
  id: string;
  payload: any;
  requestId?: string;
  timestamp?: number;
}
```

### 拡張メッセージエンベロープ（圧縮・バージョニング対応）

```typescript
interface MessageEnvelope {
  version: number;
  format: SerializationFormat;
  compressed: boolean;
  size: number;
  checksum?: string;
  payload: string;
}
```

### サポートされているコマンドタイプ

```typescript
enum CommandType {
  // 基本コマンド
  STATUS = 'status',
  LIST_PROCESSES = 'list_processes',
  START_PROCESS = 'start_process',
  STOP_PROCESS = 'stop_process',
  RESTART_PROCESS = 'restart_process',
  
  // 設定関連
  GET_CONFIG = 'get_config',
  SET_CONFIG = 'set_config',
  RELOAD_CONFIG = 'reload_config',
  
  // ログ関連
  GET_LOGS = 'get_logs',
  TAIL_LOGS = 'tail_logs',
  
  // システム関連
  SHUTDOWN = 'shutdown',
  HEARTBEAT = 'heartbeat',
  
  // 認証関連
  AUTH_CHALLENGE = 'auth_challenge',
  AUTH_RESPONSE = 'auth_response'
}
```

## エラーハンドリング

### エラーレスポンス形式

```typescript
interface ErrorResponse {
  type: 'error';
  id: string;
  payload: {
    code: string;
    message: string;
    details?: any;
  };
  requestId: string;
}
```

### エラー分類

```typescript
enum ErrorCode {
  // 接続エラー
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_LOST = 'CONNECTION_LOST',
  
  // メッセージエラー
  MESSAGE_TOO_LARGE = 'MESSAGE_TOO_LARGE',
  MESSAGE_MALFORMED = 'MESSAGE_MALFORMED',
  MESSAGE_TIMEOUT = 'MESSAGE_TIMEOUT',
  
  // 認証エラー
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_FAILED = 'AUTH_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // システムエラー
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}
```

## 設定

### サーバー設定

```typescript
interface IPCServerOptions {
  // 接続設定
  maxConnections?: number;
  connectionTimeout?: number;
  
  // メッセージ設定
  maxMessageSize?: number;
  messageTimeout?: number;
  
  // セキュリティ設定
  enableAuth?: boolean;
  allowedClients?: string[];
  
  // パフォーマンス設定
  enableCompression?: boolean;
  compressionThreshold?: number;
}
```

### クライアント設定

```typescript
interface IPCClientOptions {
  // 接続設定
  connectionTimeout?: number;
  reconnectAttempts?: number;
  
  // メッセージ設定
  requestTimeout?: number;
  
  // 再接続設定
  enableAutoReconnect?: boolean;
  reconnectStrategy?: ReconnectionStrategy;
  
  // ハートビート設定
  enableHeartbeat?: boolean;
  heartbeatInterval?: number;
}
```

## パフォーマンス考慮事項

### 接続プール最適化
- 最小接続数: 2-5 (通常のワークロード)
- 最大接続数: 10-50 (負荷に応じて調整)
- ロードバランシング: `LEAST_CONNECTIONS`を推奨

### メッセージ最適化
- 圧縮しきい値: 100バイト以上
- 最大メッセージサイズ: 1MB
- バッチ処理: 複数の小さなメッセージをまとめて送信

### ハートビート設定
- 間隔: 30秒 (通常)、5秒 (リアルタイム要件)
- タイムアウト: 間隔の1/3
- 最大失敗回数: 3回

## トラブルシューティング

### よくある問題と解決策

#### 接続失敗
```bash
# Unix socketファイルの権限確認
ls -la ~/.masuidrive-procman/procman.sock

# プロセスがlistenしているか確認
lsof -U | grep procman.sock
```

#### メッセージタイムアウト
```typescript
// タイムアウト値を増加
const client = IPCFactory.createClient({
  requestTimeout: 30000  // 30秒
});
```

#### メモリリーク
```typescript
// 適切なクリーンアップ
try {
  await client.connect();
  // 処理...
} finally {
  await client.disconnect();
}
```

## ベストプラクティス

### 1. 適切なリソース管理
```typescript
// 推奨: try-finally パターン
const client = IPCFactory.createClient();
try {
  await client.connect();
  // 処理...
} finally {
  await client.disconnect();
}
```

### 2. エラーハンドリング
```typescript
// 推奨: 包括的なエラーハンドリング
try {
  const response = await client.sendRequest('command', payload);
} catch (error) {
  if (error instanceof ConnectionError) {
    // 再接続試行
  } else if (error instanceof AuthError) {
    // 再認証
  } else {
    // ログ出力とフォールバック
  }
}
```

### 3. パフォーマンス監視
```typescript
// 推奨: 統計情報の定期確認
setInterval(() => {
  const poolStats = pool.getStats();
  const heartbeatStats = heartbeat.getStats();
  
  if (poolStats.averageAcquireTime > 1000) {
    console.warn('Connection pool performance degraded');
  }
}, 60000);
```

## 今後の拡張計画

### 計画中の機能
- [ ] MessagePack/CBOR対応
- [ ] 圧縮アルゴリズムの選択肢追加
- [ ] TLS暗号化サポート
- [ ] 分散システム対応
- [ ] パフォーマンス監視ダッシュボード

### API安定性
- **Stable**: `IPCServerBase`, `IPCClientBase`, `IPCFactory`
- **Beta**: `ConnectionPool`, `HeartbeatSystem`
- **Alpha**: `AuthSystem`, `MessageProtocol`拡張機能

---

このドキュメントはprocman IPC システムの包括的なガイドです。実装の詳細やサンプルコードは各モジュールのテストファイルもご参照ください。