/**
 * Public entry of the Recruitments module for views. Views run in the
 * browser, so this entry reaches no server code: no database, queue or Node
 * built-ins. Server code uses `index.ts`. It is the one owner of the stage
 * values, their labels, icons and colours, the label of an offer without an
 * application, the stages allowed from each state, the choices of the stage
 * switch of Moja lista, the note's limit and the texts of refusals (D10,
 * A-R14).
 */
export {
  allowedStages,
  isStage,
  noApplicationLabel,
  stageLabels,
  stages,
  type Stage,
} from './domain/stages.ts'
export { stageMarks } from './domain/stage-marks.ts'
export {
  applicationsAddress,
  changeStageChoice,
  readApplicationsQuery,
  stageChoiceLabels,
  stageChoices,
  type ApplicationsQuery,
  type StageChoice,
} from './domain/stage-choices.ts'
export { noteCounterText, noteFits } from './domain/note.ts'
export {
  noteTooLongMessage,
  refusalText,
  stageChangedMessage,
  type RefusalCode,
} from './refusal-codes.ts'
export type {
  ApplicationDetailsView,
  ApplicationsPageView,
} from './application-views.ts'
