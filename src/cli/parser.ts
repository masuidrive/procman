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
import * as runCommand from './commands/run.js';
import * as taskCommand from './commands/task.js';

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
      .option('--verbose', 'Enable verbose error output for debugging')
      .option(
        '--socket <path>',
        'Socket path for daemon communication (default: ./.procman.sock, env: PROCMAN_SOCKET_PATH)'
      );

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
        '\n' +
        '  3. Run background tasks (for AI agents):\n' +
        '     $ procman run "npm test" --json       Run a one-shot task\n' +
        '     $ procman task list --json             List running tasks\n' +
        '     $ procman task log <id> --wait-exit --timeout 60s --json\n' +
        '     $ procman task kill <id>               Kill a task\n' +
        '\n' +
        'Socket:\n' +
        '  Default socket path: ./.procman.sock (relative to working directory)\n' +
        '  Override with: --socket <path> or PROCMAN_SOCKET_PATH env var\n' +
        '  Tip: Add ".procman.sock" to .gitignore\n' +
        '\n  Run "procman help" for full documentation and examples.'
    );

    // Set up global options before command execution
    this.program.hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts.verbose) {
        setVerboseMode(true);
      }
      if (opts.socket) {
        process.env.PROCMAN_SOCKET_PATH = opts.socket;
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

    // Run command - one-shot task execution
    this.program
      .command('run <command...>')
      .description('Run a command as a background task')
      .option('--json', 'Output in JSON format')
      .option('--name <name>', 'Task name')
      .action(async (command: string[], options) => {
        await runCommand.execute(command, options);
      });

    // Task command - task management
    const taskCmd = this.program
      .command('task')
      .description('Manage background tasks');

    taskCmd
      .command('status <id>')
      .description('Get task status')
      .option('--json', 'Output in JSON format')
      .action(async (id: string, options) => {
        await taskCommand.executeStatus(id, options);
      });

    taskCmd
      .command('list')
      .description('List all tasks')
      .option('--json', 'Output in JSON format')
      .action(async (options) => {
        await taskCommand.executeList(options);
      });

    taskCmd
      .command('kill <id>')
      .description('Kill a running task')
      .option('--json', 'Output in JSON format')
      .option('-s, --signal <signal>', 'Signal to send', 'SIGTERM')
      .action(async (id: string, options) => {
        await taskCommand.executeKill(id, options);
      });

    taskCmd
      .command('log <id>')
      .description('Get task output')
      .option('--json', 'Output in JSON format')
      .option('--wait-lines <n>', 'Wait for N lines of output', parseInt)
      .option('--wait-match <pattern>', 'Wait for regex pattern match')
      .option('--wait-exit', 'Wait for task to exit')
      .option('--timeout <duration>', 'Timeout (e.g. 30s, 5m)')
      .action(async (id: string, options) => {
        await taskCommand.executeLog(id, options);
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
