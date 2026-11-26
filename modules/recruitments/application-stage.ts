import type { Stage } from './domain/stages.ts'

/** An application's stage and its stage moment (A-R05), after a move. */
export type ApplicationStage = { stage: Stage; stageChangedAt: Date }
