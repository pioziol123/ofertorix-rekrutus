import { closePool } from '../lib/db.ts'
import { createBoss } from '../lib/queue.ts'
import { solidJobsSource as source } from '../modules/sources/index.ts'
import {
  readSyncState,
  requestSync,
  useSyncQueue,
  waitForSyncRun,
} from '../modules/sources/index.ts'

const boss = createBoss()
boss.on('error', () => {
  console.error('Queue connection error')
})
try {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--wait'))
    throw new Error('Usage: source:sync [--wait]')
  await boss.start()
  useSyncQueue(boss)
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
  await boss.stop()
  await closePool()
}
