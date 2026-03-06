#!/usr/bin/env node
import { CommandParser } from './parser.js';
import {
  setupGlobalCLISignalHandling,
  cleanupGlobalCLISignalHandling,
} from './signal-handler.js';
import { findPackageJson } from './utils/find-package-json.js';

const pkg = findPackageJson();

async function main(): Promise<void> {
  // Setup global signal handling for CLI
  setupGlobalCLISignalHandling(async () => {
    // Global cleanup function - will be called before process exit
    cleanupGlobalCLISignalHandling();
  });

  const parser = new CommandParser({
    name: 'procman',
    description:
      'Run multiple servers and workers in one terminal for local development.\n' +
      'Define your processes in a JS config file, then start/stop/restart them together.\n' +
      'Features: auto-restart on crash, memory limit monitoring, real-time log streaming.',
    version: pkg.version,
  });

  try {
    await parser.parseAsync();
  } catch (error) {
    console.error(
      'Error:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Always run main when this file is executed
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
