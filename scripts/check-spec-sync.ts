// Usage: node scripts/check-spec-sync.ts <bd task or epic id>
// Checks that every document the task links (PRD, requirements, solution
// design; an epic: its PRD) is in `main` on `origin` with the same content as
// on disk, uncommitted changes included. Exits 0 when all match, 1 when any
// document differs or the fetch fails, 2 on wrong usage.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkSpecSync, documentPaths } from './spec-sync.ts'

const id = process.argv[2]
if (!id || process.argv.length > 3) {
  console.error('Usage: node scripts/check-spec-sync.ts <bd task or epic id>')
  process.exit(2)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

type Issue = { issue_type?: string, spec_id?: string, metadata?: Record<string, string> }
let issue: Issue | undefined
try {
  const output = execFileSync('bd', ['show', id, '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  issue = (JSON.parse(output) as Issue[])[0]
} catch (error) {
  console.error(`Cannot read ${id} from bd: ${(error as { stderr?: string }).stderr?.trim() || (error as Error).message}`)
  process.exit(2)
}
if (!issue) {
  console.error(`No issue ${id} in bd`)
  process.exit(2)
}

const meta = issue.metadata ?? {}
const paths = issue.issue_type === 'epic'
  ? documentPaths([meta.prd ?? issue.spec_id])
  : documentPaths([meta.prd, meta.requirements, meta.sd])
if (!paths.length) {
  console.error(`${id} links no documents`)
  process.exit(1)
}

const result = checkSpecSync({ repoDir: root, paths })
if (result.ok) {
  for (const path of paths) console.log(`${path}: identical`)
  process.exit(0)
}
if ('fetchError' in result) {
  console.error(`Cannot fetch main from origin: ${result.fetchError}`)
  process.exit(1)
}
for (const { path, reason } of result.mismatches) console.log(`${path}: ${reason}`)
process.exit(1)
