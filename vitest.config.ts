import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist'],
    // Prevent memory issues
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        maxForks: 2,
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