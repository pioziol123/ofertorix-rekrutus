/**
 * Unattended runner for prepared bd tasks, with agents in Sandcastle docker sandboxes.
 * Contract: docs/agents/implementation-workflow.md (section "Execution").
 *
 * Runs from the runner's copy, a clone of GitHub prepared by `node .sandcastle/setup.ts`
 * in the owner's copy:
 *   node .sandcastle/runner.ts [--once] [--dry-run] [--task <id>] [--model <id>]
 *        [--effort <level>] [--interval <minutes>] [--slots <n>] [--rebuild-image]
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { git } from './exchange.ts'
import { type Runner, excludeAgentFiles, GATE, preview, serialLane, serve, writeLog } from './flow.ts'
import { type Effort, dockerImages, dockerSandboxes } from './environment.ts'
import { readSettings, settingsProblems } from './settings.ts'
import { bdTaskDb } from './taskdb.ts'

const { values: opts } = parseArgs({
  options: {
    once: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    task: { type: 'string' },
    model: { type: 'string', default: 'claude-opus-5-5' },
    effort: { type: 'string', default: 'medium' },
    interval: { type: 'string', default: '5' },
    slots: { type: 'string', default: '1' },
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
/** Entries not tied to a task; each run of a task writes to a log of its own. */
const sharedLog = join(logDir, 'runner.log')
const slots = Number(opts.slots)
if (!Number.isInteger(slots) || slots < 1) {
  console.error(`--slots must be a whole number of at least 1, not ${opts.slots}`)
  process.exit(1)
}

function notify(title: string, message: string): void {
  const clean = (text: string) => text.replace(/["\\]/g, '').slice(0, 200)
  spawn('osascript', ['-e', `display notification "${clean(message)}" with title "${clean(title)}"`], {
    stdio: 'ignore',
  }).on('error', () => {})
}

function log(message: string): void {
  writeLog(sharedLog, message)
}

// ---------- entry ----------

const runner: Runner = {
  repo,
  db: bdTaskDb({ repo, beadsDir: settings.beadsDir, assignee: git(repo, ['config', 'user.name']) }),
  sandboxes: dockerSandboxes({ repo, model: opts.model!, effort: opts.effort as Effort }),
  images: dockerImages({ repo, rebuild: opts['rebuild-image']! }),
  notifier: { notify },
  log,
  taskLog: (taskId) => {
    const file = join(logDir, `${taskId}-${Date.now()}.log`)
    return (message) => writeLog(file, message)
  },
  slots,
  exchange: serialLane(),
  startCommit: git(repo, ['rev-parse', 'HEAD']),
  reportedVersions: new Set(),
  pause: () => new Promise((resolve) => setTimeout(resolve, Number(opts.interval) * 60_000)),
  ...(opts.task ? { onlyTask: opts.task } : {}),
}

async function main(): Promise<void> {
  if (opts['dry-run']) {
    preview(runner)
    console.log(`Agent: ${opts.model} (effort ${opts.effort}) in docker sandbox; gate: ${GATE}; ${slots} task(s) at a time`)
    return
  }
  mkdirSync(logDir, { recursive: true })
  excludeAgentFiles(repo)
  log(`runner started from ${runner.startCommit.slice(0, 7)} in ${repo} with ${slots} slot(s)`)
  await serve(runner, opts.once ? { maxTasks: 1 } : {})
}

await main()
