/**
 * Process event forwarding utilities
 *
 * This module contains functions for setting up event forwarding
 * between ProcessManager components and the main ProcessManager facade.
 */

import { EventEmitter } from 'events';
import { ManagedProcessInfo } from './managed-process-info.js';
import {
  ProcessLifecycleManager,
  ProcessMonitor,
  ProcessPersistence,
  ProcessGroupManager,
} from './interfaces';

/**
 * Set up event forwarding from components to the main ProcessManager emitter
 */
export function setupEventForwarding(
  emitter: EventEmitter,
  processes: Map<string, ManagedProcessInfo>,
  lifecycle: ProcessLifecycleManager,
  monitor: ProcessMonitor,
  persistence: ProcessPersistence,
  groups: ProcessGroupManager
): void {
  // Cast components to EventEmitter for event forwarding
  const lifecycleEmitter = lifecycle as unknown as EventEmitter;
  const monitorEmitter = monitor as unknown as EventEmitter;
  const persistenceEmitter = persistence as unknown as EventEmitter;
  const groupsEmitter = groups as unknown as EventEmitter;

  // Forward lifecycle events
  lifecycleEmitter.on('process:started', (name: string) => {
    const processInfo = processes.get(name)?.getProcessInfo();
    if (processInfo) {
      emitter.emit('process:started', name, processInfo);
    }
  });
  lifecycleEmitter.on('process:stopped', (name: string) => {
    const processInfo = processes.get(name)?.getProcessInfo();
    if (processInfo) {
      emitter.emit('process:stopped', name, processInfo);
    }
  });
  lifecycleEmitter.on(
    'process:exit',
    (name: string, code: number | null, signal: string | null) => {
      emitter.emit('process:exit', name, code, signal);
    }
  );
  lifecycleEmitter.on('process:error', (name: string, error: Error) => {
    emitter.emit('process:error', name, error);
  });
  lifecycleEmitter.on('process:restart', (name: string) => {
    emitter.emit('process:restart', name);
  });
  lifecycleEmitter.on('process:restarted', (name: string) => {
    emitter.emit('process:restarted', name);
  });

  // Forward monitor events
  monitorEmitter.on(
    'process:memory-limit',
    (data: { name: string; usage: number; limit: number }) => {
      emitter.emit('process:memory-limit', data.name, data.usage, data.limit);
    }
  );
  monitorEmitter.on(
    'process:unhealthy',
    (data: { name: string; consecutiveFailures: number }) => {
      emitter.emit('process:unhealthy', data.name, data.consecutiveFailures);
    }
  );
  monitorEmitter.on('process:died', (data: { name: string }) => {
    emitter.emit('process:died', data.name);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monitorEmitter.on('process:stats', (data: { name: string; stats: any }) => {
    emitter.emit('process:stats', data.name, data.stats);
  });

  // Forward persistence events
  persistenceEmitter.on('persistence:saved', (filePath: string) => {
    emitter.emit('persistence:saved', filePath);
  });
  persistenceEmitter.on('persistence:save-error', (error: Error) => {
    emitter.emit('persistence:save-error', error);
  });
  persistenceEmitter.on(
    'persistence:loaded',
    (filePath: string, processCount: number) => {
      emitter.emit('persistence:loaded', filePath, processCount);
    }
  );
  persistenceEmitter.on('persistence:load-error', (error: Error) => {
    emitter.emit('persistence:load-error', error);
  });

  // Forward group events
  groupsEmitter.on(
    'namespace:operation-start',
    (namespace: string, operation: string) => {
      emitter.emit('namespace:operation-start', namespace, operation);
    }
  );
  groupsEmitter.on(
    'namespace:operation-complete',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (namespace: string, operation: string, results: any) => {
      emitter.emit(
        'namespace:operation-complete',
        namespace,
        operation,
        results
      );
    }
  );
  groupsEmitter.on(
    'batch:operation-start',
    (processNames: string[], operation: string) => {
      emitter.emit('batch:operation-start', processNames, operation);
    }
  );
  groupsEmitter.on(
    'batch:operation-complete',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (operation: string, results: any) => {
      emitter.emit('batch:operation-complete', operation, results);
    }
  );
}

/**
 * Set up internal event handlers for process management (e.g., memory limit auto-restart)
 */
export function setupInternalEventHandlers(
  emitter: EventEmitter,
  processes: Map<string, ManagedProcessInfo>,
  restartProcess: (name: string) => Promise<void>
): void {
  // Handle memory limit exceeded - trigger restart
  emitter.on(
    'process:memory-limit',
    async (name: string, usage: number, limit: number) => {
      console.log(
        `Process '${name}' exceeded memory limit: ${Math.round(usage / 1024 / 1024)}MB > ${Math.round(limit / 1024 / 1024)}MB`
      );

      const managedProcess = processes.get(name);
      if (managedProcess && managedProcess.isAutoRestartEnabled()) {
        console.log(`Auto-restarting process '${name}' due to memory limit`);
        try {
          await restartProcess(name);
        } catch (error) {
          console.error(
            `Failed to restart process '${name}' after memory limit:`,
            error
          );
        }
      }
    }
  );
}
