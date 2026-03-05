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
import {
  Component,
  ComponentManagerEvents,
} from './component-manager-types.js';
import {
  ComponentInitializationError,
  ComponentCleanupError,
} from './component-manager-errors.js';
import { StreamingSessionManager } from './component-streaming.js';
import { performHealthChecks, HealthCheckResult } from './component-health.js';
import { createComponentWrapper } from './component-registration.js';
import { createDaemonInterface } from './component-daemon-interface.js';
import { wireCommandHandlers } from './component-command-wiring.js';

// Re-export everything for backward compatibility
export {
  Component,
  ComponentManagerEvents,
} from './component-manager-types.js';
export {
  ComponentInitializationError,
  ComponentCleanupError,
} from './component-manager-errors.js';
export { StreamingSessionManager } from './component-streaming.js';
export {
  performHealthChecks,
  ComponentHealthStatus,
  HealthCheckResult,
  HealthCheckTargets,
} from './component-health.js';
export {
  createComponentWrapper,
  convertAppConfigToProcessConfig,
} from './component-registration.js';
export {
  createDaemonInterface,
  DaemonInterfaceDeps,
} from './component-daemon-interface.js';
export { wireCommandHandlers } from './component-command-wiring.js';

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

  // Streaming session manager
  private readonly streamingManager = new StreamingSessionManager();

  constructor(private dataDirectory: DataDirectory) {
    super();
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

    const steps: [string, () => Promise<void>][] = [
      ['ConfigLoader', () => this.initializeConfigLoader()],
      ['ProcessManager', () => this.initializeProcessManager()],
      ['LogManager', () => this.initializeLogManager()],
      ['IPCServer', () => this.initializeIPCServer()],
      ['CommandHandler', () => this.initializeCommandHandler()],
    ];

    try {
      console.log('Starting daemon component initialization...');

      for (const [name, initFn] of steps) {
        console.log(`Initializing ${name}...`);
        await initFn();
        console.log(`${name} initialized successfully`);
      }

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
    this.streamingManager.cleanupAllStreamingSessions();

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

    // Clean up listener management
    await this.cleanupListeners();

    this.emit('allComponentsStopped');

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
   */
  async performHealthChecks(): Promise<HealthCheckResult> {
    return performHealthChecks({
      configLoader: this.configLoader,
      processManager: this.processManager,
      logManager: this.logManager,
      ipcServer: this.ipcServer,
      commandHandler: this.commandHandler,
    });
  }

  /**
   * Get initialization errors
   */
  getInitializationErrors(): ComponentInitializationError[] {
    return [...this.initializationErrors];
  }

  /**
   * Helper to initialize a component with standard error handling
   */
  private async initializeWithErrorHandling(
    componentName: string,
    initFn: () => Promise<void>
  ): Promise<void> {
    try {
      await initFn();
      this.emit('componentStarted', componentName);
    } catch (error) {
      if (componentName === 'ipcServer') {
        console.error('IPC server initialization failed:', error);
      }
      const initError = new ComponentInitializationError(
        componentName,
        error as Error
      );
      this.initializationErrors.push(initError);
      this.emit('componentError', componentName, initError);
      throw initError;
    }
  }

  /**
   * Initialize config loader
   */
  private async initializeConfigLoader(): Promise<void> {
    await this.initializeWithErrorHandling('configLoader', async () => {
      this.configLoader = new ConfigLoader();
      await this.registerComponent('configLoader', this.configLoader);
    });
  }

  /**
   * Initialize process manager
   */
  private async initializeProcessManager(): Promise<void> {
    await this.initializeWithErrorHandling('processManager', async () => {
      this.processManager = ProcessManager.create();
      await this.registerComponent('processManager', this.processManager);
    });
  }

  /**
   * Initialize log manager
   */
  private async initializeLogManager(): Promise<void> {
    await this.initializeWithErrorHandling('logManager', async () => {
      const logDir = await this.dataDirectory.getLogDirectory();
      this.logManager = new LogManager(logDir);
      await this.registerComponent('logManager', this.logManager);
    });
  }

  /**
   * Initialize IPC server
   */
  private async initializeIPCServer(): Promise<void> {
    await this.initializeWithErrorHandling('ipcServer', async () => {
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
    });
  }

  /**
   * Initialize command handler
   */
  private async initializeCommandHandler(): Promise<void> {
    await this.initializeWithErrorHandling('commandHandler', async () => {
      if (
        !this.configLoader ||
        !this.processManager ||
        !this.logManager ||
        !this.ipcServer
      ) {
        throw new Error('Required components not initialized');
      }

      const daemonInterface = this.createDaemonInterface();
      this.commandHandler = new IPCCommandHandler(daemonInterface);
      await this.registerComponent('commandHandler', this.commandHandler);

      // Register command handlers with IPC server
      this.registerCommandHandlers();
    });
  }

  /**
   * Create daemon interface for command handler
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private createDaemonInterface() {
    return createDaemonInterface({
      getConfigLoader: () => this.configLoader!,
      getProcessManager: () => this.processManager!,
      getLogManager: () => this.logManager!,
      cleanupAll: () => this.cleanupAll(),
    });
  }

  /**
   * Register command handlers with IPC server
   */
  private registerCommandHandlers(): void {
    if (!this.ipcServer || !this.commandHandler) {
      return;
    }

    wireCommandHandlers({
      ipcServer: this.ipcServer,
      commandHandler: this.commandHandler,
      logManager: this.logManager!,
      streamingManager: this.streamingManager,
      registerListener: this.registerListener.bind(this),
    });
  }

  /**
   * Clean up all managed listeners and components
   */
  public async cleanup(): Promise<void> {
    this.streamingManager.cleanupAllStreamingSessions();
    await this.cleanupListeners();
  }

  /**
   * Clean up only listeners (without streaming sessions)
   */
  private async cleanupListeners(): Promise<void> {
    await this.listenerCleanup.dispose();
    this.removeAllListeners();
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

    const component = createComponentWrapper(name, instance);

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
