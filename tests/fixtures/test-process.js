#!/usr/bin/env node

/**
 * Test process for integration testing
 * This script simulates a long-running process that can be controlled
 */

console.log('Test process started with PID:', process.pid);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  process.exit(0);
});

// Simulate work with periodic output
let counter = 0;
const interval = setInterval(() => {
  counter++;
  console.log(`Test process heartbeat ${counter}`);

  // Exit after 10 heartbeats if no signal received (prevent hanging tests)
  if (counter >= 10) {
    console.log('Test process exiting after 10 heartbeats');
    process.exit(0);
  }
}, 1000);

// Handle process termination
process.on('exit', (code) => {
  console.log(`Test process exiting with code: ${code}`);
  clearInterval(interval);
});
