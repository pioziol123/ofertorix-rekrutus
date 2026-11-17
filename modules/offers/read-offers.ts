import { projectOffer } from './infrastructure/adapters/source-ad-projection.ts'
import { findCurrentAds } from './infrastructure/adapters/source-ads.ts'
import type { OfferView } from './offer-view.ts'

/** The largest catalog the list reads at once. */
const catalogLimit = 10000

/**
 * Reads every offer with its current content. Throws when the catalog
 * exceeds the limit the list can read at once.
 */
export async function readOffers(): Promise<OfferView[]> {
  const ads = await findCurrentAds(catalogLimit + 1)
  if (ads.length > catalogLimit)
    throw new Error('Offer catalog exceeds current reader limit')
  return ads.map((ad) => projectOffer(ad))
}
