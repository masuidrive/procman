/**
 * Help command implementation
 *
 * This command displays usage information for the procman CLI.
 */

import chalk from 'chalk';
import { findPackageJson } from '../utils/find-package-json.js';

const pkg = findPackageJson();

export interface HelpCommandOptions {
  format?: 'markdown' | 'text';
}

const HELP_CONTENT = {
  overview: {
    title: '@masuidrive/procman - Process Manager',
    description:
      'A powerful process manager for managing multiple applications with advanced features like memory monitoring, auto-restart, and detailed logging.',
    version: pkg.version,
  },
  commands: [
    {
      name: 'load',
      alias: null,
      description: 'Load configuration file and start daemon if not running',
      usage: 'procman load <config-file>',
      options: [
        {
          flag: '-c, --config <path>',
          desc: 'Specify configuration file path',
        },
        {
          flag: '-n, --namespace <ns>',
          desc: 'Namespace for process management',
        },
      ],
      examples: [
        'procman load ./config.js',
        'procman load -c /path/to/config.js',
        'procman load ./config.js -n production',
      ],
    },
    {
      name: 'start',
      alias: null,
      description: 'Start one or more processes',
      usage: 'procman start <name> [name2 ...]',
      options: [{ flag: '-n, --namespace <ns>', desc: 'Target namespace' }],
      examples: [
        'procman start web-server',
        'procman start web-server worker-queue',
        'procman start all',
        'procman start web-server -n production',
      ],
    },
    {
      name: 'stop',
      alias: null,
      description: 'Stop one or more processes',
      usage: 'procman stop <name> [name2 ...]',
      options: [{ flag: '-n, --namespace <ns>', desc: 'Target namespace' }],
      examples: [
        'procman stop web-server',
        'procman stop web-server worker-queue',
        'procman stop all',
        'procman stop web-server -n production',
      ],
    },
    {
      name: 'restart',
      alias: null,
      description: 'Restart one or more processes',
      usage: 'procman restart <name> [name2 ...]',
      options: [{ flag: '-n, --namespace <ns>', desc: 'Target namespace' }],
      examples: [
        'procman restart web-server',
        'procman restart web-server worker-queue',
        'procman restart all',
        'procman restart web-server -n production',
      ],
    },
    {
      name: 'list',
      alias: 'ls',
      description: 'List all managed processes',
      usage: 'procman list',
      options: [
        { flag: '-n, --namespace <ns>', desc: 'Filter by namespace' },
        {
          flag: '-f, --format <format>',
          desc: 'Output format: table, json, yaml',
        },
      ],
      examples: [
        'procman list',
        'procman ls',
        'procman list -f json',
        'procman list -n production',
        'procman list -f yaml -n production',
      ],
    },
    {
      name: 'log',
      alias: null,
      description: 'Display logs from a process',
      usage: 'procman log <name>',
      options: [
        { flag: '-n, --lines <n>', desc: 'Number of lines to display' },
        { flag: '--human', desc: 'Human-readable format with colors' },
        { flag: '--stream', desc: 'Stream logs in real-time' },
        { flag: '--namespace <ns>', desc: 'Target namespace' },
      ],
      examples: [
        'procman log web-server',
        'procman log web-server -n 100',
        'procman log web-server --human',
        'procman log web-server --stream',
        'procman log web-server --stream --human',
      ],
    },
    {
      name: 'clear-log',
      alias: null,
      description: 'Clear logs for a process',
      usage: 'procman clear-log <name>',
      options: [{ flag: '-n, --namespace <ns>', desc: 'Target namespace' }],
      examples: [
        'procman clear-log web-server',
        'procman clear-log web-server -n production',
      ],
    },
    {
      name: 'exit',
      alias: null,
      description: 'Stop all processes and shutdown daemon',
      usage: 'procman exit',
      options: [{ flag: '-f, --force', desc: 'Force immediate shutdown' }],
      examples: ['procman exit', 'procman exit --force'],
    },
    {
      name: 'run',
      alias: null,
      description: 'Run a command as a background task (for AI agents)',
      usage: 'procman run "<command>" [options]',
      options: [
        { flag: '--json', desc: 'Output in JSON format' },
        { flag: '--name <name>', desc: 'Task name (auto-generated if omitted)' },
      ],
      examples: [
        'procman run "npm test" --json',
        'procman run "node server.js" --name my-server --json',
      ],
    },
    {
      name: 'task',
      alias: null,
      description: 'Manage background tasks (status, list, kill, log)',
      usage: 'procman task <subcommand>',
      options: [
        { flag: 'status <id> --json', desc: 'Get task status and exit code' },
        { flag: 'list --json', desc: 'List all tasks' },
        { flag: 'kill <id> -s <signal>', desc: 'Kill a running task' },
        { flag: 'log <id> [wait-options]', desc: 'Get task output' },
      ],
      examples: [
        'procman task status task-a1b2c3 --json',
        'procman task list --json',
        'procman task kill task-a1b2c3',
        'procman task log task-a1b2c3 --wait-exit --timeout 60s --json',
        'procman task log task-a1b2c3 --wait-match "READY" --timeout 30s --json',
        'procman task log task-a1b2c3 --wait-lines 10 --timeout 10s --json',
      ],
    },
    {
      name: 'help',
      alias: 'prompt',
      description: 'Display help information',
      usage: 'procman help [command]',
      options: [
        {
          flag: '-f, --format <format>',
          desc: 'Output format: markdown, text',
        },
      ],
      examples: [
        'procman help',
        'procman help start',
        'procman help -f markdown',
        'procman prompt',
      ],
    },
  ],
  configuration: {
    title: 'Configuration File Format',
    description:
      'Configuration files are JavaScript modules that export a configuration object.',
    example: `module.exports = {
  apps: [
    {
      name: 'web-server',
      script: './server.js',
      args: '--port 3000',
      env: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '500M',
      instances: 2,
      autorestart: true,
      watch: false
    },
    {
      name: 'worker-queue',
      script: './worker.js',
      max_memory_restart: '1G',
      instances: 1,
      autorestart: true
    }
  ]
};`,
  },
  socket: {
    title: 'Socket Configuration',
    description:
      'procman uses a Unix domain socket for CLI-to-daemon communication.',
    details: [
      'Default path: ./.procman.sock (relative to working directory)',
      'Override with --socket <path> option or PROCMAN_SOCKET_PATH environment variable',
      'Tip: Add ".procman.sock" to your .gitignore',
    ],
    examples: [
      'procman load config.js --socket /tmp/my-app.sock',
      'PROCMAN_SOCKET_PATH=/tmp/my-app.sock procman list',
    ],
  },
  troubleshooting: {
    title: 'Common Issues and Solutions',
    issues: [
      {
        problem: 'Daemon is not running',
        solution: 'Start the daemon using: procman load <config-file>',
      },
      {
        problem: 'Permission denied errors',
        solution:
          'Check that you have write permissions to ./.procman.sock or specify a different path with --socket',
      },
      {
        problem: 'Process not starting',
        solution:
          'Check the process logs using: procman log <process-name> --human',
      },
      {
        problem: 'Memory limit exceeded',
        solution:
          'Increase max_memory_restart in your configuration file or optimize your application',
      },
      {
        problem: 'Cannot connect to daemon',
        solution:
          'Ensure the daemon is running and check for socket file conflicts. Use --socket to specify a custom path.',
      },
    ],
  },
  workflow: {
    title: 'Typical Workflow',
    steps: [
      '1. Create a configuration file (config.js)',
      '2. Load configuration and start daemon: procman load config.js',
      '3. List processes: procman list',
      '4. Start processes: procman start all',
      '5. Monitor logs: procman log <name> --stream --human',
      '6. Restart if needed: procman restart <name>',
      '7. Run a background task: procman run "npm test" --json',
      '8. Check task result: procman task log <id> --wait-exit --timeout 60s --json',
      '9. Stop processes: procman stop all',
      '10. Shutdown daemon: procman exit',
    ],
  },
};

export async function execute(
  args: string[],
  options: HelpCommandOptions
): Promise<void> {
  const format = options.format || 'text';
  const commandName = args[0];

  if (commandName) {
    // Show help for specific command
    const command = HELP_CONTENT.commands.find(
      (cmd) => cmd.name === commandName || cmd.alias === commandName
    );

    if (!command) {
      console.error(chalk.red(`Unknown command: ${commandName}`));
      console.log(chalk.yellow('Run "procman help" to see available commands'));
      process.exit(1);
    }

    displayCommandHelp(command, format);
  } else {
    // Show general help
    displayGeneralHelp(format);
  }
}

function displayCommandHelp(
  command: (typeof HELP_CONTENT.commands)[0],
  format: string
): void {
  if (format === 'markdown') {
    // Markdown format
    console.log(`## ${command.name}`);
    if (command.alias) {
      console.log(`\nAlias: \`${command.alias}\``);
    }
    console.log(`\n${command.description}`);
    console.log(`\n### Usage\n\n\`\`\`bash\n${command.usage}\n\`\`\``);

    if (command.options.length > 0) {
      console.log('\n### Options\n');
      for (const opt of command.options) {
        console.log(`- \`${opt.flag}\`: ${opt.desc}`);
      }
    }

    if (command.examples.length > 0) {
      console.log('\n### Examples\n\n```bash');
      for (const example of command.examples) {
        console.log(example);
      }
      console.log('```');
    }
  } else {
    // Text format with colors
    console.log(chalk.bold.cyan(`\n${command.name.toUpperCase()}`));
    if (command.alias) {
      console.log(chalk.gray(`Alias: ${command.alias}`));
    }
    console.log(chalk.white(command.description));
    console.log(chalk.yellow('\nUsage:'), command.usage);

    if (command.options.length > 0) {
      console.log(chalk.yellow('\nOptions:'));
      for (const opt of command.options) {
        console.log(`  ${chalk.green(opt.flag.padEnd(25))} ${opt.desc}`);
      }
    }

    if (command.examples.length > 0) {
      console.log(chalk.yellow('\nExamples:'));
      for (const example of command.examples) {
        console.log(`  ${chalk.gray('$')} ${example}`);
      }
    }
  }
}

function displayGeneralHelp(format: string): void {
  if (format === 'markdown') {
    // Markdown format
    console.log(`# ${HELP_CONTENT.overview.title}`);
    console.log(`\nVersion: ${HELP_CONTENT.overview.version}`);
    console.log(`\n${HELP_CONTENT.overview.description}`);

    console.log('\n## Commands\n');
    for (const cmd of HELP_CONTENT.commands) {
      const alias = cmd.alias ? ` (${cmd.alias})` : '';
      console.log(`- \`${cmd.name}\`${alias}: ${cmd.description}`);
    }

    console.log(`\n## ${HELP_CONTENT.configuration.title}\n`);
    console.log(HELP_CONTENT.configuration.description);
    console.log('\n### Example Configuration\n');
    console.log('```javascript');
    console.log(HELP_CONTENT.configuration.example);
    console.log('```');

    console.log(`\n## ${HELP_CONTENT.socket.title}\n`);
    console.log(HELP_CONTENT.socket.description);
    console.log('');
    for (const detail of HELP_CONTENT.socket.details) {
      console.log(`- ${detail}`);
    }
    if (HELP_CONTENT.socket.examples.length > 0) {
      console.log('\n```bash');
      for (const example of HELP_CONTENT.socket.examples) {
        console.log(example);
      }
      console.log('```');
    }

    console.log(`\n## ${HELP_CONTENT.workflow.title}\n`);
    for (const step of HELP_CONTENT.workflow.steps) {
      console.log(step);
    }

    console.log(`\n## ${HELP_CONTENT.troubleshooting.title}\n`);
    for (const issue of HELP_CONTENT.troubleshooting.issues) {
      console.log(`### ${issue.problem}\n`);
      console.log(`${issue.solution}\n`);
    }
  } else {
    // Text format with colors
    console.log(chalk.bold.cyan(`\n${HELP_CONTENT.overview.title}`));
    console.log(chalk.gray(`Version: ${HELP_CONTENT.overview.version}`));
    console.log(chalk.white(`\n${HELP_CONTENT.overview.description}`));

    console.log(chalk.bold.yellow('\n📋 Available Commands:\n'));
    for (const cmd of HELP_CONTENT.commands) {
      const alias = cmd.alias ? chalk.gray(` (${cmd.alias})`) : '';
      console.log(
        `  ${chalk.green(cmd.name.padEnd(12))}${alias.padEnd(8)} ${chalk.white(
          cmd.description
        )}`
      );
    }

    console.log(
      chalk.bold.yellow(`\n📝 ${HELP_CONTENT.configuration.title}:\n`)
    );
    console.log(chalk.white(HELP_CONTENT.configuration.description));
    console.log(chalk.gray('\nExample:'));
    console.log(chalk.gray('--------'));
    const lines = HELP_CONTENT.configuration.example.split('\n');
    for (const line of lines) {
      console.log(chalk.gray(line));
    }

    console.log(
      chalk.bold.yellow(`\n🔌 ${HELP_CONTENT.socket.title}:\n`)
    );
    console.log(chalk.white(`  ${HELP_CONTENT.socket.description}`));
    for (const detail of HELP_CONTENT.socket.details) {
      console.log(chalk.white(`  - ${detail}`));
    }
    for (const example of HELP_CONTENT.socket.examples) {
      console.log(`  ${chalk.gray('$')} ${example}`);
    }

    console.log(chalk.bold.yellow(`\n🚀 ${HELP_CONTENT.workflow.title}:\n`));
    for (const step of HELP_CONTENT.workflow.steps) {
      console.log(chalk.white(`  ${step}`));
    }

    console.log(
      chalk.bold.yellow(`\n⚠️  ${HELP_CONTENT.troubleshooting.title}:\n`)
    );
    for (const issue of HELP_CONTENT.troubleshooting.issues) {
      console.log(chalk.red(`  Problem: ${issue.problem}`));
      console.log(chalk.green(`  Solution: ${issue.solution}\n`));
    }

    console.log(chalk.cyan('\n💡 For more information on a specific command:'));
    console.log(chalk.white('   procman help <command>\n'));
    console.log(chalk.cyan('📚 Documentation:'));
    console.log(chalk.white('   https://github.com/masuidrive/procman\n'));
  }
}
