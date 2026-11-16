import { closePool } from '../lib/db.ts'
import { syncHimalayas } from '../lib/sources/himalayas-sync.ts'

// Stopping the script ends its run as interrupted.
const stop = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => stop.abort())
try {
  if (process.argv.length > 2) throw new Error('Unexpected arguments')
  const result = await syncHimalayas(undefined, stop.signal)
  console.info(JSON.stringify(result, null, 2))
  if (result.status !== 'complete') process.exitCode = 1
} catch {
  console.error('Himalayas pilot failed; inspect source run status')
  process.exitCode = 1
} finally {
  await closePool()
}
