/**
 * CLI entry point basic tests
 */
import { describe, it, expect } from 'vitest';
import { ProcessInfo, ServiceConfig, CliOptions } from '../src/types';

describe('Type definitions', () => {
  it('should have correct ProcessInfo interface', () => {
    const processInfo: ProcessInfo = {
      pid: 1234,
      name: 'test-process',
      status: 'running',
    };

    expect(processInfo.pid).toBe(1234);
    expect(processInfo.name).toBe('test-process');
    expect(processInfo.status).toBe('running');
  });

  it('should have correct ServiceConfig interface', () => {
    const config: ServiceConfig = {
      name: 'test-service',
      command: 'node app.js',
      cwd: '/path/to/app',
      env: { NODE_ENV: 'production' },
    };

    expect(config.name).toBe('test-service');
    expect(config.command).toBe('node app.js');
    expect(config.cwd).toBe('/path/to/app');
    expect(config.env?.NODE_ENV).toBe('production');
  });

  it('should have correct CliOptions interface', () => {
    const options: CliOptions = {
      verbose: true,
      config: '/path/to/config.js',
    };

    expect(options.verbose).toBe(true);
    expect(options.config).toBe('/path/to/config.js');
  });
});
