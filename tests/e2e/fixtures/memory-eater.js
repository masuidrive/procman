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

  // Allocate roughly 5MB per iteration for faster memory growth
  const chunk = Buffer.alloc(5 * 1024 * 1024, 'x');
  memoryChunks.push(chunk);

  const memUsage = process.memoryUsage();
  const memUsageMB = Math.round(memUsage.rss / 1024 / 1024);

  console.log(`Memory eater iteration ${counter}, RSS: ${memUsageMB}MB`);

  // Stop eating memory after 10 iterations (should reach ~50MB)
  if (counter >= 10) {
    console.log('Memory eater stopping memory allocation');
    clearInterval(interval);

    // Keep process alive but stop growing memory
    setInterval(() => {
      console.log(
        `Memory eater idle, RSS: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
      );
    }, 2000);
  }
}, 200); // Allocate every 200ms for faster growth

// Handle process termination
process.on('exit', (code) => {
  console.log(`Memory eater process exiting with code: ${code}`);
  clearInterval(interval);
});

// Prevent process from exiting immediately
process.stdin.resume();
