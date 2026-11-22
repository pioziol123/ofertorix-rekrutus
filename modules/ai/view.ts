/**
 * Public entry of the AI module for views: the read object of the AI
 * assignments panel (T11 of epic sq2) with its texts, and the outcome of
 * the owner's actions with the rules of which are offered (T12). Views run in the
 * browser, so this entry reaches no server code: no database, queue or
 * Node built-ins. Server code uses `index.ts`.
 */
export {
  actionFailedText,
  actionOutcomeText,
  actualCostText,
  amountText,
  assignmentActions,
  assignmentStatusLabels,
  assignmentTypeLabels,
  failureReasonLabels,
  operationCauseText,
  operationStateText,
  parametersText,
  timeLeftText,
  type AssignmentActionOutcome,
  type AssignmentDetails,
  type AssignmentFailureReason,
  type AssignmentListPage,
  type AssignmentRow,
  type OperationDetails,
  type OperationState,
  type OperationWait,
} from './domain/panel.ts'
