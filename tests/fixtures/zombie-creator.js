#!/usr/bin/env node

/**
 * Test program that creates zombie processes
 * Used for testing zombie process cleanup functionality
 */

const { spawn } = require('child_process');

console.log(`[zombie-creator] Parent process started with PID: ${process.pid}`);

// Create multiple child processes that will become zombies
const numZombies = 3;
const children = [];

for (let i = 0; i < numZombies; i++) {
  // Create a child process that exits quickly
  const child = spawn(
    'node',
    [
      '-e',
      `
    console.log('[zombie-child-${i}] Child process PID:', process.pid);
    console.log('[zombie-child-${i}] Exiting in 2 seconds...');
    setTimeout(() => {
      console.log('[zombie-child-${i}] Child exiting now');
      process.exit(0);
    }, 2000);
  `,
    ],
    {
      stdio: 'inherit',
      detached: false, // Keep as child of this process
    }
  );

  children.push(child);
  console.log(
    `[zombie-creator] Spawned child ${i + 1}/${numZombies} with PID: ${child.pid}`
  );
}

// Parent continues running but doesn't wait() for children
// This creates zombie processes when children exit
console.log(
  '[zombie-creator] Parent will continue running without waiting for children...'
);
console.log(
  '[zombie-creator] Children will become zombies when they exit after 2 seconds'
);

// Keep parent alive for 10 seconds to observe zombies
let secondsAlive = 0;
const keepAliveInterval = setInterval(() => {
  secondsAlive++;
  console.log(
    `[zombie-creator] Parent still alive (${secondsAlive}s) - not reaping children`
  );

  // Check if any children have become zombies (we can't directly check, but we know they should be)
  if (secondsAlive === 3) {
    console.log(
      '[zombie-creator] Children should now be zombies (exited but not reaped)'
    );
    console.log(
      '[zombie-creator] Run "ps aux | grep defunct" to see zombie processes'
    );
  }

  if (secondsAlive >= 10) {
    console.log('[zombie-creator] Parent exiting without reaping zombies');
    clearInterval(keepAliveInterval);

    // Exit without waiting for children - they become zombies
    // In a real scenario, init (PID 1) would adopt and reap them
    process.exit(0);
  }
}, 1000);

// Explicitly NOT waiting for children to demonstrate zombie creation
// In proper code, we would do:
// children.forEach(child => {
//   child.on('exit', () => { /* reap child */ });
// });
