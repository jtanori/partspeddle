import { defineConfig } from 'vitest/config';

/**
 * Vitest Integration Test Configuration
 *
 * Fork-based isolation with single-fork mode for DB/Redis consistency.
 *
 * @see project-governance/diagnostics/T0.5.1-failure-reproduction-matrix.md
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup-integration.ts'],

    // Fork-based pool avoids vmThreads deadlock on Node 24 + macOS
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Deterministic execution: no parallel files until isolation framework exists
    fileParallelism: false,

    // Timeout governance — generous for cold-start DB operations
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
