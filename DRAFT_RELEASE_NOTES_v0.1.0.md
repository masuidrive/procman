# Release Notes: @masuidrive/procman v0.1.0

🎉 **Initial Public Release**

We're excited to announce the first public release of @masuidrive/procman - a lightweight process management daemon tool designed specifically for development environments.

## 🚀 Key Features

### Process Lifecycle Management
- **Simple CLI commands**: `start`, `stop`, `restart`, `status`, `list`, `log`, `health`, `help`
- **Configuration-based management**: Bulk process management using JSON, JS, or CJS configuration files
- **Namespace support**: Organize and manage processes by namespace for better project isolation

### Memory Management & Monitoring
- **Memory-based auto restart**: Automatic process restart when memory usage exceeds configured limits
- **Memory leak detection**: Built-in monitoring and prevention patterns
- **PM2-compatible**: Supports `max_memory_restart` option for familiar configuration

### Logging & Monitoring
- **Structured log aggregation**: Centralized logging system for all managed processes
- **Health monitoring**: `procman health` command provides real-time memory usage and system status
- **Configurable log levels**: Fine-grained control over logging verbosity

### Cross-Platform Support
- **Linux**: Full support with Unix Domain Sockets
- **macOS**: Full support with Unix Domain Sockets  
- **Windows**: Basic support with Named Pipes
- **Node.js 18+**: Compatible with modern Node.js versions

### Developer Experience
- **TypeScript support**: Full type definitions included
- **EventEmitter leak prevention**: Automatic cleanup patterns prevent memory leaks
- **Graceful shutdown**: Clean state preservation and connection draining
- **Daemon architecture**: Persistent process management without blocking your terminal

## 📦 Installation

### As a dependency in your project:
```bash
npm install @masuidrive/procman
```

### Global CLI installation:
```bash
npm install -g @masuidrive/procman
```

### Verify installation:
```bash
procman --version  # Should output: 0.1.0
procman --help     # Display available commands
```

## 🏃 Quick Start

### 1. Basic Process Management
```bash
# Start a process
procman start my-app "node server.js"

# Check status
procman status my-app

# View logs
procman log my-app

# Stop process
procman stop my-app
```

### 2. Configuration File Usage
Create a `procman.config.js`:
```javascript
module.exports = {
  namespace: 'my-project',
  processes: {
    'web-server': {
      command: 'node',
      args: ['server.js'],
      env: {
        PORT: '3000',
        NODE_ENV: 'development'
      },
      max_memory_restart: '500M',
      log: {
        enabled: true,
        level: 'info'
      }
    },
    'worker': {
      command: 'node',
      args: ['worker.js'],
      max_memory_restart: '200M'
    }
  }
};
```

Load and manage:
```bash
# Load configuration
procman load procman.config.js

# Start all processes
procman start -a

# Monitor health
procman health
```

## 🔧 Configuration Options

### Process Configuration
- `command`: Executable command
- `args`: Command arguments array
- `cwd`: Working directory
- `env`: Environment variables
- `max_memory_restart`: Memory limit for auto-restart (e.g., '100M', '1G')
- `log`: Logging configuration

### Logging Configuration
- `enabled`: Enable/disable logging
- `level`: Log level (`error`, `warn`, `info`, `debug`)
- `file`: Custom log file path

## 🛠️ Development

### TypeScript Support
```typescript
import { ProcessInfo } from '@masuidrive/procman';

const process: ProcessInfo = {
  name: 'my-process',
  status: 'running',
  pid: 12345,
  cpu: 0.5,
  memory: 1024
};
```

### Requirements
- **Node.js**: 18.0.0 or higher
- **Operating System**: Linux (recommended), macOS, or Windows

## 📊 Package Stats
- **Package size**: 275.1 kB
- **Unpacked size**: 1.4 MB
- **Dependencies**: Minimal runtime dependencies for optimal performance
- **TypeScript**: Full type definitions included

## 🔗 Links
- **Repository**: https://github.com/masuidrive/procman
- **Issues**: https://github.com/masuidrive/procman/issues
- **NPM Package**: https://www.npmjs.com/package/@masuidrive/procman
- **Documentation**: https://github.com/masuidrive/procman#readme

## 🙏 Acknowledgments

This project follows the teachings of:
- **t_wada**: Test-driven development principles and code quality standards
- **Robert C. Martin (Uncle Bob)**: Clean code architecture and SOLID principles

## 🐛 Known Issues

None at this time. Please report any issues on our [GitHub Issues page](https://github.com/masuidrive/procman/issues).

## 📈 What's Next?

Future versions may include:
- Enhanced Windows support
- Process dependency management
- Web dashboard interface
- Clustering support
- Additional log output formats

## 📄 License

MIT License - see [LICENSE](https://github.com/masuidrive/procman/blob/main/LICENSE) file for details.

---

**Full Changelog**: https://github.com/masuidrive/procman/blob/main/CHANGELOG.md

Thank you for trying @masuidrive/procman! We look forward to your feedback and contributions.