import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist'],
    // Prevent memory issues and resource contention
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false, // Allow parallel execution for resource distribution
        // Phase 11.9 analysis: CI environment benefits from process isolation
        // maxForks=2 distributes 151 E2E tests across processes to prevent resource accumulation
        maxForks: 2, // Both CI and local use 2 forks for optimal resource distribution
      }
    },
    isolate: true,
    testTimeout: 30000,
    hookTimeout: 60000, // Increased from 20s to 60s for reliable cleanup
    teardownTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
      ]
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})