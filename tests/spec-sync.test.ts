// U1-AC01–U1-AC06: a bare repository stands in for the exchange point and a
// clone plays the owner's copy; no network is used (W-AC02).
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkSpecSync, documentPaths } from '../scripts/spec-sync.ts'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

const PRD = 'docs/specs/x/PRD.md'
const REQ = 'docs/specs/x/requirements.md'

let base: string
let owner: string

const write = (path: string, content: string) => {
  mkdirSync(dirname(join(owner, path)), { recursive: true })
  writeFileSync(join(owner, path), content)
}

/** Branches, HEAD, index and working-tree status of the owner's copy. */
const snapshot = () => ({
  refs: git(owner, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads'),
  head: git(owner, 'symbolic-ref', '-q', 'HEAD'),
  index: git(owner, 'ls-files', '--stage'),
  status: git(owner, 'status', '--porcelain=v1', '--untracked-files=all'),
  // Blob ids of every working file, tracked or not, so a content change counts too.
  files: git(owner, 'ls-files', '--cached', '--others', '-z')
    .split('\0').filter(Boolean)
    .map((path) => `${path} ${git(owner, 'hash-object', '--', path)}`),
})

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'spec-sync-'))
  const exchange = join(base, 'exchange.git')
  git(base, 'init', '--bare', '--initial-branch=main', exchange)
  owner = join(base, 'owner')
  git(base, 'clone', '--quiet', exchange, owner)
  write(PRD, '# PRD\n')
  write(REQ, '# Requirements\n')
  git(owner, 'add', '.')
  git(owner, 'commit', '--quiet', '-m', 'docs')
  git(owner, 'push', '--quiet', 'origin', 'HEAD:main')
})

afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('checkSpecSync', () => {
  it('U1-AC04: succeeds when every document is identical at the exchange point', () => {
    expect(checkSpecSync({ repoDir: owner, paths: [PRD, REQ] })).toEqual({ ok: true })
  })

  it('U1-AC01: lists a document that exists only in the owner\'s copy as missing', () => {
    write('docs/specs/x/solution-design.md', '# SD\n')
    git(owner, 'add', '.')
    git(owner, 'commit', '--quiet', '-m', 'sd')
    expect(checkSpecSync({ repoDir: owner, paths: [PRD, 'docs/specs/x/solution-design.md'] })).toEqual({
      ok: false,
      mismatches: [{ path: 'docs/specs/x/solution-design.md', reason: 'missing at the exchange point' }],
    })
  })

  it('U1-AC02: lists a document with an unpushed commit as different', () => {
    write(REQ, '# Requirements\n\nR-01\n')
    git(owner, 'commit', '--quiet', '-am', 'edit')
    expect(checkSpecSync({ repoDir: owner, paths: [PRD, REQ] })).toEqual({
      ok: false, mismatches: [{ path: REQ, reason: 'different content' }],
    })
  })

  it('U1-AC03: lists a document with an uncommitted change as different', () => {
    write(PRD, '# PRD\n\nchanged\n')
    expect(checkSpecSync({ repoDir: owner, paths: [PRD, REQ] })).toEqual({
      ok: false, mismatches: [{ path: PRD, reason: 'different content' }],
    })
  })

  it('compares against the exchange point as fetched now, not the last known state', () => {
    const other = join(base, 'other')
    git(base, 'clone', '--quiet', join(base, 'exchange.git'), other)
    writeFileSync(join(other, PRD), '# PRD v2\n')
    git(other, 'commit', '--quiet', '-am', 'other')
    git(other, 'push', '--quiet', 'origin', 'HEAD:main')
    expect(checkSpecSync({ repoDir: owner, paths: [PRD] })).toEqual({
      ok: false, mismatches: [{ path: PRD, reason: 'different content' }],
    })
  })

  it('reports a linked document missing from disk', () => {
    expect(checkSpecSync({ repoDir: owner, paths: ['docs/specs/x/nope.md'] })).toEqual({
      ok: false, mismatches: [{ path: 'docs/specs/x/nope.md', reason: 'no file on disk' }],
    })
  })

  it('U1-AC05: fails with the fetch error when the exchange point is unreachable', () => {
    git(owner, 'remote', 'set-url', 'origin', join(base, 'does-not-exist.git'))
    const result = checkSpecSync({ repoDir: owner, paths: [PRD] })
    expect(result.ok).toBe(false)
    expect('fetchError' in result && result.fetchError).toMatch(/does-not-exist\.git/)
  })

  it('U1-AC06: leaves branches, index and files of the owner\'s copy as they were', () => {
    git(owner, 'switch', '--quiet', '-c', 'feature')
    write(PRD, '# PRD\n\nwip\n')
    write('notes.txt', 'untracked\n')
    git(owner, 'add', 'notes.txt')
    write(REQ, '# Requirements\n\nunstaged\n')
    const before = snapshot()
    checkSpecSync({ repoDir: owner, paths: [PRD, REQ] })
    expect(snapshot()).toEqual(before)
  })
})

describe('documentPaths', () => {
  it('drops anchors, empty links and duplicates', () => {
    expect(documentPaths([PRD, `${REQ}#u1`, undefined, ' ', `${REQ}#u2`])).toEqual([PRD, REQ])
  })
})
