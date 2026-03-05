/**
 * Graceful shutdown orchestration helpers
 *
 * Provides standalone functions for shutdown phases:
 * connection draining, process termination, state preservation, and timeout handling.
 * These are called from ProcmanDaemon's private methods.
 */

import path from 'path';
import type { DataDirectory } from './data-directory.js';
import type { ShutdownReason } from './procman-daemon.js';
import type { IPCServerBase } from './ipc-server-base.js';
import type { ProcessManager } from '../process-manager/process-manager.js';

/**
 * Save shutdown state to disk for recovery/analysis
 */
export async function saveShutdownState(
  dataDirectory: DataDirectory,
  reason: ShutdownReason,
  processManager: ProcessManager | undefined,
  getAllProcessStatusesFn: () => Promise<unknown[]>,
  activeConnectionCount: number
): Promise<void> {
  try {
    const state = {
      timestamp: new Date().toISOString(),
      reason,
      processId: process.pid,
      memoryUsage: process.memoryUsage(),
      processes: processManager ? await getAllProcessStatusesFn() : [],
      activeConnections: activeConnectionCount,
      uptime: process.uptime(),
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    };

    const statePath = path.join(
      dataDirectory.getDataDir(),
      'shutdown-state.json'
    );
    const fs = await import('fs');

    // Ensure directory exists before writing
    const dir = path.dirname(statePath);
    await fs.promises.mkdir(dir, { recursive: true });

    await fs.promises.writeFile(
      statePath,
      JSON.stringify(state, null, 2),
      'utf-8'
    );

    console.log(`[ProcmanDaemon] Shutdown state saved to: ${statePath}`);
  } catch (error) {
    // Non-critical error - log but don't fail shutdown
    console.error('[ProcmanDaemon] Failed to save shutdown state:', error);
  }
}

/**
 * Get count of active IPC connections
 */
export function getActiveConnectionCount(
  ipcServer: IPCServerBase | undefined
): number {
  if (!ipcServer) {
    return 0;
  }
  return ipcServer.getConnections().length;
}

/**
 * Drain active IPC connections gracefully
 */
export async function drainActiveConnections(
  ipcServer: IPCServerBase | undefined
): Promise<void> {
  if (!ipcServer) {
    console.log('[ProcmanDaemon] No IPC server to drain connections from');
    return;
  }

  const connections = ipcServer.getConnections();
  if (connections.length === 0) {
    console.log('[ProcmanDaemon] No active connections to drain');
    return;
  }

  console.log(
    `[ProcmanDaemon] Draining ${connections.length} active connections...`
  );

  // Send shutdown notice to all connections
  ipcServer.broadcast({
    id: `shutdown-notice-${Date.now()}`,
    type: 'ping', // Use existing command type for compatibility
    payload: {
      shutdownNotice: true,
      reason: 'graceful-shutdown',
      gracePeriodMs: 8000, // Give clients 8 seconds to cleanup
    },
    timestamp: Date.now(),
  });

  // Wait for connections to close gracefully
  const drainStartTime = Date.now();
  const maxDrainTime = 8000; // 8 seconds for clients to disconnect

  while (
    ipcServer.getConnections().length > 0 &&
    Date.now() - drainStartTime < maxDrainTime
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100)); // Check every 100ms
  }

  const remainingConnections = ipcServer.getConnections().length;
  if (remainingConnections > 0) {
    console.warn(
      `[ProcmanDaemon] ${remainingConnections} connections did not close gracefully, will force close`
    );
  } else {
    console.log('[ProcmanDaemon] All connections drained successfully');
  }
}

/**
 * Stop all managed processes gracefully
 */
export async function stopManagedProcesses(
  processManager: ProcessManager | undefined
): Promise<void> {
  if (!processManager) {
    console.log('[ProcmanDaemon] No process manager to stop processes from');
    return;
  }

  const allProcesses = processManager.getAllProcessInfo();
  if (allProcesses.length === 0) {
    console.log('[ProcmanDaemon] No managed processes to stop');
    return;
  }

  console.log(
    `[ProcmanDaemon] Stopping ${allProcesses.length} managed processes gracefully...`
  );

  const processNames = allProcesses.map((p) => p.name);
  await processManager.stopProcesses(processNames);

  console.log('[ProcmanDaemon] All managed processes stopped');
}

/**
 * Execute a function with timeout
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  phaseName: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error(`${phaseName} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
