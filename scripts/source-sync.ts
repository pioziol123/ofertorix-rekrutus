import { closePool } from '../lib/db.ts'
import { stopQueues } from '../lib/queues/index.ts'
import {
  solidJobsSource as source,
  readSyncState,
  requestSync,
  waitForSyncRun,
} from '../modules/sources/index.ts'

try {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--wait'))
    throw new Error('Usage: source:sync [--wait]')
  const run = await requestSync({ source })
  console.info(JSON.stringify({ id: run.id, reused: run.existing }, null, 2))
  if (args.includes('--wait')) {
    // No time limit; stopping the script leaves the run to the worker.
    const finished = await waitForSyncRun(run.id)
    const { run: stored, lastComplete } = await readSyncState({
      source,
      runId: run.id,
      scope: {},
    })
    console.info(JSON.stringify({ run: stored, lastComplete }, null, 2))
    if (finished.status !== 'complete') process.exitCode = 1
  }
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith('Usage:')
      ? error.message
      : 'Could not request import; check worker and database',
  )
  process.exitCode = 1
} finally {
  await stopQueues()
  await closePool()
}
