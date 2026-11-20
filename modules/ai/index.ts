/**
 * Public operations of the AI module: general capabilities for working with
 * a model, independent of the clients' business cases.
 * Clients, the module plugin, the periodic process, the migration step
 * and the server use only these.
 */
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
export {
  endFailedExecution,
  requestUnfinishedExecutions,
} from './end-failed-execution.ts'
// The steps of the periodic process (B6-R09).
export { fundWaitingExecutions } from './fund-executions.ts'
export { advanceSentBatches, cleanUpEndedBatches } from './run-batch.ts'
