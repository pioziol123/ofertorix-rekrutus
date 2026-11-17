/**
 * The runner's cycle and the run of one task, independent of Docker, the network and bd.
 * Contract: docs/agents/implementation-workflow.md (section "Execution");
 * solution design of oferty-pracy-uuk, task uuk.2.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BASE_BRANCH,
  branchExists,
  deleteReturnBranch,
  fetchMain,
  git,
  imageInputs,
  missingAt,
  programTree,
  pushMain,
  pushReturnBranch,
  returnBranchName,
  tryGit,
} from './exchange.ts'
import {
  type AgentResult,
  type Issue,
  bearingAssumptions,
  dependants,
  deviationProblems,
  epicLabelPlan,
  isFollowUp,
  isOpen,
  loadBearing,
  marker,
  resultShapeProblems,
} from './followups.ts'
import type { Images, Notifier, Sandboxes, TaskDb, WarmSandbox } from './ports.ts'

export const RESULT_FILE = '.agent-result.json'
export const REVIEW_FILE = '.agent-review.json'
export const GATE = 'scripts/gate.sh'
/** Feedback rounds into the implementing agent's session before the task goes back to preparation. */
export const MAX_FEEDBACK_TURNS = 3

export interface Review {
  verdict: 'pass' | 'pass-with-deferral' | 'fail'
  findings: string[]
}

/** The epic a task belongs to and its children, read once when the task starts. */
export interface EpicContext {
  epic: Issue | null
  children: Issue[]
}

export interface Runner {
  /** The runner's copy: a clone of the exchange point's repository. */
  repo: string
  db: TaskDb
  sandboxes: Sandboxes
  images: Images
  notifier: Notifier
  /** Writes to the current log: the task's own log while a task runs, the shared log otherwise. */
  log(message: string): void
  /** Points the log at a task's own file, or back at the shared log with null. */
  logTo(taskId: string | null): void
  /** The commit the running program was started from (U2-R06). */
  startCommit: string
  /** Program trees at the exchange point already reported as newer. */
  reportedVersions: Set<string>
  /** The usual pause between cycles; a delivery waiting for GitHub retries after it. */
  pause(): Promise<void>
  /** Only this task is considered, as with --task. */
  onlyTask?: string
}

const firstLine = (text: string) => text.split('\n')[0] ?? ''

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

/** Calls the task database, logging instead of throwing; bookkeeping must not stop a run. */
function quietly(r: Runner, what: string, action: () => void): void {
  try {
    action()
  } catch (error) {
    r.log(`${what} failed: ${firstLine((error as Error).message)}`)
  }
}

// ---------- tasks ----------

export function candidates(r: Runner): Issue[] {
  if (r.onlyTask) return [r.db.show(r.onlyTask)]
  return r.db.ready().filter(
    (issue) =>
      issue.issue_type !== 'epic' &&
      !issue.labels?.includes('ready-for-human') &&
      !issue.labels?.includes('needs-info'),
  )
}

/** The nearest epic above an issue, or null for a standalone task. */
function epicOf(r: Runner, issue: Issue): Issue | null {
  let parentId = issue.parent ?? null
  while (parentId) {
    const parent = r.db.show(parentId)
    if (parent.issue_type === 'epic') return parent
    parentId = parent.parent ?? null
  }
  return null
}

/** Every issue below an epic, any status. */
function epicChildren(r: Runner, epic: Issue): Issue[] {
  // bd list --parent also matches ids by their dotted prefix, so a task moved out of the
  // epic would still show up. Membership follows the parent field down from the epic.
  const listed = r.db.listUnder(epic.id)
  const members = new Set([epic.id])
  for (let grew = true; grew; ) {
    grew = false
    for (const issue of listed) {
      if (issue.parent && members.has(issue.parent) && !members.has(issue.id)) {
        members.add(issue.id)
        grew = true
      }
    }
  }
  return listed.filter((issue) => issue.id !== epic.id && members.has(issue.id))
}

/**
 * Epic-level hand-off: a task in an epic starts only when the epic carries
 * ready-for-agent and none of its open children is still in preparation.
 * Returns why the task has to wait, or null when it may start.
 */
export function epicBlocker(r: Runner, issue: Issue): string | null {
  const epic = epicOf(r, issue)
  if (!epic) return null
  if (!epic.labels?.includes('ready-for-agent')) return `epic ${epic.id} has not been handed off (no ready-for-agent)`
  // Follow-ups keep the epic open but do not hold its other tasks back.
  const unprepared = epicChildren(r, epic).filter(
    (child) =>
      child.issue_type !== 'epic' &&
      !isFollowUp(child) &&
      child.status !== 'closed' &&
      child.status !== 'deferred' &&
      !child.labels?.includes('ready-for-human') &&
      (!child.labels?.includes('ready-for-agent') || child.labels.includes('needs-info')),
  )
  if (unprepared.length) return `epic ${epic.id} still has tasks in preparation: ${unprepared.map((c) => c.id).join(', ')}`
  return null
}

function epicContext(r: Runner, issue: Issue): EpicContext {
  const epic = epicOf(r, issue)
  return { epic, children: epic ? epicChildren(r, epic) : [] }
}

/**
 * Keeps follow_ups on handed-off epics in step with their children and takes an epic back
 * (needs-info) when only follow-ups remain and one of them still waits for a decision.
 */
export function reconcileEpics(r: Runner, apply: boolean): void {
  for (const summary of r.db.epics()) {
    const epic = r.db.show(summary.id)
    if (!isOpen(epic)) continue
    const plan = epicLabelPlan(epic, epicChildren(r, epic))
    if (!plan) continue
    const change = [
      ...plan.add.map((l) => `+${l}`),
      ...plan.remove.map((l) => `-${l}`),
      ...(plan.followUps === undefined ? [] : [plan.followUps ? 'follow_ups=true' : 'follow_ups removed']),
    ].join(' ')
    if (!apply) {
      console.log(`Epic ${epic.id}: would reconcile labels: ${change}`)
      continue
    }
    quietly(r, `bd update ${epic.id}`, () => r.db.update(epic.id, {
      add: plan.add,
      remove: plan.remove,
      ...(plan.followUps === true ? { setMetadata: { follow_ups: 'true' } } : {}),
      ...(plan.followUps === false ? { unsetMetadata: ['follow_ups'] } : {}),
    }))
    r.log(`epic ${epic.id}: reconciled labels: ${change}`)
  }
}

/** Repository paths of the documents a task links, without anchors. */
export function documentLinks(issue: Issue): Record<string, string> {
  const meta = issue.metadata ?? {}
  const keys = meta.lane === 'small' ? ['prd'] : ['prd', 'requirements', 'sd']
  const links: Record<string, string> = {}
  for (const key of keys) {
    const link = typeof meta[key] === 'string' ? (meta[key] as string) : ''
    links[key] = link.split('#')[0]!.trim()
  }
  return links
}

/** Deterministic readiness gaps that send a task back to preparation. */
export function readinessProblems(issue: Issue): string[] {
  const problems = Object.entries(documentLinks(issue))
    .filter(([, path]) => !path)
    .map(([key]) => `metadata.${key} is missing`)
  if (!issue.acceptance_criteria?.trim()) problems.push('acceptance_criteria is empty')
  return problems
}

/** Linked documents the fetched exchange point does not have yet; the task waits for them (U2-R09). */
export function missingDocuments(r: Runner, issue: Issue, mainSha: string): string[] {
  return missingAt(r.repo, mainSha, Object.values(documentLinks(issue)).filter(Boolean))
}

/**
 * Gives the task back to preparation. The agent's work, when there is any, goes to the
 * exchange point's repository under the return prefix so the owner can inspect it (U2-R14).
 */
export function returnToPreparation(r: Runner, issue: Issue, reason: string, branch: string | null): void {
  r.log(`${issue.id}: returned to preparation: ${firstLine(reason)}`)
  let kept = ''
  if (branch && branchExists(r.repo, branch)) {
    const pushed = pushReturnBranch(r.repo, branch)
    kept = pushed.ok
      ? `\nThe work is on GitHub on branch ${returnBranchName(branch)}.`
      : `\nThe work stayed only in the runner's copy on branch ${branch}: pushing it to GitHub failed: ${firstLine(pushed.out)}`
    if (!pushed.ok) r.log(`${issue.id}: pushing ${returnBranchName(branch)} failed: ${firstLine(pushed.out)}`)
  }
  quietly(r, `bd comment ${issue.id}`, () => r.db.comment(issue.id, `Runner returned the task. ${reason}${kept}`))
  quietly(r, `bd update ${issue.id}`, () => r.db.update(issue.id, { remove: ['ready-for-agent'], add: ['needs-info'] }))
  quietly(r, `bd unclaim ${issue.id}`, () => r.db.unclaim(issue.id))
  r.notifier.notify(`${issue.id} needs attention`, reason)
}

// ---------- prompts ----------

/** What the agents need to know about the epic's follow-ups and load-bearing requirements. */
function epicBrief(ctx: EpicContext): string {
  if (!ctx.epic) return 'The task belongs to no epic: no load-bearing requirements and no open follow-ups.'
  const followUps = ctx.children
    .filter((c) => isFollowUp(c) && isOpen(c))
    .map((c) => ({ id: c.id, title: c.title, marker: c.metadata?.marker }))
  return [
    `Epic: ${ctx.epic.id}. Load-bearing requirements: ${[...loadBearing(ctx.epic)].join(', ') || 'none marked'}.`,
    followUps.length
      ? `Open follow-ups of the epic; their marked code is interim, build nothing new on it:\n${JSON.stringify(followUps, null, 2)}`
      : 'The epic has no open follow-ups.',
  ].join('\n')
}

/** Reviewer instruction for assumptions that settle a load-bearing requirement; empty when none does. */
function bearingNote(assumptions: NonNullable<AgentResult['assumptions']>, ctx: EpicContext): string {
  const bearing = bearingAssumptions(assumptions, ctx.epic)
  if (!bearing.length) return ''
  return `These assumptions settle load-bearing requirements of the epic: ${bearing.map((b) => `${b.id} (${b.touched.join(', ')})`).join('; ')}. Later tasks build on how they are read. Check each strictly: the reading must be the only one that keeps today's behaviour, or the conflict must belong to a later step of the classification (blocked). A reading that fixes the requirement's meaning for the rest of the epic is a finding.`
}

function implementPrompt(issue: Issue, ctx: EpicContext, baseSha: string): string {
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
    epicBrief(ctx),
    `The task branch starts at commit ${baseSha}, the current ${BASE_BRANCH}.`,
    `Result file: ${RESULT_FILE} in the worktree root.`,
  ].join('\n\n')
}

function feedbackPrompt(report: string): string {
  return [
    'The runner checked your work and the task is not done yet:',
    report,
    `Fix it within the task, run ${GATE} until it exits 0, commit, and rewrite ${RESULT_FILE}. If the report shows a spec conflict rather than a defect in your code, classify it as the process contract's section "Spec conflicts during implementation" says: an assumption or a qualifying deviation goes into the result, anything else means finishing as blocked with the question.`,
  ].join('\n\n')
}

function reviewPrompt(issue: Issue, result: AgentResult, ctx: EpicContext, baseSha: string): string {
  const deviations = result.deviations ?? []
  const assumptions = result.assumptions ?? []
  return [
    `Review the change on this branch against its specification. Diff: git diff ${baseSha}...HEAD. Do not modify tracked files.`,
    `Documents: ${JSON.stringify(issue.metadata)}. Acceptance criteria:\n${issue.acceptance_criteria}`,
    'Read the documents in full, and the section "Spec conflicts during implementation" of the process contract that AGENTS.md names. Report requirements that are missing or partial, behaviour that was not asked for, contracts implemented differently from the solution design, and any option the solution design records as discarded that the diff, an assumption or interim code takes. Quote the document line for each finding.',
    'Also read the architecture rules that AGENTS.md names and check the diff against them. A design cost from their list that the diff introduces is a finding unless the solution design records it or the implementing agent recorded it as an assumption; such an assumption names the architecture rule in place of a precedence rule.',
    epicBrief(ctx),
    `The implementing agent recorded these assumptions:\n${JSON.stringify(assumptions, null, 2)}\nFor each, check that every acceptance criterion is really met, that the choice follows the precedence order, and that a test covers the edge case. An assumption that leaves a criterion unmet is a finding.`,
    bearingNote(assumptions, ctx),
    `And these deviations, each deferring part of the task to a follow-up:\n${JSON.stringify(deviations, null, 2)}\nFor each, check against the classification and qualification rules in that section: that it does not belong to an earlier step (assumption or blocked), that the interim code follows precedence and carries its marker, and that the follow-up description lets a developer with no context understand the business and technical problem, the decision needed and how to verify the target. Check that each deviation's requirement IDs cover every requirement its interim code affects, including shared rules of the epic rather than only a narrower task criterion. Also check that the diff builds nothing new on the interim code of the epic's open follow-ups.`,
    `Write ${REVIEW_FILE} in the repository root as JSON: {"verdict": "pass" | "pass-with-deferral" | "fail", "findings": ["..."]}. Use "fail" when any finding means a criterion that is not deferred or a design contract is not met, or when any deviation or assumption does not hold, or when the diff, an assumption or interim code takes an option the solution design records as discarded. Use "pass-with-deferral" when the work passes and you accept every deviation; "pass" only when there are no deviations.`,
  ].filter(Boolean).join('\n\n')
}

// ---------- one task ----------

/** Delivery retries because the exchange point changed, before the task goes back (U3-R06). */
export const MAX_DELIVERY_RETRIES = 5

/**
 * What the runner keeps about a running task, in memory, for the duration of the run
 * (solution design of oferty-pracy-uuk, task uuk.3, "State of a task").
 */
interface TaskRun {
  issue: Issue
  branch: string
  ctx: EpicContext
  sandbox: WarmSandbox
  /** The exchange point commit the work must sit on: the fetched base, or the newer main it was replayed onto. */
  base: string
  /** The commit of main on which the work last passed the gate; null before the first pass. */
  gateBase: string | null
  /** The checked commit of the work. */
  commit: string | null
  result: AgentResult | null
  review: Review['verdict'] | null
  turns: number
  retries: number
  /** Image inputs of the commit the warm sandbox was opened from. */
  warmInputs: string
  /** The image was rebuilt from a newer main during the task, so the warm sandbox is out of date. */
  envChanged: boolean
}

type Step = { ok: true } | { ok: false; report: string; final?: boolean }

/**
 * Replays the task branch, checked out in the worktree, on top of `onto`. On a conflict the
 * replay is aborted and the report names the conflicting files and the commits of main
 * between `from` and `onto` that change them (U3-R05).
 */
function replay(worktree: string, from: string, onto: string): Step {
  const rebase = tryGit(worktree, ['rebase', onto])
  if (rebase.ok) return { ok: true }
  const files = tryGit(worktree, ['diff', '--name-only', '--diff-filter=U']).out.split('\n').filter(Boolean)
  tryGit(worktree, ['rebase', '--abort'])
  const commits = files.length ? tryGit(worktree, ['log', '--format=%h %s', `${from}..${onto}`, '--', ...files]).out : ''
  const report = [
    `Replaying the task branch on ${BASE_BRANCH} at ${onto} conflicted.`,
    files.length ? `Conflicting files:\n${files.map((f) => `- ${f}`).join('\n')}` : `git said:\n${tail(rebase.out, 20)}`,
    commits ? `Commits of ${BASE_BRANCH} since ${from.slice(0, 7)} that change them:\n${commits.split('\n').map((c) => `- ${c}`).join('\n')}` : '',
    `Rebase the task branch on commit ${onto} yourself (git rebase ${onto}), resolve the conflict, run ${GATE} until it exits 0, commit, and rewrite ${RESULT_FILE}.`,
  ].filter(Boolean).join('\n\n')
  return { ok: false, report }
}

/** The runner's own checks in the implementing agent's warm sandbox, after each agent turn. */
async function warmCheck(r: Runner, t: TaskRun): Promise<Step> {
  const worktree = t.sandbox.worktreePath
  const result = readJson<AgentResult>(join(worktree, RESULT_FILE))
  if (!result) return { ok: false, report: `You did not write ${RESULT_FILE}.` }
  t.result = result
  if (result.status === 'blocked') return { ok: false, report: `Blocked: ${result.question}`, final: true }

  const dirty = git(worktree, ['status', '--porcelain'])
  if (dirty) return { ok: false, report: `Uncommitted changes are left in the worktree:\n${dirty}` }
  if (git(r.repo, ['rev-list', '--count', `${t.base}..refs/heads/${t.branch}`]) === '0') {
    return { ok: false, report: 'There are no commits on the task branch.' }
  }
  // The base is a commit the runner fetched, not the main branch the sandbox can write to.
  const replayed = replay(worktree, t.gateBase ?? t.base, t.base)
  if (!replayed.ok) return replayed
  const shape = resultShapeProblems(result)
  if (shape.length) return { ok: false, report: `${RESULT_FILE} does not match the shape in the implement-task skill:\n- ${shape.join('\n- ')}` }
  // Markers count only when the task's own diff adds them.
  const diff = tryGit(worktree, ['diff', `${t.base}...HEAD`]).out
  const problems = deviationProblems(result, {
    taskId: t.issue.id,
    acceptance: t.issue.acceptance_criteria,
    epic: t.ctx.epic,
    siblings: t.ctx.children,
    hasMarker: (text) => diff.split('\n').some((line) => line.startsWith('+') && line.includes(text)),
  })
  if (problems.length) {
    return { ok: false, report: `The result's evidence and deviations fail the runner's checks (process contract, "What the runner checks"):\n- ${problems.join('\n- ')}` }
  }

  r.log(`${t.issue.id}: running the gate in the warm sandbox`)
  const gate = await t.sandbox.exec(GATE)
  if (gate.exitCode !== 0) return { ok: false, report: `${GATE} failed in your sandbox:\n${tail(`${gate.stdout}${gate.stderr}`)}` }
  return { ok: true }
}

/**
 * The gate in a fresh sandbox on a copy of the task branch, so only committed work counts,
 * and, when asked, the review of the task's whole change against `t.base`. On success the
 * branch's commit becomes the checked commit and `t.base` the commit of the last gate.
 */
async function verify(r: Runner, t: TaskRun, withReview: boolean): Promise<Step> {
  const commit = git(r.repo, ['rev-parse', `refs/heads/${t.branch}`])
  const gateBranch = `${t.branch}-gate`
  git(r.repo, ['branch', '--force', gateBranch, commit])
  try {
    const sandbox = await r.sandboxes.fresh(gateBranch)
    try {
      r.log(`${t.issue.id}: running the gate in a fresh sandbox on ${BASE_BRANCH} at ${t.base.slice(0, 7)}`)
      const gate = await sandbox.exec(GATE)
      if (gate.exitCode !== 0) {
        return { ok: false, report: `${GATE} failed in a fresh sandbox, which sees only committed work:\n${tail(`${gate.stdout}${gate.stderr}`)}` }
      }
      if (withReview) {
        r.log(`${t.issue.id}: running the spec review`)
        await sandbox.review(reviewPrompt(t.issue, t.result!, t.ctx, t.base))
        if (git(r.repo, ['rev-parse', `refs/heads/${gateBranch}`]) !== commit) {
          return { ok: false, report: 'The reviewer committed to the branch under review.', final: true }
        }
        const review = readJson<Review>(join(sandbox.worktreePath, REVIEW_FILE))
        if (!review) return { ok: false, report: `The reviewer did not write ${REVIEW_FILE}.` }
        const findings = Array.isArray(review.findings) ? review.findings.map(String) : []
        // Exactly one verdict passes: pass-with-deferral when the result has deviations, pass otherwise.
        const expected = t.result!.deviations?.length ? 'pass-with-deferral' : 'pass'
        if (review.verdict !== expected) {
          const report = review.verdict === 'fail'
            ? `The spec review failed:\n- ${findings.join('\n- ')}`
            : `The spec review did not pass (verdict ${JSON.stringify(review.verdict)}, expected ${expected}):\n- ${findings.join('\n- ')}`
          return { ok: false, report }
        }
        t.review = review.verdict
      }
      t.commit = commit
      t.gateBase = t.base
      return { ok: true }
    } finally {
      await sandbox.close()
    }
  } finally {
    tryGit(r.repo, ['branch', '-D', gateBranch])
  }
}

/** Checks after an agent turn: the warm checks, then the fresh gate and the review. */
async function fullChecks(r: Runner, t: TaskRun): Promise<Step> {
  const warm = await warmCheck(r, t)
  return warm.ok ? verify(r, t, true) : warm
}

type Delivery = { delivered: true } | { delivered?: false; feedback: string } | { delivered?: false; returned: string }

/**
 * Delivery with a changing exchange point (task uuk.3, "Delivery steps"). Runs before the
 * warm sandbox closes so a failure can still go back to the agent.
 */
async function deliver(r: Runner, t: TaskRun): Promise<Delivery> {
  for (;;) {
    // 1. Fetch; while GitHub is unreachable the checked work waits with its sandbox open (U3-R07).
    const fetched = fetchMain(r.repo)
    if (!fetched.ok) {
      r.log(`${t.issue.id}: delivery waits, GitHub is unreachable: ${firstLine(fetched.error)}`)
      await r.pause()
      continue
    }
    // 2–4. main changed since the last gate: replay the work on it and check it again.
    if (fetched.sha !== t.gateBase) {
      t.retries++
      if (t.retries > MAX_DELIVERY_RETRIES) {
        return { returned: `${BASE_BRANCH} on GitHub changed during delivery more than ${MAX_DELIVERY_RETRIES} times; the last change was ${t.gateBase!.slice(0, 7)} → ${fetched.sha.slice(0, 7)}.` }
      }
      const from = t.gateBase!
      r.log(`${t.issue.id}: ${BASE_BRANCH} on GitHub moved ${from.slice(0, 7)} → ${fetched.sha.slice(0, 7)}; replaying the work (retry ${t.retries} of ${MAX_DELIVERY_RETRIES})`)
      t.base = fetched.sha
      if (imageInputs(r.repo, fetched.sha) !== t.warmInputs) {
        r.log(`${t.issue.id}: the dependency list or the image recipe changed on ${BASE_BRANCH}; building the image from ${fetched.sha.slice(0, 7)}`)
        r.images.ensure(fetched.sha)
        t.envChanged = true
      }
      const replayed = replay(t.sandbox.worktreePath, from, fetched.sha)
      if (!replayed.ok) return { feedback: replayed.report }
      const changed = git(r.repo, ['diff', '--name-only', from, fetched.sha]).split('\n').filter(Boolean)
      const documents = Object.values(documentLinks(t.issue)).filter(Boolean)
      const touched = documents.filter((doc) => changed.includes(doc))
      if (touched.length) r.log(`${t.issue.id}: the change of ${BASE_BRANCH} includes task documents (${touched.join(', ')}); the review runs again`)
      const checked = await verify(r, t, touched.length > 0)
      if (!checked.ok) return checked.final ? { returned: checked.report } : { feedback: checked.report }
      continue
    }
    // 5. Push the checked commit, never forced.
    const pushed = pushMain(r.repo, t.commit!)
    if (pushed.ok) return { delivered: true }
    // The cause comes from fetching again, not from the text of git's message.
    const again = fetchMain(r.repo)
    if (!again.ok || again.sha !== t.gateBase) continue
    return { returned: `Delivery failed: ${tail(pushed.out, 10)}` }
  }
}

/**
 * One implementing session in one warm sandbox, from the first agent turn to delivery.
 * Every failure that a correction can fix goes back into the same session as a feedback
 * turn, MAX_FEEDBACK_TURNS at most. Returns the delivered commit or the reason to return.
 */
async function runTask(r: Runner, issue: Issue, branch: string, baseSha: string, ctx: EpicContext): Promise<{ ok: true; commit: string; result: AgentResult } | { ok: false; report: string }> {
  const sandbox = await r.sandboxes.warm(branch)
  const t: TaskRun = {
    issue, branch, ctx, sandbox, base: baseSha, gateBase: null, commit: null, result: null, review: null,
    turns: 0, retries: 0, warmInputs: imageInputs(r.repo, baseSha), envChanged: false,
  }
  /** Sends a report back to the agent; returns why the task goes back instead, if it must. */
  const feedback = async (report: string): Promise<string | null> => {
    if (t.envChanged) return `The environment changed during the task (the dependency list or the image recipe on ${BASE_BRANCH}), and the agent's sandbox is out of date, so it cannot correct the work:\n${report}`
    if (t.turns >= MAX_FEEDBACK_TURNS) return report
    t.turns++
    r.log(`${issue.id}: feedback turn ${t.turns}: ${firstLine(report)}`)
    await sandbox.exec(`rm -f ${RESULT_FILE}`)
    if (!(await sandbox.resume(feedbackPrompt(report)))) return `${report}\n(No agent session to resume.)`
    return null
  }
  try {
    r.log(`${issue.id}: implementing in ${sandbox.worktreePath}`)
    await sandbox.exec(`rm -f ${RESULT_FILE} ${REVIEW_FILE}`)
    await sandbox.start(implementPrompt(issue, ctx, baseSha))
    for (;;) {
      const checked = await fullChecks(r, t)
      if (!checked.ok) {
        if (checked.final) return { ok: false, report: checked.report }
        const stop = await feedback(checked.report)
        if (stop) return { ok: false, report: stop }
        continue
      }
      const delivery = await deliver(r, t)
      if (delivery.delivered) return { ok: true, commit: t.commit!, result: t.result! }
      if ('returned' in delivery) return { ok: false, report: delivery.returned }
      const stop = await feedback(delivery.feedback)
      if (stop) return { ok: false, report: stop }
    }
  } finally {
    await sandbox.close()
  }
}

/** An id without the project prefix: oferty-pracy-0mq.13 → 0mq.13. Hash ids contain no dash. */
function shortId(id: string): string {
  return id.slice(id.lastIndexOf('-') + 1)
}

export function slug(text: string, maxLength = 50): string {
  const ascii = text
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii.length <= maxLength) return ascii
  const cut = ascii.slice(0, maxLength)
  // Cut at a word boundary and drop a dangling one- or two-letter word such as "i".
  return cut.slice(0, cut.lastIndexOf('-') > 0 ? cut.lastIndexOf('-') : maxLength).replace(/-[a-z0-9]{1,2}$/, '')
}

/**
 * Task branch: <epic>-<task>-<title slug>, e.g. 0mq-13-wprowadzic-wspolne-zarzadzanie.
 * The task part is relative to the epic when the id is hierarchical; a task outside
 * any epic uses its own short id alone.
 */
export function taskBranch(r: Runner, issue: Issue): string {
  const task = shortId(issue.id)
  const epic = epicOf(r, issue)
  let prefix = task
  if (epic) {
    const epicId = shortId(epic.id)
    prefix = task.startsWith(`${epicId}.`) ? `${epicId}-${task.slice(epicId.length + 1)}` : `${epicId}-${task}`
  }
  return `${prefix}-${slug(issue.title)}`
}

/** Comments the evidence and files follow-ups, assumptions and new scope after a delivery. */
function recordOutcome(r: Runner, issue: Issue, result: AgentResult, ctx: EpicContext): void {
  const deviations = result.deviations ?? []
  const assumptions = result.assumptions ?? []
  const evidence = result.evidence.map((e) => `- ${e.ac}: ${e.check} → ${e.result}`).join('\n')
  const sections = [result.summary, `Evidence:\n${evidence}`]
  if (assumptions.length) {
    sections.push(`Assumptions:\n${assumptions.map((a) => `- ${a.id} (${a.requirements.join(', ')}): ${a.decision} Rule: ${a.rule}`).join('\n')}`)
  }
  const review = deviations.length ? 'spec review passed with deferral' : 'spec review passed'
  sections.push(`Gate passed in a fresh sandbox; ${review}.`)

  const filed: string[] = []
  for (const d of deviations) {
    const tag = marker(issue.id, d.id)
    let id = ''
    try {
      id = r.db.create({
        title: d.title,
        description: d.description,
        labels: ['needs-info'],
        metadata: { type: 'follow-up', marker: tag, origin: issue.id },
        discoveredFrom: issue.id,
        ...(ctx.epic ? { parent: ctx.epic.id } : {}),
      })
    } catch (error) {
      r.log(`${issue.id}: filing follow-up ${d.id} failed: ${firstLine((error as Error).message)}`)
      filed.push(`- ${d.id}: NOT FILED, ${d.title} (defers ${d.deferred_acs.join(', ') || 'no criterion'}; marker ${tag})`)
      continue
    }
    const waiting = dependants(d, issue.id, ctx.children)
    for (const dependant of waiting) quietly(r, `bd dep add ${dependant}`, () => r.db.addDependency(dependant, id))
    const blocks = waiting.length ? `; blocks ${waiting.join(', ')}` : ''
    filed.push(`- ${d.id} → ${id}: ${d.title} (defers ${d.deferred_acs.join(', ') || 'no criterion'}; marker ${tag}${blocks})`)
  }
  if (filed.length) sections.push(`Known deviations in ${BASE_BRANCH}, each with a follow-up:\n${filed.join('\n')}`)
  quietly(r, `bd comment ${issue.id}`, () => r.db.comment(issue.id, sections.join('\n\n')))

  if (assumptions.length) recordAssumptions(r, issue, assumptions, ctx)
  for (const scope of result.new_scope ?? result.followups ?? []) {
    quietly(r, `bd create (new scope of ${issue.id})`, () => r.db.create({
      title: scope.title, description: scope.description, labels: ['needs-triage'], discoveredFrom: issue.id,
    }))
  }
}

/** Adds assumptions to the epic's open assumptions task, creating it outside the epic when missing. */
function recordAssumptions(r: Runner, issue: Issue, assumptions: NonNullable<AgentResult['assumptions']>, ctx: EpicContext): void {
  const scope = ctx.epic?.id ?? issue.id
  const bearing = new Map(bearingAssumptions(assumptions, ctx.epic).map((b) => [b.id, b.touched]))
  const flag = (id: string) => (bearing.has(id) ? `\n**Load-bearing (${bearing.get(id)!.join(', ')}): the rest of the epic builds on this reading; confirm it first.**` : '')
  const text = assumptions
    .map((a) => `### ${issue.id} / ${a.id} (${a.requirements.join(', ')})${flag(a.id)}\nGap: ${a.gap}\nDecision: ${a.decision}\nRule: ${a.rule}\nIf decided otherwise: ${a.if_reversed}`)
    .join('\n\n')
  let existing: Issue[] = []
  try {
    existing = r.db.assumptionTasks(scope)
  } catch (error) {
    r.log(`${issue.id}: looking up the assumptions task failed: ${firstLine((error as Error).message)}`)
  }
  const open = existing.find(isOpen)
  if (open) {
    quietly(r, `bd comment ${open.id}`, () => r.db.comment(open.id, text))
    return
  }
  const description = `Implementing agents settled these gaps in the specification of ${scope} by the precedence rule of the process contract. Confirm each one in the solution design, or turn it into a change.\n\n${text}`
  quietly(r, `bd create (assumptions of ${scope})`, () => r.db.create({
    title: `Potwierdzić założenia agentów dla ${scope}`, description, labels: ['needs-triage'],
    metadata: { type: 'assumptions', epic: scope }, discoveredFrom: issue.id,
  }))
}

/** Runs one task from the fetched exchange point state `baseSha` to delivery or return. */
export async function processTask(r: Runner, issue: Issue, baseSha: string): Promise<void> {
  const branch = taskBranch(r, issue)
  r.logTo(issue.id)
  try {
    r.db.claim(issue.id)
    git(r.repo, ['branch', '--force', branch, baseSha])
    const ctx = epicContext(r, issue)

    let outcome: Awaited<ReturnType<typeof runTask>>
    try {
      outcome = await runTask(r, issue, branch, baseSha, ctx)
    } catch (error) {
      // A sandbox or agent failure (idle timeout, docker error) must not kill the runner
      // and leave the task claimed: hand it back like any other failed attempt.
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      returnToPreparation(r, issue, `The runner stopped the attempt on an error: ${message}`, branch)
      return
    }
    if (!outcome.ok) {
      returnToPreparation(r, issue, outcome.report || 'Unknown failure.', branch)
      return
    }
    const { commit, result } = outcome
    const sha = commit.slice(0, 7)
    recordOutcome(r, issue, result, ctx)
    const deferred = result.deviations?.length ? ` with ${result.deviations.length} deviation(s) deferred to follow-ups` : ''
    quietly(r, `bd close ${issue.id}`, () => r.db.close(issue.id, `Delivered ${branch} to ${BASE_BRANCH} on GitHub at ${sha} by the agent runner${deferred}.`))
    deleteReturnBranch(r.repo, branch)
    tryGit(r.repo, ['branch', '-D', branch])
    r.log(`${issue.id}: delivered to ${BASE_BRANCH} on GitHub at ${sha} and closed`)
    r.notifier.notify(`${issue.id} is on GitHub`, `${issue.title} — delivered to ${BASE_BRANCH} at ${sha}`)
  } finally {
    r.logTo(null)
  }
}

// ---------- cycle ----------

/** Reports, once per program version, that the exchange point holds a newer runner (U2-R06). */
export function checkProgramVersion(r: Runner, mainSha: string): string | null {
  const running = programTree(r.repo, r.startCommit)
  const latest = programTree(r.repo, mainSha)
  if (!latest || latest === running) return null
  const message = `${BASE_BRANCH} on GitHub at ${mainSha.slice(0, 7)} has a newer runner program; this runner keeps working in its version from ${r.startCommit.slice(0, 7)}. To switch: run the preparing command again, then restart the runner.`
  if (!r.reportedVersions.has(latest)) {
    r.reportedVersions.add(latest)
    r.log(message)
    r.notifier.notify('Newer runner on GitHub', message)
  }
  return message
}

/**
 * Picks the next task on the fetched state. Tasks whose documents are not at the exchange
 * point yet wait without holding up the others; other readiness gaps return the task.
 */
export function pickTask(r: Runner, mainSha: string, apply: boolean): Issue | null {
  for (const summary of candidates(r)) {
    const issue = r.db.show(summary.id)
    const waiting = epicBlocker(r, issue)
    if (waiting) {
      if (apply) r.log(`${issue.id}: waits: ${waiting}`)
      else console.log(`- ${issue.id} ${issue.title}\n  waits: ${waiting}`)
      continue
    }
    const problems = readinessProblems(issue)
    if (problems.length) {
      if (apply) returnToPreparation(r, issue, `Readiness check failed: ${problems.join('; ')}.`, null)
      else console.log(`- ${issue.id} ${issue.title}\n  would return as needs-info: ${problems.join('; ')}`)
      continue
    }
    const missing = missingDocuments(r, issue, mainSha)
    if (missing.length) {
      const text = `documents not on ${BASE_BRANCH} on GitHub yet: ${missing.join(', ')}`
      if (apply) r.log(`${issue.id}: waits: ${text}`)
      else console.log(`- ${issue.id} ${issue.title}\n  waits: ${text}`)
      continue
    }
    if (!apply) {
      console.log(`- ${issue.id} ${issue.title}\n  would implement`)
      continue
    }
    return issue
  }
  return null
}

/**
 * One cycle: fetch the exchange point, report a newer program, build the image from the
 * fetched state, reconcile epics, pick a task and run it. Returns whether a task ran.
 */
export async function cycle(r: Runner): Promise<boolean> {
  const fetched = fetchMain(r.repo)
  if (!fetched.ok) {
    r.log(`cannot fetch ${BASE_BRANCH} from GitHub; no task taken this cycle: ${tail(fetched.error, 5)}`)
    return false
  }
  checkProgramVersion(r, fetched.sha)
  r.images.ensure(fetched.sha)
  reconcileEpics(r, true)
  const picked = pickTask(r, fetched.sha, true)
  if (!picked) return false
  await processTask(r, picked, fetched.sha)
  return true
}

/** Preview mode: fetch, version check, reconciliation and selection, with no task database writes and no image build. */
export function preview(r: Runner): void {
  const fetched = fetchMain(r.repo)
  if (!fetched.ok) {
    console.log(`Cannot fetch ${BASE_BRANCH} from GitHub: ${tail(fetched.error, 5)}`)
    return
  }
  console.log(`Exchange point: ${BASE_BRANCH} on GitHub at ${fetched.sha.slice(0, 7)}`)
  const newer = checkProgramVersion({ ...r, reportedVersions: new Set(), log: () => {}, notifier: { notify: () => {} } }, fetched.sha)
  console.log(newer ?? `Runner program: current (${r.startCommit.slice(0, 7)})`)
  reconcileEpics(r, false)
  const list = candidates(r)
  console.log(`Candidates: ${list.length}`)
  pickTask(r, fetched.sha, false)
}

/** Keeps the agents' result files out of git status in every worktree of the runner's copy. */
export function excludeAgentFiles(repo: string): void {
  const exclude = join(git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']), 'info', 'exclude')
  const current = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  for (const file of [RESULT_FILE, REVIEW_FILE]) {
    if (!current.split('\n').includes(file)) appendFileSync(exclude, `\n${file}\n`)
  }
}

/** Appends a timestamped line to a log file when its directory exists, and prints it. */
export function writeLog(file: string, message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  if (existsSync(join(file, '..'))) appendFileSync(file, `${line}\n`)
}
