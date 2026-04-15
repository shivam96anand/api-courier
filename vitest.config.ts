import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        '**/*.d.ts',
        '**/types.ts',
        '**/styles/**',
        '**/index.html',
        'coverage/**',
        'dist/**',
        'build/**',
        'scripts/**',
        'release/**',
        '**/__tests__/**',
        '**/__mocks__/**',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});