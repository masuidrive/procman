import { Command } from 'commander';

// Command handlers
import * as loadCommand from './commands/load.js';
import * as startCommand from './commands/start.js';
import * as stopCommand from './commands/stop.js';
import * as restartCommand from './commands/restart.js';
import * as exitCommand from './commands/exit.js';
import * as listCommand from './commands/list.js';
import * as logCommand from './commands/log.js';
import * as clearLogCommand from './commands/clear-log.js';
import * as helpCommand from './commands/help.js';

// Error handling utilities
import { setVerboseMode } from './utils/error-handler.js';

export interface CLIConfig {
  name: string;
  description: string;
  version: string;
}

export class CommandParser {
  private program: Command;

  constructor(config: CLIConfig) {
    this.program = new Command();
    this.program
      .name(config.name)
      .description(config.description)
      .version(config.version)
      .option('--verbose', 'Enable verbose error output for debugging');

    this.program.addHelpText(
      'after',
      '\nQuick Start:\n' +
        '  1. Create a config file (e.g. procman.config.js):\n' +
        '     module.exports = { apps: [\n' +
        "       { name: 'api',    script: 'node server.js' },\n" +
        "       { name: 'worker', script: 'node worker.js' },\n" +
        '     ] };\n' +
        '\n' +
        '  2. Run:\n' +
        '     $ procman load ./procman.config.js   Load config and start daemon\n' +
        '     $ procman list                       Show process status\n' +
        '     $ procman log api --stream            Stream logs in real-time\n' +
        '     $ procman restart worker              Restart a process\n' +
        '     $ procman exit                        Stop all and shutdown\n' +
        '\n  Run "procman help" for full documentation and examples.'
    );

    // Set up global verbose flag before command execution
    this.program.hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts.verbose) {
        setVerboseMode(true);
      }
    });

    this.setupCommands();
  }

  private setupCommands(): void {
    // Load command - configuration file loading and daemon startup
    this.program
      .command('load [configFile]')
      .description('Load configuration file and start daemon')
      .option('-n, --namespace <name>', 'Target namespace')
      .option('-c, --config <path>', 'Configuration file path')
      .action(async (configFile, options) => {
        const args: string[] = configFile ? [configFile] : [];
        await loadCommand.execute(args, options);
      });

    // Start command - process startup
    this.program
      .command('start [targets...]')
      .description('Start process(es)')
      .option('-n, --namespace <name>', 'Target namespace')
      .option('-a, --all', 'Start all processes')
      .action(async (targets: string[] = [], options) => {
        await startCommand.execute(targets, options);
      });

    // Stop command - process stop
    this.program
      .command('stop [targets...]')
      .description('Stop process(es)')
      .option('-n, --namespace <name>', 'Target namespace')
      .option('-a, --all', 'Stop all processes')
      .option('-f, --force', 'Force stop without graceful shutdown')
      .action(async (targets: string[] = [], options) => {
        await stopCommand.execute(targets, options);
      });

    // Restart command - process restart
    this.program
      .command('restart [targets...]')
      .description('Restart process(es)')
      .option('-n, --namespace <name>', 'Target namespace')
      .option('-a, --all', 'Restart all processes')
      .action(async (targets: string[] = [], options) => {
        await restartCommand.execute(targets, options);
      });

    // Exit command - daemon shutdown
    this.program
      .command('exit')
      .description('Exit daemon')
      .option('-f, --force', 'Force exit without graceful shutdown')
      .action(async (options) => {
        const args: string[] = [];
        await exitCommand.execute(args, options);
      });

    // List/ls command - process list
    this.program
      .command('list')
      .alias('ls')
      .description('List processes')
      .option('-n, --namespace <name>', 'Target namespace')
      .option(
        '-f, --format <format>',
        'Output format (table|yaml|json)',
        'table'
      )
      .action(async (options) => {
        const args: string[] = [];
        await listCommand.execute(args, options);
      });

    // Log command - log display
    this.program
      .command('log [targets...]')
      .description('Show logs')
      .option('-n, --lines <lines>', 'Number of lines to show', parseInt)
      .option('--human', 'Human readable format')
      .option('--stream', 'Stream logs in real-time')
      .option('--namespace <name>', 'Target namespace')
      .action(async (targets: string[] = [], options) => {
        await logCommand.execute(targets, options);
      });

    // Clear-log command - log clear
    this.program
      .command('clear-log [targets...]')
      .description('Clear logs')
      .option('-n, --namespace <name>', 'Target namespace')
      .action(async (targets: string[] = [], options) => {
        await clearLogCommand.execute(targets, options);
      });

    // Help command - help display
    this.program
      .command('help')
      .alias('prompt')
      .description('Show detailed help for AI coding assistant')
      .option(
        '-f, --format <format>',
        'Output format (markdown|text)',
        'markdown'
      )
      .action(async (options) => {
        const args: string[] = [];
        await helpCommand.execute(args, options);
      });
  }

  public parse(argv?: string[]): void {
    this.program.parse(argv);
  }

  public async parseAsync(argv?: string[]): Promise<void> {
    const args = argv || process.argv;
    // Show help when no command is provided (only program name + script)
    if (args.length <= 2) {
      this.program.outputHelp();
      return;
    }
    await this.program.parseAsync(argv);
  }

  public outputHelp(): void {
    this.program.outputHelp();
  }
}
