#!/usr/bin/env node

/**
 * PoC: プロセス管理の検証
 * child_process.spawn, プロセス監視, シグナル処理をテスト
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');

class ProcessManager extends EventEmitter {
  constructor() {
    super();
    this.processes = new Map();
    this.monitoring = false;
    this.monitorInterval = null;
  }

  async startProcess(config) {
    const { name, command, args = [], cwd, env } = config;
    
    if (this.processes.has(name)) {
      throw new Error(`Process ${name} already exists`);
    }

    console.log(`[ProcessManager] Starting process: ${name}`);
    console.log(`[ProcessManager] Command: ${command} ${args.join(' ')}`);
    
    const processInfo = {
      name,
      command,
      args,
      process: null,
      pid: null,
      status: 'starting',
      startTime: Date.now(),
      memoryUsage: 0,
      restarts: 0,
      config
    };

    try {
      const childProcess = spawn(command, args, {
        cwd: cwd || process.cwd(),
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      processInfo.process = childProcess;
      processInfo.pid = childProcess.pid;
      processInfo.status = 'online';

      // Handle stdout
      childProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        console.log(`[${name}:stdout] ${output}`);
        this.emit('log', { name, type: 'stdout', message: output, timestamp: Date.now() });
      });

      // Handle stderr
      childProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        console.log(`[${name}:stderr] ${output}`);
        this.emit('log', { name, type: 'stderr', message: output, timestamp: Date.now() });
      });

      // Handle process exit
      childProcess.on('exit', (code, signal) => {
        console.log(`[ProcessManager] Process ${name} exited with code ${code}, signal ${signal}`);
        processInfo.status = 'stopped';
        processInfo.exitCode = code;
        processInfo.exitSignal = signal;
        this.emit('processExit', { name, code, signal });
      });

      // Handle process error
      childProcess.on('error', (error) => {
        console.error(`[ProcessManager] Process ${name} error:`, error.message);
        processInfo.status = 'errored';
        processInfo.error = error.message;
        this.emit('processError', { name, error: error.message });
      });

      this.processes.set(name, processInfo);
      console.log(`[ProcessManager] Process ${name} started with PID ${childProcess.pid}`);
      
      return processInfo;

    } catch (error) {
      processInfo.status = 'errored';
      processInfo.error = error.message;
      this.processes.set(name, processInfo);
      throw error;
    }
  }

  async stopProcess(name, options = {}) {
    const { timeout = 10000, forceKill = true } = options;
    
    const processInfo = this.processes.get(name);
    if (!processInfo) {
      throw new Error(`Process ${name} not found`);
    }

    if (processInfo.status === 'stopped') {
      console.log(`[ProcessManager] Process ${name} is already stopped`);
      return;
    }

    console.log(`[ProcessManager] Stopping process: ${name} (PID: ${processInfo.pid})`);
    processInfo.status = 'stopping';

    const childProcess = processInfo.process;
    
    return new Promise((resolve, reject) => {
      const killTimer = setTimeout(() => {
        if (forceKill && !childProcess.killed) {
          console.log(`[ProcessManager] Force killing process ${name}`);
          childProcess.kill('SIGKILL');
        }
      }, timeout);

      childProcess.once('exit', () => {
        clearTimeout(killTimer);
        console.log(`[ProcessManager] Process ${name} stopped`);
        resolve();
      });

      // Send SIGTERM for graceful shutdown
      console.log(`[ProcessManager] Sending SIGTERM to process ${name}`);
      childProcess.kill('SIGTERM');
    });
  }

  async restartProcess(name) {
    const processInfo = this.processes.get(name);
    if (!processInfo) {
      throw new Error(`Process ${name} not found`);
    }

    console.log(`[ProcessManager] Restarting process: ${name}`);
    
    // Stop the process
    await this.stopProcess(name);
    
    // Update restart count
    processInfo.restarts++;
    
    // Remove from processes map temporarily
    this.processes.delete(name);
    
    // Start again with same config
    return await this.startProcess(processInfo.config);
  }

  getProcessInfo(name) {
    const processInfo = this.processes.get(name);
    if (!processInfo) {
      return null;
    }

    return {
      name: processInfo.name,
      pid: processInfo.pid,
      status: processInfo.status,
      uptime: processInfo.status === 'online' ? Date.now() - processInfo.startTime : 0,
      memoryUsage: processInfo.memoryUsage,
      restarts: processInfo.restarts,
      command: `${processInfo.command} ${processInfo.args.join(' ')}`
    };
  }

  getAllProcesses() {
    const result = [];
    for (const [name] of this.processes) {
      result.push(this.getProcessInfo(name));
    }
    return result;
  }

  startMonitoring() {
    if (this.monitoring) {
      return;
    }

    console.log(`[ProcessManager] Starting process monitoring`);
    this.monitoring = true;

    this.monitorInterval = setInterval(async () => {
      for (const [name, processInfo] of this.processes) {
        if (processInfo.status === 'online' && processInfo.pid) {
          try {
            // Get memory usage
            const memInfo = process.memoryUsage();
            processInfo.memoryUsage = Math.round(memInfo.rss / 1024 / 1024); // MB
            
            // Check if process is still alive
            process.kill(processInfo.pid, 0); // Signal 0 just checks if process exists
            
          } catch (error) {
            if (error.code === 'ESRCH') {
              console.log(`[ProcessManager] Process ${name} is no longer running`);
              processInfo.status = 'stopped';
              this.emit('processExit', { name, code: null, signal: null });
            }
          }
        }
      }
    }, 5000); // Check every 5 seconds
  }

  stopMonitoring() {
    if (!this.monitoring) {
      return;
    }

    console.log(`[ProcessManager] Stopping process monitoring`);
    this.monitoring = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  async stopAll() {
    console.log(`[ProcessManager] Stopping all processes`);
    const promises = [];
    
    for (const [name] of this.processes) {
      promises.push(this.stopProcess(name));
    }

    await Promise.all(promises);
    this.stopMonitoring();
  }
}

// Test runner
async function runTest() {
  console.log(`=== Process Management PoC ===`);
  
  const manager = new ProcessManager();

  // Listen to events
  manager.on('log', (logEntry) => {
    // In real implementation, this would go to log files
  });

  manager.on('processExit', ({ name, code, signal }) => {
    console.log(`[Event] Process ${name} exited (code: ${code}, signal: ${signal})`);
  });

  manager.on('processError', ({ name, error }) => {
    console.log(`[Event] Process ${name} error: ${error}`);
  });

  try {
    // Start monitoring
    manager.startMonitoring();

    // Test 1: Start a simple process (echo server)
    console.log(`\n--- Test 1: Starting echo server ---`);
    await manager.startProcess({
      name: 'echo-server',
      command: 'node',
      args: ['-e', `
        const http = require('http');
        const server = http.createServer((req, res) => {
          console.log('Request received:', req.url);
          res.writeHead(200, {'Content-Type': 'text/plain'});
          res.end('Hello from echo server!');
        });
        server.listen(0, () => {
          console.log('Echo server started on port', server.address().port);
        });
      `]
    });

    // Wait and check status
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Process info:', manager.getProcessInfo('echo-server'));

    // Test 2: Start a process that outputs regularly
    console.log(`\n--- Test 2: Starting timer process ---`);
    await manager.startProcess({
      name: 'timer',
      command: 'node',
      args: ['-e', `
        let count = 0;
        setInterval(() => {
          console.log('Timer tick:', ++count);
          if (count >= 5) {
            console.log('Timer process exiting');
            process.exit(0);
          }
        }, 1000);
      `]
    });

    // Wait for timer to run
    await new Promise(resolve => setTimeout(resolve, 6000));

    // Test 3: Process restart
    console.log(`\n--- Test 3: Testing process restart ---`);
    await manager.startProcess({
      name: 'simple-app',
      command: 'node',
      args: ['-e', `
        console.log('Simple app started');
        setTimeout(() => {
          console.log('Simple app running...');
        }, 1000);
        
        // Keep process alive
        setInterval(() => {
          console.log('App heartbeat');
        }, 2000);
      `]
    });

    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Restarting simple-app...');
    await manager.restartProcess('simple-app');
    
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Show all processes
    console.log(`\n--- All processes ---`);
    console.log(manager.getAllProcesses());

    console.log(`\n--- Test completed successfully ---`);

  } catch (error) {
    console.error(`Test failed:`, error.message);
    process.exit(1);
  } finally {
    // Cleanup
    await manager.stopAll();
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

module.exports = { ProcessManager };