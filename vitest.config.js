import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Run package tests sequentially to avoid tarball cleanup race conditions
    // Other tests can run in parallel
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    exclude: [
      'node_modules/**',
      '.claude/**',
      'test-installs/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'test/**',
        '**/*.test.{js,ts}',
        '**/*.spec.{js,ts}',
        '**/*.config.{js,mjs,ts}',
        'coverage/**',
        'test-*.{js,ts}',
        // Exclude CLI files - bonus feature, not core MCP server
        'src/cli.ts',
        'src/cli-handlers.ts',
        'src/cli-utils.ts',
        'src/formatters.ts',
        'src/completions.ts',
        // Exclude entry points and optional features
        'src/index.ts',
        'src/http-server.ts',
        'src/middleware/**'
      ],
      include: [
        'src/**/*.ts'
      ],
      thresholds: {
        branches: 10,
        functions: 10,
        lines: 10,
        statements: 10
      }
    }
  }
});