import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The runner's own tests use node:test and run from .sandcastle/.
    exclude: [...configDefaults.exclude, '.sandcastle/**'],
    // Integration schemas isolate rows, but PostgreSQL advisory locks are
    // database-wide. Source adapters intentionally use the same lock keys.
    fileParallelism: process.env.RUN_INTEGRATION !== '1',
  },
})
