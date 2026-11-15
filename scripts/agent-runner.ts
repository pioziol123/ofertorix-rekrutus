/**
 * Unattended runner for prepared bd tasks.
 * Contract: docs/agents/implementation-workflow.md (section "Execution").
 *
 * Usage: node scripts/agent-runner.ts [--once] [--dry-run] [--task <id>] [--agent claude|codex]
 *        [--model <name>] [--effort <level>] [--budget <usd>] [--interval <minutes>]
 *        [--gate <shell command>]
 */
import { spawn } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

const { values: opts } = parseArgs({
  options: {
    once: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    task: { type: 'string' },
    agent: { type: 'string', default: 'claude' },
    model: { type: 'string' },
    effort: { type: 'string', default: 'medium' },
    budget: { type: 'string', default: '20' },
    interval: { type: 'string', default: '5' },
    gate: { type: 'string', default: 'scripts/agent-gate.sh' },
  },
})

const BASE_BRANCH = 'master'
const RESULT_FILE = '.agent-result.json'
const REVIEW_FILE = '.agent-review.json'
const MAX_ATTEMPTS = 2

interface Issue {
  id: string
  title: string
  description?: string
  design?: string
  notes?: string
  acceptance_criteria?: string
  issue_type?: string
  labels?: string[]
  metadata?: Record<string, string>
}

interface AgentResult {
  status: 'done' | 'blocked'
  summary: string
  evidence: { ac: string; check: string; result: string }[]
  followups?: { title: string; description: string }[]
  question: string | null
}

interface Review {
  verdict: 'pass' | 'fail'
  findings: string[]
}

interface RunOutput {
  code: number
  stdout: string
  stderr: string
}

interface Outcome {
  ok: boolean
  report: string
  result: AgentResult | null
  /** A failure that a second attempt cannot fix. */
  final?: boolean
}

let logDir = ''
let logFile = ''

function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  if (logDir && existsSync(logDir)) appendFileSync(logFile, `${line}\n`)
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 10 * 60_000,
): Promise<RunOutput> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (logDir && existsSync(logDir)) {
        appendFileSync(
          logFile,
          `$ ${cmd} ${args.join(' ')}\n${stdout}${stderr}\n`,
        )
      }
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

const repoRoot = (
  await run('git', ['rev-parse', '--show-toplevel'], process.cwd())
).stdout.trim()
const workRoot = join(
  dirname(repoRoot),
  `${basename(repoRoot)}-agent-worktrees`,
)
logDir = join(workRoot, 'logs')
logFile = join(logDir, 'runner.log')

async function must(
  cmd: string,
  args: string[],
  cwd = repoRoot,
): Promise<string> {
  const out = await run(cmd, args, cwd)
  if (out.code !== 0)
    throw new Error(
      `${cmd} ${args.join(' ')} failed: ${out.stderr || out.stdout}`,
    )
  return out.stdout
}

function tail(text: string, lines = 60): string {
  return text.trim().split('\n').slice(-lines).join('\n')
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function bdShow(id: string): Promise<Issue> {
  const parsed = JSON.parse(await must('bd', ['show', id, '--json'])) as
    Issue | Issue[]
  return Array.isArray(parsed) ? parsed[0]! : parsed
}

async function candidates(): Promise<Issue[]> {
  if (opts.task) return [await bdShow(opts.task)]
  const out = await must('bd', [
    'ready',
    '--json',
    '--label',
    'ready-for-agent',
    '--limit',
    '0',
  ])
  const ready = JSON.parse(out) as Issue[]
  return ready.filter(
    (issue) =>
      issue.issue_type !== 'epic' &&
      !issue.labels?.includes('ready-for-human') &&
      !issue.labels?.includes('needs-info'),
  )
}

/** Deterministic part of the readiness checklist. Returns the problems found. */
async function readinessProblems(issue: Issue): Promise<string[]> {
  const problems: string[] = []
  const meta = issue.metadata ?? {}
  const required =
    meta.lane === 'small' ? ['prd'] : ['prd', 'requirements', 'sd']
  for (const key of required) {
    const link = meta[key]
    if (!link) {
      problems.push(`metadata.${key} is missing`)
      continue
    }
    const path = link.split('#')[0]!
    const exists = await run(
      'git',
      ['cat-file', '-e', `${BASE_BRANCH}:${path}`],
      repoRoot,
    )
    if (exists.code !== 0)
      problems.push(`metadata.${key} (${path}) is not in ${BASE_BRANCH}`)
  }
  if (!issue.acceptance_criteria?.trim())
    problems.push('acceptance_criteria is empty')
  return problems
}

async function mainCheckoutBlocker(): Promise<string | null> {
  const branch = (await must('git', ['branch', '--show-current'])).trim()
  if (branch !== BASE_BRANCH)
    return `main checkout is on ${branch}, not ${BASE_BRANCH}`
  const dirty = (
    await must('git', ['status', '--porcelain', '--untracked-files=no'])
  ).trim()
  if (dirty) return 'main checkout has uncommitted changes to tracked files'
  return null
}

async function excludeAgentFiles(): Promise<void> {
  const common = (await must('git', ['rev-parse', '--git-common-dir'])).trim()
  const exclude = join(
    common.startsWith('/') ? common : join(repoRoot, common),
    'info',
    'exclude',
  )
  const current = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  for (const file of [RESULT_FILE, REVIEW_FILE]) {
    if (!current.split('\n').includes(file))
      appendFileSync(exclude, `\n${file}\n`)
  }
}

const IMPLEMENT_TOOLS = [
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
  'Skill',
  'Task',
  'Bash(scripts/agent-exec.sh *)',
  'Bash(./scripts/agent-exec.sh *)',
  'Bash(scripts/agent-gate.sh)',
  'Bash(./scripts/agent-gate.sh)',
  'Bash(ls *)',
  'Bash(git add *)',
  'Bash(git commit *)',
  'Bash(git status *)',
  'Bash(git diff *)',
  'Bash(git log *)',
  'Bash(git show *)',
  'Bash(git restore *)',
  'Bash(git mv *)',
  'Bash(git rm *)',
]
const REVIEW_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Write',
  'Bash(git diff *)',
  'Bash(git log *)',
  'Bash(git show *)',
]
const DENIED_TOOLS = [
  'Bash(git push *)',
  'Bash(git checkout *)',
  'Bash(git switch *)',
  'Bash(git merge *)',
  'Bash(git rebase *)',
  'Bash(bd *)',
  'Bash(docker *)',
]

function agentCommand(prompt: string, review: boolean): [string, string[]] {
  if (opts.agent === 'codex') {
    const args = [
      'exec',
      '--sandbox',
      'workspace-write',
      '-c',
      `model_reasoning_effort=${opts.effort}`,
    ]
    if (opts.model) args.push('--model', opts.model)
    return ['codex', [...args, prompt]]
  }
  return [
    'claude',
    [
      '-p',
      prompt,
      '--model',
      opts.model ?? 'opus',
      '--effort',
      opts.effort!,
      '--max-budget-usd',
      opts.budget!,
      '--permission-mode',
      'dontAsk',
      '--allowedTools',
      (review ? REVIEW_TOOLS : IMPLEMENT_TOOLS).join(','),
      '--disallowedTools',
      DENIED_TOOLS.join(','),
      '--output-format',
      'json',
    ],
  ]
}

function implementPrompt(issue: Issue, failure: string | null): string {
  const task = {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    design: issue.design,
    notes: issue.notes,
    acceptance_criteria: issue.acceptance_criteria,
    documents: issue.metadata,
  }
  return [
    'Use the implement-task skill.',
    `Task:\n${JSON.stringify(task, null, 2)}`,
    `Result file: ${RESULT_FILE} in the worktree root.`,
    failure ? `Failure report from the previous attempt:\n${failure}` : '',
  ].join('\n\n')
}

function reviewPrompt(issue: Issue): string {
  return [
    `Review the change on this branch against its specification. Diff: git diff ${BASE_BRANCH}...HEAD.`,
    `Documents: ${JSON.stringify(issue.metadata)}. Acceptance criteria:\n${issue.acceptance_criteria}`,
    'Read the documents in full. Report requirements that are missing or partial, behaviour that was not asked for, and contracts implemented differently from the solution design. Quote the document line for each finding.',
    `Write ${REVIEW_FILE} in the repository root as JSON: {"verdict": "pass" | "fail", "findings": ["..."]}. Use "fail" when any finding means an acceptance criterion or a design contract is not met.`,
  ].join('\n\n')
}

function notify(title: string, message: string): void {
  const clean = (text: string) => text.replace(/["\\]/g, '').slice(0, 200)
  spawn(
    'osascript',
    [
      '-e',
      `display notification "${clean(message)}" with title "${clean(title)}"`,
    ],
    {
      stdio: 'ignore',
    },
  ).on('error', () => {})
}

async function returnToPreparation(
  issue: Issue,
  reason: string,
  worktree: string | null,
): Promise<void> {
  log(`${issue.id}: returned to preparation: ${reason.split('\n')[0]}`)
  const kept = worktree ? `\nWorktree kept at ${worktree}.` : ''
  await run(
    'bd',
    ['comment', issue.id, `Runner returned the task. ${reason}${kept}`],
    repoRoot,
  )
  await run(
    'bd',
    [
      'update',
      issue.id,
      '--remove-label',
      'ready-for-agent',
      '--add-label',
      'needs-info',
    ],
    repoRoot,
  )
  await run('bd', ['unclaim', issue.id], repoRoot)
  notify(`${issue.id} needs attention`, reason)
}

async function attempt(
  issue: Issue,
  worktree: string,
  failure: string | null,
): Promise<Outcome> {
  rmSync(join(worktree, RESULT_FILE), { force: true })
  rmSync(join(worktree, REVIEW_FILE), { force: true })

  const [cmd, args] = agentCommand(implementPrompt(issue, failure), false)
  log(`${issue.id}: running ${cmd} implementation`)
  await run(cmd, args, worktree, 3 * 60 * 60_000)

  const result = readJson<AgentResult>(join(worktree, RESULT_FILE))
  if (!result)
    return {
      ok: false,
      report: `The agent did not write ${RESULT_FILE}.`,
      result,
    }
  if (result.status === 'blocked') {
    return {
      ok: false,
      report: `Blocked: ${result.question}`,
      result,
      final: true,
    }
  }

  const dirty = (
    await run('git', ['status', '--porcelain'], worktree)
  ).stdout.trim()
  if (dirty)
    return {
      ok: false,
      report: `Uncommitted changes left in the worktree:\n${dirty}`,
      result,
    }
  const ahead = (
    await run('git', ['rev-list', '--count', `${BASE_BRANCH}..HEAD`], worktree)
  ).stdout.trim()
  if (ahead === '0')
    return { ok: false, report: 'No commits on the task branch.', result }

  const rebase = await run('git', ['rebase', BASE_BRANCH], worktree)
  if (rebase.code !== 0) {
    await run('git', ['rebase', '--abort'], worktree)
    const report = `Rebase on ${BASE_BRANCH} conflicted:\n${tail(rebase.stdout + rebase.stderr)}`
    return { ok: false, report, result, final: true }
  }

  log(`${issue.id}: running gate`)
  const gate = await run('sh', ['-c', opts.gate!], worktree, 45 * 60_000)
  if (gate.code !== 0) {
    return {
      ok: false,
      report: `Gate failed (${opts.gate}):\n${tail(gate.stdout + gate.stderr)}`,
      result,
    }
  }

  const [reviewCmd, reviewArgs] = agentCommand(reviewPrompt(issue), true)
  log(`${issue.id}: running ${reviewCmd} review`)
  await run(reviewCmd, reviewArgs, worktree, 60 * 60_000)
  const review = readJson<Review>(join(worktree, REVIEW_FILE))
  if (!review)
    return {
      ok: false,
      report: `The reviewer did not write ${REVIEW_FILE}.`,
      result,
    }
  if (review.verdict !== 'pass') {
    return {
      ok: false,
      report: `Spec review failed:\n- ${review.findings.join('\n- ')}`,
      result,
    }
  }
  return { ok: true, report: '', result }
}

async function processTask(issue: Issue): Promise<void> {
  const branch = `agent/${issue.id}`
  const worktree = join(workRoot, issue.id)
  logFile = join(logDir, `${issue.id}-${Date.now()}.log`)

  await must('bd', ['update', issue.id, '--claim'])
  if (existsSync(worktree))
    await run('git', ['worktree', 'remove', '--force', worktree], repoRoot)
  await run('git', ['branch', '-D', branch], repoRoot)
  await must('git', ['worktree', 'add', '-b', branch, worktree, BASE_BRANCH])

  let failure: string | null = null
  let outcome: Outcome | null = null
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    log(`${issue.id}: attempt ${n}`)
    outcome = await attempt(issue, worktree, failure)
    if (outcome.ok || outcome.final) break
    failure = outcome.report
    log(`${issue.id}: attempt ${n} failed: ${failure.split('\n')[0]}`)
  }
  if (!outcome?.ok || !outcome.result) {
    await returnToPreparation(
      issue,
      outcome?.report ?? 'Unknown failure.',
      worktree,
    )
    return
  }

  const blocker = await mainCheckoutBlocker()
  const merge = blocker
    ? null
    : await run('git', ['merge', '--ff-only', branch], repoRoot)
  if (blocker || !merge || merge.code !== 0) {
    const why = blocker ?? tail(merge?.stderr ?? '')
    await returnToPreparation(
      issue,
      `Gates passed but the fast-forward merge failed: ${why}`,
      worktree,
    )
    return
  }
  const sha = (await must('git', ['rev-parse', '--short', 'HEAD'])).trim()

  const result = outcome.result
  const evidence = result.evidence
    .map((e) => `- ${e.ac}: ${e.check} → ${e.result}`)
    .join('\n')
  const comment = `${result.summary}\n\nEvidence:\n${evidence}\n\nGate passed; spec review passed.`
  await run('bd', ['comment', issue.id, comment], repoRoot)
  for (const followup of result.followups ?? []) {
    await run(
      'bd',
      [
        'create',
        '--title',
        followup.title,
        '--description',
        followup.description,
        '--type',
        'task',
        '--labels',
        'needs-triage',
        '--deps',
        `discovered-from:${issue.id}`,
        '--silent',
      ],
      repoRoot,
    )
  }
  await must('bd', [
    'close',
    issue.id,
    '--reason',
    `Merged ${branch} into ${BASE_BRANCH} at ${sha} by the agent runner.`,
  ])
  await run('git', ['worktree', 'remove', '--force', worktree], repoRoot)
  await run('git', ['branch', '-d', branch], repoRoot)
  log(`${issue.id}: merged at ${sha} and closed`)
  notify(`${issue.id} merged`, issue.title)
}

async function dryRun(): Promise<void> {
  const blocker = await mainCheckoutBlocker()
  console.log(
    blocker
      ? `Main checkout: NOT READY (${blocker})`
      : `Main checkout: ready on ${BASE_BRANCH}`,
  )
  const list = await candidates()
  console.log(`Candidates: ${list.length}`)
  for (const summary of list) {
    const issue = await bdShow(summary.id)
    const problems = await readinessProblems(issue)
    const verdict = problems.length
      ? `would return as needs-info: ${problems.join('; ')}`
      : 'would implement'
    console.log(`- ${issue.id} ${issue.title}\n  ${verdict}`)
  }
  const [cmd, args] = agentCommand('<prompt>', false)
  console.log(
    `Agent: ${cmd} ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`,
  )
  console.log(`Gate: ${opts.gate}`)
}

async function main(): Promise<void> {
  if (opts['dry-run']) return dryRun()
  mkdirSync(logDir, { recursive: true })
  await excludeAgentFiles()
  for (;;) {
    logFile = join(logDir, 'runner.log')
    let picked: Issue | null = null
    const blocker = await mainCheckoutBlocker()
    if (blocker) log(`waiting: ${blocker}`)
    else {
      for (const summary of await candidates()) {
        const issue = await bdShow(summary.id)
        const problems = await readinessProblems(issue)
        if (problems.length === 0) {
          picked = issue
          break
        }
        await returnToPreparation(
          issue,
          `Readiness check failed: ${problems.join('; ')}.`,
          null,
        )
      }
    }
    if (picked) await processTask(picked)
    if (opts.once) return
    if (!picked) {
      log(`no ready task; next check in ${opts.interval} min`)
      await new Promise((resolve) =>
        setTimeout(resolve, Number(opts.interval) * 60_000),
      )
    }
  }
}

await main()
