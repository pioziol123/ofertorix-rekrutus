import { closePool } from '../lib/db.ts'
import { createBoss } from '../lib/queue.ts'
import {
  parseJobspySource,
  jobspyEnabled,
  readSyncState,
  requestSync,
  SourceDisabledError,
  useSyncQueue,
  waitForSyncRun,
} from '../modules/sources/index.ts'

const boss = createBoss()
boss.on('error', () => {
  console.error('JobSpy queue error')
})
try {
  const args = process.argv.slice(2)
  const sourceIndex = args.indexOf('--source')
  const source = parseJobspySource(
    sourceIndex < 0 ? 'indeed' : (args[sourceIndex + 1] ?? ''),
  )
  const remaining = args.filter(
    (_, index) =>
      sourceIndex < 0 || (index !== sourceIndex && index !== sourceIndex + 1),
  )
  if (remaining.some((arg) => arg !== '--wait'))
    throw new Error('Usage: jobspy:sync [--source source] [--wait]')
  // Checked before the queue connects, as before; the request checks again.
  if (!jobspyEnabled(source)) throw new SourceDisabledError(source)
  await boss.start()
  useSyncQueue(boss)
  const run = await requestSync({ source })
  console.info(JSON.stringify({ id: run.id, reused: run.existing }))
  if (args.includes('--wait')) {
    // No time limit; stopping the script leaves the run to the worker.
    const finished = await waitForSyncRun(run.id)
    const {
      enabled,
      scheduled,
      run: stored,
    } = await readSyncState({
      source,
      runId: run.id,
    })
    console.info(JSON.stringify({ enabled, scheduled, run: stored }, null, 2))
    if (finished.status !== 'complete') process.exitCode = 1
  }
} catch (error) {
  console.error(
    error instanceof SourceDisabledError
      ? 'JobSpy source is disabled'
      : error instanceof Error && error.message.startsWith('Usage:')
        ? error.message
        : 'Could not request JobSpy import',
  )
  process.exitCode = 1
} finally {
  await boss.stop()
  await closePool()
}
