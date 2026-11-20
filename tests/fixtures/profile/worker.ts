/**
 * A worker entry for the Profile tests: the worker library with the
 * repository's plugins index, as the worker entry starts it, without the
 * existing path of the modules not yet moved.
 */
import { fileURLToPath } from 'node:url'
import { closePool } from '../../../lib/db.ts'
import { startWorker } from '../../../lib/workers/index.ts'

const worker = await startWorker({
  plugins: fileURLToPath(new URL('../../../plugins/index.ts', import.meta.url)),
})
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void worker
      .stop()
      .then(closePool)
      .then(() => process.exit(0))
  })
