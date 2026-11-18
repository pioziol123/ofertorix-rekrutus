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
  commitExists,
  deleteRemoteBranch,
  deleteReturnBranch,
  EXCHANGE_REF,
  fetchKeptWork,
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
  sharedCriteria,
  marker,
  resultShapeProblems,
} from './followups.ts'
import type { FreshSandbox, Images, Notifier, Sandboxes, TaskDb, WarmSandbox } from './ports.ts'
import {
  type Continuation,
  type ReturnData,
  type StateNote,
  KEPT_BASE,
  KEPT_BRANCH,
  RETURN_COMMENT,
  START_FRESH,
  continuationBrief,
  keptWork,
  parseReturnData,
  returnDataBlock,
  sinceReturn,
  stateNote,
} from './continuation.ts'
import { EnvironmentExhausted, EnvironmentFailure, MAX_ENVIRONMENT_RETRIES, closeQuietly, guardedSandboxes } from './retries.ts'

export const RESULT_FILE = '.agent-result.json'
export const REVIEW_FILE = '.agent-review.json'
export const GATE = 'scripts/gate.sh'
/**
 * Starts the image's PostgreSQL for the reviewer. The gate stops the database it started,
 * so without this a reviewer cannot run a single test on a real database.
 */
export const REVIEW_DATABASE = 'pg_ctl --wait --options="-k /tmp -c listen_addresses=localhost" --log=/tmp/review-postgres.log start && pnpm migrate'
/** Feedback rounds into the implementing agent's session before the task goes back to preparation. */
export const MAX_FEEDBACK_TURNS = 3

export interface Review {
  verdict: 'pass' | 'pass-with-deferral' | 'fail'
  /** Marked findings; a plain string, as an older reviewer writes it, counts as a fix finding (D5). */
  findings: (string | Finding)[]
}

/**
 * A finding of the review (D5). A fix finding goes back to the agent as a feedback turn; an
 * owner finding needs a choice the documents leave open or a change of a document, and ends
 * the attempt. Its question has the shape of the state note's question (REV-R02).
 */
export interface Finding {
  kind: 'fix' | 'owner'
  text: string
  question?: unknown
}

/** Reads the review's findings: a finding not marked `owner` is a fix finding (REV-AC03). */
export function findingsOf(raw: unknown): Finding[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item): Finding => {
    if (!item || typeof item !== 'object') return { kind: 'fix', text: String(item) }
    const { kind, text, question } = item as Record<string, unknown>
    const body = typeof text === 'string' ? text : JSON.stringify(item)
    // An owner finding without its question still ends the attempt.
    // ASSUMPTION(oferty-pracy-5yd.4/ASM-1)
    if (kind === 'owner') return question === undefined ? { kind, text: body } : { kind, text: body, question }
    return { kind: 'fix', text: body }
  })
}

/** One line of the review report per finding; an owner finding is labelled and carries its question. */
function findingLine(finding: Finding): string {
  if (finding.kind === 'fix') return finding.text
  const question = finding.question === undefined ? '' : `\n  Question: ${JSON.stringify(finding.question)}`
  return `Owner finding: ${finding.text}${question}`
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
  /**
   * Writes to the log of this context: the runner's shared log, or the task's own log in
   * the context a task's run gets (task uuk.4: no variables shared between runs).
   */
  log(message: string): void
  /** A new log of its own for one run of a task. */
  taskLog(taskId: string): (message: string) => void
  /** How many tasks run at the same time (U4-R02); 1 by default. */
  slots: number
  /** Fetches and deliveries of all runs pass through here one at a time (U4-R04). */
  exchange: Lane
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

/** Runs operations one at a time, in the order they arrive. */
export interface Lane {
  run<T>(operation: () => T | Promise<T>): Promise<T>
}

export function serialLane(): Lane {
  let last: Promise<unknown> = Promise.resolve()
  return {
    run<T>(operation: () => T | Promise<T>): Promise<T> {
      const result = last.then(operation)
      last = result.catch(() => {})
      return result
    },
  }
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
 * exchange point's repository under the return prefix so the owner can inspect it (U2-R14),
 * and the task records it as kept work for the next attempt (oferty-pracy-5yd, CON-R01).
 * The state note and the last review report travel as data at the end of the comment (CON-R10).
 */
export function returnToPreparation(r: Runner, issue: Issue, reason: string, branch: string | null, data: ReturnData = {}, startBase: string | null = null): void {
  r.log(`${issue.id}: returned to preparation: ${firstLine(reason)}`)
  let kept = ''
  if (branch && branchExists(r.repo, branch)) {
    const pushed = pushReturnBranch(r.repo, branch)
    kept = pushed.ok
      ? `\nThe work is on GitHub on branch ${returnBranchName(branch)}.`
      : `\nThe work stayed only in the runner's copy on branch ${branch}: pushing it to GitHub failed: ${firstLine(pushed.out)}`
    if (pushed.ok) {
      // The commit of main the attempt worked on: where it started, or for kept work not yet
      // replayed, the older commit that work is built on. A replay onto a newer main during
      // delivery does not move it, so the owner's answer keeps every document change since.
      const base = tryGit(r.repo, ['merge-base', `refs/heads/${branch}`, startBase ?? EXCHANGE_REF])
      if (base.ok) {
        quietly(r, `bd update ${issue.id}`, () => r.db.update(issue.id, { setMetadata: { [KEPT_BRANCH]: returnBranchName(branch), [KEPT_BASE]: base.out } }))
      } else {
        r.log(`${issue.id}: the kept work is not recorded in the task, its base on ${BASE_BRANCH} is unknown: ${firstLine(base.out)}`)
      }
    } else {
      r.log(`${issue.id}: pushing ${returnBranchName(branch)} failed: ${firstLine(pushed.out)}`)
    }
  }
  quietly(r, `bd comment ${issue.id}`, () => r.db.comment(issue.id, `${RETURN_COMMENT} ${reason}${kept}${returnDataBlock(data)}`))
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

function implementPrompt(issue: Issue, ctx: EpicContext, baseSha: string, continuation: Continuation | null): string {
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
    continuation
      ? continuationBrief(continuation, baseSha, BASE_BRANCH)
      : `The task branch starts at commit ${baseSha}, the current ${BASE_BRANCH}.`,
    `Result file: ${RESULT_FILE} in the worktree root.`,
  ].join('\n\n')
}

/** The one request for a state note before a return (CON-R09); not a feedback turn. */
function notePrompt(reason: string, owner: boolean): string {
  return [
    'The runner is returning this task to preparation, so this attempt ends here:',
    reason,
    `Write a state note for the next attempt with the task-state-note skill: it goes into ${RESULT_FILE} as state_note. Change nothing else: no code, no commits.`,
    // REV-R03: the note carries the owner findings and the fix findings.
    owner ? "Carry the review's findings in the note: the owner findings in its question, with their options and the reviewer's recommendation, and the fix findings in what remains." : '',
  ].filter(Boolean).join('\n\n')
}

/**
 * What the new agent after an environment failure receives beside the implementing prompt
 * (ENV-R02): that the previous agent stopped on the environment, the failure's first line,
 * and the last review report of the attempt when the continuation part does not carry it.
 */
function retryBrief(failure: EnvironmentFailure, lastReview: string | null, continuedReview: string | null): string {
  return [
    `The previous agent of this attempt stopped on an environment failure, not because of the task: ${firstLine(failure.message)}`,
    `You are a new agent; its conversation is not resumed. The runner opened a new sandbox on the same work directory: the task branch holds the previous agent's commits, and files it changed but did not commit are still in the worktree. Check git status and git log, keep what is sound, and finish the task as the implement-task skill says.`,
    lastReview && lastReview !== continuedReview ? `The last review report of this attempt:\n${lastReview}` : '',
  ].filter(Boolean).join('\n\n')
}

function feedbackPrompt(report: string): string {
  return [
    'The runner checked your work and the task is not done yet:',
    report,
    `Fix it within the task, run ${GATE} until it exits 0, commit, and rewrite ${RESULT_FILE}. If the report shows a spec conflict rather than a defect in your code, classify it as the process contract's section "Spec conflicts during implementation" says: an assumption or a qualifying deviation goes into the result, anything else means finishing as blocked with the question.`,
  ].join('\n\n')
}

function reviewPrompt(issue: Issue, result: AgentResult, ctx: EpicContext, baseSha: string, database: boolean, continuation: boolean): string {
  const deviations = result.deviations ?? []
  const assumptions = result.assumptions ?? []
  return [
    `Review the change on this branch against its specification. Diff: git diff ${baseSha}...HEAD. Do not modify tracked files.`,
    // CON-R07: the kept work of the returned attempt is part of the task's change.
    continuation ? `This attempt continued the kept work of an earlier, returned attempt. The diff covers the task's whole change against ${BASE_BRANCH}, the kept commits included; review all of it.` : '',
    `The gate already passed here: every test ran, those on a real database included. ${
      database
        ? 'PostgreSQL is running with the schema migrated, so you can run a single test to check a claim, for example RUN_INTEGRATION=1 pnpm vitest run <test file>.'
        : 'PostgreSQL could not be started for you, so tests on a real database cannot be run again here; judge them from the code and the gate result.'
    }`,
    `Documents: ${JSON.stringify(issue.metadata)}. Acceptance criteria:\n${issue.acceptance_criteria}`,
    'Read the documents in full, and the section "Spec conflicts during implementation" of the process contract that AGENTS.md names. Report requirements that are missing or partial, behaviour that was not asked for, contracts implemented differently from the solution design, and any option the solution design records as discarded that the diff, an assumption or interim code takes. Quote the document line for each finding.',
    'Also read the architecture rules that AGENTS.md names and check the diff against them. A design cost from their list that the diff introduces is a finding unless the solution design records it or the implementing agent recorded it as an assumption; such an assumption names the architecture rule in place of a precedence rule.',
    epicBrief(ctx),
    `The implementing agent recorded these assumptions:\n${JSON.stringify(assumptions, null, 2)}\nFor each, check that every acceptance criterion is really met, that the choice follows the precedence order, and that a test covers the edge case. An assumption that leaves a criterion unmet is a finding.`,
    bearingNote(assumptions, ctx),
    `And these deviations, each deferring part of the task to a follow-up:\n${JSON.stringify(deviations, null, 2)}\nFor each, check against the classification and qualification rules in that section: that it does not belong to an earlier step (assumption or blocked), that the interim code follows precedence and carries its marker, and that the follow-up description lets a developer with no context understand the business and technical problem, the decision needed and how to verify the target. Check that each deviation's requirement IDs cover every requirement its interim code affects, including shared rules of the epic rather than only a narrower task criterion. Also check that the diff builds nothing new on the interim code of the epic's open follow-ups.`,
    // REV-R01, REV-R02, REV-R05: the two kinds of finding. A blocked result returns before any
    // review, so the rule on an unneeded stop applies to the conflicts the reviewer sees.
    // ASSUMPTION(oferty-pracy-5yd.4/ASM-2)
    [
      'Mark every finding with its kind:',
      '- "fix": the implementing agent can remove it from the documents and the code alone. It goes back to the agent as a correction.',
      '- "owner": removing it needs a choice the documents leave open, or a change of a document. The runner then ends the attempt without a correction round and returns the task to the owner with the findings, so mark a finding "owner" only when no reading of the documents settles it.',
      'Two cases are always "fix" findings, because the documents settle them: taking an option the solution design records as discarded (the fix is to drop it), and a stop the agent did not need, that is a stop where the classification in that section allows an assumption or a qualifying deviation with a follow-up (the fix is to record the assumption or the deviation and carry on). So a spec conflict that an assumption or a qualifying deviation settles is a "fix" finding, not an "owner" one.',
      'An owner finding also carries a "question" in the shape of the question of a state note, as the task-state-note skill defines it (read that skill): it states the conflict and quotes the requirements involved, lists the options with their consequences, and gives your recommendation.',
    ].join('\n'),
    `Write ${REVIEW_FILE} in the repository root as JSON: {"verdict": "pass" | "pass-with-deferral" | "fail", "findings": [{"kind": "fix", "text": "..."}, {"kind": "owner", "text": "...", "question": {...}}]}. Use "fail" when any finding means a criterion that is not deferred or a design contract is not met, or when any deviation or assumption does not hold, or when the diff, an assumption or interim code takes an option the solution design records as discarded. Use "pass-with-deferral" when the work passes and you accept every deviation; "pass" only when there are no deviations.`,
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
  /** The implementing agent's sandbox; null until it is open, and after an environment failure until a new one is. */
  sandbox: WarmSandbox | null
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
  /** The returned attempt this one continues, or null for a start from main. */
  continuation: Continuation | null
  /** The last review report, of this attempt or, before its first review, of the one it continues. */
  lastReview: string | null
  /** Every environment failure of the attempt, in order; counted from zero in every attempt (CON-R08, ENV-R04). */
  environmentFailures: string[]
}

/**
 * Counts an environment failure of the attempt (D4). While retries remain it logs the retry;
 * the failure after the last retry throws EnvironmentExhausted, which returns the task.
 */
function environmentFailure(r: Runner, t: TaskRun, failure: EnvironmentFailure): void {
  t.environmentFailures.push(failure.message)
  const count = t.environmentFailures.length
  if (count > MAX_ENVIRONMENT_RETRIES) {
    r.log(`${t.issue.id}: environment failure ${count}, no retry left: ${firstLine(failure.message)}`)
    throw new EnvironmentExhausted(t.environmentFailures)
  }
  r.log(`${t.issue.id}: environment failure ${count}, retry ${count} of ${MAX_ENVIRONMENT_RETRIES} (not a feedback turn): ${firstLine(failure.message)}`)
}

/** `owner`: the review has an owner finding, so the attempt ends without a feedback turn (REV-R03). */
type Step = { ok: true } | { ok: false; report: string; final?: boolean; owner?: boolean }

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
  const worktree = t.sandbox!.worktreePath
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
  // Kept work of a returned attempt is replayed from the commit of main it was built on.
  const replayed = replay(worktree, t.gateBase ?? t.continuation?.keptBase ?? t.base, t.base)
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
  const gate = await t.sandbox!.exec(GATE)
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
  try {
    // An environment failure in the fresh sandbox repeats the check in a new one (ENV-R03).
    for (;;) {
      git(r.repo, ['branch', '--force', gateBranch, commit])
      try {
        return await verifyInFresh(r, t, withReview, commit, gateBranch)
      } catch (error) {
        if (!(error instanceof EnvironmentFailure) || error.kind !== 'fresh') throw error
        environmentFailure(r, t, error)
        r.log(`${t.issue.id}: repeating the check in a new fresh sandbox`)
      }
    }
  } finally {
    tryGit(r.repo, ['branch', '-D', gateBranch])
  }
}

/** One run of the fresh check. A failed operation closes the sandbox quietly and throws; a failed close throws too. */
async function verifyInFresh(r: Runner, t: TaskRun, withReview: boolean, commit: string, gateBranch: string): Promise<Step> {
  const sandbox = await r.sandboxes.fresh(gateBranch)
  let step: Step
  try {
    step = await checkInFresh(r, t, withReview, commit, gateBranch, sandbox)
  } catch (error) {
    await closeQuietly(sandbox, r.log)
    throw error
  }
  await sandbox.close()
  return step
}

async function checkInFresh(r: Runner, t: TaskRun, withReview: boolean, commit: string, gateBranch: string, sandbox: FreshSandbox): Promise<Step> {
  r.log(`${t.issue.id}: running the gate in a fresh sandbox on ${BASE_BRANCH} at ${t.base.slice(0, 7)}`)
  const gate = await sandbox.exec(GATE)
  if (gate.exitCode !== 0) {
    return { ok: false, report: `${GATE} failed in a fresh sandbox, which sees only committed work:\n${tail(`${gate.stdout}${gate.stderr}`)}` }
  }
  if (withReview) {
    const database = await sandbox.exec(REVIEW_DATABASE)
    if (database.exitCode !== 0) r.log(`${t.issue.id}: the reviewer's database did not start:\n${tail(`${database.stdout}${database.stderr}`)}`)
    r.log(`${t.issue.id}: running the spec review`)
    await sandbox.review(reviewPrompt(t.issue, t.result!, t.ctx, t.base, database.exitCode === 0, t.continuation !== null))
    if (git(r.repo, ['rev-parse', `refs/heads/${gateBranch}`]) !== commit) {
      return { ok: false, report: 'The reviewer committed to the branch under review.', final: true }
    }
    const review = readJson<Review>(join(sandbox.worktreePath, REVIEW_FILE))
    if (!review) return { ok: false, report: `The reviewer did not write ${REVIEW_FILE}.` }
    const marked = findingsOf(review.findings)
    const findings = marked.map(findingLine)
    t.lastReview = [`Verdict: ${JSON.stringify(review.verdict)}`, ...findings.map((f) => `- ${f}`)].join('\n')
    // An owner finding ends the attempt whatever the verdict; the fix findings travel with it (REV-R03).
    const owners = marked.filter((f) => f.kind === 'owner').length
    if (owners) {
      return {
        ok: false,
        owner: true,
        report: `The spec review has ${owners} owner finding${owners > 1 ? 's' : ''}, which only the owner can settle, so the attempt ends without a feedback turn:\n- ${findings.join('\n- ')}`,
      }
    }
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
}

/** Checks after an agent turn: the warm checks, then the fresh gate and the review. */
async function fullChecks(r: Runner, t: TaskRun): Promise<Step> {
  const warm = await warmCheck(r, t)
  return warm.ok ? verify(r, t, true) : warm
}

type Delivery =
  | { delivered: true }
  | { delivered?: false; feedback: string }
  | { delivered?: false; returned: string }
  | { delivered?: false; owner: string }

/**
 * Delivery with a changing exchange point (task uuk.3, "Delivery steps"). Runs before the
 * warm sandbox closes so a failure can still go back to the agent.
 */
async function deliver(r: Runner, t: TaskRun): Promise<Delivery> {
  for (;;) {
    // One run at a time goes from the fetch to the push (U4-R04); a wait for GitHub happens outside the queue.
    const attempt = await r.exchange.run(() => deliverInQueue(r, t))
    if (attempt !== 'unreachable') return attempt
    await r.pause()
  }
}

async function deliverInQueue(r: Runner, t: TaskRun): Promise<Delivery | 'unreachable'> {
  for (;;) {
    // 1. Fetch; while GitHub is unreachable the checked work waits with its sandbox open (U3-R07).
    const fetched = fetchMain(r.repo)
    if (!fetched.ok) {
      r.log(`${t.issue.id}: delivery waits, GitHub is unreachable: ${firstLine(fetched.error)}`)
      return 'unreachable'
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
        r.images.ensure(fetched.sha, r.log)
        t.envChanged = true
      }
      const replayed = replay(t.sandbox!.worktreePath, from, fetched.sha)
      if (!replayed.ok) return { feedback: replayed.report }
      const changed = git(r.repo, ['diff', '--name-only', from, fetched.sha]).split('\n').filter(Boolean)
      const documents = Object.values(documentLinks(t.issue)).filter(Boolean)
      const touched = documents.filter((doc) => changed.includes(doc))
      if (touched.length) r.log(`${t.issue.id}: the change of ${BASE_BRANCH} includes task documents (${touched.join(', ')}); the review runs again`)
      const checked = await verify(r, t, touched.length > 0)
      if (!checked.ok) return checked.final ? { returned: checked.report } : checked.owner ? { owner: checked.report } : { feedback: checked.report }
      continue
    }
    // 5. Push the checked commit, never forced.
    const pushed = pushMain(r.repo, t.commit!)
    if (pushed.ok) return { delivered: true }
    // The cause comes from fetching again, not from the text of git's message.
    const again = fetchMain(r.repo)
    if (!again.ok) return 'unreachable'
    if (again.sha !== t.gateBase) continue
    return { returned: `Delivery failed: ${tail(pushed.out, 10)}` }
  }
}

/** The reason of a return after an error that is not an environment failure, such as one of the task database. */
function errorReason(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return `The runner stopped the attempt on an error: ${message}`
}

type Outcome = { ok: true; commit: string; result: AgentResult } | { ok: false; report: string; data: ReturnData }

/**
 * Before a return because of an owner finding or because the feedback turns are used up, the
 * runner resumes the agent's session once and asks for a state note (CON-R09, D3). The request is not a feedback turn;
 * a failed turn, a missing or a malformed note all leave the return without a note.
 */
async function askForStateNote(r: Runner, t: TaskRun, reason: string, owner = false): Promise<StateNote | null> {
  r.log(`${t.issue.id}: asking the agent for a state note before the return (not a feedback turn; feedback turns used: ${t.turns} of ${MAX_FEEDBACK_TURNS})`)
  try {
    // Only a note written in answer to this request counts, not one left in an earlier result.
    await t.sandbox!.exec(`rm -f ${RESULT_FILE}`)
    if (!(await t.sandbox!.resume(notePrompt(reason, owner)))) {
      r.log(`${t.issue.id}: no agent session to ask for a state note; returning without one`)
      return null
    }
  } catch (error) {
    r.log(`${t.issue.id}: the request for a state note failed; returning without one: ${firstLine(error instanceof Error ? error.message : String(error))}`)
    return null
  }
  const written = readJson<AgentResult>(join(t.sandbox!.worktreePath, RESULT_FILE))?.state_note
  const note = stateNote(written)
  if (!note) r.log(`${t.issue.id}: ${written === undefined ? 'the agent wrote no state note' : 'the state note is not a JSON object'}; returning without one`)
  return note
}

/**
 * One attempt from the first agent turn to delivery. Every failure that a correction can fix
 * goes back into the same session as a feedback turn, MAX_FEEDBACK_TURNS at most. An
 * environment failure in the agent's sandbox starts a new agent in a new sandbox on the same
 * work directory instead (ENV-R01), MAX_ENVIRONMENT_RETRIES times per attempt together with
 * those of the fresh sandbox. Returns the delivered commit or the reason to return.
 */
async function runTask(r: Runner, issue: Issue, branch: string, baseSha: string, ctx: EpicContext, continuation: Continuation | null): Promise<Outcome> {
  // Feedback turns, delivery retries and environment retries count from zero in every attempt (CON-R08).
  const t: TaskRun = {
    issue, branch, ctx, sandbox: null, base: baseSha, gateBase: null, commit: null, result: null, review: null,
    turns: 0, retries: 0, warmInputs: imageInputs(r.repo, baseSha), envChanged: false,
    continuation, lastReview: continuation?.lastReview ?? null, environmentFailures: [],
  }
  const returned = (report: string, note: StateNote | null = null): Outcome => ({
    ok: false, report, data: { ...(note ? { state_note: note } : {}), ...(t.lastReview ? { last_review: t.lastReview } : {}) },
  })
  /** An owner finding returns the task at once, after the one request for a state note (REV-R03). */
  const ownerReturn = async (report: string): Promise<Outcome> => {
    r.log(`${issue.id}: the review has an owner finding; returning the task without a feedback turn`)
    return returned(report, await askForStateNote(r, t, report, true))
  }
  /** Sends a report back to the agent; returns the outcome of a return instead, if the task must go back. */
  const feedback = async (report: string): Promise<Outcome | null> => {
    if (t.envChanged) return returned(`The environment changed during the task (the dependency list or the image recipe on ${BASE_BRANCH}), and the agent's sandbox is out of date, so it cannot correct the work:\n${report}`)
    if (t.turns >= MAX_FEEDBACK_TURNS) {
      const reason = `${report}\n\nAll ${MAX_FEEDBACK_TURNS} feedback turns of the attempt are used (${t.turns} of ${MAX_FEEDBACK_TURNS}).`
      return returned(reason, await askForStateNote(r, t, reason))
    }
    t.turns++
    r.log(`${issue.id}: feedback turn ${t.turns}: ${firstLine(report)}`)
    try {
      await t.sandbox!.exec(`rm -f ${RESULT_FILE}`)
      if (!(await t.sandbox!.resume(feedbackPrompt(report)))) return returned(`${report}\n(No agent session to resume.)`)
    } catch (error) {
      // A turn the environment interrupted is given back: retries are counted apart from
      // feedback turns (ENV-R04), and the next check reports the same problem to the new agent.
      // ASSUMPTION(oferty-pracy-5yd.3/ASM-2)
      if (error instanceof EnvironmentFailure) t.turns--
      throw error
    }
    return null
  }
  let prompt = implementPrompt(issue, ctx, baseSha, continuation)
  try {
    for (;;) {
      try {
        if (!t.sandbox) {
          t.sandbox = await r.sandboxes.warm(branch)
          r.log(`${issue.id}: implementing in ${t.sandbox.worktreePath}${continuation ? `, continuing the kept work of ${continuation.keptBranch}` : ''}`)
          await t.sandbox.exec(`rm -f ${RESULT_FILE} ${REVIEW_FILE}`)
          await t.sandbox.start(prompt)
        }
        for (;;) {
          const checked = await fullChecks(r, t)
          if (!checked.ok) {
            // A blocked agent wrote its state note with the question (CON-R10).
            if (checked.final) return returned(checked.report, t.result?.status === 'blocked' ? stateNote(t.result.state_note) : null)
            if (checked.owner) return await ownerReturn(checked.report)
            const stop = await feedback(checked.report)
            if (stop) return stop
            continue
          }
          const delivery = await deliver(r, t)
          if (delivery.delivered) return { ok: true, commit: t.commit!, result: t.result! }
          if ('returned' in delivery) return returned(delivery.returned)
          if ('owner' in delivery) return await ownerReturn(delivery.owner)
          const stop = await feedback(delivery.feedback)
          if (stop) return stop
        }
      } catch (error) {
        // An environment failure in the agent's sandbox (ENV-R01, D4): close it, ignoring
        // errors, and start a new agent in a new sandbox on the same branch. The work
        // directory lives outside the container, so committed and uncommitted work stays.
        if (!(error instanceof EnvironmentFailure) || error.kind !== 'warm') throw error
        environmentFailure(r, t, error)
        await closeQuietly(t.sandbox, r.log)
        t.sandbox = null
        // The new sandbox runs on the image built for the main the work now sits on.
        t.warmInputs = imageInputs(r.repo, t.base)
        t.envChanged = false
        prompt = [implementPrompt(issue, ctx, t.base, continuation), retryBrief(error, t.lastReview, continuation?.lastReview ?? null)].join('\n\n')
        r.log(`${issue.id}: starting a new agent in a new sandbox on the same work directory`)
      }
    }
  } catch (error) {
    // The return still carries the last review report this attempt knows (CON-R04).
    if (error instanceof EnvironmentExhausted) return returned(error.message)
    return returned(errorReason(error))
  } finally {
    // The attempt is over, delivered or about to be returned; a failed close changes neither.
    // ASSUMPTION(oferty-pracy-5yd.3/ASM-1)
    await closeQuietly(t.sandbox, r.log)
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
    const waiting = dependants(d, issue.id, ctx.children, sharedCriteria(ctx.epic))
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

type Start = { from: string; continuation: Continuation | null } | { wait: string }

/**
 * Where an attempt starts (CON-R02–R06, D2): the kept work the task records, fetched from
 * GitHub, or the fetched main when there is none, when the owner ordered a fresh start or
 * when the branch is gone. GitHub unreachable makes the task wait like an unreachable main.
 */
function startingPoint(r: Runner, issue: Issue, baseSha: string): Start {
  const kept = keptWork(issue)
  if (issue.labels?.includes(START_FRESH)) {
    r.log(`${issue.id}: the task carries ${START_FRESH}; starting from ${BASE_BRANCH}${kept ? `, the kept work of ${kept.branch} ignored` : ''}`)
    r.db.update(issue.id, { remove: [START_FRESH], unsetMetadata: [KEPT_BRANCH, KEPT_BASE] })
    return { from: baseSha, continuation: null }
  }
  if (!kept) return { from: baseSha, continuation: null }
  const fetched = fetchKeptWork(r.repo, kept.branch)
  if (!fetched.ok) {
    if (!fetched.missing) return { wait: `cannot fetch the kept work ${kept.branch} from GitHub: ${firstLine(fetched.out)}` }
    r.log(`${issue.id}: the kept work ${kept.branch} recorded in the task is no longer on GitHub; starting from ${BASE_BRANCH} at ${baseSha.slice(0, 7)}`)
    return { from: baseSha, continuation: null }
  }
  const keptBase = commitExists(r.repo, kept.base) ? kept.base : null
  if (!keptBase) r.log(`${issue.id}: the runner's copy does not have ${kept.base}, the commit the kept work was built on`)
  const { latest, after } = sinceReturn(r.db.listComments(issue.id))
  const parsed = latest ? parseReturnData(latest.text) : null
  if (parsed && 'malformed' in parsed) r.log(`${issue.id}: the data of the return's comment is malformed, going on without it: ${parsed.malformed}`)
  const data = parsed && 'data' in parsed ? parsed.data : {}
  const documents = Object.values(documentLinks(issue)).filter(Boolean)
  const documentsDiff = keptBase ? git(r.repo, ['diff', keptBase, baseSha, '--', ...documents]) : null
  r.log(`${issue.id}: continuing the kept work ${kept.branch} at ${fetched.sha.slice(0, 7)}, built on ${kept.base.slice(0, 7)}`)
  return {
    from: fetched.sha,
    continuation: {
      keptBranch: kept.branch, keptBase, note: data.state_note ?? null, lastReview: data.last_review ?? null,
      comments: after, documentsDiff,
    },
  }
}

/**
 * Runs one claimed task from the fetched exchange point state `baseSha` to delivery or
 * return. The run gets its own context with its own log; an error in it returns this task
 * and leaves the other runs alone (U4-R01, U4-R05).
 */
export async function processTask(shared: Runner, issue: Issue, baseSha: string): Promise<void> {
  // Every sandbox operation of the run reports its errors as environment failures (D4).
  const r: Runner = { ...shared, log: shared.taskLog(issue.id), sandboxes: guardedSandboxes(shared.sandboxes) }
  shared.log(`${issue.id}: started on ${BASE_BRANCH} at ${baseSha.slice(0, 7)}`)
  let branch: string | null = null
  let continuation: Continuation | null = null
  try {
    const start = startingPoint(r, issue, baseSha)
    if ('wait' in start) {
      // Nothing was started; the task stays ready and the kept work recorded.
      r.log(`${issue.id}: waits, released for the next cycle: ${start.wait}`)
      shared.log(`${issue.id}: waits: ${start.wait}`)
      quietly(r, `bd unclaim ${issue.id}`, () => r.db.unclaim(issue.id))
      return
    }
    const name = taskBranch(r, issue)
    git(r.repo, ['branch', '--force', name, start.from])
    branch = name
    const ctx = epicContext(r, issue)
    continuation = start.continuation
    const outcome = await runTask(r, issue, branch, baseSha, ctx, continuation)
    if (!outcome.ok) {
      returnToPreparation(r, issue, outcome.report || 'Unknown failure.', branch, outcome.data, baseSha)
      shared.log(`${issue.id}: returned to preparation`)
      return
    }
    const { commit, result } = outcome
    const sha = commit.slice(0, 7)
    recordOutcome(r, issue, result, ctx)
    const deferred = result.deviations?.length ? ` with ${result.deviations.length} deviation(s) deferred to follow-ups` : ''
    quietly(r, `bd close ${issue.id}`, () => r.db.close(issue.id, `Delivered ${branch} to ${BASE_BRANCH} on GitHub at ${sha} by the agent runner${deferred}.`))
    deleteReturnBranch(r.repo, branch)
    const kept = keptWork(issue)
    if (kept) {
      // The kept work is delivered; a renamed task left it under its earlier branch name.
      if (kept.branch !== returnBranchName(branch)) deleteRemoteBranch(r.repo, kept.branch)
      quietly(r, `bd update ${issue.id}`, () => r.db.update(issue.id, { unsetMetadata: [KEPT_BRANCH, KEPT_BASE] }))
    }
    tryGit(r.repo, ['branch', '-D', branch])
    r.log(`${issue.id}: delivered to ${BASE_BRANCH} on GitHub at ${sha} and closed`)
    shared.log(`${issue.id}: delivered at ${sha}`)
    r.notifier.notify(`${issue.id} is on GitHub`, `${issue.title} — delivered to ${BASE_BRANCH} at ${sha}`)
  } catch (error) {
    // A sandbox, agent or task database failure must not stop the runner or the other runs,
    // nor leave the task claimed: hand it back like any other failed attempt.
    // Before the agent's session exists the last review report is the continued attempt's.
    const lastReview = continuation?.lastReview
    returnToPreparation(r, issue, errorReason(error), branch, lastReview ? { last_review: lastReview } : {}, baseSha)
    shared.log(`${issue.id}: returned to preparation after an error`)
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
    const kept = issue.labels?.includes(START_FRESH) ? null : keptWork(issue)
    const fetchedKept = kept ? fetchKeptWork(r.repo, kept.branch) : null
    if (fetchedKept && !fetchedKept.ok && !fetchedKept.missing) {
      // GitHub does not give the kept work now: the task waits without being claimed (ASM-2).
      const text = `cannot fetch the kept work ${kept!.branch} from GitHub: ${firstLine(fetchedKept.out)}`
      if (apply) r.log(`${issue.id}: waits: ${text}`)
      else console.log(`- ${issue.id} ${issue.title}\n  waits: ${text}`)
      continue
    }
    if (!apply) {
      console.log(`- ${issue.id} ${issue.title}\n  would implement`)
      continue
    }
    // A conditional claim: losing it means another run took the task first (U4-R03).
    if (!r.db.claim(issue.id)) {
      r.log(`${issue.id}: skipped, another run claimed it first`)
      continue
    }
    return issue
  }
  return null
}

/**
 * Selects and claims the next task: fetch the exchange point through the delivery queue,
 * report a newer program, build the image from the fetched state, reconcile epics and pick.
 */
export async function selectNext(r: Runner): Promise<{ issue: Issue; baseSha: string } | null> {
  const fetched = await r.exchange.run(() => fetchMain(r.repo))
  if (!fetched.ok) {
    r.log(`cannot fetch ${BASE_BRANCH} from GitHub; no task taken this cycle: ${tail(fetched.error, 5)}`)
    return null
  }
  checkProgramVersion(r, fetched.sha)
  r.images.ensure(fetched.sha, r.log)
  reconcileEpics(r, true)
  const issue = pickTask(r, fetched.sha, true)
  return issue ? { issue, baseSha: fetched.sha } : null
}

/** One cycle with one slot: select a task and run it to the end. Returns whether a task ran. */
export async function cycle(r: Runner): Promise<boolean> {
  const next = await selectNext(r)
  if (!next) return false
  await processTask(r, next.issue, next.baseSha)
  return true
}

export interface ServeOptions {
  /** Start at most this many tasks, then wait for them and stop; also stop when none is ready (--once is 1). */
  maxTasks?: number
  /** Stop once nothing is running and no task is ready (for tests). */
  stopWhenIdle?: boolean
}

/**
 * The runner's main loop (U4-R02): starts a task whenever a slot is free and a task is
 * ready; selection keeps working while tasks run. Pauses when nothing could be started.
 */
export async function serve(r: Runner, options: ServeOptions = {}): Promise<void> {
  const running = new Set<Promise<void>>()
  let started = 0
  for (;;) {
    let idle = true
    while (running.size < r.slots && (options.maxTasks === undefined || started < options.maxTasks)) {
      let next: Awaited<ReturnType<typeof selectNext>> = null
      try {
        next = await selectNext(r)
      } catch (error) {
        // A failure while selecting (task database, image build) must not stop the running tasks.
        r.log(`selecting a task failed; trying again after the pause: ${firstLine(error instanceof Error ? error.message : String(error))}`)
      }
      if (!next) break
      idle = false
      started++
      const run: Promise<void> = processTask(r, next.issue, next.baseSha)
        .catch((error) => r.log(`${next.issue.id}: the run failed outside its own handling: ${firstLine(String(error))}`))
        .finally(() => running.delete(run))
      running.add(run)
    }
    const exhausted = options.maxTasks !== undefined && (started >= options.maxTasks || (idle && running.size === 0))
    if (exhausted || (options.stopWhenIdle && idle && running.size === 0)) {
      await Promise.all(running)
      return
    }
    if (running.size === r.slots || !idle) {
      // All slots busy, or a task just started: look again when a run ends or after a pause.
      if (running.size === r.slots) await Promise.race(running)
      continue
    }
    r.log(`no task to start (${running.size} of ${r.slots} slots busy); next check after the pause`)
    await Promise.race([r.pause(), ...running])
  }
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
