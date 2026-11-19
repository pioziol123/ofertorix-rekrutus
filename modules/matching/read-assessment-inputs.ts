import {
  readAdVersionList,
  readAdVersions,
  readCurrentAdVersions,
  type SourceAd,
} from '../sources/index.ts'
import {
  readActiveProfileVersion,
  readProfileVersionMetadata,
  type ProfileVersion,
} from '../profile/index.ts'

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
 * Matching reads ads only through the Sources module's public read, which
 * takes no row locks. Callers read before they hold a connection, so a write
 * never waits for a second one; an ad changed between this read and a later
 * write is accepted as for the profile (0mq.13), and the assessment then
 * shows as stale.
 */

/** The current version of each given ad that has one, by ad id. */
export async function currentAdVersions(
  adIds: readonly string[],
): Promise<Map<string, string>> {
  const versions = await readCurrentAdVersions(adIds)
  return new Map(versions.map((v) => [v.adId, v.versionId]))
}

/**
 * The given ads for assessment, by ad id: first the current version of each,
 * then the content of exactly that version, so an assessment always pairs
 * content with the version it came from, even when the ad changes between
 * the two reads.
 */
export async function adsForAssessment(
  adIds: readonly string[],
): Promise<Map<string, SourceAd>> {
  const versions = await readCurrentAdVersions(adIds)
  const ads = await readAdVersions(versions.map((v) => v.versionId))
  return new Map(ads.map((ad) => [ad.id, ad]))
}

/**
 * Adds to each assessment row of one ad the retrieval time of the ad version
 * it assessed and whether it is stale: made for another profile version than
 * the active one, or for another ad version than the current one. Rows of an
 * ad without a current version, or of a version the ad does not have, are
 * left out, as the former join with the ad tables did.
 */
export async function withAdVersionState<
  T extends { profile_version_id: string; ad_revision_id: string },
>(
  rows: T[],
  adId: string,
  activeProfileVersionId: string | null,
): Promise<(T & { offer_version_at: Date; stale: boolean })[]> {
  if (!rows.length) return []
  const current = (await currentAdVersions([adId])).get(adId)
  if (current === undefined) return []
  const times = new Map(
    (await readAdVersionList(adId)).map((v) => [v.id, v.at]),
  )
  return rows.flatMap((row) => {
    const at = times.get(row.ad_revision_id)
    if (!at) return []
    return [
      {
        ...row,
        offer_version_at: at,
        stale:
          row.profile_version_id !== activeProfileVersionId ||
          row.ad_revision_id !== current,
      },
    ]
  })
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
