/**
 * Unattended runner for prepared bd tasks, with agents in Sandcastle docker sandboxes.
 * Contract: docs/agents/implementation-workflow.md (section "Execution").
 *
 * Runs from the runner's copy, a clone of GitHub prepared by `node .sandcastle/setup.ts`
 * in the owner's copy:
 *   node .sandcastle/runner.ts [--once] [--dry-run] [--task <id>] [--model <id>]
 *        [--effort <level>] [--interval <minutes>] [--rebuild-image]
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { git } from './exchange.ts'
import { type Runner, cycle, excludeAgentFiles, GATE, preview, writeLog } from './flow.ts'
import type { Issue } from './followups.ts'
import type { NewIssue, TaskDb } from './ports.ts'
import { type Effort, dockerImages, dockerSandboxes } from './environment.ts'
import { readSettings, settingsProblems } from './settings.ts'

const { values: opts } = parseArgs({
  options: {
    once: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    task: { type: 'string' },
    model: { type: 'string', default: 'claude-opus-5-5' },
    effort: { type: 'string', default: 'medium' },
    interval: { type: 'string', default: '5' },
    'rebuild-image': { type: 'boolean', default: false },
  },
})

const repo = git(process.cwd(), ['rev-parse', '--show-toplevel'])
const problems = settingsProblems(repo)
if (problems.length) {
  console.error(`The runner cannot start from ${repo}:\n- ${problems.join('\n- ')}\nPrepare the runner's copy with \`node .sandcastle/setup.ts\` from your copy of the project.`)
  process.exit(1)
}
const settings = readSettings(repo)
const logDir = join(repo, '.sandcastle', 'logs')
const sharedLog = join(logDir, 'runner.log')
let logFile = sharedLog

// ---------- task database ----------

/** Every bd call goes through here; the setting points bd at the owner's task database (U2-R05). */
function bd(args: string[]): string {
  return execFileSync('bd', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BEADS_DIR: settings.beadsDir },
  })
}

const json = <T>(args: string[]) => JSON.parse(bd([...args, '--json'])) as T

const taskDb: TaskDb = {
  ready: () => json<Issue[]>(['ready', '--label', 'ready-for-agent', '--limit', '0']),
  show: (id) => {
    const parsed = json<Issue | Issue[]>(['show', id])
    return Array.isArray(parsed) ? parsed[0]! : parsed
  },
  epics: () => json<Issue[]>(['list', '--type', 'epic', '--limit', '0']),
  listUnder: (epicId) => json<Issue[]>(['list', '--parent', epicId, '--all', '--limit', '0']),
  assumptionTasks: (scope) => json<Issue[]>(['list', '--metadata-field', 'type=assumptions', '--metadata-field', `epic=${scope}`, '--limit', '0']),
  claim: (id) => void bd(['update', id, '--claim']),
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

function notify(title: string, message: string): void {
  const clean = (text: string) => text.replace(/["\\]/g, '').slice(0, 200)
  spawn('osascript', ['-e', `display notification "${clean(message)}" with title "${clean(title)}"`], {
    stdio: 'ignore',
  }).on('error', () => {})
}

function log(message: string): void {
  writeLog(logFile, message)
}

// ---------- entry ----------

const runner: Runner = {
  repo,
  db: taskDb,
  sandboxes: dockerSandboxes({ repo, model: opts.model!, effort: opts.effort as Effort }),
  images: dockerImages({ repo, log, rebuild: opts['rebuild-image']! }),
  notifier: { notify },
  log,
  logTo: (taskId) => {
    logFile = taskId ? join(logDir, `${taskId}-${Date.now()}.log`) : sharedLog
  },
  startCommit: git(repo, ['rev-parse', 'HEAD']),
  reportedVersions: new Set(),
  ...(opts.task ? { onlyTask: opts.task } : {}),
}

async function main(): Promise<void> {
  if (opts['dry-run']) {
    preview(runner)
    console.log(`Agent: ${opts.model} (effort ${opts.effort}) in docker sandbox; gate: ${GATE}`)
    return
  }
  mkdirSync(logDir, { recursive: true })
  excludeAgentFiles(repo)
  log(`runner started from ${runner.startCommit.slice(0, 7)} in ${repo}`)
  for (;;) {
    const ran = await cycle(runner)
    if (opts.once) return
    if (!ran) {
      log(`no task run; next check in ${opts.interval} min`)
      await new Promise((resolve) => setTimeout(resolve, Number(opts.interval) * 60_000))
    }
  }
}

await main()
