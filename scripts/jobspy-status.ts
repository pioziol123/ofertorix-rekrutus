import { closePool } from '../lib/db.ts'
import { parseJobspySource } from '../lib/sources/jobspy-catalog.ts'
import { readSourceCatalog, readSyncState } from '../modules/sources/index.ts'
try {
  if (process.argv.length > 4) throw new Error('Invalid arguments')
  let state
  if (process.argv[2]) {
    const { enabled, scheduled, run } = await readSyncState({
      source: parseJobspySource(process.argv[2]),
      runId: process.argv[3],
    })
    state = { enabled, scheduled, run }
  } else state = (await readSourceCatalog()).jobspy
  console.info(JSON.stringify(state, null, 2))
} catch {
  console.error('Could not read JobSpy status')
  process.exitCode = 1
} finally {
  await closePool()
}
