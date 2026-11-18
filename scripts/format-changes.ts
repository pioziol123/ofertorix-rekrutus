// The gate's formatting step: Prettier's check on the files the task changed.
// Several files on `main` already fail the check, so the gate checks only the
// files changed between the merge base with `main` and the working tree.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/** The states of `main` a copy may know: the local branch and the fetched one. */
export const MAIN_REFS = ['refs/heads/main', 'refs/remotes/origin/main']

export type ChangedFiles = {
  /** The commit the change is measured from; null when no merge base was found. */
  base: string | null
  /** Repository-relative paths that exist in the working tree. */
  files: string[]
}

export type FormatCheck = ChangedFiles & {
  ok: boolean
  /** Prettier's output; each unformatted file is named on its own line. */
  output: string
}

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const tryGit = (cwd: string, args: string[]): string | null => {
  try {
    return git(cwd, args).trim()
  } catch {
    return null
  }
}

const paths = (output: string) => output.split('\0').filter(Boolean)

/**
 * The merge base of HEAD with `main`. When the copy knows both the local
 * branch and the fetched one, the nearer common ancestor wins, so work that
 * reached either of them does not count as the task's change.
 */
export function mergeBase(repoDir: string): string | null {
  const refs = MAIN_REFS.filter(
    (ref) =>
      tryGit(repoDir, ['rev-parse', '--verify', '--quiet', ref]) !== null,
  )
  if (!refs.length) return null
  return tryGit(repoDir, ['merge-base', 'HEAD', ...refs]) || null
}

/**
 * Files changed between the merge base with `main` and the working tree,
 * uncommitted and untracked files included, deleted files skipped. Without a
 * merge base, the files of the last commit.
 */
export function changedFiles(repoDir: string): ChangedFiles {
  const base = mergeBase(repoDir)
  const listed = base
    ? [
        ...paths(
          git(repoDir, [
            'diff',
            '--name-only',
            '--no-renames',
            '--diff-filter=d',
            '-z',
            base,
          ]),
        ),
        ...paths(
          git(repoDir, ['ls-files', '--others', '--exclude-standard', '-z']),
        ),
      ]
    : paths(
        git(repoDir, [
          'diff-tree',
          '-r',
          '--root',
          '--no-commit-id',
          '--name-only',
          '--no-renames',
          '--diff-filter=d',
          '-z',
          'HEAD',
        ]),
      )
  const files = [...new Set(listed)]
    .filter((path) => existsSync(join(repoDir, path)))
    .sort()
  return { base, files }
}

const prettierBin = createRequire(import.meta.url).resolve(
  'prettier/bin/prettier.cjs',
)

/**
 * Runs Prettier's check on the changed files. Files Prettier ignores
 * (`.prettierignore`, `.gitignore`) or has no parser for are skipped.
 */
export function checkFormatting(repoDir: string): FormatCheck {
  const changed = changedFiles(repoDir)
  if (!changed.files.length) return { ...changed, ok: true, output: '' }
  const run = spawnSync(
    process.execPath,
    [
      prettierBin,
      '--check',
      '--ignore-unknown',
      '--no-color',
      '--',
      ...changed.files,
    ],
    { cwd: repoDir, encoding: 'utf8' },
  )
  if (run.error) throw run.error
  return {
    ...changed,
    ok: run.status === 0,
    output: `${run.stdout}${run.stderr}`.trim(),
  }
}
