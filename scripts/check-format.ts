// Usage: node scripts/check-format.ts
// The gate's formatting step, run from the worktree root. Checks with Prettier
// the files changed between the merge base with `main` and the working tree
// (without a merge base: the files of the last commit). Exits 0 when they are
// formatted, 1 when any is not and names each such file.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkFormatting } from './format-changes.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const result = checkFormatting(root)
const scope = result.base
  ? `changed since ${result.base.slice(0, 7)}, the merge base with main`
  : 'of the last commit (no merge base with main was found)'

if (result.ok) {
  console.log(`Formatting: ${result.files.length} file(s) ${scope} checked.`)
  process.exit(0)
}
console.error(`Formatting: files ${scope} are not formatted.`)
console.error(result.output)
console.error('Run: pnpm exec prettier --write <file>...')
process.exit(1)
