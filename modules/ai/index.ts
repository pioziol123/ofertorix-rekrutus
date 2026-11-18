/**
 * Public operations of the AI module: general capabilities for working with
 * a model, independent of the clients' business cases.
 * Clients, the worker and the server use only these.
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
// countActiveExecutions, readExecutionArchive, readExecutionGroup,
// readLatestExecutions and the refusal code batch_too_large.
export { isConfigured, readReservation } from './execution-settings.ts'
export {
  countActiveExecutions,
  readExecution,
  readExecutionArchive,
  readExecutionGroup,
  readExecutionHistory,
  readLatestExecution,
  readLatestExecutions,
  type AiExecution,
} from './read-execution.ts'
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
export {
  registerResultReceiver,
  type ExecutionCost,
  type ExecutionFailureDelivery,
  type ExecutionResultDelivery,
  type ReceiverDecision,
  type ResultReceiver,
} from './result-receiver.ts'

// Composition: where the worker and the server assemble dependencies.
export {
  aiExecutionJobOptions,
  aiExecutionQueue,
  useAiQueue,
} from './execution-queue.ts'
export { runExecution } from './run-execution.ts'
export { recoverExecutions } from './recover-executions.ts'

// Transitional: what Matching and Companies use today, until task
// oferty-pracy-0mq.17 moves them to the contract above and removes these
// exports.
export { aiConfiguration, type AiConfiguration } from './configuration.ts'
export { chargeCeiling } from './domain/cost.ts'
export { reserve } from './infrastructure/persistence/budget.ts'
