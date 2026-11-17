/**
 * Git operations of the runner's copy against the exchange point, `main` on `origin`
 * (solution design of oferty-pracy-uuk, T-01 and task uuk.2). The local `main` only
 * mirrors the exchange point: every fetch overwrites it, so a write to it from an
 * agent's environment has no effect. The runner trusts commit ids, not branch names.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

export const BASE_BRANCH = 'main'
export const REMOTE = 'origin'
/** Prefix of branches a returned task leaves on the exchange point's repository. */
export const RETURN_PREFIX = 'agent/'
/** The runner's own program; a different tree at the exchange point is a newer version. */
export const PROGRAM_DIR = '.sandcastle'

/**
 * Agents' sandboxes can write to the git data of the runner's copy. The runner's own git
 * calls on the host therefore ignore hooks and fsmonitor, so nothing an agent leaves in
 * that data runs on the host, which holds the GitHub credentials (U2-R03).
 */
const HARDENED = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false']

export function git(repo: string, args: string[]): string {
  return execFileSync('git', [...HARDENED, ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function tryGit(repo: string, args: string[]): { ok: boolean; out: string } {
  try {
    return { ok: true, out: git(repo, args) }
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || (e.message ?? '') }
  }
}

export type Fetched = { ok: true; sha: string } | { ok: false; error: string }

/** Fetches the exchange point and overwrites the `main` mirror with it, forced. */
export function fetchMain(repo: string): Fetched {
  const fetch = tryGit(repo, ['fetch', '--quiet', '--no-tags', REMOTE,
    `+refs/heads/${BASE_BRANCH}:refs/heads/${BASE_BRANCH}`,
    `+refs/heads/${BASE_BRANCH}:refs/remotes/${REMOTE}/${BASE_BRANCH}`])
  if (!fetch.ok) return { ok: false, error: fetch.out }
  return { ok: true, sha: git(repo, ['rev-parse', `refs/heads/${BASE_BRANCH}`]) }
}

/** Commits in `to` that `from` lacks, one `<short id> <subject>` per line, oldest first. */
export function commitsBetween(repo: string, from: string, to: string): string[] {
  const out = git(repo, ['log', '--reverse', '--format=%h %s', `${from}..${to}`])
  return out ? out.split('\n') : []
}

/** Paths that are not in the given commit. */
export function missingAt(repo: string, commit: string, paths: string[]): string[] {
  return paths.filter((path) => !tryGit(repo, ['cat-file', '-e', `${commit}:${path}`]).ok)
}

/** Tree id of the runner's program in a commit, or '' when the commit has none. */
export function programTree(repo: string, commit: string): string {
  return tryGit(repo, ['rev-parse', `${commit}:${PROGRAM_DIR}`]).out.split('\n')[0] ?? ''
}

/** Pushes a checked commit to `main` on the exchange point, never forced. */
export function pushMain(repo: string, commit: string): { ok: boolean; out: string } {
  return tryGit(repo, ['push', '--quiet', REMOTE, `${commit}:refs/heads/${BASE_BRANCH}`])
}

export function returnBranchName(branch: string): string {
  return `${RETURN_PREFIX}${branch}`
}

/** Pushes a returned task's branch under the return prefix, forced over an earlier return. */
export function pushReturnBranch(repo: string, branch: string): { ok: boolean; out: string } {
  return tryGit(repo, ['push', '--quiet', '--force', REMOTE, `refs/heads/${branch}:refs/heads/${returnBranchName(branch)}`])
}

/** Removes the branch an earlier return left; its absence is not an error. */
export function deleteReturnBranch(repo: string, branch: string): void {
  const name = returnBranchName(branch)
  if (!tryGit(repo, ['ls-remote', '--exit-code', '--heads', REMOTE, name]).ok) return
  tryGit(repo, ['push', '--quiet', REMOTE, '--delete', name])
}

export function branchExists(repo: string, branch: string): boolean {
  return tryGit(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).ok
}

/** Files the agent environment's image is built from that change rarely. */
export const IMAGE_INPUT_FILES = ['pnpm-lock.yaml', '.sandcastle/Dockerfile']

/** Hash of the image inputs at a commit; a missing file counts as empty. */
export function imageInputs(repo: string, commit: string): string {
  const hash = createHash('sha256')
  for (const file of IMAGE_INPUT_FILES) hash.update(`${file}\0${tryGit(repo, ['show', `${commit}:${file}`]).ok ? git(repo, ['show', `${commit}:${file}`]) : ''}\0`)
  return hash.digest('hex').slice(0, 16)
}
