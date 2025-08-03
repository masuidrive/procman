#!/usr/bin/env node

/**
 * Memory eater process for testing memory limit functionality
 * This process gradually consumes memory to trigger max_memory_restart
 */

console.log('Memory eater process started with PID:', process.pid);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Memory eater received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Memory eater received SIGINT, shutting down...');
  process.exit(0);
});

// Memory consumption simulation
let memoryChunks = [];
let counter = 0;

const interval = setInterval(() => {
  counter++;

  // Allocate roughly 2MB per iteration
  const chunk = Buffer.alloc(2 * 1024 * 1024, 'x');
  memoryChunks.push(chunk);

  const memUsage = process.memoryUsage();
  const memUsageMB = Math.round(memUsage.rss / 1024 / 1024);

  console.log(`Memory eater iteration ${counter}, RSS: ${memUsageMB}MB`);

  // Stop eating memory after 15 iterations (should reach ~30MB)
  if (counter >= 15) {
    console.log('Memory eater stopping memory allocation');
    clearInterval(interval);

    // Keep process alive but stop growing memory
    setInterval(() => {
      console.log(
        `Memory eater idle, RSS: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
      );
    }, 2000);
  }
}, 500); // Allocate every 500ms

// Handle process termination
process.on('exit', (code) => {
  console.log(`Memory eater process exiting with code: ${code}`);
  clearInterval(interval);
});

// Prevent process from exiting immediately
process.stdin.resume();
