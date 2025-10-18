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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'test/**',
        '**/*.test.js',
        '**/*.spec.js',
        '**/*.config.js',
        '**/*.config.mjs',
        'coverage/**',
        'test-*.js',
        // Exclude CLI files - bonus feature, not core MCP server
        'src/cli.js',
        'src/cli-handlers.js',
        'src/cli-utils.js',
        'src/formatters.js',
        'src/completions.js',
        // Exclude entry points and optional features
        'src/index.js',
        'src/http-server.js',
        'src/middleware/**'
      ],
      include: [
        'src/**/*.js'
      ],
      thresholds: {
        branches: 55,
        functions: 55,
        lines: 55,
        statements: 55
      }
    }
  }
});