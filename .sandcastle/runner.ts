/**
 * Unattended runner for prepared bd tasks, with agents in Sandcastle docker sandboxes.
 * Contract: docs/agents/implementation-workflow.md (section "Execution").
 *
 * Run from the main checkout on a clean master:
 *   node .sandcastle/runner.ts [--once] [--dry-run] [--task <id>] [--model <id>]
 *        [--effort <level>] [--interval <minutes>] [--rebuild-image]
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { claudeCode, createSandbox } from '@ai-hero/sandcastle'
import { docker } from '@ai-hero/sandcastle/sandboxes/docker'

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

const BASE_BRANCH = 'master'
const IMAGE = 'oferty-pracy-sandbox'
const IMAGE_LABEL = 'oferty-pracy.sandbox-inputs'
const RESULT_FILE = '.agent-result.json'
const REVIEW_FILE = '.agent-review.json'
const GATE = 'scripts/gate.sh'
const MAX_ATTEMPTS = 2
/** Skills the agent uses inside the sandbox, mounted read-only from the host. */
const SKILLS = ['implement-task', 'tdd']

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

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

interface Outcome {
  ok: boolean
  report: string
  result: AgentResult | null
  /** A failure that a second attempt cannot fix. */
  final?: boolean
}

const repoRoot = git(['rev-parse', '--show-toplevel'], process.cwd())
const logDir = join(repoRoot, '.sandcastle', 'logs')
let logFile = join(logDir, 'runner.log')

function git(args: string[], cwd = repoRoot): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function tryGit(args: string[], cwd = repoRoot): { ok: boolean; out: string } {
  try {
    return { ok: true, out: git(args, cwd) }
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string }
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() }
  }
}

function bd(args: string[]): string {
  return execFileSync('bd', args, { cwd: repoRoot, encoding: 'utf8' })
}

function bdQuiet(args: string[]): void {
  try {
    bd(args)
  } catch (error) {
    log(`bd ${args[0]} failed: ${(error as Error).message.split('\n')[0]}`)
  }
}

function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  if (existsSync(logDir)) appendFileSync(logFile, `${line}\n`)
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

function notify(title: string, message: string): void {
  const clean = (text: string) => text.replace(/["\\]/g, '').slice(0, 200)
  spawn('osascript', ['-e', `display notification "${clean(message)}" with title "${clean(title)}"`], {
    stdio: 'ignore',
  }).on('error', () => {})
}

// ---------- tasks ----------

function bdShow(id: string): Issue {
  const parsed = JSON.parse(bd(['show', id, '--json'])) as Issue | Issue[]
  return Array.isArray(parsed) ? parsed[0]! : parsed
}

function candidates(): Issue[] {
  if (opts.task) return [bdShow(opts.task)]
  const ready = JSON.parse(bd(['ready', '--json', '--label', 'ready-for-agent', '--limit', '0'])) as Issue[]
  return ready.filter(
    (issue) =>
      issue.issue_type !== 'epic' &&
      !issue.labels?.includes('ready-for-human') &&
      !issue.labels?.includes('needs-info'),
  )
}

/** Deterministic part of the readiness checklist. Returns the problems found. */
function readinessProblems(issue: Issue): string[] {
  const problems: string[] = []
  const meta = issue.metadata ?? {}
  const required = meta.lane === 'small' ? ['prd'] : ['prd', 'requirements', 'sd']
  for (const key of required) {
    const link = meta[key]
    if (!link) {
      problems.push(`metadata.${key} is missing`)
      continue
    }
    const path = link.split('#')[0]!
    if (!tryGit(['cat-file', '-e', `${BASE_BRANCH}:${path}`]).ok) {
      problems.push(`metadata.${key} (${path}) is not in ${BASE_BRANCH}`)
    }
  }
  if (!issue.acceptance_criteria?.trim()) problems.push('acceptance_criteria is empty')
  return problems
}

function returnToPreparation(issue: Issue, reason: string, branch: string | null): void {
  log(`${issue.id}: returned to preparation: ${reason.split('\n')[0]}`)
  const kept = branch ? `\nThe work is kept on branch ${branch}.` : ''
  bdQuiet(['comment', issue.id, `Runner returned the task. ${reason}${kept}`])
  bdQuiet(['update', issue.id, '--remove-label', 'ready-for-agent', '--add-label', 'needs-info'])
  bdQuiet(['unclaim', issue.id])
  notify(`${issue.id} needs attention`, reason)
}

// ---------- environment ----------

function mainCheckoutBlocker(): string | null {
  const branch = git(['branch', '--show-current'])
  if (branch !== BASE_BRANCH) return `main checkout is on ${branch}, not ${BASE_BRANCH}`
  if (git(['status', '--porcelain', '--untracked-files=no'])) {
    return 'main checkout has uncommitted changes to tracked files'
  }
  if (!existsSync(join(repoRoot, '.sandcastle', '.env'))) {
    return '.sandcastle/.env with CLAUDE_CODE_OAUTH_TOKEN is missing'
  }
  return null
}

function excludeAgentFiles(): void {
  const exclude = join(git(['rev-parse', '--path-format=absolute', '--git-common-dir']), 'info', 'exclude')
  const current = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  for (const file of [RESULT_FILE, REVIEW_FILE]) {
    if (!current.split('\n').includes(file)) appendFileSync(exclude, `\n${file}\n`)
  }
}

/** Hash of everything the image is built from that changes rarely. */
function imageInputs(): string {
  const hash = createHash('sha256')
  for (const file of ['pnpm-lock.yaml', '.sandcastle/Dockerfile']) hash.update(git(['show', `${BASE_BRANCH}:${file}`]))
  return hash.digest('hex').slice(0, 16)
}

function ensureImage(): void {
  const wanted = imageInputs()
  let current = ''
  try {
    current = execFileSync('docker', ['image', 'inspect', IMAGE, '--format', `{{ index .Config.Labels "${IMAGE_LABEL}" }}`], {
      encoding: 'utf8',
    }).trim()
  } catch {
    current = ''
  }
  if (current === wanted && !opts['rebuild-image']) return
  log(`building ${IMAGE} (inputs ${wanted}, was ${current || 'none'})`)
  const uid = execFileSync('id', ['-u'], { encoding: 'utf8' }).trim()
  const gid = execFileSync('id', ['-g'], { encoding: 'utf8' }).trim()
  execFileSync(
    'docker',
    ['build', '-q', '-f', '.sandcastle/Dockerfile', '-t', IMAGE, '--label', `${IMAGE_LABEL}=${wanted}`,
      '--build-arg', `AGENT_UID=${uid}`, '--build-arg', `AGENT_GID=${gid}`, '.'],
    { cwd: repoRoot, stdio: ['ignore', 'ignore', 'inherit'] },
  )
}

function sandboxProvider() {
  const skillsRoot = join(homedir(), '.claude', 'skills')
  const mounts = SKILLS.filter((skill) => existsSync(join(skillsRoot, skill))).map((skill) => ({
    hostPath: realpathSync(join(skillsRoot, skill)),
    sandboxPath: `/home/agent/.claude/skills/${skill}`,
    readonly: true,
  }))
  return docker({
    imageName: IMAGE,
    mounts,
    env: {
      GIT_AUTHOR_NAME: git(['config', 'user.name']),
      GIT_AUTHOR_EMAIL: git(['config', 'user.email']),
      GIT_COMMITTER_NAME: git(['config', 'user.name']),
      GIT_COMMITTER_EMAIL: git(['config', 'user.email']),
    },
  })
}

function agent() {
  return claudeCode(opts.model!, { effort: opts.effort as Effort })
}

// ---------- prompts ----------

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
    `Review the change on this branch against its specification. Diff: git diff ${BASE_BRANCH}...HEAD. Do not modify tracked files.`,
    `Documents: ${JSON.stringify(issue.metadata)}. Acceptance criteria:\n${issue.acceptance_criteria}`,
    'Read the documents in full. Report requirements that are missing or partial, behaviour that was not asked for, and contracts implemented differently from the solution design. Quote the document line for each finding.',
    `Write ${REVIEW_FILE} in the repository root as JSON: {"verdict": "pass" | "fail", "findings": ["..."]}. Use "fail" when any finding means an acceptance criterion or a design contract is not met.`,
  ].join('\n\n')
}

// ---------- one task ----------

/** Restores master if anything inside a sandbox moved it. Returns a report when it did. */
function guardMaster(expected: string): string | null {
  const actual = git(['rev-parse', BASE_BRANCH])
  if (actual === expected) return null
  git(['update-ref', `refs/heads/${BASE_BRANCH}`, expected, actual])
  return `${BASE_BRANCH} moved from ${expected.slice(0, 7)} to ${actual.slice(0, 7)} during the run and was restored.`
}

async function implement(issue: Issue, branch: string, masterSha: string, failure: string | null): Promise<Outcome> {
  await using sandbox = await createSandbox({ branch, baseBranch: BASE_BRANCH, cwd: repoRoot, sandbox: sandboxProvider() })
  const worktree = sandbox.worktreePath
  log(`${issue.id}: implementing in ${worktree}`)
  await sandbox.exec(`rm -f ${RESULT_FILE} ${REVIEW_FILE}`)
  const run = await sandbox.run({ agent: agent(), prompt: implementPrompt(issue, failure) })
  log(`${issue.id}: agent finished (log ${run.logFilePath ?? 'none'})`)

  const moved = guardMaster(masterSha)
  if (moved) return { ok: false, report: moved, result: null, final: true }

  const result = readJson<AgentResult>(join(worktree, RESULT_FILE))
  if (!result) return { ok: false, report: `The agent did not write ${RESULT_FILE}.`, result }
  if (result.status === 'blocked') return { ok: false, report: `Blocked: ${result.question}`, result, final: true }

  const dirty = git(['status', '--porcelain'], worktree)
  if (dirty) return { ok: false, report: `Uncommitted changes left in the worktree:\n${dirty}`, result }
  if (git(['rev-list', '--count', `${BASE_BRANCH}..${branch}`]) === '0') {
    return { ok: false, report: 'No commits on the task branch.', result }
  }
  const rebase = tryGit(['rebase', BASE_BRANCH], worktree)
  if (!rebase.ok) {
    tryGit(['rebase', '--abort'], worktree)
    return { ok: false, report: `Rebase on ${BASE_BRANCH} conflicted:\n${tail(rebase.out)}`, result, final: true }
  }
  return { ok: true, report: '', result }
}

/** Gate and review in a fresh sandbox on a copy of the task branch, so only committed work counts. */
async function verify(issue: Issue, branch: string, masterSha: string): Promise<Outcome> {
  const gateBranch = `${branch}-gate`
  tryGit(['branch', '-D', gateBranch])
  git(['branch', gateBranch, branch])
  try {
    await using sandbox = await createSandbox({ branch: gateBranch, cwd: repoRoot, sandbox: sandboxProvider() })
    log(`${issue.id}: running the gate`)
    const gate = await sandbox.exec(GATE)
    if (gate.exitCode !== 0) {
      return { ok: false, report: `Gate failed (${GATE}):\n${tail(`${gate.stdout}${gate.stderr}`)}`, result: null }
    }
    log(`${issue.id}: running the spec review`)
    await sandbox.run({ agent: agent(), prompt: reviewPrompt(issue) })
    const moved = guardMaster(masterSha)
    if (moved) return { ok: false, report: moved, result: null, final: true }
    if (git(['rev-parse', gateBranch]) !== git(['rev-parse', branch])) {
      return { ok: false, report: 'The reviewer committed to the branch under review.', result: null, final: true }
    }
    const review = readJson<Review>(join(sandbox.worktreePath, REVIEW_FILE))
    if (!review) return { ok: false, report: `The reviewer did not write ${REVIEW_FILE}.`, result: null }
    if (review.verdict !== 'pass') {
      return { ok: false, report: `Spec review failed:\n- ${review.findings.join('\n- ')}`, result: null }
    }
    return { ok: true, report: '', result: null }
  } finally {
    tryGit(['branch', '-D', gateBranch])
  }
}

async function processTask(issue: Issue): Promise<void> {
  const branch = `agent/${issue.id}`
  logFile = join(logDir, `${issue.id}-${Date.now()}.log`)
  bd(['update', issue.id, '--claim'])
  tryGit(['branch', '-D', branch])
  const masterSha = git(['rev-parse', BASE_BRANCH])

  let failure: string | null = null
  let outcome: Outcome | null = null
  let result: AgentResult | null = null
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    log(`${issue.id}: attempt ${n}`)
    outcome = await implement(issue, branch, masterSha, failure)
    result = outcome.result ?? result
    if (outcome.ok) outcome = await verify(issue, branch, masterSha)
    if (outcome.ok || outcome.final) break
    failure = outcome.report
    log(`${issue.id}: attempt ${n} failed: ${failure.split('\n')[0]}`)
  }
  if (!outcome?.ok || !result) {
    returnToPreparation(issue, outcome?.report ?? 'Unknown failure.', branch)
    return
  }

  const blocker = mainCheckoutBlocker()
  const merge = blocker ? null : tryGit(['merge', '--ff-only', branch])
  if (blocker || !merge?.ok) {
    returnToPreparation(issue, `Gate passed but the fast-forward merge failed: ${blocker ?? tail(merge?.out ?? '')}`, branch)
    return
  }
  const sha = git(['rev-parse', '--short', 'HEAD'])

  const evidence = result.evidence.map((e) => `- ${e.ac}: ${e.check} → ${e.result}`).join('\n')
  bdQuiet(['comment', issue.id, `${result.summary}\n\nEvidence:\n${evidence}\n\nGate passed in a fresh sandbox; spec review passed.`])
  for (const followup of result.followups ?? []) {
    bdQuiet(['create', '--title', followup.title, '--description', followup.description, '--type', 'task',
      '--labels', 'needs-triage', '--deps', `discovered-from:${issue.id}`, '--silent'])
  }
  bd(['close', issue.id, '--reason', `Merged ${branch} into ${BASE_BRANCH} at ${sha} by the agent runner.`])
  tryGit(['branch', '-d', branch])
  log(`${issue.id}: merged at ${sha} and closed`)
  notify(`${issue.id} merged`, issue.title)
}

// ---------- entry ----------

function dryRun(): void {
  const blocker = mainCheckoutBlocker()
  console.log(blocker ? `Main checkout: NOT READY (${blocker})` : `Main checkout: ready on ${BASE_BRANCH}`)
  const inputs = tryGit(['cat-file', '-e', `${BASE_BRANCH}:.sandcastle/Dockerfile`]).ok ? imageInputs() : null
  console.log(`Image ${IMAGE}: ${inputs ? `inputs ${inputs}` : `.sandcastle/Dockerfile is not on ${BASE_BRANCH} yet`}`)
  const list = candidates()
  console.log(`Candidates: ${list.length}`)
  for (const summary of list) {
    const issue = bdShow(summary.id)
    const problems = readinessProblems(issue)
    console.log(`- ${issue.id} ${issue.title}\n  ${problems.length ? `would return as needs-info: ${problems.join('; ')}` : 'would implement'}`)
  }
  console.log(`Agent: ${opts.model} (effort ${opts.effort}) in docker sandbox; gate: ${GATE}`)
}

async function main(): Promise<void> {
  if (opts['dry-run']) return dryRun()
  mkdirSync(logDir, { recursive: true })
  excludeAgentFiles()
  for (;;) {
    logFile = join(logDir, 'runner.log')
    let picked: Issue | null = null
    const blocker = mainCheckoutBlocker()
    if (blocker) log(`waiting: ${blocker}`)
    else {
      ensureImage()
      for (const summary of candidates()) {
        const issue = bdShow(summary.id)
        const problems = readinessProblems(issue)
        if (problems.length === 0) {
          picked = issue
          break
        }
        returnToPreparation(issue, `Readiness check failed: ${problems.join('; ')}.`, null)
      }
    }
    if (picked) await processTask(picked)
    if (opts.once) return
    if (!picked) {
      log(`no ready task; next check in ${opts.interval} min`)
      await new Promise((resolve) => setTimeout(resolve, Number(opts.interval) * 60_000))
    }
  }
}

await main()
