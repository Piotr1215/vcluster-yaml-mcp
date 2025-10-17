import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
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
        'test-*.js'
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