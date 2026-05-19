import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup-integration.ts'],

    // Deterministic execution: no parallel threads until isolation framework exists
    maxThreads: 1,
    minThreads: 1,

    // Timeout governance
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
