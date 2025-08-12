/**
 * IPC Factory
 *
 * Factory class for creating appropriate IPC server/client instances
 * based on the current platform (Unix Domain Socket for Unix-like systems,
 * Named Pipe for Windows).
 */

import * as os from 'os';
import * as path from 'path';
import { IPCServerBase } from './ipc-server-base.js';
import { IPCClientBase } from './ipc-client-base.js';
import { UnixSocketServer } from './unix-socket-server.js';
import { UnixSocketClient } from './unix-socket-client.js';
import { NamedPipeServer } from './named-pipe-server.js';
import { NamedPipeClient } from './named-pipe-client.js';
import type { IPCServerConfig, IPCClientConfig } from '../shared/ipc.js';
import { PLATFORM_CONSTANTS } from '../shared/constants.js';

/**
 * Platform types
 */
export type Platform = 'unix' | 'windows';

/**
 * IPC Factory class
 */
export class IPCFactory {
  /**
   * Get current platform
   */
  static getCurrentPlatform(): Platform {
    return os.platform() === 'win32' ? 'windows' : 'unix';
  }

  /**
   * Create an IPC server for the current platform
   */
  static createServer(config: IPCServerConfig = { path: '' }): IPCServerBase {
    const platform = this.getCurrentPlatform();
    return this.createServerForPlatform(platform, config);
  }

  /**
   * Create an IPC client for the current platform
   */
  static createClient(config: IPCClientConfig = { path: '' }): IPCClientBase {
    const platform = this.getCurrentPlatform();
    return this.createClientForPlatform(platform, config);
  }

  /**
   * Create an IPC server for a specific platform
   */
  static createServerForPlatform(
    platform: Platform,
    config: IPCServerConfig = { path: '' }
  ): IPCServerBase {
    const mergedConfig = this.mergeConfigWithDefaults(platform, config);

    switch (platform) {
      case 'unix':
        return new UnixSocketServer(mergedConfig);
      case 'windows':
        return new NamedPipeServer(mergedConfig);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Create an IPC client for a specific platform
   */
  static createClientForPlatform(
    platform: Platform,
    config: IPCClientConfig = { path: '' }
  ): IPCClientBase {
    const mergedConfig = this.mergeConfigWithDefaults(platform, config);

    switch (platform) {
      case 'unix':
        return new UnixSocketClient(mergedConfig);
      case 'windows':
        return new NamedPipeClient(mergedConfig);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Get default IPC path for the current platform
   */
  static getDefaultIPCPath(): string {
    console.error('[DEBUG-IPC-FACTORY] Getting default IPC path...');
    console.error(
      '[DEBUG-IPC-FACTORY] Environment check:',
      JSON.stringify(
        {
          PROCMAN_SOCKET_PATH: process.env.PROCMAN_SOCKET_PATH,
          HOME: process.env.HOME,
          USERPROFILE: process.env.USERPROFILE,
          platform: this.getCurrentPlatform(),
          processId: process.pid,
        },
        null,
        2
      )
    );

    // Check for environment variable first
    if (process.env.PROCMAN_SOCKET_PATH) {
      console.error(
        '[DEBUG-IPC-FACTORY] Using PROCMAN_SOCKET_PATH from environment:',
        process.env.PROCMAN_SOCKET_PATH
      );
      return process.env.PROCMAN_SOCKET_PATH;
    }

    const platform = this.getCurrentPlatform();
    const defaultPath = this.getDefaultIPCPathForPlatform(platform);
    console.error(
      '[DEBUG-IPC-FACTORY] Using default platform path:',
      defaultPath
    );
    return defaultPath;
  }

  /**
   * Get default IPC path for a specific platform
   */
  static getDefaultIPCPathForPlatform(platform: Platform): string {
    switch (platform) {
      case 'unix':
        return PLATFORM_CONSTANTS.UNIX.IPC_PATH;
      case 'windows':
        return PLATFORM_CONSTANTS.WINDOWS.IPC_PATH;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Check if the current platform supports IPC
   */
  static isPlatformSupported(): boolean {
    return this.isPlatformSupportedForPlatform(this.getCurrentPlatform());
  }

  /**
   * Check if a specific platform supports IPC
   */
  static isPlatformSupportedForPlatform(platform: Platform): boolean {
    return platform === 'unix' || platform === 'windows';
  }

  /**
   * Get platform-specific constants
   */
  static getPlatformConstants(
    platform?: Platform
  ): typeof PLATFORM_CONSTANTS.UNIX | typeof PLATFORM_CONSTANTS.WINDOWS {
    const targetPlatform = platform || this.getCurrentPlatform();

    switch (targetPlatform) {
      case 'unix':
        return PLATFORM_CONSTANTS.UNIX;
      case 'windows':
        return PLATFORM_CONSTANTS.WINDOWS;
      default:
        throw new Error(`Unsupported platform: ${targetPlatform}`);
    }
  }

  /**
   * Expand tilde in file paths
   */
  private static expandPath(filePath: string): string {
    console.error('[DEBUG-IPC-FACTORY] Expanding path:', filePath);

    if (filePath.startsWith('~/')) {
      // Enhanced HOME detection: process.env.HOME || os.homedir()
      const envHome = process.env.HOME;
      const osHome = os.homedir();
      const homeDir = envHome || osHome;

      console.error(
        '[DEBUG-IPC-FACTORY] Home directory resolution:',
        JSON.stringify(
          {
            originalPath: filePath,
            envHome: envHome,
            osHome: osHome,
            selectedHome: homeDir,
            processId: process.pid,
          },
          null,
          2
        )
      );

      if (!homeDir) {
        console.error(
          '[DEBUG-IPC-FACTORY] ❌ Unable to resolve home directory'
        );
        throw new Error('Unable to resolve home directory for path expansion');
      }

      const expandedPath = path.join(homeDir, filePath.slice(2));
      console.error(
        '[DEBUG-IPC-FACTORY] Path expanded successfully:',
        expandedPath
      );
      return expandedPath;
    }

    console.error(
      '[DEBUG-IPC-FACTORY] Path does not need expansion:',
      filePath
    );
    return filePath;
  }

  /**
   * Merge user config with platform defaults
   */
  private static mergeConfigWithDefaults(
    platform: Platform,
    config: IPCServerConfig | IPCClientConfig
  ): IPCServerConfig | IPCClientConfig {
    const defaultPath = this.getDefaultIPCPathForPlatform(platform);

    if (platform === 'unix') {
      const socketPath = config.path || config.socketPath || defaultPath;
      return {
        socketPath: this.expandPath(socketPath),
        ...config,
      };
    } else {
      const namedPipePath = config.path || config.namedPipePath || defaultPath;
      return {
        namedPipePath: namedPipePath, // Named pipes don't need path expansion
        ...config,
      };
    }
  }
}

/**
 * Convenience functions for creating IPC instances
 */

/**
 * Create an IPC server for the current platform
 */
export function createIPCServer(config?: IPCServerConfig): IPCServerBase {
  return IPCFactory.createServer(config);
}

/**
 * Create an IPC client for the current platform
 */
export function createIPCClient(config?: IPCClientConfig): IPCClientBase {
  return IPCFactory.createClient(config);
}

/**
 * Get the default IPC path for the current platform
 */
export function getDefaultIPCPath(): string {
  return IPCFactory.getDefaultIPCPath();
}

/**
 * Check if IPC is supported on the current platform
 */
export function isIPCSupported(): boolean {
  return IPCFactory.isPlatformSupported();
}

/**
 * Get current platform type
 */
export function getCurrentPlatform(): Platform {
  return IPCFactory.getCurrentPlatform();
}
