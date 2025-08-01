#!/usr/bin/env node

/**
 * PoC: IPC通信の検証
 * Unix Domain Socket と Named Pipe の双方向通信をテスト
 */

const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

class IPCServer {
  constructor() {
    this.server = null;
    this.clients = new Set();
    this.isWindows = os.platform() === 'win32';
    this.socketPath = this.isWindows 
      ? '\\\\.\\pipe\\procman-poc-test'
      : path.join(os.tmpdir(), 'procman-poc-test.sock');
  }

  async start() {
    return new Promise((resolve, reject) => {
      // Unix系の場合、既存のソケットファイルを削除
      if (!this.isWindows && fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
      }

      this.server = net.createServer();
      
      this.server.on('connection', (socket) => {
        console.log(`[Server] Client connected`);
        this.clients.add(socket);

        socket.on('data', (data) => {
          try {
            const message = JSON.parse(data.toString());
            console.log(`[Server] Received:`, message);
            
            // Echo back with server info
            const response = {
              type: 'response',
              echo: message,
              timestamp: Date.now(),
              server: 'procman-poc'
            };
            
            socket.write(JSON.stringify(response) + '\n');
          } catch (error) {
            console.error(`[Server] JSON parse error:`, error.message);
            socket.write(JSON.stringify({ error: 'Invalid JSON' }) + '\n');
          }
        });

        socket.on('close', () => {
          console.log(`[Server] Client disconnected`);
          this.clients.delete(socket);
        });

        socket.on('error', (error) => {
          console.error(`[Server] Socket error:`, error.message);
          this.clients.delete(socket);
        });
      });

      this.server.on('error', (error) => {
        console.error(`[Server] Server error:`, error.message);
        reject(error);
      });

      this.server.listen(this.socketPath, () => {
        console.log(`[Server] Listening on ${this.socketPath}`);
        resolve();
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Close all client connections
      for (const client of this.clients) {
        client.end();
      }
      this.clients.clear();

      this.server.close(() => {
        console.log(`[Server] Server stopped`);
        
        // Clean up socket file on Unix
        if (!this.isWindows && fs.existsSync(this.socketPath)) {
          fs.unlinkSync(this.socketPath);
        }
        
        resolve();
      });
    });
  }

  broadcast(message) {
    const data = JSON.stringify(message) + '\n';
    for (const client of this.clients) {
      client.write(data);
    }
  }
}

class IPCClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.isWindows = os.platform() === 'win32';
    this.socketPath = this.isWindows 
      ? '\\\\.\\pipe\\procman-poc-test'
      : path.join(os.tmpdir(), 'procman-poc-test.sock');
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath);

      this.socket.on('connect', () => {
        console.log(`[Client] Connected to server`);
        this.isConnected = true;
        resolve();
      });

      this.socket.on('data', (data) => {
        try {
          const lines = data.toString().split('\n').filter(line => line.trim());
          for (const line of lines) {
            const message = JSON.parse(line);
            console.log(`[Client] Received:`, message);
          }
        } catch (error) {
          console.error(`[Client] JSON parse error:`, error.message);
        }
      });

      this.socket.on('close', () => {
        console.log(`[Client] Connection closed`);
        this.isConnected = false;
      });

      this.socket.on('error', (error) => {
        console.error(`[Client] Connection error:`, error.message);
        this.isConnected = false;
        reject(error);
      });
    });
  }

  send(message) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }
    
    const data = JSON.stringify(message) + '\n';
    this.socket.write(data);
  }

  disconnect() {
    if (this.socket) {
      this.socket.end();
    }
  }
}

// Test runner
async function runTest() {
  console.log(`=== IPC Communication PoC ===`);
  console.log(`Platform: ${os.platform()}`);
  console.log(`Using: ${os.platform() === 'win32' ? 'Named Pipe' : 'Unix Domain Socket'}`);
  
  const server = new IPCServer();
  const client = new IPCClient();

  try {
    // Start server
    console.log(`\n--- Starting server ---`);
    await server.start();
    
    // Wait a bit for server to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Connect client
    console.log(`\n--- Connecting client ---`);
    await client.connect();

    // Test basic communication
    console.log(`\n--- Testing basic communication ---`);
    client.send({ type: 'test', message: 'Hello, server!' });
    
    await new Promise(resolve => setTimeout(resolve, 100));

    // Test multiple messages
    console.log(`\n--- Testing multiple messages ---`);
    for (let i = 0; i < 3; i++) {
      client.send({ type: 'count', value: i, timestamp: Date.now() });
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));

    // Test server broadcast
    console.log(`\n--- Testing server broadcast ---`);
    server.broadcast({ type: 'broadcast', message: 'Message to all clients' });
    
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`\n--- Test completed successfully ---`);

  } catch (error) {
    console.error(`Test failed:`, error.message);
    process.exit(1);
  } finally {
    // Cleanup
    client.disconnect();
    await server.stop();
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  process.exit(0);
});

// Run the test
if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = { IPCServer, IPCClient };