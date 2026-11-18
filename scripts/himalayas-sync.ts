import { closePool } from '../lib/db.ts'
import { createBoss } from '../lib/queue.ts'
import { source } from '../lib/sources/himalayas.ts'
import {
  requestSync,
  useSyncQueue,
  waitForSyncRun,
} from '../modules/sources/index.ts'

// Manual pilot without a schedule: requests the run through the sync queue
// and, as the pilot always did, waits for its result, without a time limit.
// Stopping the script leaves the run to the worker.
const boss = createBoss()
boss.on('error', () => {
  console.error('Queue connection error')
})
try {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--wait'))
    throw new Error('Unexpected arguments')
  await boss.start()
  useSyncQueue(boss)
  // ASSUMPTION(oferty-pracy-0mq.16/ASM-2): the pilot waits also without
  // --wait, as it did when it ran the sync itself.
  const run = await waitForSyncRun((await requestSync({ source })).id)
  console.info(
    JSON.stringify(
      {
        id: run.id,
        status: run.status,
        seen: run.uniqueAds,
        revisions: run.revisions,
        pages: run.pages,
        error: run.error,
        diagnostics: run.diagnostics,
      },
      null,
      2,
    ),
  )
  if (run.status !== 'complete') process.exitCode = 1
} catch {
  console.error('Himalayas pilot failed; inspect source run status')
  process.exitCode = 1
} finally {
  await boss.stop()
  await closePool()
}
