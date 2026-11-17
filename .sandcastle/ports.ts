/**
 * Substitution boundaries of the runner (solution design of oferty-pracy-uuk, T-03).
 * The logic of a run uses these narrow operations; runner.ts wires the real ones
 * (bd, Sandcastle docker sandboxes, docker build, system notifications) and the
 * tests wire stand-ins. Git operations stay real on both sides.
 */
import type { Issue } from './followups.ts'

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

/** The implementing agent's environment, kept warm across feedback turns. */
export interface WarmSandbox {
  readonly worktreePath: string
  exec(command: string): Promise<ExecResult>
  /** First agent turn. */
  start(prompt: string): Promise<void>
  /** A feedback turn in the same agent session; false when there is no session to resume. */
  resume(prompt: string): Promise<boolean>
  close(): Promise<void>
}

/** A fresh environment on a copy of the task branch, for the gate and the review. */
export interface FreshSandbox {
  readonly worktreePath: string
  exec(command: string): Promise<ExecResult>
  review(prompt: string): Promise<void>
  close(): Promise<void>
}

/** Both open an environment on an existing local branch of the runner's copy. */
export interface Sandboxes {
  warm(branch: string): Promise<WarmSandbox>
  fresh(branch: string): Promise<FreshSandbox>
}

/** Builds the agent environment's image from a commit when its inputs changed. */
export interface Images {
  ensure(commit: string): void
}

export interface Notifier {
  notify(title: string, message: string): void
}

export interface LabelChange {
  add?: string[]
  remove?: string[]
  setMetadata?: Record<string, string>
  unsetMetadata?: string[]
}

export interface NewIssue {
  title: string
  description: string
  labels: string[]
  metadata?: Record<string, string>
  discoveredFrom: string
  /** Parent epic; labels are not inherited from it. */
  parent?: string
}

/** Operations on the task database. Their meaning is the bd commands named beside them. */
export interface TaskDb {
  /** bd ready --label ready-for-agent */
  ready(): Issue[]
  show(id: string): Issue
  epics(): Issue[]
  /** bd list --parent <epic> --all */
  listUnder(epicId: string): Issue[]
  /** Open and closed assumption tasks of a scope (metadata type=assumptions, epic=<scope>). */
  assumptionTasks(scope: string): Issue[]
  /**
   * Claims the task only when it has no assignee (a conditional write). False when
   * another run claimed it first; other failures throw.
   */
  claim(id: string): boolean
  unclaim(id: string): void
  comment(id: string, text: string): void
  update(id: string, change: LabelChange): void
  /** Returns the new id. */
  create(issue: NewIssue): string
  addDependency(id: string, dependsOn: string): void
  close(id: string, reason: string): void
}
