/**
 * What a returned task carries to its next attempt: the kept work recorded in the task, the
 * data block of the return's comment, and the owner's answer.
 * Contract: docs/agents/implementation-workflow.md (sections "One task" and "Return of a task");
 * solution design of oferty-pracy-5yd, decisions D2 and D3.
 */
import type { Issue } from './followups.ts'
import type { TaskComment } from './ports.ts'

/** Task metadata: the return branch holding the kept work, and the commit of main the returned attempt worked on. */
export const KEPT_BRANCH = 'kept_branch'
export const KEPT_BASE = 'kept_base'
/** The label with which the owner orders an attempt from main, ignoring the kept work. */
export const START_FRESH = 'start-fresh'
/** Every return comment the runner writes starts with this. */
export const RETURN_COMMENT = 'Runner returned the task.'

/** The data a return's comment carries after its human-readable reason. */
export interface ReturnData {
  /** The returned attempt's state note; its shape belongs to the agents' skills. */
  state_note?: StateNote
  /** The last review report of the returned attempt. */
  last_review?: string
}

export type StateNote = Record<string, unknown>

/** The kept work a task records, or null when it records none. */
export function keptWork(issue: Issue): { branch: string; base: string } | null {
  const branch = issue.metadata?.[KEPT_BRANCH]
  const base = issue.metadata?.[KEPT_BASE]
  return typeof branch === 'string' && branch && typeof base === 'string' && base ? { branch, base } : null
}

/** A state note as the runner keeps it: a JSON object. Anything else is no note. */
export function stateNote(value: unknown): StateNote | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as StateNote) : null
}

const OPEN = '```json\n'
const CLOSE = '\n```'

/** The fenced JSON block a return's comment ends with; empty when there is nothing to carry. */
export function returnDataBlock(data: ReturnData): string {
  const present = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null))
  if (!Object.keys(present).length) return ''
  return `\n\n${OPEN}${JSON.stringify(present, null, 2)}${CLOSE}`
}

/**
 * Reads the data block at the end of a return's comment. JSON keeps line breaks inside
 * strings escaped, so the block's closing fence cannot appear inside it.
 */
export function parseReturnData(text: string): { data: ReturnData } | { malformed: string } | null {
  const start = text.lastIndexOf(OPEN)
  if (start < 0) return null
  const body = text.slice(start + OPEN.length)
  const end = body.lastIndexOf(CLOSE)
  if (end < 0) return { malformed: 'the data block is not closed' }
  let parsed: unknown
  try {
    parsed = JSON.parse(body.slice(0, end))
  } catch (error) {
    return { malformed: (error as Error).message }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { malformed: 'the data block is not an object' }
  const raw = parsed as Record<string, unknown>
  const data: ReturnData = {}
  if (raw.state_note !== undefined) {
    const note = stateNote(raw.state_note)
    if (!note) return { malformed: 'state_note is not an object' }
    data.state_note = note
  }
  if (typeof raw.last_review === 'string') data.last_review = raw.last_review
  return { data }
}

/** The latest return comment and the comments added after it, which belong to the owner's answer. */
export function sinceReturn(comments: TaskComment[]): { latest: TaskComment | null; after: TaskComment[] } {
  let index = -1
  comments.forEach((c, i) => {
    if (c.text.startsWith(RETURN_COMMENT)) index = i
  })
  return index < 0 ? { latest: null, after: [] } : { latest: comments[index]!, after: comments.slice(index + 1) }
}

/** Everything a continuation's agent receives beside what every attempt receives. */
export interface Continuation {
  /** The return branch on GitHub. */
  keptBranch: string
  /** The commit of main the returned attempt worked on; null when the runner's copy does not have it. */
  keptBase: string | null
  note: StateNote | null
  lastReview: string | null
  /** Comments added after the latest return. */
  comments: TaskComment[]
  /** git diff of the task's documents from the kept base to the current main; null when unknown. */
  documentsDiff: string | null
}

/** The part of the implementing prompt that hands the kept work and the owner's answer over. */
export function continuationBrief(c: Continuation, baseSha: string, mainName: string): string {
  const fence = (lang: string, text: string) => `\`\`\`${lang}\n${text}\n\`\`\``
  const base = c.keptBase ?? 'unknown'
  return [
    `This task continues an earlier attempt that was returned to preparation. The task branch holds that attempt's kept work (${c.keptBranch} on GitHub); that attempt worked on commit ${base} of ${mainName}, and the current ${mainName} is ${baseSha}. After your turn the runner replays the branch on ${baseSha}, and a conflict comes back to you as a report naming the files and commits; you may rebase it yourself first (git rebase ${baseSha}). The owner's decision overrides the state note.`,
    c.note
      ? `State note of the returned attempt:\n${fence('json', JSON.stringify(c.note, null, 2))}`
      : 'The returned attempt left no state note.',
    c.comments.length
      ? `The owner's answer, comments added to the task after the return, oldest first:\n${c.comments.map((cm) => `---\n${cm.created_at ? `(${cm.created_at}) ` : ''}${cm.text}`).join('\n')}\n---`
      : 'The owner added no comment to the task after the return.',
    c.documentsDiff === null
      ? `The change of the task's documents since ${base} is unknown: the runner's copy does not have that commit. Read the documents in full.`
      : c.documentsDiff
        ? `The owner's answer, the change of the task's documents since ${base}:\n${fence('diff', c.documentsDiff)}`
        : `The task's documents did not change since ${base}.`,
    c.lastReview ? `The last review report of the returned attempt:\n${c.lastReview}` : '',
  ].filter(Boolean).join('\n\n')
}
