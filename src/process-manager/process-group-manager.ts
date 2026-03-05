/**
 * ProcessGroupManager - Handles process group management and batch operations
 *
 * This class is responsible for:
 * - Namespace-based process grouping
 * - Batch operations on multiple processes
 * - Dependency management foundation
 */

import { EventEmitter } from 'events';
import {
  ProcessGroupManager as IProcessGroupManager,
  NamespaceStatus,
  BatchOperationResult,
  ProcessDependency,
  DependencyResolutionResult,
} from './interfaces/process-group.js';
import { ProcessInfo } from '../shared/process.js';
import { ManagedProcessInfo } from './managed-process-info.js';

/**
 * ProcessGroupManager implementation (simplified for architecture demo)
 */
export class ProcessGroupManagerImpl
  extends EventEmitter
  implements IProcessGroupManager
{
  private readonly processes: Map<string, ManagedProcessInfo>;
  private readonly dependencies: Map<string, ProcessDependency>;
  private readonly processLifecycle: {
    startProcess: (
      name: string
    ) => Promise<{ success: boolean; error?: string }>;
    stopProcess: (
      name: string
    ) => Promise<{ success: boolean; error?: string }>;
    restartProcess: (
      name: string
    ) => Promise<{ success: boolean; error?: string }>;
  };

  constructor(
    processes: Map<string, ManagedProcessInfo>,
    processLifecycle: {
      startProcess: (
        name: string
      ) => Promise<{ success: boolean; error?: string }>;
      stopProcess: (
        name: string
      ) => Promise<{ success: boolean; error?: string }>;
      restartProcess: (
        name: string
      ) => Promise<{ success: boolean; error?: string }>;
    }
  ) {
    super();
    this.processes = processes;
    this.dependencies = new Map();
    this.processLifecycle = processLifecycle;
  }

  /**
   * Get all available namespaces
   */
  public getNamespaces(): string[] {
    const namespaces = new Set<string>();
    for (const managedProcess of Array.from(this.processes.values())) {
      namespaces.add(managedProcess.getNamespace());
    }
    return Array.from(namespaces).sort();
  }

  /**
   * Get status summary for a namespace
   */
  public getNamespaceStatus(namespace: string): NamespaceStatus {
    const processes = this.getProcessesByNamespace(namespace);

    let total = 0;
    let online = 0;
    let stopped = 0;
    let errored = 0;
    let other = 0;

    for (const process of processes) {
      total++;
      switch (process.status) {
        case 'online':
          online++;
          break;
        case 'stopped':
          stopped++;
          break;
        case 'errored':
          errored++;
          break;
        default:
          other++;
          break;
      }
    }

    return {
      namespace,
      total,
      online,
      stopped,
      errored,
      other,
    };
  }

  /**
   * Get all processes in a namespace
   */
  public getProcessesByNamespace(namespace: string): ProcessInfo[] {
    return Array.from(this.processes.values())
      .filter((managedProcess) => managedProcess.getNamespace() === namespace)
      .map((managedProcess) => managedProcess.toProcessInfo());
  }

  /**
   * Get process names in a namespace
   */
  public getProcessNamesByNamespace(namespace: string): string[] {
    return Array.from(this.processes.values())
      .filter((managedProcess) => managedProcess.getNamespace() === namespace)
      .map((managedProcess) => managedProcess.getName());
  }

  /**
   * Start all processes in a namespace
   */
  public async startNamespace(
    namespace: string
  ): Promise<BatchOperationResult> {
    const processNames = this.getProcessNamesByNamespace(namespace);
    this.emit('namespace:operation-start', { namespace, operation: 'start' });

    const result = await this.startProcesses(processNames);

    this.emit('namespace:operation-complete', {
      namespace,
      operation: 'start',
      result,
    });
    return result;
  }

  /**
   * Stop all processes in a namespace
   */
  public async stopNamespace(namespace: string): Promise<BatchOperationResult> {
    const processNames = this.getProcessNamesByNamespace(namespace);
    this.emit('namespace:operation-start', { namespace, operation: 'stop' });

    const result = await this.stopProcesses(processNames);

    this.emit('namespace:operation-complete', {
      namespace,
      operation: 'stop',
      result,
    });
    return result;
  }

  /**
   * Restart all processes in a namespace
   */
  public async restartNamespace(
    namespace: string
  ): Promise<BatchOperationResult> {
    const processNames = this.getProcessNamesByNamespace(namespace);
    this.emit('namespace:operation-start', { namespace, operation: 'restart' });

    const result = await this.restartProcesses(processNames);

    this.emit('namespace:operation-complete', {
      namespace,
      operation: 'restart',
      result,
    });
    return result;
  }

  /**
   * Start multiple processes
   */
  public async startProcesses(names: string[]): Promise<BatchOperationResult> {
    this.emit('batch:operation-start', {
      operation: 'start',
      processCount: names.length,
    });

    const promises = names.map(async (name) => {
      const result = await this.processLifecycle.startProcess(name);
      return {
        name,
        success: result.success,
        error: result.error,
      };
    });

    const results = await Promise.allSettled(promises);
    const finalResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          name: names[index],
          success: false,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        };
      }
    });

    const successCount = finalResults.filter((r) => r.success).length;
    const failureCount = finalResults.length - successCount;

    const batchResult: BatchOperationResult = {
      success: failureCount === 0,
      results: finalResults,
      successCount,
      failureCount,
    };

    this.emit('batch:operation-complete', {
      operation: 'start',
      result: batchResult,
    });
    return batchResult;
  }

  /**
   * Stop multiple processes
   */
  public async stopProcesses(names: string[]): Promise<BatchOperationResult> {
    this.emit('batch:operation-start', {
      operation: 'stop',
      processCount: names.length,
    });

    const promises = names.map(async (name) => {
      const result = await this.processLifecycle.stopProcess(name);
      return {
        name,
        success: result.success,
        error: result.error,
      };
    });

    const results = await Promise.allSettled(promises);
    const finalResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          name: names[index],
          success: false,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        };
      }
    });

    const successCount = finalResults.filter((r) => r.success).length;
    const failureCount = finalResults.length - successCount;

    const batchResult: BatchOperationResult = {
      success: failureCount === 0,
      results: finalResults,
      successCount,
      failureCount,
    };

    this.emit('batch:operation-complete', {
      operation: 'stop',
      result: batchResult,
    });
    return batchResult;
  }

  /**
   * Restart multiple processes
   */
  public async restartProcesses(
    names: string[]
  ): Promise<BatchOperationResult> {
    this.emit('batch:operation-start', {
      operation: 'restart',
      processCount: names.length,
    });

    const promises = names.map(async (name) => {
      const result = await this.processLifecycle.restartProcess(name);
      return {
        name,
        success: result.success,
        error: result.error,
      };
    });

    const results = await Promise.allSettled(promises);
    const finalResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          name: names[index],
          success: false,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        };
      }
    });

    const successCount = finalResults.filter((r) => r.success).length;
    const failureCount = finalResults.length - successCount;

    const batchResult: BatchOperationResult = {
      success: failureCount === 0,
      results: finalResults,
      successCount,
      failureCount,
    };

    this.emit('batch:operation-complete', {
      operation: 'restart',
      result: batchResult,
    });
    return batchResult;
  }

  /**
   * Configure a process dependency
   */
  public configureDependency(dependency: ProcessDependency): void {
    // Validate that the process exists
    if (!this.processes.has(dependency.name)) {
      throw new Error(`Process '${dependency.name}' not found`);
    }

    // Validate that all dependent processes exist
    if (dependency.dependsOn) {
      for (const depName of dependency.dependsOn) {
        if (!this.processes.has(depName)) {
          throw new Error(`Dependent process '${depName}' not found`);
        }
      }
    }

    this.dependencies.set(dependency.name, dependency);
    this.emit('dependency:configured', { dependency });
  }

  /**
   * Remove a process dependency
   */
  public removeDependency(name: string): void {
    this.dependencies.delete(name);
    this.emit('dependency:removed', { name });
  }

  /**
   * Get dependency configuration for a process
   */
  public getDependency(name: string): ProcessDependency | undefined {
    return this.dependencies.get(name);
  }

  /**
   * Get all dependency configurations
   */
  public getAllDependencies(): ProcessDependency[] {
    return Array.from(this.dependencies.values());
  }

  /**
   * Resolve dependencies for a set of processes
   */
  public resolveDependencies(names: string[]): DependencyResolutionResult {
    // Build dependency graph
    const dependencyGraph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    // Initialize graph
    for (const name of names) {
      dependencyGraph.set(name, new Set());
      inDegree.set(name, 0);
    }

    // Build edges based on dependencies
    for (const name of names) {
      const dependency = this.dependencies.get(name);
      if (dependency && dependency.dependsOn) {
        for (const dep of dependency.dependsOn) {
          if (names.includes(dep)) {
            dependencyGraph.get(dep)?.add(name);
            inDegree.set(name, (inDegree.get(name) || 0) + 1);
          }
        }
      }
    }

    // Topological sort to find startup order
    const independent: string[] = [];
    const dependent: string[][] = [];
    const visited = new Set<string>();
    const queue: string[] = [];

    // Find nodes with no dependencies
    for (const [name, degree] of inDegree) {
      if (degree === 0) {
        queue.push(name);
        independent.push(name);
        visited.add(name);
      }
    }

    // Process dependencies level by level
    while (queue.length > 0) {
      const currentLevel: string[] = [];
      const nextQueue: string[] = [];

      // Process all nodes at current level
      for (const current of queue) {
        const neighbors = dependencyGraph.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            const newDegree = (inDegree.get(neighbor) || 0) - 1;
            inDegree.set(neighbor, newDegree);

            if (newDegree === 0) {
              nextQueue.push(neighbor);
              currentLevel.push(neighbor);
              visited.add(neighbor);
            }
          }
        }
      }

      if (currentLevel.length > 0) {
        dependent.push(currentLevel);
      }

      queue.length = 0;
      queue.push(...nextQueue);
    }

    // Check for circular dependencies
    const circular: string[] = [];
    for (const name of names) {
      if (!visited.has(name)) {
        circular.push(name);
      }
    }

    // Return result in expected format for tests
    const startupOrder: string[][] = [];
    if (independent.length > 0) {
      startupOrder.push(independent);
    }
    startupOrder.push(...dependent);

    return {
      independent,
      dependent,
      circular,
      startupOrder,
      circularDependencies: circular,
      unresolvedProcesses: [],
    };
  }

  /**
   * Start processes with dependency resolution
   */
  public async startProcessesWithDependencies(
    names: string[]
  ): Promise<BatchOperationResult> {
    // For now, just start them all without dependency resolution
    return this.startProcesses(names);
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Clear all dependencies
    this.dependencies.clear();
  }
}
