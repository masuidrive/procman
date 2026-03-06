/**
 * Port Detector - Detect listening ports for a given process PID
 *
 * Uses lsof (macOS) or ss (Linux) to detect which ports a process is listening on.
 */

import { execFile as execFileCb } from 'child_process';

const DETECTION_TIMEOUT_MS = 3000;

/**
 * Parse lsof output to extract listening ports for a specific PID
 */
export function parseLsofOutput(stdout: string, pid: number): number[] {
  const ports = new Set<number>();
  const lines = stdout.split('\n');

  for (const line of lines) {
    // Match lines with (LISTEN) that belong to our PID
    if (!line.includes('(LISTEN)')) continue;

    // lsof columns: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    const fields = line.trim().split(/\s+/);
    if (fields.length < 10) continue;

    const linePid = parseInt(fields[1], 10);
    if (linePid !== pid) continue;

    // NAME field is before "(LISTEN)", e.g. "*:3000 (LISTEN)"
    const listenIdx = fields.indexOf('(LISTEN)');
    if (listenIdx < 1) continue;
    const addrPart = fields[listenIdx - 1];
    const colonIdx = addrPart.lastIndexOf(':');
    if (colonIdx === -1) continue;

    const portStr = addrPart.substring(colonIdx + 1);
    const port = parseInt(portStr, 10);
    if (!isNaN(port) && port > 0 && port <= 65535) {
      ports.add(port);
    }
  }

  return Array.from(ports).sort((a, b) => a - b);
}

/**
 * Parse ss output to extract listening ports for a specific PID
 */
export function parseSsOutput(stdout: string, pid: number): number[] {
  const ports = new Set<number>();
  const lines = stdout.split('\n');

  for (const line of lines) {
    // ss -tlnp output: State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
    // Check if this line contains our PID
    const pidPattern = new RegExp(`pid=${pid}[,)]`);
    if (!pidPattern.test(line)) continue;

    // Extract port from Local Address:Port (4th column)
    const fields = line.trim().split(/\s+/);
    if (fields.length < 5) continue;

    const localAddr = fields[3]; // e.g. "0.0.0.0:3000" or "*:8080" or "[::]:3000"
    const colonIdx = localAddr.lastIndexOf(':');
    if (colonIdx === -1) continue;

    const portStr = localAddr.substring(colonIdx + 1);
    const port = parseInt(portStr, 10);
    if (!isNaN(port) && port > 0 && port <= 65535) {
      ports.add(port);
    }
  }

  return Array.from(ports).sort((a, b) => a - b);
}

/** Options for detectListeningPorts, mainly for testing DI */
export interface DetectPortsOptions {
  execFile?: typeof execFileCb;
  timeout?: number;
}

/**
 * Detect listening TCP ports for a given PID
 *
 * Returns sorted array of port numbers. Returns empty array on any error.
 */
export async function detectListeningPorts(
  pid: number,
  options?: DetectPortsOptions
): Promise<number[]> {
  const exec = options?.execFile ?? execFileCb;
  const timeout = options?.timeout ?? DETECTION_TIMEOUT_MS;

  try {
    if (process.platform === 'darwin') {
      return await detectWithLsof(pid, exec, timeout);
    } else if (process.platform === 'linux') {
      return await detectWithSs(pid, exec, timeout);
    }
    // Unsupported platform
    return [];
  } catch {
    return [];
  }
}

function detectWithLsof(
  pid: number,
  exec: typeof execFileCb,
  timeout: number
): Promise<number[]> {
  return new Promise((resolve) => {
    exec(
      'lsof',
      ['-i', '-P', '-n', '-p', String(pid)],
      { timeout, encoding: 'utf8' },
      (error, stdout) => {
        if (error || !stdout) {
          resolve([]);
          return;
        }
        resolve(parseLsofOutput(stdout as string, pid));
      }
    );
  });
}

function detectWithSs(
  pid: number,
  exec: typeof execFileCb,
  timeout: number
): Promise<number[]> {
  return new Promise((resolve) => {
    exec('ss', ['-tlnp'], { timeout, encoding: 'utf8' }, (error, stdout) => {
      if (error || !stdout) {
        resolve([]);
        return;
      }
      resolve(parseSsOutput(stdout as string, pid));
    });
  });
}
