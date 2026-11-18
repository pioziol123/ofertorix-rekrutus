import { db } from '../../../../lib/db.ts'
import type { ProfileData } from '../../../../lib/profile/model.ts'

/**
 * The profile aggregate: the head that points at the active version, the
 * editable draft and the confirmed versions. Rows keep their stored shape,
 * which the profile routes return as they are.
 */

/** A confirmed version with every stored column. */
export type VersionRecord = {
  id: string
  number: number
  data: unknown
  command_id: string
  draft_revision: number
  previous_version_id: string | null
  created_at: Date
}

export type DraftRecord = {
  revision: number
  base_version_id: string | null
  data: unknown
  [column: string]: unknown
}

/** Locks the profile head until the transaction ends; returns the active id. */
export async function lockHead(): Promise<string | null> {
  const row = (
    await db().query('SELECT * FROM profile_head WHERE singleton FOR UPDATE')
  ).rows[0]
  return (row.active_version_id as string | null) ?? null
}

/** The active version with every stored column, or null. */
export async function findActiveVersionRecord(): Promise<VersionRecord | null> {
  return (
    (
      await db().query(
        'SELECT v.* FROM profile_head h JOIN profile_versions v ON v.id=h.active_version_id WHERE h.singleton',
      )
    ).rows[0] ?? null
  )
}

/** The saved draft, or null before the first save. */
export async function findDraft(): Promise<DraftRecord | null> {
  return (
    (await db().query('SELECT * FROM profile_drafts WHERE singleton'))
      .rows[0] ?? null
  )
}

/** Id, number and confirmation time of every version, newest first. */
export async function listVersions(): Promise<
  { id: string; number: number; created_at: Date }[]
> {
  return (
    await db().query(
      'SELECT id,number,created_at FROM profile_versions ORDER BY number DESC',
    )
  ).rows
}

/** How many of the given imports exist. */
export async function countImports(ids: string[]): Promise<number> {
  return (
    (
      await db().query(
        'SELECT id FROM profile_imports WHERE id=ANY($1::uuid[])',
        [ids],
      )
    ).rowCount ?? 0
  )
}

/** The saved text of an import's revision, or null. */
export async function findImportText(
  importId: string,
  revision: number,
): Promise<string | null> {
  return (
    ((
      await db().query(
        'SELECT text FROM profile_import_texts WHERE import_id=$1 AND revision=$2',
        [importId, revision],
      )
    ).rows[0]?.text as string | undefined) ?? null
  )
}

/** Writes the draft with the next revision and returns the stored row. */
export async function upsertDraft(
  revision: number,
  baseVersionId: string | null,
  data: ProfileData,
): Promise<DraftRecord> {
  return (
    await db().query(
      `INSERT INTO profile_drafts(singleton,revision,base_version_id,data) VALUES(true,$1,$2,$3)
   ON CONFLICT(singleton) DO UPDATE SET revision=EXCLUDED.revision,data=EXCLUDED.data,updated_at=now() RETURNING *`,
      [revision, baseVersionId, data],
    )
  ).rows[0]
}

/** The version a confirmation command created, or null. */
export async function findVersionByCommand(
  commandId: string,
): Promise<VersionRecord | null> {
  return (
    (
      await db().query('SELECT * FROM profile_versions WHERE command_id=$1', [
        commandId,
      ])
    ).rows[0] ?? null
  )
}

/** Creates the next confirmed version and returns the stored row. */
export async function insertVersion(version: {
  id: string
  data: ProfileData
  commandId: string
  draftRevision: number
  previousVersionId: string | null
}): Promise<VersionRecord> {
  return (
    await db().query(
      `INSERT INTO profile_versions(id,number,data,command_id,draft_revision,previous_version_id)
   VALUES($1,(SELECT coalesce(max(number),0)+1 FROM profile_versions),$2,$3,$4,$5) RETURNING *`,
      [
        version.id,
        version.data,
        version.commandId,
        version.draftRevision,
        version.previousVersionId,
      ],
    )
  ).rows[0]
}

/** Makes the version active and rebases the draft on it. */
export async function activateVersion(versionId: string) {
  await db().query(
    'UPDATE profile_head SET active_version_id=$1 WHERE singleton',
    [versionId],
  )
  await db().query(
    'UPDATE profile_drafts SET base_version_id=$1,revision=revision+1,updated_at=now() WHERE singleton',
    [versionId],
  )
}
