import { closePool, getPool } from '../lib/db.ts'
import { sourceSchema } from '../lib/sources/polish.ts'
import {
  polishCatalogStatus,
  polishStatus,
} from '../lib/sources/polish-sync.ts'
const pool = getPool()
try {
  if (process.argv.length > 4) throw new Error('Invalid arguments')
  console.info(
    JSON.stringify(
      process.argv[2]
        ? await polishStatus(
            pool,
            process.argv[3],
            sourceSchema.parse(process.argv[2]),
          )
        : await polishCatalogStatus(pool),
      null,
      2,
    ),
  )
} catch {
  console.error('Could not read source status')
  process.exitCode = 1
} finally {
  await closePool()
}
