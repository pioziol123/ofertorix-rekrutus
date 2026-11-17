/**
 * Prepares or updates the runner's copy (solution design of oferty-pracy-uuk, task uuk.2).
 * Run from the owner's copy:
 *   node .sandcastle/setup.ts [--dir <path>]
 * The default directory sits beside the owner's copy, named after it with the suffix -runner.
 * In an empty place it clones GitHub on the main branch,
 * installs the runner's dependencies, copies the agent token and records where the task
 * database is. Run again, it updates the program to main on GitHub and keeps the settings.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { BASE_BRANCH, PROGRAM_DIR, REMOTE, fetchMain, git, tryGit } from './exchange.ts'
import { ENV_FILE, SETTINGS_FILE, TOKEN_KEY, readSettings, tokenIn, writeSettings } from './settings.ts'

export interface SetupOptions {
  /** The owner's copy of the project. */
  owner: string
  /** Where the runner's copy lives. */
  dir: string
  /** Installs the runner's dependencies in the program directory. */
  install(programDir: string): void
}

export type SetupResult = { ok: true; action: 'created' | 'updated'; commit: string } | { ok: false; error: string }

export function defaultRunnerDir(owner: string): string {
  return join(dirname(owner), `${basename(owner)}-runner`)
}

function isEmptyPlace(dir: string): boolean {
  return !existsSync(dir) || readdirSync(dir).length === 0
}

export function prepareRunnerCopy({ owner, dir, install }: SetupOptions): SetupResult {
  const url = tryGit(owner, ['remote', 'get-url', REMOTE])
  if (!url.ok) return { ok: false, error: `the owner's copy has no ${REMOTE} remote: ${url.out}` }

  if (isEmptyPlace(dir)) {
    const clone = tryGit(dirname(resolve(dir)), ['clone', '--quiet', url.out, resolve(dir)])
    if (!clone.ok) return { ok: false, error: `cloning ${url.out} failed: ${clone.out}` }
    const fetched = fetchMain(dir)
    if (!fetched.ok) return { ok: false, error: fetched.error }
    install(join(dir, PROGRAM_DIR))
    writeFileSync(join(dir, ENV_FILE), `${TOKEN_KEY}=${tokenIn(join(owner, ENV_FILE))}\n`)
    writeSettings(dir, { beadsDir: join(resolve(owner), '.beads') })
    return { ok: true, action: 'created', commit: fetched.sha }
  }

  if (!tryGit(dir, ['rev-parse', '--git-dir']).ok || tryGit(dir, ['remote', 'get-url', REMOTE]).out !== url.out) {
    return { ok: false, error: `${dir} is neither empty nor a runner's copy cloned from ${url.out}` }
  }
  const changed = git(dir, ['status', '--porcelain', '--untracked-files=no', '--', PROGRAM_DIR])
  if (changed) return { ok: false, error: `the runner's program in ${dir} has local changes; resolve them first:\n${changed}` }
  const fetched = fetchMain(dir)
  if (!fetched.ok) return { ok: false, error: fetched.error }
  // A copy prepared by an earlier version stands detached; put it back on main first.
  const update = tryGit(dir, ['checkout', '--quiet', BASE_BRANCH])
  const merge = update.ok ? tryGit(dir, ['merge', '--quiet', '--ff-only', fetched.sha]) : update
  if (!merge.ok) return { ok: false, error: `updating ${BASE_BRANCH} to ${fetched.sha.slice(0, 7)} in ${dir} failed:\n${merge.out}` }
  install(join(dir, PROGRAM_DIR))
  // Settings are kept; only a missing one is filled in.
  if (!tokenIn(join(dir, ENV_FILE))) writeFileSync(join(dir, ENV_FILE), `${TOKEN_KEY}=${tokenIn(join(owner, ENV_FILE))}\n`)
  try {
    readSettings(dir)
  } catch {
    writeSettings(dir, { beadsDir: join(resolve(owner), '.beads') })
  }
  return { ok: true, action: 'updated', commit: fetched.sha }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { dir: { type: 'string' } } })
  const owner = git(process.cwd(), ['rev-parse', '--show-toplevel'])
  const dir = resolve(values.dir ?? defaultRunnerDir(owner))
  const result = prepareRunnerCopy({
    owner,
    dir,
    install: (programDir) => execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: programDir, stdio: 'inherit' }),
  })
  if (!result.ok) {
    console.error(`Setup failed: ${result.error}`)
    process.exit(1)
  }
  console.log(`Runner's copy ${result.action} in ${dir} at ${BASE_BRANCH} ${result.commit.slice(0, 7)} from GitHub.`)
  if (!tokenIn(join(dir, ENV_FILE))) console.log(`Add ${TOKEN_KEY} (from \`claude setup-token\`) to ${join(dir, ENV_FILE)}.`)
  console.log(`Settings: ${join(dir, SETTINGS_FILE)}. Start the runner with:\n  cd ${dir} && node ${PROGRAM_DIR}/runner.ts`)
}
