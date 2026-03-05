#!/usr/bin/env node
import { createRequire } from 'module';
import { CommandParser } from './parser.js';
import {
  setupGlobalCLISignalHandling,
  cleanupGlobalCLISignalHandling,
} from './signal-handler.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json') as { version: string };

async function main(): Promise<void> {
  // Setup global signal handling for CLI
  setupGlobalCLISignalHandling(async () => {
    // Global cleanup function - will be called before process exit
    cleanupGlobalCLISignalHandling();
  });

  const parser = new CommandParser({
    name: 'procman',
    description: 'Process Manager CLI Tool',
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
