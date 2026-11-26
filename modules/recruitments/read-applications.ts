import type { Stage } from './domain/stages.ts'
import {
  findApplication,
  findCurrentStages,
  findStageChanges,
} from './infrastructure/persistence/applications.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** An application with its note and its history of stages, newest first. */
export type ApplicationDetails = {
  offerId: string
  stage: Stage
  stageChangedAt: Date
  note: string
  history: { stage: Stage; changedAt: Date }[]
}

/**
 * The application of an offer, or null when the offer has none or the ID
 * is not a UUID. Reads committed state, takes no locks.
 */
export async function readApplication(
  offerId: string,
): Promise<ApplicationDetails | null> {
  if (!uuid.test(offerId)) return null
  const application = await findApplication(offerId)
  if (!application) return null
  return {
    offerId: offerId.toLowerCase(),
    stage: application.stage,
    stageChangedAt: application.stageChangedAt,
    note: application.note,
    history: await findStageChanges(application.id),
  }
}

/**
 * The current stage of every application, `removed` included, by offer ID
 * (D3): one query, at most one row per application.
 */
export async function readCurrentStages(): Promise<Map<string, Stage>> {
  return new Map(
    (await findCurrentStages()).map((row) => [row.offerId, row.stage]),
  )
}
