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
  commitsBetween,
  deleteReturnBranch,
  fetchMain,
  git,
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

export interface Outcome {
  ok: boolean
  report: string
  result: AgentResult | null
  /** A failure that a second attempt cannot fix. */
  final?: boolean
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

/** The runner's own checks in the implementing agent's warm sandbox, after each agent turn. */
async function warmCheck(r: Runner, sandbox: WarmSandbox, issue: Issue, branch: string, baseSha: string, ctx: EpicContext): Promise<Outcome> {
  const worktree = sandbox.worktreePath
  const result = readJson<AgentResult>(join(worktree, RESULT_FILE))
  if (!result) return { ok: false, report: `You did not write ${RESULT_FILE}.`, result }
  if (result.status === 'blocked') return { ok: false, report: `Blocked: ${result.question}`, result, final: true }

  const dirty = git(worktree, ['status', '--porcelain'])
  if (dirty) return { ok: false, report: `Uncommitted changes are left in the worktree:\n${dirty}`, result }
  if (git(r.repo, ['rev-list', '--count', `${baseSha}..refs/heads/${branch}`]) === '0') {
    return { ok: false, report: 'There are no commits on the task branch.', result }
  }
  // The base is the commit the runner fetched, not the main branch the sandbox can write to.
  const rebase = tryGit(worktree, ['rebase', baseSha])
  if (!rebase.ok) {
    tryGit(worktree, ['rebase', '--abort'])
    return { ok: false, report: `Rebase on ${BASE_BRANCH} at ${baseSha.slice(0, 7)} conflicted:\n${tail(rebase.out)}`, result, final: true }
  }
  const shape = resultShapeProblems(result)
  if (shape.length) return { ok: false, report: `${RESULT_FILE} does not match the shape in the implement-task skill:\n- ${shape.join('\n- ')}`, result }
  // Markers count only when the task's own diff adds them.
  const diff = tryGit(worktree, ['diff', `${baseSha}...HEAD`]).out
  const problems = deviationProblems(result, {
    taskId: issue.id,
    acceptance: issue.acceptance_criteria,
    epic: ctx.epic,
    siblings: ctx.children,
    hasMarker: (text) => diff.split('\n').some((line) => line.startsWith('+') && line.includes(text)),
  })
  if (problems.length) {
    const report = `The result's evidence and deviations fail the runner's checks (process contract, "What the runner checks"):\n- ${problems.join('\n- ')}`
    return { ok: false, report, result }
  }

  r.log(`${issue.id}: running the gate in the warm sandbox`)
  const gate = await sandbox.exec(GATE)
  if (gate.exitCode !== 0) {
    return { ok: false, report: `${GATE} failed in your sandbox:\n${tail(`${gate.stdout}${gate.stderr}`)}`, result }
  }
  return { ok: true, report: '', result }
}

/**
 * Gate and review in a fresh sandbox on a copy of the task branch, so only committed work
 * counts. On success `commit` is the checked commit, which is what gets delivered.
 */
async function verify(r: Runner, issue: Issue, branch: string, baseSha: string, result: AgentResult, ctx: EpicContext): Promise<Outcome & { commit?: string }> {
  const commit = git(r.repo, ['rev-parse', `refs/heads/${branch}`])
  const gateBranch = `${branch}-gate`
  git(r.repo, ['branch', '--force', gateBranch, commit])
  try {
    const sandbox = await r.sandboxes.fresh(gateBranch)
    try {
      r.log(`${issue.id}: running the gate in a fresh sandbox`)
      const gate = await sandbox.exec(GATE)
      if (gate.exitCode !== 0) {
        const report = `${GATE} failed in a fresh sandbox, which sees only committed work:\n${tail(`${gate.stdout}${gate.stderr}`)}`
        return { ok: false, report, result: null }
      }
      r.log(`${issue.id}: running the spec review`)
      await sandbox.review(reviewPrompt(issue, result, ctx, baseSha))
      if (git(r.repo, ['rev-parse', `refs/heads/${gateBranch}`]) !== commit) {
        return { ok: false, report: 'The reviewer committed to the branch under review.', result: null, final: true }
      }
      const review = readJson<Review>(join(sandbox.worktreePath, REVIEW_FILE))
      if (!review) return { ok: false, report: `The reviewer did not write ${REVIEW_FILE}.`, result: null }
      const findings = Array.isArray(review.findings) ? review.findings.map(String) : []
      // Exactly one verdict passes: pass-with-deferral when the result has deviations, pass otherwise.
      const expected = result.deviations?.length ? 'pass-with-deferral' : 'pass'
      if (review.verdict !== expected) {
        const report = review.verdict === 'fail'
          ? `The spec review failed:\n- ${findings.join('\n- ')}`
          : `The spec review did not pass (verdict ${JSON.stringify(review.verdict)}, expected ${expected}):\n- ${findings.join('\n- ')}`
        return { ok: false, report, result: null }
      }
      return { ok: true, report: '', result: null, commit }
    } finally {
      await sandbox.close()
    }
  } finally {
    tryGit(r.repo, ['branch', '-D', gateBranch])
  }
}

/**
 * One implementing session in one warm sandbox. After each agent turn the runner
 * checks the work itself; failures go back into the same session with resume,
 * up to MAX_FEEDBACK_TURNS times. Work that passes is verified in a fresh sandbox.
 */
async function implementAndVerify(r: Runner, issue: Issue, branch: string, baseSha: string, ctx: EpicContext): Promise<{ outcome: Outcome; result: AgentResult | null; commit?: string }> {
  const sandbox = await r.sandboxes.warm(branch)
  try {
    r.log(`${issue.id}: implementing in ${sandbox.worktreePath}`)
    await sandbox.exec(`rm -f ${RESULT_FILE} ${REVIEW_FILE}`)
    await sandbox.start(implementPrompt(issue, ctx, baseSha))
    let result: AgentResult | null = null
    for (let turn = 1; ; turn++) {
      let outcome: Outcome & { commit?: string } = await warmCheck(r, sandbox, issue, branch, baseSha, ctx)
      result = outcome.result ?? result
      if (outcome.ok && result) outcome = await verify(r, issue, branch, baseSha, result, ctx)
      if (outcome.ok || outcome.final) return { outcome, result, commit: outcome.commit }
      if (turn > MAX_FEEDBACK_TURNS) return { outcome, result }
      r.log(`${issue.id}: feedback turn ${turn}: ${firstLine(outcome.report)}`)
      await sandbox.exec(`rm -f ${RESULT_FILE}`)
      if (!(await sandbox.resume(feedbackPrompt(outcome.report)))) {
        return { outcome: { ...outcome, report: `${outcome.report}\n(No agent session to resume.)` }, result }
      }
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

/**
 * Delivers the checked commit to the exchange point without forcing (U2-R10–R12).
 * Returns null on success, otherwise the reason the task goes back.
 */
function deliver(r: Runner, commit: string, baseSha: string): string | null {
  const pushed = pushMain(r.repo, commit)
  if (pushed.ok) return null
  // The cause comes from fetching again, not from the text of git's message.
  const fetched = fetchMain(r.repo)
  if (!fetched.ok) return `Delivery failed: GitHub is unreachable: ${firstLine(fetched.error)}`
  if (fetched.sha !== baseSha) {
    const commits = commitsBetween(r.repo, baseSha, fetched.sha)
    return `Delivery failed: ${BASE_BRANCH} on GitHub changed during the task (${baseSha.slice(0, 7)} → ${fetched.sha.slice(0, 7)}). New commits:\n${commits.map((c) => `- ${c}`).join('\n')}`
  }
  return `Delivery failed: ${tail(pushed.out, 10)}`
}

/** Runs one task from the fetched exchange point state `baseSha` to delivery or return. */
export async function processTask(r: Runner, issue: Issue, baseSha: string): Promise<void> {
  const branch = taskBranch(r, issue)
  r.logTo(issue.id)
  try {
    r.db.claim(issue.id)
    git(r.repo, ['branch', '--force', branch, baseSha])
    const ctx = epicContext(r, issue)

    let attempt: Awaited<ReturnType<typeof implementAndVerify>>
    try {
      attempt = await implementAndVerify(r, issue, branch, baseSha, ctx)
    } catch (error) {
      // A sandbox or agent failure (idle timeout, docker error) must not kill the runner
      // and leave the task claimed: hand it back like any other failed attempt.
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      returnToPreparation(r, issue, `The runner stopped the attempt on an error: ${message}`, branch)
      return
    }
    const { outcome, result, commit } = attempt
    if (!outcome.ok || !result || !commit) {
      returnToPreparation(r, issue, outcome.report || 'Unknown failure.', branch)
      return
    }

    const failed = deliver(r, commit, baseSha)
    if (failed) {
      returnToPreparation(r, issue, failed, branch)
      return
    }
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
