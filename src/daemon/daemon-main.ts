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
    const dataDirectory = new DataDirectory(process.env.PROCMAN_SOCKET_PATH);
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
  const daemonStartTime = Date.now();
  console.error('[DEBUG-DAEMON-MAIN] Starting procman daemon...');
  console.error(
    '[DEBUG-DAEMON-MAIN] Daemon process info:',
    JSON.stringify(
      {
        processId: process.pid,
        parentPid: process.ppid,
        arguments: args,
        startTime: new Date().toISOString(),
        workingDirectory: process.cwd(),
        environment: {
          HOME: process.env.HOME,
          PROCMAN_SOCKET_PATH: process.env.PROCMAN_SOCKET_PATH,
          USER: process.env.USER,
          NODE_ENV: process.env.NODE_ENV,
        },
      },
      null,
      2
    )
  );

  try {
    console.error('[DEBUG-DAEMON-MAIN] Creating ProcmanDaemon instance...');
    const daemon = new ProcmanDaemon();

    console.error('[DEBUG-DAEMON-MAIN] Setting up daemon event handlers...');
    // Setup logging for daemon events
    daemon.on('stateChange', (state) => {
      console.error(`[DEBUG-DAEMON-MAIN] Daemon state changed to: ${state}`);
    });

    daemon.on('error', (error) => {
      console.error('[DEBUG-DAEMON-MAIN] Daemon error:', error);
    });

    daemon.on('componentStarted', (componentName) => {
      console.error(`[DEBUG-DAEMON-MAIN] Component started: ${componentName}`);
    });

    daemon.on('componentStopped', (componentName) => {
      console.error(`[DEBUG-DAEMON-MAIN] Component stopped: ${componentName}`);
    });

    console.error('[DEBUG-DAEMON-MAIN] Starting daemon core services...');
    // Start the daemon
    await daemon.start();

    const startupTime = Date.now() - daemonStartTime;
    console.error('[DEBUG-DAEMON-MAIN] ✓ Procman daemon started successfully');
    console.error(
      '[DEBUG-DAEMON-MAIN] Startup stats:',
      JSON.stringify(
        {
          startupTimeMs: startupTime,
          daemonPid: process.pid,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    // Load configuration if provided
    const configIndex = args.indexOf('--config');
    if (configIndex !== -1 && args[configIndex + 1]) {
      const configPath = args[configIndex + 1];
      console.error(
        `[DEBUG-DAEMON-MAIN] Loading configuration from: ${configPath}`
      );
      try {
        await daemon.loadConfig(configPath);
        console.error(
          '[DEBUG-DAEMON-MAIN] ✓ Configuration loaded successfully'
        );
      } catch (configError) {
        console.error(
          '[DEBUG-DAEMON-MAIN] ❌ Failed to load configuration:',
          configError
        );
      }
    } else {
      console.error('[DEBUG-DAEMON-MAIN] No configuration file specified');
    }

    console.error(
      '[DEBUG-DAEMON-MAIN] Daemon is now ready to accept connections'
    );
    // Keep process alive - the daemon will handle shutdown via signals
    // The ProcmanDaemon class sets up signal handlers that will call daemon.stop()
  } catch (error) {
    const startupTime = Date.now() - daemonStartTime;
    console.error('[DEBUG-DAEMON-MAIN] ❌ Failed to start daemon');
    console.error(
      '[DEBUG-DAEMON-MAIN] Failure stats:',
      JSON.stringify(
        {
          startupTimeMs: startupTime,
          processId: process.pid,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        null,
        2
      )
    );
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
