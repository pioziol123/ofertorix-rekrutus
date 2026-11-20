import { fileURLToPath } from 'node:url'
import { closePool } from '../lib/db.ts'
import { startWorker } from '../lib/workers/index.ts'

// The worker carries out the jobs of every queue through the worker
// library: an invalid queue configuration, pool size (WORKER_POOL_SIZE) or
// module plugin ends it at start (B1-R04, B1-R14). It knows no module and
// does no periodic work; the periodic process does (B6-R09).
const worker = await startWorker({
  plugins: fileURLToPath(new URL('../plugins/index.ts', import.meta.url)),
})

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  await worker.stop()
  await closePool()
}
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void shutdown()
      .then(() => process.exit(0))
      .catch(() => {
        console.error('Worker failed to stop')
        process.exit(1)
      })
  })
