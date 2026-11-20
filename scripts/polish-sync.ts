import { parseArgs } from 'node:util'
import { closePool } from '../lib/db.ts'
import { stopQueues } from '../lib/queues/index.ts'
import {
  polishQuery,
  readSyncState,
  requestSync,
  waitForSyncRun,
} from '../modules/sources/index.ts'
try {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      technology: { type: 'string', default: 'PHP' },
      seniority: { type: 'string', default: 'senior' },
      'max-offers': { type: 'string' },
      'max-pages': { type: 'string' },
      'max-requests': { type: 'string' },
      wait: { type: 'boolean', default: false },
    },
  })
  const query = polishQuery.parse({
    source: values.source,
    technology: values.technology === 'all' ? null : values.technology,
    seniority: values.seniority === 'all' ? null : values.seniority,
    ...(values['max-offers']
      ? { maxOffers: Number(values['max-offers']) }
      : {}),
    ...(values['max-pages'] ? { maxPages: Number(values['max-pages']) } : {}),
    ...(values['max-requests']
      ? { maxRequests: Number(values['max-requests']) }
      : {}),
  })
  const run = await requestSync({ source: query.source, scopeRequest: query })
  console.info(JSON.stringify({ id: run.id, reused: run.existing }))
  if (values.wait) {
    // No time limit; stopping the script leaves the run to the worker.
    const finished = await waitForSyncRun(run.id)
    const {
      enabled,
      scheduled,
      run: stored,
    } = await readSyncState({
      source: query.source,
      runId: run.id,
    })
    console.info(JSON.stringify({ enabled, scheduled, run: stored }, null, 2))
    if (finished.status !== 'complete') process.exitCode = 1
  }
} catch {
  console.error(
    'Could not import source; check --source bulldogjob|theprotocol|justjoinit|nofluffjobs, --technology, --seniority and limits',
  )
  process.exitCode = 1
} finally {
  await stopQueues()
  await closePool()
}
