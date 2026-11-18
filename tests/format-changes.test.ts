// FMT-AC01, FMT-AC02: the gate's formatting step on a temporary repository.
// A bare repository stands in for GitHub and a clone plays the task's copy.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changedFiles, checkFormatting } from '../scripts/format-changes.ts'

const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()

const FORMATTED = 'export const a = 1\n'
const UNFORMATTED = 'export const   a=1;;\n'

let base: string
let repo: string

const write = (path: string, content: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  writeFileSync(join(repo, path), content)
}

const commit = (message: string) => {
  git(repo, 'add', '--all')
  git(repo, 'commit', '--quiet', '-m', message)
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'format-changes-'))
  const exchange = join(base, 'exchange.git')
  git(base, 'init', '--bare', '--initial-branch=main', exchange)
  repo = join(base, 'copy')
  git(base, 'clone', '--quiet', exchange, repo)
  write('.prettierrc.json', '{ "semi": false, "singleQuote": true }\n')
  // main already holds an unformatted file, as the real main does.
  write('legacy.ts', UNFORMATTED)
  write('kept.ts', FORMATTED)
  commit('main')
  git(repo, 'push', '--quiet', 'origin', 'HEAD:main')
  git(repo, 'switch', '--quiet', '-c', 'task')
})

afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('checkFormatting', () => {
  it('FMT-AC01: fails and names an unformatted file the task changed', () => {
    write('src/new.ts', UNFORMATTED)
    commit('task')

    const result = checkFormatting(repo)

    expect(result.ok).toBe(false)
    expect(result.output).toContain('src/new.ts')
    expect(result.output).not.toContain('legacy.ts')
  })

  it('FMT-AC01: an uncommitted or untracked unformatted file counts too', () => {
    write('kept.ts', UNFORMATTED)
    write('untracked.ts', UNFORMATTED)

    const result = checkFormatting(repo)

    expect(result.ok).toBe(false)
    expect(result.output).toContain('kept.ts')
    expect(result.output).toContain('untracked.ts')
  })

  it('FMT-AC02: passes when only files the task did not change are unformatted', () => {
    write('src/new.ts', FORMATTED)
    commit('task')

    const result = checkFormatting(repo)

    expect(result).toMatchObject({ ok: true, files: ['src/new.ts'] })
  })

  it('FMT-AC02: passes with no change at all', () => {
    expect(checkFormatting(repo)).toMatchObject({ ok: true, files: [] })
  })

  it('skips deleted files, files Prettier ignores and files it has no parser for', () => {
    git(repo, 'rm', '--quiet', 'legacy.ts')
    write('.prettierignore', 'generated/\n')
    write('generated/out.ts', UNFORMATTED)
    write('run.sh', 'echo   x;;\n')
    commit('task')

    const result = checkFormatting(repo)

    expect(result.ok).toBe(true)
    expect(result.files).not.toContain('legacy.ts')
  })

  it('without a merge base checks the files of the last commit', () => {
    git(repo, 'update-ref', '-d', 'refs/remotes/origin/main')
    git(repo, 'branch', '--quiet', '-D', 'main')
    write('last.ts', FORMATTED)
    commit('last')

    expect(changedFiles(repo)).toEqual({ base: null, files: ['last.ts'] })
  })
})

describe('changedFiles', () => {
  // The runner's copy keeps its local main where it was cloned and fetches
  // GitHub into origin/main; the owner's copy may be ahead of origin/main.
  // The nearer merge base wins, so work that reached main is not the task's.
  it('measures from the fetched main when the local main is behind', () => {
    git(repo, 'switch', '--quiet', '--detach', 'main')
    write('delivered.ts', UNFORMATTED)
    commit('delivered by another task')
    git(repo, 'push', '--quiet', 'origin', 'HEAD:main')
    git(repo, 'fetch', '--quiet', 'origin')
    const fetched = git(repo, 'rev-parse', 'HEAD')
    git(repo, 'switch', '--quiet', '-C', 'task')
    write('mine.ts', FORMATTED)
    commit('task')

    expect(changedFiles(repo)).toEqual({ base: fetched, files: ['mine.ts'] })
  })

  it('measures from the local main when it is ahead of the fetched one', () => {
    git(repo, 'switch', '--quiet', 'main')
    write('local.ts', UNFORMATTED)
    commit('owner commit not pushed yet')
    const local = git(repo, 'rev-parse', 'HEAD')
    git(repo, 'switch', '--quiet', '-c', 'owner-task')
    write('mine.ts', FORMATTED)
    commit('task')

    expect(changedFiles(repo)).toEqual({ base: local, files: ['mine.ts'] })
  })
})
