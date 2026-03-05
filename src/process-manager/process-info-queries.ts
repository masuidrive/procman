/**
 * Process information query utilities
 *
 * This module contains functions for querying process information,
 * namespace status, and other read-only operations on the process map.
 */

import { ManagedProcessInfo } from './managed-process-info.js';
import { ProcessInfo } from '../shared/process.js';

/**
 * Get process information by name
 */
export function getProcessInfo(
  processes: Map<string, ManagedProcessInfo>,
  name: string
): ProcessInfo | undefined {
  const processInfo = processes.get(name);
  return processInfo?.getProcessInfo();
}

/**
 * Get all process information
 */
export function getAllProcessInfo(
  processes: Map<string, ManagedProcessInfo>
): ProcessInfo[] {
  return Array.from(processes.values()).map((p) => p.getProcessInfo());
}

/**
 * Get processes by namespace
 */
export function getProcessesByNamespace(
  processes: Map<string, ManagedProcessInfo>,
  namespace: string
): ProcessInfo[] {
  return Array.from(processes.values())
    .filter((p) => p.getProcessInfo().namespace === namespace)
    .map((p) => p.getProcessInfo());
}

/**
 * Get process names by namespace
 */
export function getProcessNamesByNamespace(
  processes: Map<string, ManagedProcessInfo>,
  namespace: string
): string[] {
  return Array.from(processes.values())
    .filter((p) => p.getProcessInfo().namespace === namespace)
    .map((p) => p.getProcessInfo().name);
}

/**
 * Get all namespaces
 */
export function getNamespaces(
  processes: Map<string, ManagedProcessInfo>
): string[] {
  const namespaces = new Set<string>();
  for (const processInfo of processes.values()) {
    namespaces.add(processInfo.getProcessInfo().namespace || 'default');
  }
  return Array.from(namespaces).sort();
}

/**
 * Get namespace status summary
 */
export function getNamespaceStatus(
  processes: Map<string, ManagedProcessInfo>,
  namespace: string
): {
  total: number;
  online: number;
  stopped: number;
  errored: number;
  starting: number;
  stopping: number;
} {
  const namespaceProcesses = getProcessesByNamespace(processes, namespace);
  const status = {
    total: namespaceProcesses.length,
    online: 0,
    stopped: 0,
    errored: 0,
    starting: 0,
    stopping: 0,
  };

  for (const process of namespaceProcesses) {
    switch (process.status) {
      case 'online':
        status.online++;
        break;
      case 'stopped':
        status.stopped++;
        break;
      case 'errored':
        status.errored++;
        break;
      case 'starting':
        status.starting++;
        break;
      case 'stopping':
        status.stopping++;
        break;
    }
  }

  return status;
}

/**
 * Get all process names sorted alphabetically
 */
export function getProcessNames(
  processes: Map<string, ManagedProcessInfo>
): string[] {
  return Array.from(processes.keys()).sort();
}

/**
 * Check if process exists
 */
export function hasProcess(
  processes: Map<string, ManagedProcessInfo>,
  name: string
): boolean {
  return processes.has(name);
}
