// Usage: node scripts/check-spec-altitude.ts <document.md>...
// Reports implementation detail in specification documents. Exits 1 when any
// document has an error; warnings name identifiers to review by hand.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findAltitudeIssues } from './spec-altitude.ts'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('Usage: node scripts/check-spec-altitude.ts <document.md>...')
  process.exit(2)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Tracked top-level directories that hold code; docs links stay allowed.
const directories = execFileSync('git', ['ls-tree', '-d', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((name) => name && !name.startsWith('.') && name !== 'docs')

let errors = 0
for (const file of files) {
  for (const issue of findAltitudeIssues(readFileSync(file, 'utf8'), directories)) {
    if (issue.severity === 'error') errors++
    console.log(`${file}:${issue.line}: ${issue.severity}: ${issue.rule}: ${issue.match}`)
  }
}
process.exit(errors ? 1 : 0)
