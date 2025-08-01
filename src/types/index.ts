/**
 * Basic type definitions for procman
 */

export interface ProcessInfo {
  pid: number;
  name: string;
  status: 'running' | 'stopped' | 'crashed';
}

export interface ServiceConfig {
  name: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
}

export interface CliOptions {
  verbose?: boolean;
  config?: string;
}
