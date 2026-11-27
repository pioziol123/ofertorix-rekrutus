import type { AgentTool } from './agent-tools.ts'

/**
 * The status of an assignment as requesting modules see it (ZA-R01):
 * in progress, needs attention, succeeded or failed. Succeeded and failed
 * are final. The one closed list of the assignment contract that is public.
 */
export const assignmentStatuses = [
  'in_progress',
  'needs_attention',
  'succeeded',
  'failed',
] as const
export type AssignmentStatus = (typeof assignmentStatuses)[number]

/** Whether a status is final: succeeded or failed. */
export const isFinal = (status: AssignmentStatus): boolean =>
  status === 'succeeded' || status === 'failed'

/** The kind of work: a single answer or an agent session. */
export const assignmentTypes = ['single', 'agent'] as const
export type AssignmentType = (typeof assignmentTypes)[number]

/**
 * Why a failed assignment failed (ZA-R05), as stored: rejected by the
 * owner, time limit exceeded, result not taken. Only the owner sees it.
 */
export type AssignmentFailureReason =
  'rejected' | 'time_limit' | 'delivery_failed'

/**
 * The response format an executor is to follow: a name and a JSON Schema.
 * The AI module passes it on and does not check a result against it.
 */
export type ResponseFormat = {
  name: string
  schema: Record<string, unknown>
}

/**
 * The frozen content of an assignment: what every operation of it carries
 * out, as far as an executor reads it.
 */
export type AssignmentContent = {
  type: AssignmentType
  instruction: string
  input: string
  responseFormat: ResponseFormat | null
  agent: { tools: AgentTool[]; resultInstruction: string } | null
}

/** The time limit of every assignment, counted from placing (T6-R06). */
export const assignmentTimeLimitSeconds = 7 * 24 * 3600

/** Operations an assignment gets without the owner, the first included. */
export const automaticOperationLimit = 3

/**
 * The owner's actions an assignment allows (T12-R01, T12-R03, T12-R05):
 * Retry only while it needs attention and is within its time limit, Reject
 * while it is not final. The one owner of this rule: the panel offers the
 * actions by it, and Retry and Reject decide by it whether they take
 * effect.
 */
export function ownerActions(assignment: {
  status: AssignmentStatus
  withinTimeLimit: boolean
}): { retry: boolean; reject: boolean } {
  return {
    retry:
      assignment.status === 'needs_attention' && assignment.withinTimeLimit,
    reject: !isFinal(assignment.status),
  }
}
