#!/usr/bin/env node
import { CommandParser } from './parser.js';

async function main(): Promise<void> {
  const parser = new CommandParser({
    name: 'procman',
    description: 'Process Manager CLI Tool',
    version: '0.1.0',
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
