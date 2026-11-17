// Compares a task's documents on the owner's disk with the exchange point
// (`main` on `origin`). See the readiness checklist in the process contract.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type DocumentMismatch = {
  path: string
  reason: 'no file on disk' | 'missing at the exchange point' | 'different content'
}

export type SpecSyncResult =
  | { ok: true }
  | { ok: false, fetchError: string }
  | { ok: false, mismatches: DocumentMismatch[] }

export type SpecSyncOptions = {
  /** The owner's copy: a git working tree. */
  repoDir: string
  /** Repository-relative paths; an anchor after `#` is ignored. */
  paths: string[]
  remote?: string
  branch?: string
}

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** Drops the anchor and duplicates, keeping the order of first appearance. */
export function documentPaths(links: Array<string | undefined>): string[] {
  const paths = links
    .filter((link): link is string => !!link?.trim())
    .map((link) => link.split('#')[0]!.trim())
    .filter(Boolean)
  return [...new Set(paths)]
}

/**
 * Fetches the branch from the remote and compares each document's git blob id
 * on disk (as `git add` would compute it, uncommitted changes included) with
 * the blob at the same path in the fetched state. Only the remote-tracking ref
 * changes; local branches, the index and the working files stay untouched.
 */
export function checkSpecSync({ repoDir, paths, remote = 'origin', branch = 'main' }: SpecSyncOptions): SpecSyncResult {
  const tracking = `refs/remotes/${remote}/${branch}`
  try {
    git(repoDir, ['fetch', '--quiet', '--no-tags', remote, `+refs/heads/${branch}:${tracking}`])
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    return { ok: false, fetchError: stderr || (error as Error).message }
  }

  const mismatches: DocumentMismatch[] = []
  for (const path of paths) {
    if (!existsSync(join(repoDir, path))) {
      mismatches.push({ path, reason: 'no file on disk' })
      continue
    }
    const local = git(repoDir, ['hash-object', '--', path])
    let remoteBlob: string
    try {
      remoteBlob = git(repoDir, ['rev-parse', '--verify', '--quiet', `${tracking}:${path}`])
    } catch {
      mismatches.push({ path, reason: 'missing at the exchange point' })
      continue
    }
    if (local !== remoteBlob) mismatches.push({ path, reason: 'different content' })
  }
  return mismatches.length ? { ok: false, mismatches } : { ok: true }
}
