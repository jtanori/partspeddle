import { defineConfig } from 'vitest/config';

/**
 * Vitest Main Configuration
 *
 * Uses fork-based process isolation instead of default vmThreads
 * to avoid deadlock/hang issues with Node.js 24 + Vitest 3.2.4.
 *
 * @see project-governance/diagnostics/T0.5.1-failure-reproduction-matrix.md
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Fork-based pool avoids vmThreads deadlock on Node 24 + macOS
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 80,
        statements: 80,
      },
    },
  },
});
