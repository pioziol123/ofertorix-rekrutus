/**
 * Pure rules for spec conflicts: deviation checks, dependants and epic label reconciliation.
 * Contract: docs/agents/implementation-workflow.md (section "Spec conflicts during implementation").
 */

export const MAX_DEVIATIONS_PER_TASK = 2
export const MAX_OPEN_FOLLOWUPS_PER_EPIC = 3
/** Other open tasks of the epic a deviation may reach; they become blocked by its follow-up. */
export const MAX_DEPENDANTS = 2

export interface Issue {
  id: string
  title: string
  description?: string
  design?: string
  notes?: string
  acceptance_criteria?: string
  issue_type?: string
  labels?: string[]
  metadata?: Record<string, unknown>
  parent?: string | null
  status?: string
}

export interface Assumption {
  id: string
  requirements: string[]
  gap: string
  decision: string
  rule: string
  if_reversed: string
}

export interface Deviation {
  id: string
  kind: 'contradiction' | 'underspecified' | 'blocked-by-task'
  requirements: string[]
  deferred_acs: string[]
  interim: string
  qualification: string
  title: string
  description: string
}

export interface NewScope {
  title: string
  description: string
}

export interface AgentResult {
  status: 'done' | 'blocked'
  summary: string
  evidence: { ac: string; check: string; result: string }[]
  assumptions?: Assumption[]
  deviations?: Deviation[]
  new_scope?: NewScope[]
  /** Older name of new_scope. */
  followups?: NewScope[]
  question: string | null
}

function strings(value: unknown): boolean {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

/** Shape problems in a done result that would break the runner's checks or bookkeeping. */
export function resultShapeProblems(result: AgentResult): string[] {
  const problems: string[] = []
  if (typeof result.summary !== 'string') problems.push('summary must be a string')
  if (!Array.isArray(result.evidence) || !result.evidence.every((e) => e && typeof e.ac === 'string')) {
    problems.push('evidence must be a list of {ac, check, result}')
  }
  for (const [key, list] of [['assumptions', result.assumptions], ['deviations', result.deviations], ['new_scope', result.new_scope]] as const) {
    if (list !== undefined && !Array.isArray(list)) problems.push(`${key} must be a list`)
  }
  for (const a of Array.isArray(result.assumptions) ? result.assumptions : []) {
    if (typeof a?.id !== 'string' || !strings(a.requirements)) problems.push('each assumption needs an id and a requirements list')
  }
  for (const d of Array.isArray(result.deviations) ? result.deviations : []) {
    if (typeof d?.id !== 'string' || !strings(d.requirements) || !strings(d.deferred_acs)) {
      problems.push('each deviation needs an id, a requirements list and a deferred_acs list')
    }
  }
  return problems
}

export function marker(taskId: string, deviationId: string): string {
  return `FOLLOW-UP(${taskId}/${deviationId})`
}

export function isFollowUp(issue: Issue): boolean {
  return issue.metadata?.type === 'follow-up'
}

export function isOpen(issue: Issue): boolean {
  return issue.status !== 'closed' && issue.status !== 'deferred'
}

/** Criterion IDs from acceptance_criteria lines of the form `AC-ID: observable result`. */
export function criterionIds(acceptance: string | undefined): string[] {
  const ids: string[] = []
  for (const line of (acceptance ?? '').split('\n')) {
    const match = /^\s*(?:[-*]\s+)?([A-Za-z0-9][A-Za-z0-9._-]*):/.exec(line)
    if (match) ids.push(match[1]!)
  }
  return ids
}

/** Longest range expanded; anything wider is left as written. */
const MAX_RANGE = 100
const RANGE = /((?:[A-Za-z0-9]+-)+[A-Za-z]*)(\d+)\s*(?:[–—-]|\.\.)\s*\1(\d+)(?![A-Za-z0-9])/g

/**
 * Every ID inside written ranges such as `F2-01–F2-05` or `A1-AC02..A1-AC04`,
 * keeping the zero padding. Both ends must share the prefix.
 */
export function rangeIds(text: string): string[] {
  const ids: string[] = []
  for (const [, prefix, from, to] of text.matchAll(RANGE)) {
    const start = Number(from)
    const end = Number(to)
    if (end <= start || end - start > MAX_RANGE) continue
    for (let n = start; n <= end; n++) ids.push(`${prefix}${String(n).padStart(from!.length, '0')}`)
  }
  return ids
}

export function loadBearing(epic: Issue | null): Set<string> {
  const raw = epic?.metadata?.load_bearing
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(',') : []
  const ids = list.map((id) => id.trim()).filter(Boolean)
  return new Set([...ids, ...rangeIds(ids.join(','))])
}

/** Assumptions whose requirements include load-bearing IDs, with the IDs they touch. */
export function bearingAssumptions(assumptions: Assumption[], epic: Issue | null): { id: string; touched: string[] }[] {
  const bearing = loadBearing(epic)
  return assumptions
    .map((a) => ({ id: a.id, touched: (a.requirements ?? []).filter((id) => bearing.has(id)) }))
    .filter((a) => a.touched.length)
}

function mentions(issue: Issue, id: string): boolean {
  const fields = [issue.title, issue.description, issue.design, issue.notes, issue.acceptance_criteria].join('\n')
  if (rangeIds(fields).includes(id)) return true
  return new RegExp(`(^|[^A-Za-z0-9-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9-]|$)`).test(fields)
}

/** Open tasks other than the task itself and follow-ups that mention any of the deviation's IDs. */
export function dependants(deviation: Deviation, taskId: string, siblings: Issue[]): string[] {
  const ids = [...deviation.requirements, ...deviation.deferred_acs]
  return siblings
    .filter((s) => s.id !== taskId && s.issue_type !== 'epic' && isOpen(s) && !isFollowUp(s))
    .filter((s) => ids.some((id) => mentions(s, id)))
    .map((s) => s.id)
}

export interface DeviationContext {
  taskId: string
  acceptance: string | undefined
  epic: Issue | null
  /** Children of the epic, all statuses; empty for a task outside any epic. */
  siblings: Issue[]
  /** Whether the branch contains the given marker text. */
  hasMarker: (text: string) => boolean
}

/** Deterministic checks of a done result's deviations and evidence. Returns the problems found. */
export function deviationProblems(result: AgentResult, ctx: DeviationContext): string[] {
  const problems: string[] = []
  const deviations = result.deviations ?? []
  const criteria = criterionIds(ctx.acceptance)
  const bearing = loadBearing(ctx.epic)

  if (deviations.length > MAX_DEVIATIONS_PER_TASK) {
    problems.push(`${deviations.length} deviations; a task may defer at most ${MAX_DEVIATIONS_PER_TASK}. Finish as blocked.`)
  }
  const openFollowUps = ctx.siblings.filter((s) => isFollowUp(s) && isOpen(s)).length
  if (deviations.length && openFollowUps + deviations.length > MAX_OPEN_FOLLOWUPS_PER_EPIC) {
    problems.push(
      `The epic already has ${openFollowUps} open follow-ups; ${deviations.length} more exceed the limit of ${MAX_OPEN_FOLLOWUPS_PER_EPIC}. Finish as blocked.`,
    )
  }

  const deferred = new Set<string>()
  const seen = new Set<string>()
  for (const d of deviations) {
    const name = d.id || '(no id)'
    if (!d.id || seen.has(d.id)) problems.push(`Deviation ${name}: needs a unique id.`)
    seen.add(d.id)
    if (!d.requirements?.length || d.requirements.length > 2) {
      problems.push(`Deviation ${name}: names ${d.requirements?.length ?? 0} requirements; it needs one or two.`)
    }
    if (!d.title?.trim() || !d.description?.trim()) problems.push(`Deviation ${name}: the follow-up title and description are required.`)
    for (const ac of d.deferred_acs ?? []) {
      if (criteria.length && !criteria.includes(ac)) problems.push(`Deviation ${name}: ${ac} is not a criterion of this task.`)
      deferred.add(ac)
    }
    const touched = [...(d.requirements ?? []), ...(d.deferred_acs ?? [])].filter((id) => bearing.has(id))
    if (touched.length) problems.push(`Deviation ${name}: ${touched.join(', ')} is load-bearing for the epic; finish as blocked.`)
    if (!ctx.hasMarker(marker(ctx.taskId, d.id))) problems.push(`Deviation ${name}: marker ${marker(ctx.taskId, d.id)} is not in the committed code.`)
    const reach = dependants(d, ctx.taskId, ctx.siblings)
    if (reach.length > MAX_DEPENDANTS) {
      problems.push(`Deviation ${name}: ${reach.length} other open tasks mention its IDs (${reach.join(', ')}); at most ${MAX_DEPENDANTS} may wait for it. Finish as blocked.`)
    }
  }

  if (criteria.length) {
    if (deferred.size && criteria.every((ac) => deferred.has(ac))) problems.push('Every acceptance criterion is deferred; at least one has to be met.')
    const evidenced = new Set(result.evidence.map((e) => e.ac))
    const missing = criteria.filter((ac) => !evidenced.has(ac) && !deferred.has(ac))
    if (missing.length) problems.push(`No evidence and no deviation for: ${missing.join(', ')}.`)
  }
  return problems
}

export interface LabelPlan {
  add: string[]
  remove: string[]
  /** true: set follow_ups=true; false: remove the key; undefined: leave it. */
  followUps?: boolean
}

function flag(value: unknown): boolean {
  return value === true || value === 'true'
}

/**
 * Label changes for an epic given its children, or null when nothing changes.
 * follow_ups=true marks the phase in which only follow-ups remain open. Entering it with a
 * follow-up still undecided takes the epic back (needs-info instead of ready-for-agent).
 * The runner never adds ready-for-agent: task-prep hands the epic off again.
 */
export function epicLabelPlan(epic: Issue, children: Issue[]): LabelPlan | null {
  const labels = new Set(epic.labels ?? [])
  const marked = flag(epic.metadata?.['follow_ups'])
  if (!labels.has('ready-for-agent') && !marked) return null

  const tasks = children.filter((c) => c.issue_type !== 'epic')
  const openFollowUps = tasks.filter((c) => isFollowUp(c) && isOpen(c))
  const othersOpen = tasks.some((c) => !isFollowUp(c) && isOpen(c))

  // The runner only takes an epic back. Handing it off again is a decision made in preparation.
  const plan: LabelPlan = { add: [], remove: [] }
  const phase = openFollowUps.length > 0 && !othersOpen
  if (phase) {
    const allReady = openFollowUps.every((f) => f.labels?.includes('ready-for-agent') && !f.labels.includes('needs-info'))
    if (!allReady && labels.has('ready-for-agent')) {
      plan.remove.push('ready-for-agent')
      if (!labels.has('needs-info')) plan.add.push('needs-info')
    }
  }
  if (phase !== marked) plan.followUps = phase
  return plan.add.length || plan.remove.length || plan.followUps !== undefined ? plan : null
}
