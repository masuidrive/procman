import { describe, test, expect } from 'vitest';
import { generateTaskId } from '../../src/shared/task.js';

describe('Task Types', () => {
  describe('generateTaskId', () => {
    test('should generate IDs matching expected format', () => {
      const id = generateTaskId();
      expect(id).toMatch(/^task-[a-z0-9]{6}$/);
    });

    test('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTaskId());
      }
      expect(ids.size).toBe(100);
    });
  });
});
