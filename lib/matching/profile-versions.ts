import {
  readActiveProfileVersion,
  readProfileVersionMetadata,
  type ProfileVersion,
} from '../../modules/profile/index.ts'

/**
 * Matching reads confirmed profile versions only through the Profile module's
 * public read. The read takes no row locks: a profile confirmed between this
 * read and a later write is accepted (owner's decision in 0mq.13), and the
 * owner can enqueue the assessment again.
 */

/** The active confirmed version, or null when the owner has confirmed none. */
export async function activeProfileVersion(): Promise<ProfileVersion | null> {
  const read = await readActiveProfileVersion()
  return read.active ? read.version : null
}

/** Version numbers of the given versions, read in one query, by id. */
export async function profileVersionNumbers(
  ids: readonly string[],
): Promise<Map<string, number>> {
  const metadata = await readProfileVersionMetadata(ids)
  return new Map(metadata.map((version) => [version.id, version.number]))
}

/**
 * Adds the number of each row's profile version. Every stored assessment
 * references an existing version; a row without one is left out, as the
 * former join with the versions did.
 */
export function withProfileNumbers<T extends { profile_version_id: string }>(
  rows: T[],
  numbers: Map<string, number>,
): (T & { profile_number: number })[] {
  return rows.flatMap((row) => {
    const number = numbers.get(row.profile_version_id)
    return number === undefined ? [] : [{ ...row, profile_number: number }]
  })
}
