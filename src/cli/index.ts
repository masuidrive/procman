#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('procman')
  .description('Process Manager CLI Tool')
  .version('0.1.0');

program
  .command('status')
  .description('Show process status')
  .action(() => {
    console.log('Process status feature will be implemented');
  });

program
  .command('start <service>')
  .description('Start a service')
  .action((service: string) => {
    console.log(`Starting service: ${service}`);
  });

program
  .command('stop <service>')
  .description('Stop a service')
  .action((service: string) => {
    console.log(`Stopping service: ${service}`);
  });

program.parse();
