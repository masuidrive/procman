/**
 * Simple Lock Problem Test - Direct verification without complex resource management
 */

import { describe, test, expect } from 'vitest';
import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';
import { setupTestEnvironment } from './shared/cli-commands-shared';

describe('Simple Lock Problem Verification', () => {
  test('should generate unique socket paths using crypto.randomUUID()', async () => {
    const socketPaths: string[] = [];

    // Generate 5 unique socket paths
    for (let i = 0; i < 5; i++) {
      const { testSocketPath } = await setupTestEnvironment();
      socketPaths.push(testSocketPath);
      console.log(`Path ${i + 1}: ${testSocketPath}`);
    }

    // Verify all paths are unique
    const uniquePaths = new Set(socketPaths);
    expect(uniquePaths.size).toBe(5);

    // Verify crypto UUID pattern
    socketPaths.forEach((socketPath) => {
      expect(socketPath).toMatch(/pm-e2e-\d+-[a-f0-9]{8}/);
      expect(socketPath).toContain(process.pid.toString());
    });
  });

  test('should create unique directory paths', async () => {
    const env1 = await setupTestEnvironment();
    const env2 = await setupTestEnvironment();
    const env3 = await setupTestEnvironment();

    // All should be different
    expect(env1.testSocketPath).not.toBe(env2.testSocketPath);
    expect(env2.testSocketPath).not.toBe(env3.testSocketPath);
    expect(env1.testSocketPath).not.toBe(env3.testSocketPath);

    console.log('Unique socket paths generated:');
    console.log(`Env 1: ${env1.testSocketPath}`);
    console.log(`Env 2: ${env2.testSocketPath}`);
    console.log(`Env 3: ${env3.testSocketPath}`);
  });

  test('should verify crypto.randomUUID() entropy', () => {
    const uuids = new Set<string>();

    // Generate 100 UUIDs and verify uniqueness
    for (let i = 0; i < 100; i++) {
      const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      uuids.add(uuid);
    }

    expect(uuids.size).toBe(100);
    console.log('Generated 100 unique crypto UUIDs successfully');
  });
});
