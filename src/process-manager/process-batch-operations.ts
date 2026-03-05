/**
 * Process batch operations and dependency management utilities
 *
 * This module contains functions for batch process operations (start/stop/restart
 * multiple processes or namespaces) and dependency management, delegating to
 * the ProcessGroupManager component.
 */

import { ProcessGroupManager } from './interfaces';
import { ProcessDependency } from './interfaces/process-group.js';

/**
 * Result type for batch operations
 */
export type BatchOperationResult = {
  name: string;
  success: boolean;
  error?: string;
}[];

/**
 * Start multiple processes
 */
export async function startProcesses(
  groups: ProcessGroupManager,
  names: string[]
): Promise<BatchOperationResult> {
  const result = await groups.startProcesses(names);
  return result.results;
}

/**
 * Stop multiple processes
 */
export async function stopProcesses(
  groups: ProcessGroupManager,
  names: string[]
): Promise<BatchOperationResult> {
  const result = await groups.stopProcesses(names);
  return result.results;
}

/**
 * Restart multiple processes
 */
export async function restartProcesses(
  groups: ProcessGroupManager,
  names: string[]
): Promise<BatchOperationResult> {
  const result = await groups.restartProcesses(names);
  return result.results;
}

/**
 * Start all processes in a namespace
 */
export async function startNamespace(
  groups: ProcessGroupManager,
  namespace: string
): Promise<BatchOperationResult> {
  const result = await groups.startNamespace(namespace);
  return result.results;
}

/**
 * Stop all processes in a namespace
 */
export async function stopNamespace(
  groups: ProcessGroupManager,
  namespace: string
): Promise<BatchOperationResult> {
  const result = await groups.stopNamespace(namespace);
  return result.results;
}

/**
 * Restart all processes in a namespace
 */
export async function restartNamespace(
  groups: ProcessGroupManager,
  namespace: string
): Promise<BatchOperationResult> {
  const result = await groups.restartNamespace(namespace);
  return result.results;
}

/**
 * Configure a process dependency
 */
export function configureDependency(
  groups: ProcessGroupManager,
  dependency: ProcessDependency
): void {
  groups.configureDependency(dependency);
}

/**
 * Remove a process dependency
 */
export function removeDependency(
  groups: ProcessGroupManager,
  name: string
): void {
  groups.removeDependency(name);
}

/**
 * Get process dependency
 */
export function getDependency(
  groups: ProcessGroupManager,
  name: string
): ProcessDependency | undefined {
  return groups.getDependency(name);
}

/**
 * Get all dependencies
 */
export function getAllDependencies(
  groups: ProcessGroupManager
): ProcessDependency[] {
  return groups.getAllDependencies();
}

/**
 * Resolve dependencies for a set of processes
 */
export function resolveDependencies(
  groups: ProcessGroupManager,
  names: string[]
): ReturnType<ProcessGroupManager['resolveDependencies']> {
  return groups.resolveDependencies(names);
}
