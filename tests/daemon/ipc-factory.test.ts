/**
 * IPC Factory Tests
 *
 * Unit tests for the IPC factory and platform detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import {
  IPCFactory,
  createIPCServer,
  createIPCClient,
  getDefaultIPCPath,
  isIPCSupported,
  getCurrentPlatform,
} from '../../src/daemon/ipc-factory';
import { UnixSocketServer } from '../../src/daemon/unix-socket-server';
import { UnixSocketClient } from '../../src/daemon/unix-socket-client';
import { NamedPipeServer } from '../../src/daemon/named-pipe-server';
import { NamedPipeClient } from '../../src/daemon/named-pipe-client';
import { PLATFORM_CONSTANTS } from '../../src/shared/constants';

// Mock os.platform
vi.mock('os', () => ({
  platform: vi.fn(),
}));

const mockOs = vi.mocked(os);

describe('IPCFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCurrentPlatform', () => {
    it('should return unix for linux', () => {
      mockOs.platform.mockReturnValue('linux');

      const platform = IPCFactory.getCurrentPlatform();

      expect(platform).toBe('unix');
    });

    it('should return unix for darwin', () => {
      mockOs.platform.mockReturnValue('darwin');

      const platform = IPCFactory.getCurrentPlatform();

      expect(platform).toBe('unix');
    });

    it('should return windows for win32', () => {
      mockOs.platform.mockReturnValue('win32');

      const platform = IPCFactory.getCurrentPlatform();

      expect(platform).toBe('windows');
    });
  });

  describe('createServer', () => {
    it('should create UnixSocketServer on unix platforms', () => {
      mockOs.platform.mockReturnValue('linux');

      const server = IPCFactory.createServer();

      expect(server).toBeInstanceOf(UnixSocketServer);
    });

    it('should create NamedPipeServer on windows platforms', () => {
      mockOs.platform.mockReturnValue('win32');

      const server = IPCFactory.createServer();

      expect(server).toBeInstanceOf(NamedPipeServer);
    });

    it('should pass config to server', () => {
      mockOs.platform.mockReturnValue('linux');
      const config = { path: '/tmp/test.sock', timeout: 10000 };

      const server = IPCFactory.createServer(config);

      expect(server).toBeInstanceOf(UnixSocketServer);
    });
  });

  describe('createClient', () => {
    it('should create UnixSocketClient on unix platforms', () => {
      mockOs.platform.mockReturnValue('linux');

      const client = IPCFactory.createClient();

      expect(client).toBeInstanceOf(UnixSocketClient);
    });

    it('should create NamedPipeClient on windows platforms', () => {
      mockOs.platform.mockReturnValue('win32');

      const client = IPCFactory.createClient();

      expect(client).toBeInstanceOf(NamedPipeClient);
    });

    it('should pass config to client', () => {
      mockOs.platform.mockReturnValue('linux');
      const config = { path: '/tmp/test.sock', timeout: 10000 };

      const client = IPCFactory.createClient(config);

      expect(client).toBeInstanceOf(UnixSocketClient);
    });
  });

  describe('createServerForPlatform', () => {
    it('should create UnixSocketServer for unix platform', () => {
      const server = IPCFactory.createServerForPlatform('unix');

      expect(server).toBeInstanceOf(UnixSocketServer);
    });

    it('should create NamedPipeServer for windows platform', () => {
      const server = IPCFactory.createServerForPlatform('windows');

      expect(server).toBeInstanceOf(NamedPipeServer);
    });

    it('should throw error for unsupported platform', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        IPCFactory.createServerForPlatform('unsupported' as any);
      }).toThrow('Unsupported platform: unsupported');
    });
  });

  describe('createClientForPlatform', () => {
    it('should create UnixSocketClient for unix platform', () => {
      const client = IPCFactory.createClientForPlatform('unix');

      expect(client).toBeInstanceOf(UnixSocketClient);
    });

    it('should create NamedPipeClient for windows platform', () => {
      const client = IPCFactory.createClientForPlatform('windows');

      expect(client).toBeInstanceOf(NamedPipeClient);
    });

    it('should throw error for unsupported platform', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        IPCFactory.createClientForPlatform('unsupported' as any);
      }).toThrow('Unsupported platform: unsupported');
    });
  });

  describe('getDefaultIPCPath', () => {
    it('should return unix socket path for unix platforms', () => {
      mockOs.platform.mockReturnValue('linux');

      const path = IPCFactory.getDefaultIPCPath();

      expect(path).toBe(PLATFORM_CONSTANTS.UNIX.IPC_PATH);
    });

    it('should return named pipe path for windows platforms', () => {
      mockOs.platform.mockReturnValue('win32');

      const path = IPCFactory.getDefaultIPCPath();

      expect(path).toBe(PLATFORM_CONSTANTS.WINDOWS.IPC_PATH);
    });
  });

  describe('getDefaultIPCPathForPlatform', () => {
    it('should return unix socket path for unix platform', () => {
      const path = IPCFactory.getDefaultIPCPathForPlatform('unix');

      expect(path).toBe(PLATFORM_CONSTANTS.UNIX.IPC_PATH);
    });

    it('should return named pipe path for windows platform', () => {
      const path = IPCFactory.getDefaultIPCPathForPlatform('windows');

      expect(path).toBe(PLATFORM_CONSTANTS.WINDOWS.IPC_PATH);
    });

    it('should throw error for unsupported platform', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        IPCFactory.getDefaultIPCPathForPlatform('unsupported' as any);
      }).toThrow('Unsupported platform: unsupported');
    });
  });

  describe('isPlatformSupported', () => {
    it('should return true for unix platforms', () => {
      mockOs.platform.mockReturnValue('linux');

      const supported = IPCFactory.isPlatformSupported();

      expect(supported).toBe(true);
    });

    it('should return true for windows platforms', () => {
      mockOs.platform.mockReturnValue('win32');

      const supported = IPCFactory.isPlatformSupported();

      expect(supported).toBe(true);
    });
  });

  describe('isPlatformSupportedForPlatform', () => {
    it('should return true for unix platform', () => {
      const supported = IPCFactory.isPlatformSupportedForPlatform('unix');

      expect(supported).toBe(true);
    });

    it('should return true for windows platform', () => {
      const supported = IPCFactory.isPlatformSupportedForPlatform('windows');

      expect(supported).toBe(true);
    });
  });

  describe('getPlatformConstants', () => {
    it('should return unix constants for unix platform', () => {
      const constants = IPCFactory.getPlatformConstants('unix');

      expect(constants).toBe(PLATFORM_CONSTANTS.UNIX);
    });

    it('should return windows constants for windows platform', () => {
      const constants = IPCFactory.getPlatformConstants('windows');

      expect(constants).toBe(PLATFORM_CONSTANTS.WINDOWS);
    });

    it('should return current platform constants when no platform specified', () => {
      mockOs.platform.mockReturnValue('linux');

      const constants = IPCFactory.getPlatformConstants();

      expect(constants).toBe(PLATFORM_CONSTANTS.UNIX);
    });

    it('should throw error for unsupported platform', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        IPCFactory.getPlatformConstants('unsupported' as any);
      }).toThrow('Unsupported platform: unsupported');
    });
  });
});

describe('Convenience functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createIPCServer', () => {
    it('should create server for current platform', () => {
      mockOs.platform.mockReturnValue('linux');

      const server = createIPCServer();

      expect(server).toBeInstanceOf(UnixSocketServer);
    });

    it('should pass config to server', () => {
      mockOs.platform.mockReturnValue('linux');
      const config = { path: '/tmp/test.sock', timeout: 10000 };

      const server = createIPCServer(config);

      expect(server).toBeInstanceOf(UnixSocketServer);
    });
  });

  describe('createIPCClient', () => {
    it('should create client for current platform', () => {
      mockOs.platform.mockReturnValue('linux');

      const client = createIPCClient();

      expect(client).toBeInstanceOf(UnixSocketClient);
    });

    it('should pass config to client', () => {
      mockOs.platform.mockReturnValue('linux');
      const config = { path: '/tmp/test.sock', timeout: 10000 };

      const client = createIPCClient(config);

      expect(client).toBeInstanceOf(UnixSocketClient);
    });
  });

  describe('getDefaultIPCPath', () => {
    it('should return default path for current platform', () => {
      mockOs.platform.mockReturnValue('linux');

      const path = getDefaultIPCPath();

      expect(path).toBe(PLATFORM_CONSTANTS.UNIX.IPC_PATH);
    });
  });

  describe('isIPCSupported', () => {
    it('should check support for current platform', () => {
      mockOs.platform.mockReturnValue('linux');

      const supported = isIPCSupported();

      expect(supported).toBe(true);
    });
  });

  describe('getCurrentPlatform', () => {
    it('should return current platform', () => {
      mockOs.platform.mockReturnValue('linux');

      const platform = getCurrentPlatform();

      expect(platform).toBe('unix');
    });
  });
});
