# Memory Management

## Overview

Procman provides comprehensive memory management features to prevent memory leaks and ensure stable long-term operation of your Node.js applications.

## Features

### 1. Process Memory Monitoring

Each managed process can have a memory limit configured using the `max_memory_restart` option. When a process exceeds this limit, it is automatically restarted.

```javascript
// procman.config.js
module.exports = {
  apps: [{
    name: 'my-app',
    script: './app.js',
    max_memory_restart: '500M'  // Restart when RSS exceeds 500MB
  }]
};
```

**Supported Units:**
- Numbers: bytes (e.g., `1024`)
- K: kilobytes (e.g., `512K`)
- M: megabytes (e.g., `500M`)
- G: gigabytes (e.g., `1G`)

### 2. Daemon Memory Monitoring

The Procman daemon monitors its own memory usage and logs warnings when thresholds are exceeded:

- **Warning threshold**: 100MB
- **Critical threshold**: 200MB

> **Note**: Following PM2's design, the daemon does not auto-restart itself. Daemon lifecycle should be managed by systemd, PM2, or other process supervisors.

### 3. EventEmitter Listener Management

Procman uses the `EventCleanupHelper` pattern to prevent EventEmitter memory leaks:

```typescript
// Internal implementation
class EventCleanupHelper {
  track(emitter: EventEmitter, event: string, listener: Function): void
  dispose(): Promise<void>
}
```

This ensures all event listeners are properly cleaned up during shutdown, preventing memory leaks from accumulating over time.

### 4. Graceful Shutdown with State Preservation

When shutting down, Procman:
1. Saves current state to `~/.masuidrive-procman/shutdown-state.json`
2. Drains active connections gracefully
3. Stops all managed processes cleanly
4. Releases all resources

## Architecture

### Memory Monitor

The `MemoryMonitor` class runs every 30 seconds (PM2 standard) to check memory usage:

```
┌─────────────────┐
│  MemoryMonitor  │
├─────────────────┤
│ Check interval  │ → 30 seconds
│ Warning: 100MB  │ → Log warning
│ Critical: 200MB │ → Log critical
└─────────────────┘
```

### Process Memory Management

```
┌──────────────────────┐
│   ProcessMonitor     │
├──────────────────────┤
│ Checks each process  │
│ every 30 seconds     │
├──────────────────────┤
│ If RSS > max_memory │
│ → Emit restart event │
│ → ProcessManager     │
│   restarts process   │
└──────────────────────┘
```

## Configuration

### Per-Process Memory Limits

Set memory limits in your configuration file:

```javascript
module.exports = {
  apps: [
    {
      name: 'api-server',
      script: './api/server.js',
      max_memory_restart: '1G'
    },
    {
      name: 'worker',
      script: './worker/index.js',
      max_memory_restart: '500M'
    },
    {
      name: 'lightweight-task',
      script: './tasks/cron.js'
      // No limit - process won't restart based on memory
    }
  ]
};
```

### Environment Variables

Control daemon memory monitoring logging:

```bash
# Disable memory monitoring logs in test environment
NODE_ENV=test procman load config.js
```

## Best Practices

### 1. Set Appropriate Memory Limits

- **Production servers**: Set limits 20-30% below available RAM
- **Development**: Use lower limits to catch leaks early
- **Memory-intensive tasks**: Set higher limits or disable

### 2. Monitor Memory Trends

Check daemon health regularly:

```bash
procman health
```

Example output:
```json
{
  "memory": {
    "status": "healthy",
    "currentMemory": {
      "rss": 45231104,
      "heapUsed": 23456789
    },
    "thresholds": {
      "warning": 104857600,
      "critical": 209715200
    }
  }
}
```

### 3. Handle Memory Warnings

When you see memory warnings in logs:

1. Check for memory leaks in your application
2. Review EventEmitter listener registrations
3. Ensure streams are properly closed
4. Check for growing arrays or caches

### 4. Graceful Shutdown

Always use graceful shutdown to preserve state:

```bash
# Graceful shutdown
procman kill

# Force kill (avoid unless necessary)
procman kill --force
```

## Troubleshooting

### High Memory Usage in Managed Processes

**Symptom**: Process repeatedly restarts due to memory limit

**Solutions**:
1. Increase `max_memory_restart` limit
2. Profile application for memory leaks
3. Check for unbounded data structures
4. Review third-party module usage

### Daemon Memory Growth

**Symptom**: Daemon memory increases over time

**Solutions**:
1. Check for EventEmitter leaks in custom scripts
2. Ensure all processes are properly stopped
3. Review log file sizes (rotate if needed)
4. Restart daemon periodically via systemd/cron

### Memory Limit Not Working

**Symptom**: Process exceeds limit but doesn't restart

**Check**:
1. Verify `max_memory_restart` is properly formatted
2. Check process monitor is running: `procman status`
3. Review logs for memory check events
4. Ensure process hasn't hit max restart limit

## Memory Leak Detection Patterns

### Common Node.js Memory Leaks

1. **EventEmitter Leaks**
```javascript
// BAD - Leaks listeners
emitter.on('data', function() { ... });

// GOOD - Clean up listeners
const handler = function() { ... };
emitter.on('data', handler);
// Later...
emitter.removeListener('data', handler);
```

2. **Global Variable Growth**
```javascript
// BAD - Unbounded growth
global.cache = global.cache || [];
global.cache.push(data);

// GOOD - Bounded cache
const LRU = require('lru-cache');
const cache = new LRU({ max: 500 });
```

3. **Unclosed Resources**
```javascript
// BAD - Stream not closed
const stream = fs.createReadStream(file);
stream.on('data', processData);

// GOOD - Ensure cleanup
const stream = fs.createReadStream(file);
stream.on('data', processData);
stream.on('end', () => stream.destroy());
stream.on('error', () => stream.destroy());
```

## Integration with Monitoring Tools

### PM2 Integration

When running Procman under PM2:

```javascript
// ecosystem.config.js for PM2
module.exports = {
  apps: [{
    name: 'procman-daemon',
    script: 'procman',
    args: 'load /path/to/config.js',
    max_memory_restart: '500M',  // PM2 monitors Procman daemon
    error_file: '/var/log/procman-error.log',
    out_file: '/var/log/procman-out.log'
  }]
};
```

### Systemd Integration

```ini
# /etc/systemd/system/procman.service
[Service]
MemoryMax=500M
MemoryAccounting=true
Restart=on-failure
```

## Performance Impact

Memory monitoring has minimal performance impact:

- **CPU**: < 0.1% (checks every 30 seconds)
- **Memory**: ~2-5MB for monitoring infrastructure
- **I/O**: Minimal (only during state saves)

## Summary

Procman's memory management provides:

- ✅ Automatic restart for memory-leaking processes
- ✅ Memory usage monitoring and alerts
- ✅ EventEmitter leak prevention
- ✅ Graceful shutdown with state preservation
- ✅ PM2-compatible configuration

This ensures your Node.js applications run reliably in production environments without manual intervention for memory-related issues.