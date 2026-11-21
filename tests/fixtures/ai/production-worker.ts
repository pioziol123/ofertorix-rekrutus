/**
 * A worker entry for the AI tests: the worker library, as the worker entry
 * starts it, with the repository's plugins index and OpenAI simulated.
 */
import { fileURLToPath } from 'node:url'
import { closePool } from '../../../lib/db.ts'
import { startWorker } from '../../../lib/workers/index.ts'

const worker = await startWorker({
  plugins: fileURLToPath(new URL('./production-plugins.ts', import.meta.url)),
})
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void worker
      .stop()
      .then(closePool)
      .then(() => process.exit(0))
  })
