# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-08-12

### Added

- **Process Lifecycle Management**: Start, stop, restart processes with simple CLI commands
- **Configuration-Based Management**: Bulk management using configuration files (JSON, JS, CJS formats)
- **Structured Log Aggregation**: Centralized logging system for all managed processes
- **Memory-Based Auto Restart**: Automatic process restart when memory usage exceeds configured limits
- **Namespace Support**: Process grouping and management by namespace
- **Memory Leak Detection**: Built-in memory leak prevention and monitoring
- **Cross-Platform IPC**: Unix Domain Socket (Linux/macOS) and Named Pipe (Windows) communication
- **Health Monitoring**: `procman health` command for memory usage and system status monitoring
- **Graceful Shutdown**: Clean state preservation and connection draining

### Features

- CLI commands: `start`, `stop`, `restart`, `status`, `list`, `log`, `health`, `help`
- PM2-compatible memory management with `max_memory_restart` option
- EventEmitter leak prevention with automatic cleanup patterns
- Daemon-based architecture for persistent process management
- TypeScript support with full type definitions
- Comprehensive test suite (unit, integration, E2E)

### Platform Support

- Linux (full support)
- macOS (full support) 
- Windows (basic support)

### Requirements

- Node.js 18.0.0 or higher

[0.1.0]: https://github.com/masuidrive/procman/releases/tag/v0.1.0