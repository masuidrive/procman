#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create test config
const testConfig = {
  processes: {
    'test-app': {
      command: 'echo "test process"',
      cwd: process.cwd(),
    }
  }
};

const configPath = path.join(os.tmpdir(), 'test-procman-config.json');
fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));

// Create unique socket path
const socketPath = path.join(os.tmpdir(), `test-procman-${Date.now()}.sock`);
const env = {
  ...process.env,
  PROCMAN_SOCKET_PATH: socketPath,
  NODE_ENV: 'test'
};

console.log(`Testing daemon startup with config: ${configPath}`);
console.log(`Socket path: ${socketPath}`);

const startTime = Date.now();

// Start daemon
console.log('Starting daemon...');
const daemon = spawn('./bin/procman', ['load', configPath], {
  env,
  stdio: 'pipe',
  detached: false
});

let daemonOutput = '';
let daemonError = '';

daemon.stdout.on('data', (data) => {
  daemonOutput += data.toString();
  console.log('DAEMON STDOUT:', data.toString());
});

daemon.stderr.on('data', (data) => {
  daemonError += data.toString();
  console.log('DAEMON STDERR:', data.toString());
});

daemon.on('close', (code) => {
  const elapsed = Date.now() - startTime;
  console.log(`Daemon exited with code ${code} after ${elapsed}ms`);
  console.log('Final stdout:', daemonOutput);
  console.log('Final stderr:', daemonError);
  
  // Cleanup
  try {
    fs.unlinkSync(configPath);
    fs.unlinkSync(socketPath);
  } catch (e) {
    // ignore cleanup errors
  }
  
  process.exit(code);
});

// Test list command after 2 seconds
setTimeout(() => {
  console.log('Testing list command after 2 seconds...');
  const listStart = Date.now();
  
  const list = spawn('./bin/procman', ['list'], {
    env,
    stdio: 'pipe'
  });
  
  let listOutput = '';
  let listError = '';
  
  list.stdout.on('data', (data) => {
    listOutput += data.toString();
  });
  
  list.stderr.on('data', (data) => {
    listError += data.toString();
  });
  
  list.on('close', (code) => {
    const listElapsed = Date.now() - listStart;
    console.log(`List command completed in ${listElapsed}ms with exit code ${code}`);
    console.log('List stdout:', listOutput);
    console.log('List stderr:', listError);
    
    // Kill daemon
    daemon.kill('SIGTERM');
  });
}, 2000);

// Timeout after 30 seconds
setTimeout(() => {
  console.log('TIMEOUT: Daemon did not start within 30 seconds');
  daemon.kill('SIGKILL');
  process.exit(1);
}, 30000);