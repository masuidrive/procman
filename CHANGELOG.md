# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-08-15

### Changed

- **Enhanced CI/CD Pipeline**: Complete GitHub Actions workflow optimization
  - Added Node.js 18.x/20.x matrix testing for better compatibility
  - Upgraded to modern `softprops/action-gh-release@v2` for reliable releases
  - Implemented full test suite execution (1019 tests) before npm publishing
  - Enhanced test-stages workflow for comprehensive CI across all branches
- **Repository Cleanup**: Removed development artifacts for cleaner npm package
- **CI Environment Fixes**: Resolved all test failures in GitHub Actions environment
  - Fixed process.exit mock issues causing Unhandled Rejections
  - Optimized vitest configuration for CI stability
  - Achieved 100% test success rate (1019/1019 tests passing)

### Fixed

- **Test Stability**: Fixed graceful-shutdown-integration test Unhandled Rejection errors
- **TypeScript Compatibility**: Resolved process.exit type definition issues
- **ESLint Compliance**: Fixed all formatting errors for consistent code style

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