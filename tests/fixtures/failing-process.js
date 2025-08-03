#!/usr/bin/env node

/**
 * Test process that fails immediately
 * Used for testing error handling
 */

console.log('Failing process started with PID:', process.pid);
console.error('This process is designed to fail');

// Exit with non-zero code after a brief delay
setTimeout(() => {
  process.exit(1);
}, 100);
