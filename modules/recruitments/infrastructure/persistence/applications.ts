import { db } from '../../../../lib/db.ts'
import type { Stage } from '../../domain/stages.ts'

/**
 * Storage of the application aggregate: the application row with its
 * current stage and stage moment, and the history of its stage changes,
 * whose rows are only inserted (D1).
 */

type ApplicationRow = {
  id: string
  stage: Stage
  stage_changed_at: Date
  note: string
}

/** The current state of an offer's application. */
export type StoredApplication = {
  id: string
  stage: Stage
  stageChangedAt: Date
  note: string
}

const toApplication = (row: ApplicationRow): StoredApplication => ({
  id: row.id,
  stage: row.stage,
  stageChangedAt: row.stage_changed_at,
  note: row.note,
})

/**
 * Inserts the application of an offer, unless the offer already has one.
 * Returns the new application's ID, or null when one existed; a parallel
 * insert of the same offer waits for the other to finish.
 */
export async function insertApplication(application: {
  id: string
  offerId: string
  stage: Stage
  at: Date
}): Promise<string | null> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO recruitment_applications(id,offer_id,stage,stage_changed_at)
     VALUES($1,$2,$3,$4) ON CONFLICT (offer_id) DO NOTHING RETURNING id`,
    [application.id, application.offerId, application.stage, application.at],
  )
  return rows[0]?.id ?? null
}

/**
 * Moves the offer's application to the target stage when it is in the
 * expected stage. Returns the application's ID, or null when no row
 * matched. A parallel update of the same row waits and then checks the
 * stage again, so only one of two moves from one stage applies.
 */
export async function updateStageWhere(change: {
  offerId: string
  expected: Stage
  target: Stage
  at: Date
}): Promise<string | null> {
  const { rows } = await db().query<{ id: string }>(
    `UPDATE recruitment_applications SET stage=$3, stage_changed_at=$4
     WHERE offer_id=$1 AND stage=$2 RETURNING id`,
    [change.offerId, change.expected, change.target, change.at],
  )
  return rows[0]?.id ?? null
}

/** Appends a record to the history of stages. */
export async function insertStageChange(change: {
  id: string
  applicationId: string
  stage: Stage
  at: Date
}) {
  await db().query(
    `INSERT INTO recruitment_stage_changes(id,application_id,stage,changed_at)
     VALUES($1,$2,$3,$4)`,
    [change.id, change.applicationId, change.stage, change.at],
  )
}

/** The offer's application, or null. */
export async function findApplication(
  offerId: string,
): Promise<StoredApplication | null> {
  const { rows } = await db().query<ApplicationRow>(
    `SELECT id,stage,stage_changed_at,note FROM recruitment_applications
     WHERE offer_id=$1`,
    [offerId],
  )
  return rows[0] ? toApplication(rows[0]) : null
}

/** The history of an application's stages, newest first. */
export async function findStageChanges(
  applicationId: string,
): Promise<{ stage: Stage; changedAt: Date }[]> {
  const { rows } = await db().query<{ stage: Stage; changed_at: Date }>(
    `SELECT stage,changed_at FROM recruitment_stage_changes
     WHERE application_id=$1 ORDER BY changed_at DESC, id DESC`,
    [applicationId],
  )
  return rows.map((row) => ({ stage: row.stage, changedAt: row.changed_at }))
}

/** The current stage of every application, `removed` included. */
export async function findCurrentStages(): Promise<
  { offerId: string; stage: Stage }[]
> {
  const { rows } = await db().query<{ offer_id: string; stage: Stage }>(
    'SELECT offer_id,stage FROM recruitment_applications',
  )
  return rows.map((row) => ({ offerId: row.offer_id, stage: row.stage }))
}
