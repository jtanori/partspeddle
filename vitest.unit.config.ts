import { defineConfig } from 'vitest/config';

/**
 * Vitest Unit Test Configuration
 *
 * Fork-based isolation avoids vmThreads deadlock.
 *
 * @see project-governance/diagnostics/T0.5.1-failure-reproduction-matrix.md
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', 'tests/e2e/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
});
