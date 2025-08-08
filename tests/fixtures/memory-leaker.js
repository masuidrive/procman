#!/usr/bin/env node

/**
 * Test program that intentionally leaks memory
 * Used for testing memory limit and leak detection functionality
 */

console.log(`[memory-leaker] Started with PID: ${process.pid}`);
console.log('[memory-leaker] Will leak 1MB of memory every second...');

// Array to hold leaked memory
const leakedMemory = [];
let totalLeakedMB = 0;

// Function to leak memory
function leakMemory() {
  // Allocate 1MB of memory (1024 * 1024 bytes)
  const oneMB = 1024 * 1024;
  const buffer = Buffer.alloc(oneMB);

  // Fill with random data to ensure it's actually allocated
  for (let i = 0; i < oneMB; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }

  // Store in array so it's not garbage collected
  leakedMemory.push(buffer);
  totalLeakedMB++;

  // Log memory usage
  const memUsage = process.memoryUsage();
  console.log(`[memory-leaker] Leaked ${totalLeakedMB}MB total`);
  console.log(`[memory-leaker] Memory usage:`, {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    arrayBuffers: `${Math.round(memUsage.arrayBuffers / 1024 / 1024)}MB`,
  });

  // Simulate some actual work to make it more realistic
  let sum = 0;
  for (let i = 0; i < 1000000; i++) {
    sum += Math.random();
  }
}

// Leak memory every second
const leakInterval = setInterval(() => {
  try {
    leakMemory();

    // Optional: Stop after reaching a certain limit to prevent system issues
    if (totalLeakedMB >= 100) {
      console.log(
        '[memory-leaker] Reached 100MB limit, stopping leak but keeping process alive'
      );
      clearInterval(leakInterval);

      // Keep process alive but stop leaking
      setInterval(() => {
        console.log(
          `[memory-leaker] Still holding ${totalLeakedMB}MB in memory`
        );
      }, 5000);
    }
  } catch (error) {
    console.error('[memory-leaker] Error allocating memory:', error.message);
    if (error.message.includes('out of memory')) {
      console.log(
        '[memory-leaker] Out of memory! Process will likely be killed soon...'
      );
      clearInterval(leakInterval);
    }
  }
}, 1000);

// Handle termination signals
process.on('SIGTERM', () => {
  console.log('[memory-leaker] Received SIGTERM, cleaning up...');
  clearInterval(leakInterval);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[memory-leaker] Received SIGINT, cleaning up...');
  clearInterval(leakInterval);
  process.exit(0);
});

// Log initial memory usage
const initialMemUsage = process.memoryUsage();
console.log(`[memory-leaker] Initial memory usage:`, {
  rss: `${Math.round(initialMemUsage.rss / 1024 / 1024)}MB`,
  heapTotal: `${Math.round(initialMemUsage.heapTotal / 1024 / 1024)}MB`,
  heapUsed: `${Math.round(initialMemUsage.heapUsed / 1024 / 1024)}MB`,
});

// Keep process alive
process.stdin.resume();
