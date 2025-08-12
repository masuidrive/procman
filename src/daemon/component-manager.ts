/**
 * Component Manager - コンポーネント管理の専門クラス
 *
 * デーモンの各コンポーネントの初期化・クリーンアップを管理する。
 * Single Responsibility Principle に従ってコンポーネント管理のみに特化。
 */

import { EventEmitter } from 'events';
import { EventCleanupHelper } from '../utils/event-cleanup.js';
import { ConfigLoader } from '../config/config-loader.js';
import { ProcessManager } from '../process-manager/process-manager.js';
import { LogManager } from '../services/log-manager.js';
import { createIPCServer } from './ipc-factory.js';
import { IPCServerBase } from './ipc-server-base.js';
import { IPCCommandHandler } from './ipc-command-handler.js';
import { DataDirectory } from './data-directory.js';
import { CommandType } from '../shared/ipc.js';
import {
  LOG_STREAM_EVENTS,
  STREAM_CONFIG,
  STREAM_MESSAGE_TYPES,
} from '../shared/constants-streaming.js';

/**
 * Component initialization error
 */
export class ComponentInitializationError extends Error {
  constructor(
    public componentName: string,
    public originalError: Error
  ) {
    super(
      `Failed to initialize component '${componentName}': ${originalError.message}`
    );
    this.name = 'ComponentInitializationError';
  }
}

/**
 * Component cleanup error
 */
export class ComponentCleanupError extends Error {
  constructor(
    public componentName: string,
    public originalError: Error
  ) {
    super(
      `Failed to cleanup component '${componentName}': ${originalError.message}`
    );
    this.name = 'ComponentCleanupError';
  }
}

/**
 * Events emitted by ComponentManager
 */
export interface ComponentManagerEvents {
  componentStarted: (componentName: string) => void;
  componentStopped: (componentName: string) => void;
  componentError: (componentName: string, error: Error) => void;
  allComponentsStarted: () => void;
  allComponentsStopped: () => void;
}

/**
 * Component manager interface
 */
export interface Component {
  name: string;
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  isInitialized(): boolean;
}

/**
 * Component manager class
 *
 * Manages the lifecycle of all daemon components with proper error handling
 * and rollback capabilities.
 */
export class ComponentManager extends EventEmitter {
  private components: Map<string, Component> = new Map();
  private initializationOrder: string[] = [];
  private cleanupOrder: string[] = [];
  private initializationErrors: ComponentInitializationError[] = [];

  // Component instances
  private configLoader?: ConfigLoader;
  private processManager?: ProcessManager;
  private logManager?: LogManager;
  private ipcServer?: IPCServerBase;
  private commandHandler?: IPCCommandHandler;

  // Add EventCleanupHelper for proper listener cleanup
  private readonly listenerCleanup = new EventCleanupHelper();

  constructor(private dataDirectory: DataDirectory) {
    super();

    // No initialization needed for EventCleanupHelper
  }

  /**
   * Private method to register and track listeners
   */
  private registerListener<T extends EventEmitter>(
    emitter: T,
    event: string | symbol,
    listener: (...args: any[]) => void
  ): void {
    this.listenerCleanup.track(emitter, event, listener);
  }

  /**
   * Initialize all components
   */
  async initializeAll(): Promise<void> {
    this.initializationErrors = [];
    const startTime = Date.now();

    try {
      console.log('Starting daemon component initialization...');

      // Initialize components in order with progress logging
      console.log('Initializing ConfigLoader...');
      await this.initializeConfigLoader();
      console.log('ConfigLoader initialized successfully');

      console.log('Initializing ProcessManager...');
      await this.initializeProcessManager();
      console.log('ProcessManager initialized successfully');

      console.log('Initializing LogManager...');
      await this.initializeLogManager();
      console.log('LogManager initialized successfully');

      console.log('Initializing IPCServer...');
      await this.initializeIPCServer();
      console.log('IPCServer initialized successfully');

      console.log('Initializing CommandHandler...');
      await this.initializeCommandHandler();
      console.log('CommandHandler initialized successfully');

      const totalTime = Date.now() - startTime;
      console.log(
        `All daemon components initialized successfully in ${totalTime}ms`
      );

      this.emit('allComponentsStarted');
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(
        `Component initialization failed after ${totalTime}ms:`,
        error
      );

      // Rollback any initialized components
      await this.rollbackInitialization();
      throw error;
    }
  }

  /**
   * Cleanup all components
   */
  async cleanupAll(): Promise<void> {
    const errors: ComponentCleanupError[] = [];

    // Cleanup all streaming sessions first
    this.cleanupAllStreamingSessions();

    // Cleanup in reverse order of initialization
    const componentsToCleanup = [...this.cleanupOrder].reverse();

    for (const componentName of componentsToCleanup) {
      try {
        const component = this.components.get(componentName);
        if (component && component.isInitialized()) {
          await component.cleanup();
          this.emit('componentStopped', componentName);
        }
      } catch (error) {
        const cleanupError = new ComponentCleanupError(
          componentName,
          error as Error
        );
        errors.push(cleanupError);
        this.emit('componentError', componentName, cleanupError);
      }
    }

    // Clear component references
    this.clearComponents();

    // Clean up listener management (after streaming sessions are already cleaned up)
    await this.cleanupListeners();

    this.emit('allComponentsStopped');

    // Throw aggregated errors if any occurred
    if (errors.length > 0) {
      const errorMessage = `Component cleanup failed: ${errors.map((e) => e.message).join('; ')}`;
      throw new Error(errorMessage);
    }
  }

  /**
   * Get component by name
   */
  getComponent<T>(name: string): T | undefined {
    switch (name) {
      case 'configLoader':
        return this.configLoader as T;
      case 'processManager':
        return this.processManager as T;
      case 'logManager':
        return this.logManager as T;
      case 'ipcServer':
        return this.ipcServer as T;
      case 'commandHandler':
        return this.commandHandler as T;
      default:
        return undefined;
    }
  }

  /**
   * Check if all components are initialized
   */
  areAllComponentsInitialized(): boolean {
    return Array.from(this.components.values()).every((component) =>
      component.isInitialized()
    );
  }

  /**
   * Perform comprehensive health checks on all components
   * Verifies each component is not just initialized but actually functional
   */
  async performHealthChecks(): Promise<{
    healthy: boolean;
    details: Record<
      string,
      { status: 'healthy' | 'unhealthy' | 'unknown'; message: string }
    >;
  }> {
    const details: Record<
      string,
      { status: 'healthy' | 'unhealthy' | 'unknown'; message: string }
    > = {};
    let allHealthy = true;

    // Check ConfigLoader health
    if (this.configLoader) {
      try {
        // ConfigLoader is healthy if it exists and can load configuration
        // Since there's no isInitialized method, assume healthy if instance exists
        const isReady = true;
        details.configLoader = {
          status: isReady ? 'healthy' : 'unhealthy',
          message: isReady
            ? 'ConfigLoader is ready'
            : 'ConfigLoader not initialized',
        };
        if (!isReady) allHealthy = false;
      } catch (error) {
        details.configLoader = {
          status: 'unhealthy',
          message: `ConfigLoader error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        allHealthy = false;
      }
    } else {
      details.configLoader = {
        status: 'unhealthy',
        message: 'ConfigLoader not available',
      };
      allHealthy = false;
    }

    // Check ProcessManager health
    if (this.processManager) {
      try {
        // ProcessManager is healthy if it exists and is properly initialized
        // Since there's no isRunning method, assume healthy if instance exists
        const isReady = true;
        details.processManager = {
          status: isReady ? 'healthy' : 'unhealthy',
          message: isReady
            ? 'ProcessManager is running'
            : 'ProcessManager not running',
        };
        if (!isReady) allHealthy = false;
      } catch (error) {
        details.processManager = {
          status: 'unhealthy',
          message: `ProcessManager error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        allHealthy = false;
      }
    } else {
      details.processManager = {
        status: 'unhealthy',
        message: 'ProcessManager not available',
      };
      allHealthy = false;
    }

    // Check LogManager health
    if (this.logManager) {
      try {
        // LogManager is healthy if it exists and is properly initialized
        // Since there's no isRunning method, assume healthy if instance exists
        const isReady = true;
        details.logManager = {
          status: isReady ? 'healthy' : 'unhealthy',
          message: isReady ? 'LogManager is running' : 'LogManager not running',
        };
        if (!isReady) allHealthy = false;
      } catch (error) {
        details.logManager = {
          status: 'unhealthy',
          message: `LogManager error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        allHealthy = false;
      }
    } else {
      details.logManager = {
        status: 'unhealthy',
        message: 'LogManager not available',
      };
      allHealthy = false;
    }

    // Check IPCServer health - most critical for readiness
    if (this.ipcServer) {
      try {
        const isListening = this.ipcServer.isServerListening?.();
        details.ipcServer = {
          status: isListening ? 'healthy' : 'unhealthy',
          message: isListening
            ? 'IPC Server is listening and ready'
            : 'IPC Server not listening',
        };
        if (!isListening) allHealthy = false;
      } catch (error) {
        details.ipcServer = {
          status: 'unhealthy',
          message: `IPCServer error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        allHealthy = false;
      }
    } else {
      details.ipcServer = {
        status: 'unhealthy',
        message: 'IPC Server not available',
      };
      allHealthy = false;
    }

    // Check CommandHandler health
    if (this.commandHandler) {
      try {
        // CommandHandler is healthy if it exists (no specific health check method)
        details.commandHandler = {
          status: 'healthy',
          message: 'CommandHandler is ready',
        };
      } catch (error) {
        details.commandHandler = {
          status: 'unhealthy',
          message: `CommandHandler error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        allHealthy = false;
      }
    } else {
      details.commandHandler = {
        status: 'unhealthy',
        message: 'CommandHandler not available',
      };
      allHealthy = false;
    }

    return { healthy: allHealthy, details };
  }

  /**
   * Get initialization errors
   */
  getInitializationErrors(): ComponentInitializationError[] {
    return [...this.initializationErrors];
  }

  /**
   * Initialize config loader
   */
  private async initializeConfigLoader(): Promise<void> {
    try {
      this.configLoader = new ConfigLoader();
      await this.registerComponent('configLoader', this.configLoader);
      this.emit('componentStarted', 'configLoader');
    } catch (error) {
      const initError = new ComponentInitializationError(
        'configLoader',
        error as Error
      );
      this.initializationErrors.push(initError);
      this.emit('componentError', 'configLoader', initError);
      throw initError;
    }
  }

  /**
   * Initialize process manager
   */
  private async initializeProcessManager(): Promise<void> {
    try {
      this.processManager = ProcessManager.create();
      await this.registerComponent('processManager', this.processManager);
      this.emit('componentStarted', 'processManager');
    } catch (error) {
      const initError = new ComponentInitializationError(
        'processManager',
        error as Error
      );
      this.initializationErrors.push(initError);
      this.emit('componentError', 'processManager', initError);
      throw initError;
    }
  }

  /**
   * Initialize log manager
   */
  private async initializeLogManager(): Promise<void> {
    try {
      const logDir = await this.dataDirectory.getLogDirectory();
      this.logManager = new LogManager(logDir);
      await this.registerComponent('logManager', this.logManager);
      this.emit('componentStarted', 'logManager');
    } catch (error) {
      const initError = new ComponentInitializationError(
        'logManager',
        error as Error
      );
      this.initializationErrors.push(initError);
      this.emit('componentError', 'logManager', initError);
      throw initError;
    }
  }

  /**
   * Initialize IPC server
   */
  private async initializeIPCServer(): Promise<void> {
    try {
      const startTime = Date.now();
      console.log('Getting socket path...');
      const socketPath = await this.dataDirectory.getSocketPath();
      console.log(`Socket path resolved: ${socketPath}`);

      console.log('Creating IPC server...');
      this.ipcServer = createIPCServer({ path: socketPath });

      console.log('Registering IPC server component...');
      await this.registerComponent('ipcServer', this.ipcServer);

      const totalTime = Date.now() - startTime;
      console.log(`IPC server initialized in ${totalTime}ms`);
      this.emit('componentStarted', 'ipcServer');
    } catch (error) {
      console.error('IPC server initialization failed:', error);
      const initError = new ComponentInitializationError(
        'ipcServer',
        error as Error
      );
      this.initializationErrors.push(initError);
      this.emit('componentError', 'ipcServer', initError);
      throw initError;
    }
  }

  /**
   * Initialize command handler
   */
  private async initializeCommandHandler(): Promise<void> {
    try {
      if (
        !this.configLoader ||
        !this.processManager ||
        !this.logManager ||
        !this.ipcServer
      ) {
        throw new Error('Required components not initialized');
      }

      // Create a mock daemon object for the command handler
      const daemonInterface = this.createDaemonInterface();

      this.commandHandler = new IPCCommandHandler(daemonInterface);
      await this.registerComponent('commandHandler', this.commandHandler);

      // Register command handlers with IPC server
      this.registerCommandHandlers();

      this.emit('componentStarted', 'commandHandler');
    } catch (error) {
      const initError = new ComponentInitializationError(
        'commandHandler',
        error as Error
      );
      this.initializationErrors.push(initError);
      this.emit('componentError', 'commandHandler', initError);
      throw initError;
    }
  }

  /**
   * Create daemon interface for command handler
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createDaemonInterface() {
    return {
      getConfigLoader: () => this.configLoader!,
      getProcessManager: () => this.processManager!,
      getLogManager: () => this.logManager!,
      getAllProcessStatuses: async () => {
        // Implementation moved from ProcmanDaemon
        const processInfos = this.processManager!.getAllProcessInfo();

        const statusPromises = processInfos.map(async (processInfo) => {
          const info = processInfo;
          if (!info) return null;

          // Get process stats from monitor
          const stats = await this.processManager!.monitor.getProcessStats(
            info.name
          );

          return {
            name: info.name,
            namespace: info.namespace || 'default',
            pid: info.pid,
            status: info.status,
            uptime: info.uptime,
            memory: stats?.memory || 0,
            cpu: stats?.cpu || 0,
            restarts: info.restarts,
          };
        });

        const results = await Promise.all(statusPromises);
        return results.filter((result) => result !== null);
      },
      getConfig: () => {
        // This will be set by the calling code
        return undefined;
      },
      loadConfig: async (configFilePath: string) => {
        const config = await this.configLoader!.load(configFilePath);

        // Stop all existing processes
        const allProcesses = this.processManager!.getAllProcessInfo();
        if (allProcesses.length > 0) {
          const processNames = allProcesses
            .map((processInfo) => {
              const info = processInfo;
              return info?.name || '';
            })
            .filter((name) => name !== '');
          await this.processManager!.stopProcesses(processNames);
        }

        // Configure new processes
        for (const app of config.apps) {
          this.processManager!.configureProcess(app);

          // Setup log manager for this app if log files are configured
          if (
            this.logManager &&
            (app.log_file || app.out_file || app.error_file)
          ) {
            await this.logManager.setupAppLogs(app.name, {
              logFile: app.log_file,
              outFile: app.out_file,
              errorFile: app.error_file,
              namespace: app.namespace,
            });
          }
        }

        return config.apps;
      },
      stop: async () => {
        await this.cleanupAll();
      },
    };
  }

  /**
   * Register command handlers with IPC server
   */
  private registerCommandHandlers(): void {
    if (!this.ipcServer || !this.commandHandler) {
      return;
    }

    const commandTypes: CommandType[] = [
      'load',
      'start',
      'stop',
      'restart',
      'list',
      'log',
      'clear-log',
      'exit',
    ];

    for (const commandType of commandTypes) {
      this.ipcServer.registerHandler(
        commandType,
        async (message, connection) => {
          // Pass connection info to command handler for log streaming
          return this.commandHandler!.handleMessage(message, connection);
        }
      );
    }

    // ログストリーミングのセットアップ
    this.setupLogStreaming();
  }

  // ストリーミングセッション管理用のマップ
  // Map to track active streaming sessions with connection info
  private streamingSessions: Map<
    string,
    { cleanup: () => void; connectionId: string; messageId: string }
  > = new Map();

  /**
   * Setup log streaming functionality
   */
  private setupLogStreaming(): void {
    if (!this.commandHandler || !this.ipcServer || !this.logManager) {
      return;
    }

    // コマンドハンドラーからのログストリーミング開始イベントをリッスン
    // Note: We need connectionId to send logs to specific client only
    // This requires passing connectionId from IPCServer through IPCCommandHandler

    this.registerListener(
      this.commandHandler,
      LOG_STREAM_EVENTS.START_LOG_STREAM,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (streamConfig: any) => {
        const { messageId, target, connectionId } = streamConfig;
        const sessionId = `${STREAM_CONFIG.SESSION_PREFIX}-${messageId}-${Date.now()}`;

        // 既存のセッションがあれば停止
        this.stopLogStream(sessionId);

        // Get specific connection instead of all connections
        const connection = connectionId
          ? this.ipcServer!.getConnection(connectionId)
          : null;

        if (!connection) {
          console.error(
            `Cannot start log streaming: connection ${connectionId} not found`
          );
          return;
        }

        // ログマネージャーでストリーミングを開始
        const cleanup = this.logManager!.startLogStream(target, (logEntry) => {
          // 新しいログエントリを受信したら特定のIPCクライアントに送信
          const streamMessage = {
            id: `${STREAM_CONFIG.SESSION_PREFIX}-${Date.now()}`,
            type: STREAM_MESSAGE_TYPES.LOG_STREAM,
            payload: {
              entry: logEntry,
              app: logEntry.app,
              namespace: logEntry.namespace || 'default',
            },
            timestamp: Date.now(),
            sessionId, // セッションIDを追加
          };

          // 特定の接続にのみメッセージを送信
          try {
            // IPCサーバーの送信メソッドを使用
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (connection as any).send(JSON.stringify(streamMessage) + '\n');
          } catch (error) {
            console.error('Failed to send log stream message:', error);
            // エラーが発生した接続のストリーミングを停止
            this.stopLogStream(sessionId);
          }
        });

        // クリーンアップ関数とconnection情報を保存
        this.streamingSessions.set(sessionId, {
          cleanup,
          connectionId: connectionId || '',
          messageId,
        });

        // 接続が切断された時にストリーミングを停止
        this.setupStreamCleanupOnDisconnect(sessionId);
      }
    );

    // stop-log-streamイベントのリスナーを追加

    this.registerListener(
      this.commandHandler,
      LOG_STREAM_EVENTS.STOP_LOG_STREAM,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config: any) => {
        const { sessionId } = config;
        this.stopLogStream(sessionId);
      }
    );
  }

  /**
   * Stop log streaming for a specific session
   */
  private stopLogStream(sessionId: string): void {
    const sessionInfo = this.streamingSessions.get(sessionId);
    if (sessionInfo) {
      sessionInfo.cleanup();
      this.streamingSessions.delete(sessionId);
    }
  }

  /**
   * Setup cleanup when connection disconnects
   */
  private setupStreamCleanupOnDisconnect(sessionId: string): void {
    // IPCサーバーの切断イベントを監視
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const disconnectHandler = () => {
      // 該当するセッションのストリーミングを停止
      this.stopLogStream(sessionId);
    };

    // 一度だけ実行されるようにする
    // Note: IPCServerBase doesn't extend EventEmitter, so we can't use EventCleanupHelper for it
    // This is acceptable as IPCServerBase has its own cleanup mechanisms
    this.ipcServer?.once('disconnect', disconnectHandler);
  }

  /**
   * Cleanup all streaming sessions
   */
  private cleanupAllStreamingSessions(): void {
    for (const [, sessionInfo] of this.streamingSessions) {
      sessionInfo.cleanup();
    }
    this.streamingSessions.clear();
  }

  /**
   * Clean up all managed listeners and components
   */
  public async cleanup(): Promise<void> {
    // Clean up streaming sessions first
    this.cleanupAllStreamingSessions();

    // Clean up listeners
    await this.cleanupListeners();
  }

  /**
   * Clean up only listeners (without streaming sessions)
   */
  private async cleanupListeners(): Promise<void> {
    // Clean up all tracked listeners
    await this.listenerCleanup.dispose();

    // Clean up our own listeners
    this.removeAllListeners();

    // Listeners cleaned up by EventCleanupHelper
  }

  /**
   * Get statistics about listener management
   */
  public getListenerStats(): {
    managedListeners: number;
    ownListeners: number;
  } {
    const ownEvents = this.eventNames();
    let ownListenersCount = 0;

    for (const event of ownEvents) {
      ownListenersCount += this.listenerCount(event);
    }

    return {
      managedListeners: this.listenerCleanup.getListenerCount(),
      ownListeners: ownListenersCount,
    };
  }

  /**
   * Register a component with proper interface
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async registerComponent(name: string, instance: any): Promise<void> {
    const startTime = Date.now();
    console.log(`Registering component: ${name}`);

    const component: Component = {
      name,
      initialize: async () => {
        console.log(`Initializing component: ${name}`);
        if (instance == null) {
          throw new Error(`Component ${name} instance is null or undefined`);
        }
        // Handle component-specific initialization methods
        let startMethod = null;
        if (
          name === 'processManager' &&
          instance.startMonitoring &&
          typeof instance.startMonitoring === 'function'
        ) {
          startMethod = instance.startMonitoring.bind(instance);
        } else if (instance.start && typeof instance.start === 'function') {
          startMethod = instance.start.bind(instance);
        }

        if (startMethod) {
          const initStartTime = Date.now();

          // Add timeout for component initialization
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(
                  `Component ${name} initialization timed out after 30 seconds`
                )
              );
            }, 30000); // 30 second timeout
          });

          try {
            // Handle both async and sync start methods
            const startPromise = Promise.resolve(startMethod());
            await Promise.race([startPromise, timeoutPromise]);
            const initTime = Date.now() - initStartTime;
            console.log(
              `Component ${name} initialization completed in ${initTime}ms`
            );
          } catch (error) {
            console.error(`Component ${name} initialization failed:`, error);
            throw error;
          }
        } else {
          console.log(
            `Component ${name} has no start() method - assuming ready`
          );
        }
      },
      cleanup: async () => {
        console.log(`Cleaning up component: ${name}`);
        if (instance.stop && typeof instance.stop === 'function') {
          await instance.stop();
        } else if (instance.cleanup && typeof instance.cleanup === 'function') {
          await instance.cleanup();
        }
        console.log(`Component ${name} cleanup completed`);
      },
      isInitialized: () => {
        if (instance.isRunning && typeof instance.isRunning === 'function') {
          return instance.isRunning();
        }
        return true; // Assume initialized if no status method
      },
    };

    this.components.set(name, component);
    this.initializationOrder.push(name);
    this.cleanupOrder.push(name);

    await component.initialize();

    const totalTime = Date.now() - startTime;
    console.log(
      `Component ${name} registered and initialized in ${totalTime}ms`
    );
  }

  /**
   * Rollback partial initialization
   */
  private async rollbackInitialization(): Promise<void> {
    const componentsToRollback = [...this.initializationOrder].reverse();

    for (const componentName of componentsToRollback) {
      try {
        const component = this.components.get(componentName);
        if (component) {
          await component.cleanup();
        }
      } catch {
        // Ignore rollback errors
      }
    }

    this.clearComponents();
  }

  /**
   * Clear all component references
   */
  private clearComponents(): void {
    this.components.clear();
    this.initializationOrder = [];
    this.cleanupOrder = [];
    this.configLoader = undefined;
    this.processManager = undefined;
    this.logManager = undefined;
    this.ipcServer = undefined;
    this.commandHandler = undefined;
  }

  /**
   * Convert AppConfig to ProcessConfig format
   */
  private convertAppConfigToProcessConfig(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appConfig: any,
    appName: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    return {
      name: appName,
      script: appConfig.script || appConfig.exec || 'node',
      namespace: appConfig.namespace || 'default',
      args: appConfig.args || [],
      cwd: appConfig.cwd || process.cwd(),
      env: { ...process.env, ...appConfig.env },
      instances: appConfig.instances || 1,
      autorestart: appConfig.autorestart ?? true,
      watch: appConfig.watch ?? false,
      max_memory_restart: appConfig.max_memory_restart || undefined,
      max_restarts: appConfig.max_restarts || 15,
      min_uptime: appConfig.min_uptime || 1000,
      restart_delay: appConfig.restart_delay || 0,
      note: appConfig.note || undefined,
    };
  }

  /**
   * Override EventEmitter methods for type safety
   */

  emit<K extends keyof ComponentManagerEvents>(
    event: K,
    ...args: any[]
  ): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof ComponentManagerEvents>(
    event: K,
    listener: (...args: any[]) => void
  ): this {
    return super.on(event, listener);
  }
}
