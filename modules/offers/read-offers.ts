import { readCurrentAds, type SourceAd } from '../sources/index.ts'
import type { OfferView } from './offer-view.ts'

/**
 * Reads every offer with its current content. Throws when the catalog
 * exceeds the limit the list can read at once.
 */
export async function readOffers(): Promise<OfferView[]> {
  return (await readCurrentAds()).map((ad) => toOffer(ad))
}

/** Each ad is shown as a separate offer until ads are grouped into offers. */
export function toOffer(
  ad: SourceAd,
  revisions: OfferView['revisions'] = [],
): OfferView {
  const { versionId: _currentVersion, ...content } = ad
  return { ...content, revisions }
}
