/**
 * Public operations of the Recruitments module (the owner's applications to
 * offers, their stages, the history of stages and the note). Routes and
 * other modules use only these; views use `view.ts`.
 */
export { createApplication } from './create-application.ts'
export { moveApplication } from './move-application.ts'
export { saveNote } from './save-note.ts'
export {
  readApplication,
  readCurrentStages,
  type ApplicationDetails,
} from './read-applications.ts'
export {
  readApplicationsPage,
  type ApplicationsPage,
} from './read-applications-page.ts'
export type { ApplicationStage } from './application-stage.ts'
export {
  ApplicationMissing,
  RecruitmentRefusal,
  StageChanged,
  TransitionNotAllowed,
  type RefusalReason,
} from './domain/moves.ts'
export { NoteTooLong } from './domain/note.ts'
export { stages, type Stage } from './domain/stages.ts'

// Entry points: the module's HTTP handler, which the routes call.
export {
  answerRecruitmentRefusals,
  RefusalResponse,
  moveApplicationOverHttp,
  offerIdInput,
  readApplicationOverHttp,
  readApplicationsPageOverHttp,
  saveNoteOverHttp,
  stageInput,
} from './infrastructure/http/applications.ts'
