/**
 * IPC Communication Integration Tests
 *
 * Integration tests for IPC server and client communication,
 * including real socket/pipe communication and message handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createIPCServer, createIPCClient } from '../../src/daemon/ipc-factory';
import {
  createIPCMessage,
  createIPCSuccessResponse,
} from '../../src/shared/ipc';
import type {
  IPCServerBase,
  IPCClientBase,
  IPCConnection,
  MessageHandler,
} from '../../src/daemon';
import type {
  IPCCommandMessage,
  IPCResponse,
  IPCMessage,
} from '../../src/shared/ipc';

// Test-specific interfaces for custom payloads
interface TestCommandPayload {
  [key: string]: any;
}

interface TestResponsePayload {
  [key: string]: any;
}

// Helper function to create test command messages
function createTestCommand(
  type: string,
  payload: TestCommandPayload
): IPCMessage {
  return createIPCMessage(type, payload);
}

describe('IPC Communication Integration', () => {
  let server: IPCServerBase;
  let client: IPCClientBase;
  let testSocketPath: string;

  beforeEach(async () => {
    // Create temporary socket path for testing
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'procman-test-'));
    testSocketPath = path.join(tempDir, 'test.sock');

    // Create server and client with test socket path
    const config =
      os.platform() === 'win32'
        ? { namedPipePath: `\\\\.\\pipe\\procman-test-${Date.now()}` }
        : { socketPath: testSocketPath };

    server = createIPCServer(config);
    client = createIPCClient(config);
  });

  afterEach(async () => {
    // Clean up in proper order with longer timeout
    try {
      if (client && client.isConnected()) {
        await client.disconnect();
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    // Wait a bit for client disconnection to be processed
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      if (server && server.isServerListening()) {
        await server.stop();
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    // Wait a bit for server shutdown to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Clean up socket file
    if (os.platform() !== 'win32') {
      try {
        await fs.unlink(testSocketPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }, 15000);

  describe('Basic Connection', () => {
    it('should establish connection between server and client', async () => {
      // Start server
      await server.start();
      expect(server.isServerListening()).toBe(true);

      // Connect client
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Check server has connection
      expect(server.getConnections()).toHaveLength(1);
    });

    it('should handle client disconnection', async () => {
      await server.start();
      await client.connect();

      expect(server.getConnections()).toHaveLength(1);

      await client.disconnect();

      // Wait a bit for the server to detect disconnection
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(client.isConnected()).toBe(false);
    }, 10000);

    it('should handle server shutdown', async () => {
      await server.start();
      await client.connect();

      expect(client.isConnected()).toBe(true);

      await server.stop();

      // Wait a bit for the client to detect disconnection
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(server.isServerListening()).toBe(false);
    });
  });

  describe('Message Communication', () => {
    beforeEach(async () => {
      await server.start();
      await client.connect();
    });

    it('should send command and receive response', async () => {
      // Register echo handler
      const echoHandler: MessageHandler = async (message, connection) => {
        return createIPCSuccessResponse(message.id, {
          echo: message.payload,
          timestamp: Date.now(),
        } as any);
      };

      // For testing purposes, use a valid command type but override handler
      (server as any).registerHandler('echo', echoHandler);

      // Send command
      const command = createTestCommand('echo', { message: 'Hello, IPC!' });
      const response = await client.sendMessage(command);

      expect(response).toBeDefined();
      expect(response.type).toBe('response');
      expect(response.requestId).toBe(command.id);

      if (response.type === 'response') {
        expect((response.payload as any).echo).toEqual({
          message: 'Hello, IPC!',
        });
      }
    });

    it('should handle multiple concurrent messages', async () => {
      // Register handler
      const handler: MessageHandler = async (message, connection) => {
        return createIPCSuccessResponse(message.id, {
          processed: message.payload,
          handlerTime: Date.now(),
        } as any);
      };

      (server as any).registerHandler('process', handler);

      // Send multiple messages concurrently
      const promises = Array.from({ length: 5 }, (_, i) => {
        const command = createTestCommand('process', { index: i });
        return client.sendMessage(command);
      });

      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(5);
      responses.forEach((response, index) => {
        expect(response.type).toBe('response');
        if (response.type === 'response') {
          expect((response.payload as any).processed.index).toBe(index);
        }
      });
    });

    it('should handle rapid consecutive messages (PoC issue test)', async () => {
      // Register handler
      const handler: MessageHandler = async (message, connection) => {
        return createIPCSuccessResponse(message.id, {
          sequence: (message.payload as any).sequence,
        } as any);
      };

      (server as any).registerHandler('sequence', handler);

      // Send messages rapidly without waiting
      const responses: IPCResponse[] = [];
      const promises: Promise<IPCResponse>[] = [];

      for (let i = 0; i < 10; i++) {
        const command = createTestCommand('sequence', { sequence: i });
        promises.push(client.sendMessage(command));
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);

      // Verify all messages were processed correctly
      results.forEach((response, index) => {
        expect(response.type).toBe('response');
        if (response.type === 'response') {
          expect((response.payload as any).sequence).toBe(index);
        }
      });
    });

    it('should handle error responses', async () => {
      // Register error handler
      const errorHandler: MessageHandler = async (message, connection) => {
        throw new Error('Simulated error');
      };

      (server as any).registerHandler('error', errorHandler);

      // Send command that causes error
      const command = createTestCommand('error', { test: true });
      const response = await client.sendMessage(command);

      expect(response).toBeDefined();
      expect(response.type).toBe('error');
      expect(response.requestId).toBe(command.id);

      if (response.type === 'error') {
        expect((response.payload as any).message).toContain('Simulated error');
      }
    });

    it('should handle unknown command types', async () => {
      // Send unknown command
      const command = createTestCommand('unknown', { test: true });
      const response = await client.sendMessage(command);

      expect(response).toBeDefined();
      expect(response.type).toBe('error');
      expect(response.requestId).toBe(command.id);

      if (response.type === 'error') {
        expect((response.payload as any).message).toContain(
          'No handler registered'
        );
      }
    });
  });

  describe('Multiple Clients', () => {
    let client2: IPCClientBase;

    beforeEach(async () => {
      await server.start();

      // Create second client
      const config =
        os.platform() === 'win32'
          ? {
              namedPipePath:
                (server as any).getPipePath?.() ||
                `\\\\.\\pipe\\procman-test-${Date.now()}`,
            }
          : { socketPath: (server as any).getSocketPath?.() || testSocketPath };

      client2 = createIPCClient(config);
    });

    afterEach(async () => {
      try {
        if (client2 && client2.isConnected()) {
          await client2.disconnect();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
      // Wait for cleanup to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    }, 15000);

    it('should handle multiple client connections', async () => {
      await client.connect();
      await client2.connect();

      expect(server.getConnections()).toHaveLength(2);
      expect(client.isConnected()).toBe(true);
      expect(client2.isConnected()).toBe(true);
    });

    it('should handle messages from multiple clients', async () => {
      await client.connect();
      await client2.connect();

      // Register handler
      const handler: MessageHandler = async (message, connection) => {
        return createIPCSuccessResponse(message.id, {
          clientId: connection.id,
          message: message.payload,
        } as any);
      };

      (server as any).registerHandler('multi', handler);

      // Send messages from both clients
      const command1 = createTestCommand('multi', { from: 'client1' });
      const command2 = createTestCommand('multi', { from: 'client2' });

      const [response1, response2] = await Promise.all([
        client.sendMessage(command1),
        client2.sendMessage(command2),
      ]);

      expect(response1.type).toBe('response');
      expect(response2.type).toBe('response');

      if (response1.type === 'response' && response2.type === 'response') {
        expect((response1.payload as any).message.from).toBe('client1');
        expect((response2.payload as any).message.from).toBe('client2');

        // Different client IDs
        expect((response1.payload as any).clientId).not.toBe(
          (response2.payload as any).clientId
        );
      }
    });
  });

  describe('Connection Management', () => {
    it('should handle connection timeout', async () => {
      // Create client with short timeout
      const shortTimeoutClient = createIPCClient({
        ...(os.platform() === 'win32'
          ? { namedPipePath: `\\\\.\\pipe\\nonexistent-${Date.now()}` }
          : { socketPath: '/tmp/nonexistent.sock' }),
        timeout: 100,
      });

      // Try to connect to non-existent server
      await expect(shortTimeoutClient.connect()).rejects.toThrow();
    });

    it('should handle message timeout', async () => {
      await server.start();
      await client.connect();

      // Register slow handler
      const slowHandler: MessageHandler = async (message, connection) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return createIPCSuccessResponse(message.id, { delayed: true } as any);
      };

      (server as any).registerHandler('slow', slowHandler);

      // Send message with short timeout
      const command = createTestCommand('slow', { test: true });

      await expect(client.sendMessage(command, 100)).rejects.toThrow(
        'Request timeout'
      );
    });
  });
});
