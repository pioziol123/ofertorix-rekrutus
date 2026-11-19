import { closePool } from '../lib/db.ts'
import {
  solidJobsSource as source,
  readSyncState,
} from '../modules/sources/index.ts'
try {
  if (process.argv.length > 3) throw new Error('Expected at most one run UUID')
  const { run, lastComplete } = await readSyncState({
    source,
    runId: process.argv[2],
    scope: {},
  })
  console.info(JSON.stringify({ run, lastComplete }, null, 2))
} catch {
  console.error('Could not read import status; check run UUID and database')
  process.exitCode = 1
} finally {
  await closePool()
}
