/**
 * Public operations of the AI module: general capabilities for working with
 * a model, independent of the clients' business cases.
 * Clients, the module plugin, the periodic process, the migration step
 * and the server use only these.
 */
// Assignments: the contract of requesting modules (epic sq2). The old
// contract below stays in use beside it until the requesting modules move
// (task oferty-pracy-sq2.11). An agent assignment uses the shared list of
// agent tools, the rule of a safe source URL and the materials of agent
// work exported below (T1-R09).
export {
  placeAssignment,
  type PlacedAssignment,
} from './assignments/place-assignment.ts'
export {
  readAssignmentStatuses,
  type AssignmentStatusEntry,
  type AssignmentStatuses,
} from './assignments/read-assignment-statuses.ts'
export { canPlaceAssignments } from './assignments/can-place-assignments.ts'
export {
  AssignmentError,
  assignmentStatuses,
  type AssignmentErrorCode,
  type AssignmentRequest,
  type AssignmentStatus,
  type AssignmentType,
  type ResponseFormat,
} from './assignments/assignment.ts'

export {
  requestExecution,
  requestExecutionGroup,
  type ExecutionModeRequest,
  type ExecutionRequest,
  type RequestedExecution,
} from './request-execution.ts'
export { checkExecution, type ExecutionCheck } from './check-execution.ts'
// ASSUMPTION(oferty-pracy-0mq.21/ASM-4): readReservation, and below
// countActiveExecutions, readExecutionArchive, readLatestExecutions and
// the refusal code batch_too_large. ASSUMPTION(oferty-pracy-0mq.21/ASM-7):
// the refusal code group_requested.
export { isConfigured, readReservation } from './execution-settings.ts'
export {
  countActiveExecutions,
  readExecution,
  readExecutionArchive,
  readExecutionHistory,
  readLatestExecution,
  readLatestExecutions,
  type AiExecution,
} from './read-execution.ts'
// ASSUMPTION(oferty-pracy-0mq.21/ASM-8): the saved bodies a client gives the
// archive read.
export type { SavedBatchBody } from './provider-adapter.ts'
// ASSUMPTION(oferty-pracy-0mq.22/ASM-3): the materials of agent work.
export type { AgentMaterial, AgentSource } from './provider-adapter.ts'
// ASSUMPTION(oferty-pracy-0mq.22/ASM-5): the one rule of a safe source URL.
export { safeSourceUrl } from './domain/source-url.ts'
export {
  executionCauses,
  executionStates,
  type ExecutionCause,
  type ExecutionState,
} from './domain/execution-state.ts'
export {
  readBudget,
  readBudgetHistory,
  type AiBudget,
  type AiBudgetPeriod,
} from './read-budget.ts'
export { AiRequestError, type AiRequestErrorCode } from './errors.ts'
export type { ExecutionMode } from './execution-settings.ts'
// ASSUMPTION(oferty-pracy-0mq.22/ASM-3): the closed list of agent tools.
export { agentTools, type AgentTool } from './domain/execution-mode.ts'
export {
  registerResultReceiver,
  type ExecutionCost,
  type ExecutionFailureDelivery,
  type ExecutionResultDelivery,
  type ReceiverDecision,
  type ResultReceiver,
} from './result-receiver.ts'

// The jobs of AI executions, registered by the AI module plugin with their
// job handler and failure handler (B6-R11).
export {
  localExecutionJob,
  paidExecutionJob,
  type ExecutionJobData,
} from './execution-jobs.ts'
export { runExecution } from './run-execution.ts'
export { endFailedExecution } from './end-failed-execution.ts'
// The carry-over of unfinished executions by the migration step (B6-R10).
export { requestUnfinishedExecutions } from './request-unfinished-executions.ts'
// The steps of the periodic process (B6-R09).
export { fundWaitingExecutions } from './fund-executions.ts'
export { advanceSentBatches, cleanUpEndedBatches } from './run-batch.ts'
