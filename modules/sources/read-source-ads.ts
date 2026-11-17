import { projectSourceAd } from './domain/ad-projection.ts'
import {
  findAdVersions,
  findCurrentAds,
  findCurrentVersions,
  findVersionList,
  type AdContentRow,
} from './infrastructure/persistence/source-ads.ts'
import type {
  CurrentAdVersion,
  SourceAd,
  SourceAdVersion,
} from './source-ad.ts'

/** The largest catalogue the read without a list of ids returns at once. */
const catalogueLimit = 10000

/**
 * Reads ads with their current content in one query, in the unified form.
 * With a list of ids it returns those ads; unknown ids are skipped. Without
 * one it returns the whole catalogue and throws when it exceeds 10 000 ads.
 * The order of the result is not defined. The read takes no row locks.
 */
export async function readCurrentAds(
  ids?: readonly string[],
): Promise<SourceAd[]> {
  if (ids) {
    if (!ids.length) return []
    const unique = [...new Set(ids)]
    return toAds(await findCurrentAds(unique, unique.length))
  }
  const rows = await findCurrentAds(null, catalogueLimit + 1)
  if (rows.length > catalogueLimit)
    throw new Error('Offer catalog exceeds current reader limit')
  return toAds(rows)
}

/**
 * Reads the given versions in one query: each with the content of that
 * version and its ad's identifier, observation dates, availability and
 * expiry. Unknown ids are skipped; the order of the result is not defined.
 */
export async function readAdVersions(
  versionIds: readonly string[],
): Promise<SourceAd[]> {
  if (!versionIds.length) return []
  return toAds(await findAdVersions([...new Set(versionIds)]))
}

/** The ad's versions, identifier and retrieval time, newest first. */
export async function readAdVersionList(
  adId: string,
): Promise<SourceAdVersion[]> {
  return findVersionList(adId)
}

/**
 * Reads the identifier of the current version of each given ad in one
 * query. Unknown ids are skipped; the order of the result is not defined.
 */
export async function readCurrentAdVersions(
  adIds: readonly string[],
): Promise<CurrentAdVersion[]> {
  if (!adIds.length) return []
  return (await findCurrentVersions([...new Set(adIds)])).map((row) => ({
    adId: row.ad_id,
    versionId: row.version_id,
  }))
}

function toAds(rows: AdContentRow[]): SourceAd[] {
  const now = new Date()
  return rows.map((row) => ({
    ...projectSourceAd(row as unknown as Record<string, unknown>, now),
    versionId: row.version_id,
  }))
}
