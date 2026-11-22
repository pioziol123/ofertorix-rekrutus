/**
 * The migration step's part of the deployment of AI assignments (task
 * oferty-pracy-sq2.11, solution design of epic sq2, T10 step 1), run after
 * the database migrations: each requesting module marks as failed its
 * matters that still wait for AI work of the old way, so the owner can
 * request them again (T10-R02). The old way is gone and its records are an
 * archive, so this work will never end otherwise.
 *
 * Each module decides from its own data alone, through its public
 * operation, because the module's rules decide what a failed matter is. A
 * second run finds nothing more to end. It does not run the module
 * plugins.
 */
import { closePool } from '../lib/db.ts'
import { failResearchOfOldWay } from '../modules/companies/index.ts'
import { failAssessmentsOfOldWay } from '../modules/matching/index.ts'
import { failPreparationsOfOldWay } from '../modules/profile/index.ts'

const modules: Record<string, () => Promise<number>> = {
  'proposal preparations': failPreparationsOfOldWay,
  assessments: failAssessmentsOfOldWay,
  'company research': failResearchOfOldWay,
}

try {
  for (const [matters, fail] of Object.entries(modules)) {
    const ended = await fail()
    if (ended)
      console.info(`Marked ${ended} ${matters} of the old AI way as failed`)
  }
} finally {
  await closePool()
}
