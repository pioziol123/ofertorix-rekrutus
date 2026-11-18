import { db } from '../../../../lib/db.ts'
import type { VersionRecord } from './profile.ts'

/**
 * Confirmed profile versions and the head that points at the active one.
 * Reads take no row locks: a reader never delays a confirmation.
 */

export type VersionRow = {
  id: string
  number: number
  created_at: Date
  data: unknown
}

/** The version the profile head points at, or null when none is active. */
export async function findActiveVersion(): Promise<VersionRow | null> {
  const result = await db().query<VersionRow>(
    'SELECT v.id,v.number,v.created_at,v.data FROM profile_head h JOIN profile_versions v ON v.id=h.active_version_id WHERE h.singleton',
  )
  return result.rows[0] ?? null
}

/** The versions with the given ids; unknown ids are skipped. */
export async function findVersions(ids: string[]): Promise<VersionRow[]> {
  const result = await db().query<VersionRow>(
    'SELECT id,number,created_at,data FROM profile_versions WHERE id=ANY($1::uuid[])',
    [ids],
  )
  return result.rows
}

/** Id, number and confirmation time of the given versions, without data. */
export async function findVersionMetadata(
  ids: string[],
): Promise<Omit<VersionRow, 'data'>[]> {
  const result = await db().query<Omit<VersionRow, 'data'>>(
    'SELECT id,number,created_at FROM profile_versions WHERE id=ANY($1::uuid[])',
    [ids],
  )
  return result.rows
}

/** One version with every stored column, or null. */
export async function findVersionRecord(
  id: string,
): Promise<VersionRecord | null> {
  return (
    (await db().query('SELECT * FROM profile_versions WHERE id=$1', [id]))
      .rows[0] ?? null
  )
}
