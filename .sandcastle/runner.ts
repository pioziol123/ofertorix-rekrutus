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
  db: bdTaskDb({ repo, beadsDir: settings.beadsDir }),
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
