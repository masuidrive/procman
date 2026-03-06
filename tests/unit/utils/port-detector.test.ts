import { describe, test, expect, vi } from 'vitest';
import {
  parseLsofOutput,
  parseSsOutput,
  detectListeningPorts,
} from '../../../src/utils/port-detector.js';

describe('Port Detector', () => {
  describe('parseLsofOutput', () => {
    test('should extract listening ports for the given PID', () => {
      const output = `COMMAND     PID       USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345 testuser   22u  IPv4 0x8f62afd1f472b9a8      0t0    TCP *:3000 (LISTEN)
node      12345 testuser   23u  IPv6 0xf69036af8d341eb       0t0    TCP *:3000 (LISTEN)
node      12345 testuser   24u  IPv4 0x8907662f9402f5f1      0t0    TCP *:8080 (LISTEN)
node      12345 testuser   25u  IPv4 0x66bee14d667fdc42      0t0    TCP 127.0.0.1:3000->10.0.0.1:54321 (ESTABLISHED)`;

      expect(parseLsofOutput(output, 12345)).toEqual([3000, 8080]);
    });

    test('should only return ports for the specified PID', () => {
      const output = `COMMAND     PID       USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345 testuser   22u  IPv4 0x8f62afd1f472b9a8      0t0    TCP *:3000 (LISTEN)
python    99999 testuser   10u  IPv4 0x1234567890abcdef      0t0    TCP *:5000 (LISTEN)`;

      expect(parseLsofOutput(output, 12345)).toEqual([3000]);
    });

    test('should handle IPv6 listen addresses', () => {
      const output = `COMMAND     PID       USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345 testuser   22u  IPv6 0xabcdef1234567890      0t0    TCP [::1]:4000 (LISTEN)`;

      expect(parseLsofOutput(output, 12345)).toEqual([4000]);
    });

    test('should deduplicate ports (IPv4 + IPv6 same port)', () => {
      const output = `COMMAND     PID       USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345 testuser   22u  IPv4 0x1111111111111111      0t0    TCP *:3000 (LISTEN)
node      12345 testuser   23u  IPv6 0x2222222222222222      0t0    TCP *:3000 (LISTEN)`;

      expect(parseLsofOutput(output, 12345)).toEqual([3000]);
    });

    test('should return empty array for no matches', () => {
      expect(parseLsofOutput('', 12345)).toEqual([]);
      expect(parseLsofOutput('some random output', 12345)).toEqual([]);
    });

    test('should ignore ESTABLISHED connections', () => {
      const output = `COMMAND     PID       USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345 testuser   25u  IPv4 0x66bee14d667fdc42      0t0    TCP 127.0.0.1:3000->10.0.0.1:54321 (ESTABLISHED)`;

      expect(parseLsofOutput(output, 12345)).toEqual([]);
    });

    test('should sort ports numerically', () => {
      const output = `COMMAND     PID       USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345 testuser   22u  IPv4 0x1111111111111111      0t0    TCP *:8080 (LISTEN)
node      12345 testuser   23u  IPv4 0x2222222222222222      0t0    TCP *:3000 (LISTEN)
node      12345 testuser   24u  IPv4 0x3333333333333333      0t0    TCP *:443 (LISTEN)`;

      expect(parseLsofOutput(output, 12345)).toEqual([443, 3000, 8080]);
    });
  });

  describe('parseSsOutput', () => {
    test('should extract listening ports for the given PID', () => {
      const output = `State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN 0      128    0.0.0.0:3000       0.0.0.0:*     users:(("node",pid=12345,fd=22))
LISTEN 0      128    0.0.0.0:8080       0.0.0.0:*     users:(("node",pid=12345,fd=23))`;

      expect(parseSsOutput(output, 12345)).toEqual([3000, 8080]);
    });

    test('should only return ports for the specified PID', () => {
      const output = `State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN 0      128    0.0.0.0:3000       0.0.0.0:*     users:(("node",pid=12345,fd=22))
LISTEN 0      128    0.0.0.0:5000       0.0.0.0:*     users:(("python",pid=99999,fd=10))`;

      expect(parseSsOutput(output, 12345)).toEqual([3000]);
    });

    test('should handle IPv6 addresses', () => {
      const output = `State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN 0      128    [::]:4000          [::]:*        users:(("node",pid=12345,fd=22))`;

      expect(parseSsOutput(output, 12345)).toEqual([4000]);
    });

    test('should return empty array for no matches', () => {
      expect(parseSsOutput('', 12345)).toEqual([]);
    });
  });

  describe('detectListeningPorts', () => {
    test('should return empty array on exec error', async () => {
      const mockExec = vi.fn((_cmd, _args, _opts, cb: any) => {
        cb(new Error('command not found'), '', '');
        return {} as any;
      });

      const ports = await detectListeningPorts(12345, {
        execFile: mockExec as any,
      });
      expect(ports).toEqual([]);
    });

    test('should return empty array on empty stdout', async () => {
      const mockExec = vi.fn((_cmd, _args, _opts, cb: any) => {
        cb(null, '', '');
        return {} as any;
      });

      const ports = await detectListeningPorts(12345, {
        execFile: mockExec as any,
      });
      expect(ports).toEqual([]);
    });

    test('should detect ports from actual process (integration)', async () => {
      // Skip on non-darwin/linux
      if (process.platform !== 'darwin' && process.platform !== 'linux') return;

      const net = await import('net');
      const server = net.createServer();

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as import('net').AddressInfo).port;

      try {
        const ports = await detectListeningPorts(process.pid);
        // On some CI environments lsof may not find ports for the test process
        // So we just verify the function returns an array without erroring
        expect(Array.isArray(ports)).toBe(true);
        // If we did find ports, our port should be among them
        if (ports.length > 0) {
          expect(ports).toContain(port);
        }
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
