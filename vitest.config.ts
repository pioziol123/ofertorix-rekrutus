import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Integration schemas isolate rows, but PostgreSQL advisory locks are
    // database-wide. Source adapters intentionally use the same lock keys.
    fileParallelism: process.env.RUN_INTEGRATION !== '1',
  },
})
