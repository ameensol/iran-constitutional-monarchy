import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // All tests share one Anvil instance
      },
    },
    globalSetup: './test/setup/globalSetup.ts',
  },
  resolve: {
    alias: {
      '@king/sdk': new URL('./src/index.ts', import.meta.url).pathname,
    },
  },
});
