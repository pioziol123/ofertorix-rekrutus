/**
 * Public operations of the Recruitments module (the owner's applications to
 * offers, their stages and the history of stages). Routes and other modules
 * use only these; views use `view.ts`.
 */
export { createApplication } from './create-application.ts'
export { moveApplication } from './move-application.ts'
export {
  readApplication,
  readCurrentStages,
  type ApplicationDetails,
} from './read-applications.ts'
export type { ApplicationStage } from './application-stage.ts'
export {
  ApplicationMissing,
  RecruitmentRefusal,
  StageChanged,
  TransitionNotAllowed,
  type RefusalReason,
} from './domain/moves.ts'
export { stages, type Stage } from './domain/stages.ts'

// Entry points: the module's HTTP handler, which the routes call.
export {
  answerRecruitmentRefusals,
  moveApplicationOverHttp,
  readApplicationOverHttp,
  stageInput,
} from './infrastructure/http/applications.ts'
