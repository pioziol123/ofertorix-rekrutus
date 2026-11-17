/**
 * The task database through the bd CLI. Every call goes through one function that points
 * bd at the directory from the runner's setting (U2-R05); the rest of the runner does not
 * know where the database is.
 */
import { execFileSync } from 'node:child_process'
import type { Issue } from './followups.ts'
import type { NewIssue, TaskDb } from './ports.ts'

/** Exit code of bd when an --if-assignee or --if-status condition does not hold. */
const CONDITION_NOT_MET = 13

export function bdTaskDb({ repo, beadsDir, assignee }: { repo: string; beadsDir: string; assignee: string }): TaskDb {
  const bd = (args: string[]): string =>
    execFileSync('bd', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BEADS_DIR: beadsDir },
    })
  const json = <T>(args: string[]) => JSON.parse(bd([...args, '--json'])) as T

  return {
    ready: () => json<Issue[]>(['ready', '--label', 'ready-for-agent', '--limit', '0']),
    show: (id) => {
      const parsed = json<Issue | Issue[]>(['show', id])
      return Array.isArray(parsed) ? parsed[0]! : parsed
    },
    epics: () => json<Issue[]>(['list', '--type', 'epic', '--limit', '0']),
    listUnder: (epicId) => json<Issue[]>(['list', '--parent', epicId, '--all', '--limit', '0']),
    assumptionTasks: (scope) => json<Issue[]>(['list', '--metadata-field', 'type=assumptions', '--metadata-field', `epic=${scope}`, '--limit', '0']),
    // A plain --claim succeeds again for the same assignee, so it cannot tell two runs apart.
    claim: (id) => {
      try {
        bd(['update', id, '--if-assignee', '', '--assignee', assignee, '--status', 'in_progress'])
        return true
      } catch (error) {
        if ((error as { status?: number }).status === CONDITION_NOT_MET) return false
        throw error
      }
    },
    unclaim: (id) => void bd(['unclaim', id]),
    comment: (id, text) => void bd(['comment', id, text]),
    update: (id, change) => {
      const args = ['update', id]
      for (const label of change.add ?? []) args.push('--add-label', label)
      for (const label of change.remove ?? []) args.push('--remove-label', label)
      for (const [key, value] of Object.entries(change.setMetadata ?? {})) args.push('--set-metadata', `${key}=${value}`)
      for (const key of change.unsetMetadata ?? []) args.push('--unset-metadata', key)
      bd(args)
    },
    create: (issue: NewIssue) => {
      const args = ['create', '--title', issue.title, '--description', issue.description, '--type', 'task',
        '--labels', issue.labels.join(','), '--deps', `discovered-from:${issue.discoveredFrom}`, '--silent']
      if (issue.metadata) args.push('--metadata', JSON.stringify(issue.metadata))
      if (issue.parent) args.push('--parent', issue.parent, '--no-inherit-labels')
      return bd(args).trim().split('\n').pop()!.trim()
    },
    addDependency: (id, dependsOn) => void bd(['dep', 'add', id, dependsOn]),
    close: (id, reason) => void bd(['close', id, '--reason', reason]),
  }
}
