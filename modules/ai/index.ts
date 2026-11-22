/**
 * Public operations of the AI module: assignments of AI work for the
 * requesting modules, independent of their business cases. Requesting
 * modules, the shared registration of receivers, the module plugin, the
 * periodic process and the server use only these.
 */

// Placing an assignment and reading its status (T1). An agent assignment
// uses the shared list of agent tools, the rule of a safe source URL and
// the materials of agent work exported below (T1-R09).
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
// ASSUMPTION(oferty-pracy-sq2.11/ASM-2): the potential cost of one
// operation, for Matching's views. ASSUMPTION(oferty-pracy-sq2.9/ASM-3)
export { readPotentialCost } from './assignments/read-potential-cost.ts'
// The exchange kept with an assignment's operations, for Matching's view
// of an assessment's provider exchange (T8-R07).
export {
  readAssignmentExchange,
  type AssignmentExchange,
  type OperationExchange,
} from './assignments/read-assignment-exchange.ts'
export {
  AssignmentError,
  assignmentStatuses,
  type AssignmentErrorCode,
  type AssignmentRequest,
  type AssignmentStatus,
  type AssignmentType,
  type ResponseFormat,
} from './assignments/assignment.ts'
// ASSUMPTION(oferty-pracy-0mq.22/ASM-3): the closed list of agent tools and
// the materials of agent work.
export { agentTools, type AgentTool } from './domain/agent-tools.ts'
export type { AgentMaterial, AgentSource } from './domain/agent-material.ts'
// ASSUMPTION(oferty-pracy-0mq.22/ASM-5): the one rule of a safe source URL.
export { safeSourceUrl } from './domain/source-url.ts'

// The budget by month with the amounts carried from before the deployment
// (T3-R09, T10-R01), for the budget card of the profile page (T10-R06) and,
// from task oferty-pracy-sq2.14, the panel.
export {
  readMonthlyBudgets,
  type MonthlyBudget,
} from './assignments/read-monthly-budgets.ts'

// The jobs of the executors' queues with their handler and failure handler,
// registered by the AI module plugin, and the step of the periodic process
// that sends the operations waiting for the budget once it has room (T3).
export { executorJobs } from './executors/registry.ts'
export { runOperation } from './assignments/run-operation.ts'
export { endFailedOperation } from './assignments/end-failed-operation.ts'
export { sendOperationsWaitingForBudget } from './assignments/send-operations-waiting-for-budget.ts'

// The receiver through which a requesting module learns of every end of its
// assignments, registered by the shared registration of receivers that
// every process runs at start, and the step of the periodic process that
// fails assignments past their time limit (T6).
export {
  registerAssignmentReceiver,
  type AssignmentFailureDelivery,
  type AssignmentReceiver,
  type AssignmentResultDelivery,
} from './assignments/assignment-receiver.ts'
export { failAssignmentsPastTimeLimit } from './assignments/fail-assignments-past-time-limit.ts'

// The reads of the AI assignments panel (T11): the list of assignments
// 50 at a time, the details of one with its operations and cost figures,
// and the count of assignments needing attention for the navigation. Only
// the panel's reads give causes, reasons and costs of assignments. Their
// shapes and texts are in `view.ts`.
export { readAssignmentList } from './assignments/read-assignment-list.ts'
export { readAssignmentDetails } from './assignments/read-assignment-details.ts'
export { countAssignmentsNeedingAttention } from './assignments/count-assignments-needing-attention.ts'
