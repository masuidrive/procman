/**
 * Daemon entry point for procman
 *
 * Handles daemon process creation, detachment, and main loop.
 * Can be used both as a module (for starting daemon from CLI) and
 * as a direct entry point (when running as daemon process).
 */

import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { ProcmanDaemon } from './procman-daemon.js';
import { DataDirectory } from './data-directory.js';
import { PIDManager } from './pid-manager.js';

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);

/**
 * Check if daemon is currently running
 */
export async function isDaemonRunning(): Promise<boolean> {
  try {
    const dataDirectory = new DataDirectory();
    await dataDirectory.ensureDataDirectory();

    const pidManager = new PIDManager(dataDirectory);
    return await pidManager.isDaemonRunning();
  } catch {
    return false;
  }
}

/**
 * Start daemon as a detached child process
 * @param args Additional arguments to pass to daemon
 * @returns PID of started daemon process
 */
export async function startDaemon(args: string[] = []): Promise<number> {
  // Check if daemon is already running
  if (await isDaemonRunning()) {
    throw new Error('Daemon is already running');
  }

  // Prepare arguments for daemon process
  const daemonArgs = [__filename, '--daemon', ...args];

  // Spawn detached daemon process
  const child: ChildProcess = spawn(process.execPath, daemonArgs, {
    detached: true,
    stdio: 'ignore',
  });

  // Ensure child process started successfully
  if (!child.pid) {
    throw new Error('Failed to start daemon process');
  }

  // Unref the child so parent process can exit
  child.unref();

  return child.pid;
}

/**
 * Main daemon process function
 * This runs in the actual daemon process (detached child)
 */
async function runDaemonProcess(args: string[]): Promise<void> {
  console.log('Starting procman daemon...');

  try {
    const daemon = new ProcmanDaemon();

    // Setup logging for daemon events
    daemon.on('stateChange', (state) => {
      console.log(`Daemon state changed to: ${state}`);
    });

    daemon.on('error', (error) => {
      console.error('Daemon error:', error);
    });

    daemon.on('componentStarted', (componentName) => {
      console.log(`Component started: ${componentName}`);
    });

    daemon.on('componentStopped', (componentName) => {
      console.log(`Component stopped: ${componentName}`);
    });

    // Start the daemon
    await daemon.start();

    console.log('Procman daemon started successfully');

    // Load configuration if provided
    const configIndex = args.indexOf('--config');
    if (configIndex !== -1 && args[configIndex + 1]) {
      const configPath = args[configIndex + 1];
      console.log(`Loading configuration from: ${configPath}`);
      await daemon.loadConfig(configPath);
    }

    // Keep process alive - the daemon will handle shutdown via signals
    // The ProcmanDaemon class sets up signal handlers that will call daemon.stop()
  } catch (error) {
    console.error('Failed to start daemon:', error);
    process.exit(1);
  }
}

/**
 * Entry point when this file is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check if this should run as daemon process
  const isDaemonMode = process.argv.includes('--daemon');

  if (isDaemonMode) {
    // Running as daemon process
    runDaemonProcess(process.argv.slice(2)).catch((error) => {
      console.error('Daemon process failed:', error);
      process.exit(1);
    });
  } else {
    // Running as CLI command to start daemon
    startDaemon(process.argv.slice(2))
      .then((pid) => {
        console.log(`Daemon started with PID: ${pid}`);
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed to start daemon:', error);
        process.exit(1);
      });
  }
}
