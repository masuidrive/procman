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
        singleFork: true,
        // E2E tests need sequential execution to avoid socket path conflicts
        // Unit/Integration tests can use parallel execution for speed
        maxForks: process.env.CI ? 1 : 2,
      }
    },
    isolate: true,
    testTimeout: 30000,
    hookTimeout: 20000,
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