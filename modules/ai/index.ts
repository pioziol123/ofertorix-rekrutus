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
export {
  readExecution,
  readExecutionHistory,
  type AiExecution,
} from './read-execution.ts'
export type { ExecutionState } from './infrastructure/persistence/executions.ts'
export { readBudget, type AiBudget } from './read-budget.ts'
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

// Transitional: what the Profile, Matching and Companies use today, until
// tasks oferty-pracy-0mq.9 and oferty-pracy-0mq.17 move them to the
// contract above and remove these exports.
export {
  aiConfiguration,
  isExecutionSnapshot,
  localExecutionChoice,
  resolveEndpoint,
  savedEndpoint,
  type AiConfiguration,
  type AiEndpoint,
  type AiExecutionConfig,
  type ExecutionSnapshot,
} from './configuration.ts'
export { budgetMonth, chargeCeiling } from './domain/cost.ts'
export { reserve } from './infrastructure/persistence/budget.ts'
export {
  emptyUsage,
  ModelError,
  type ModelRequest,
  type ModelResult,
  type ModelUsage,
  type StructuredModel,
} from './provider-adapter.ts'
export { OpenAiAdapter } from './infrastructure/adapters/openai.ts'
export { OllamaAdapter } from './infrastructure/adapters/ollama.ts'
export { localFetch } from './infrastructure/adapters/local-http.ts'
