#!/usr/bin/env node

/**
 * Test program that crashes after 15 seconds
 * Used for testing daemon crash recovery functionality
 */

console.log(`[crash-after-15s] Started with PID: ${process.pid}`);
console.log(`[crash-after-15s] Will crash in 15 seconds...`);

// Ignore SIGTERM to simulate a process that won't respond to graceful shutdown
process.on('SIGTERM', () => {
  console.log(
    '[crash-after-15s] Received SIGTERM but ignoring it (simulating unresponsive process)'
  );
});

// Ignore SIGINT as well
process.on('SIGINT', () => {
  console.log(
    '[crash-after-15s] Received SIGINT but ignoring it (simulating unresponsive process)'
  );
});

let secondsElapsed = 0;

// Heartbeat every second
const heartbeatInterval = setInterval(() => {
  secondsElapsed++;
  console.log(
    `[crash-after-15s] Heartbeat ${secondsElapsed}/15 - Process running normally (PID: ${process.pid})`
  );

  // Crash after 15 seconds
  if (secondsElapsed >= 15) {
    clearInterval(heartbeatInterval);
    console.error(
      '[crash-after-15s] CRASHING NOW! Simulating unexpected daemon failure...'
    );

    // Simulate different types of crashes randomly
    const crashType = Math.random();

    if (crashType < 0.33) {
      // Uncaught exception
      throw new Error('FATAL: Simulated uncaught exception - daemon crash!');
    } else if (crashType < 0.66) {
      // Segmentation fault simulation (exit code 139)
      process.exit(139);
    } else {
      // Generic failure
      process.exit(1);
    }
  }
}, 1000);

// Keep the process alive
process.stdin.resume();
