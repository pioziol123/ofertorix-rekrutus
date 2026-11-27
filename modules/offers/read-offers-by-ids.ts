import { readCurrentAds } from '../sources/index.ts'
import type { OfferSummary } from './offer-view.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The most offers one read gives, the largest page of Moja lista. */
export const offersByIdsLimit = 100

/** The read was given more IDs than its limit, or one that is not a UUID. */
export class InvalidOfferIds extends Error {
  constructor() {
    super(`Expected at most ${offersByIdsLimit} offer UUIDs`)
  }
}

/**
 * The offers of the given IDs, for Moja lista and the application details
 * (lq3 D4): each existing offer's ID, title, company, salary ranges and
 * availability at the source, in one query. Missing IDs are left out; the
 * order is not defined. Reads committed state, takes no locks.
 */
export async function readOffersByIds(
  ids: readonly string[],
): Promise<OfferSummary[]> {
  if (ids.length > offersByIdsLimit || !ids.every((id) => uuid.test(id)))
    throw new InvalidOfferIds()
  const ads = await readCurrentAds(ids.map((id) => id.toLowerCase()))
  return ads.map((ad) => ({
    id: ad.id,
    title: ad.title,
    company: ad.company,
    salaries: ad.salaries,
    availability: ad.availability,
  }))
}
