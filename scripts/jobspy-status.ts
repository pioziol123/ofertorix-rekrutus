import { closePool, getPool } from '../lib/db.ts'
import { parseJobspySource } from '../lib/sources/jobspy-catalog.ts'
import {
  jobspyCatalogStatus,
  jobspyStatus,
} from '../lib/sources/jobspy-sync.ts'
const pool = getPool()
try {
  if (process.argv.length > 4) throw new Error('Invalid arguments')
  console.info(
    JSON.stringify(
      process.argv[2]
        ? await jobspyStatus(
            pool,
            process.argv[3],
            parseJobspySource(process.argv[2]),
          )
        : await jobspyCatalogStatus(pool),
      null,
      2,
    ),
  )
} catch {
  console.error('Could not read JobSpy status')
  process.exitCode = 1
} finally {
  await closePool()
}
