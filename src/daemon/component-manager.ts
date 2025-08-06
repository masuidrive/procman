/**
 * Component Manager - コンポーネント管理の専門クラス
 *
 * デーモンの各コンポーネントの初期化・クリーンアップを管理する。
 * Single Responsibility Principle に従ってコンポーネント管理のみに特化。
 */

import { EventEmitter } from 'events';
import { ConfigLoader } from '../config/config-loader.js';
import { ProcessManager } from '../process-manager/process-manager.js';
import { LogManager } from '../services/log-manager.js';
import { createIPCServer } from './ipc-factory.js';
import { IPCServerBase } from './ipc-server-base.js';
import { IPCCommandHandler } from './ipc-command-handler.js';
import { DataDirectory } from './data-directory.js';
import { CommandType } from '../shared/ipc.js';

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

  constructor(private dataDirectory: DataDirectory) {
    super();
  }

  /**
   * Initialize all components
   */
  async initializeAll(): Promise<void> {
    this.initializationErrors = [];

    try {
      // Initialize components in order
      await this.initializeConfigLoader();
      await this.initializeProcessManager();
      await this.initializeLogManager();
      await this.initializeIPCServer();
      await this.initializeCommandHandler();

      this.emit('allComponentsStarted');
    } catch (error) {
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
      this.processManager = new ProcessManager();
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
      const socketPath = await this.dataDirectory.getSocketPath();
      this.ipcServer = createIPCServer({ path: socketPath });
      await this.registerComponent('ipcServer', this.ipcServer);
      this.emit('componentStarted', 'ipcServer');
    } catch (error) {
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
  private createDaemonInterface() {
    return {
      getConfigLoader: () => this.configLoader!,
      getProcessManager: () => this.processManager!,
      getLogManager: () => this.logManager!,
      getAllProcessStatuses: async () => {
        // Implementation moved from ProcmanDaemon
        const processInfos = this.processManager!.getAllProcessInfo();

        const statusPromises = processInfos.map(async (info) => {
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

        return Promise.all(statusPromises);
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
          const processNames = allProcesses.map((p) => p.name);
          await this.processManager!.stopProcesses(processNames);
        }

        // Configure new processes
        for (const app of config.apps) {
          await this.processManager!.configureProcess(app);

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
      this.ipcServer.registerHandler(commandType, async (message) => {
        return this.commandHandler!.handleMessage(message);
      });
    }
  }

  /**
   * Register a component with proper interface
   */
  private async registerComponent(name: string, instance: any): Promise<void> {
    const component: Component = {
      name,
      initialize: async () => {
        if (instance.start && typeof instance.start === 'function') {
          await instance.start();
        }
      },
      cleanup: async () => {
        if (instance.stop && typeof instance.stop === 'function') {
          await instance.stop();
        } else if (instance.cleanup && typeof instance.cleanup === 'function') {
          await instance.cleanup();
        }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void
  ): this {
    return super.on(event, listener);
  }
}
