import type { OfferSummary } from '../../modules/offers/view'
import {
  noteFits,
  noteTooLongMessage,
  refusalText,
  type ApplicationDetailsView,
  type ApplicationsPageView,
  type ApplicationsQuery,
} from '../../modules/recruitments/view'
import { readFailureOutcome } from './application-stage'
import { refusalCodeOf } from './fetch-errors'
import type { PageFetch } from './sync-page-read'

/**
 * The reads and the page logic of Moja lista and its application details
 * (lq3 T2): the page joins a read of the Recruitments module with a read
 * of the Offers module by offer ID (D4). Pure apart from the fetch it is
 * given, so tests check it without a browser or a server.
 */

/** The text of an empty list (T2-R07). */
export const emptyListText = 'Brak ofert na liście dla wybranego etapu'

/**
 * Shown instead of the list when it cannot be read.
 * ASSUMPTION(oferty-pracy-lq3.2/ASM-1)
 */
export const listReadFailureText =
  'Nie udało się wczytać listy aplikacji. Spróbuj odświeżyć stronę.'

/**
 * Shown instead of the details when the application cannot be read for a
 * reason other than a missing application.
 * ASSUMPTION(oferty-pracy-lq3.2/ASM-1)
 */
export const detailsReadFailureText =
  'Nie udało się wczytać szczegółów aplikacji. Spróbuj odświeżyć stronę.'

/** One page of Moja lista with the offers of its rows by offer ID. */
export type MyListPage = {
  list: ApplicationsPageView
  offers: Record<string, OfferSummary>
}

/** The offers of the given IDs by ID; one read for all of them (D4). */
async function offersById(
  fetch: PageFetch,
  ids: string[],
): Promise<Record<string, OfferSummary>> {
  if (!ids.length) return {}
  const offers = (await fetch('/api/offer-summaries', {
    query: { ids: ids.join(',') },
  })) as OfferSummary[]
  return Object.fromEntries(offers.map((offer) => [offer.id, offer]))
}

/**
 * Reads one page of the list, then the offers of its rows. A row whose
 * offer is missing from the answer shows its stage only. A failure of
 * either read fails the page's read. ASSUMPTION(oferty-pracy-lq3.2/ASM-1)
 */
export async function readMyListPage(
  fetch: PageFetch,
  listQuery: Record<string, unknown>,
): Promise<MyListPage> {
  const list = (await fetch('/api/applications', {
    query: listQuery,
  })) as ApplicationsPageView
  return {
    list,
    offers: await offersById(
      fetch,
      list.items.map((item) => item.offerId),
    ),
  }
}

/** The application details with the offer, null when it has no offer. */
export type ApplicationDrawer = {
  application: ApplicationDetailsView
  offer: OfferSummary | null
}

/**
 * Reads the open application and its offer. Only a 404, a missing
 * application or a malformed ID, gives null, so the page shows the list
 * without details (T2-R06); any other failure fails the read.
 * ASSUMPTION(oferty-pracy-lq3.1/ASM-1) ASSUMPTION(oferty-pracy-lq3.2/ASM-1)
 */
export async function readApplicationDrawer(
  fetch: PageFetch,
  offerId: string,
): Promise<ApplicationDrawer | null> {
  if (!offerId) return null
  try {
    const [application, offers] = await Promise.all([
      fetch(
        `/api/applications/${encodeURIComponent(offerId)}`,
      ) as Promise<ApplicationDetailsView>,
      offersById(fetch, [offerId]).catch(
        (error: unknown): Record<string, OfferSummary> => {
          // A malformed ID fails both reads; the application's 404 decides.
          if (refusalCodeOf(error) === 'invalid_input') return {}
          throw error
        },
      ),
    ])
    return {
      application,
      offer: offers[application.offerId] ?? null,
    }
  } catch (error) {
    if (readFailureOutcome(error) === 'no_application') return null
    throw error
  }
}

/**
 * The query to show after a move in the details (T2-R10): when the move
 * took the last row of the last page out of the view, the read gives an
 * earlier page, and the address moves to it; otherwise the address stays.
 */
export function queryAfterMove(
  shown: ApplicationsQuery,
  read: Pick<ApplicationsPageView, 'page'>,
): ApplicationsQuery | null {
  return read.page < shown.page ? { ...shown, page: read.page } : null
}

/**
 * What the page says before saving a note: the message of A-R10 for a
 * note over the limit, which the page then does not send, or nothing.
 */
export const noteCheckText = (text: string): string | null =>
  noteFits(text) ? null : noteTooLongMessage

/** Shown after the note was saved. ASSUMPTION(oferty-pracy-lq3.2/ASM-2) */
export const noteSavedText = 'Notatka zapisana.'

/**
 * Shown when a note save fails without a refusal code; the typed text stays
 * in the field. ASSUMPTION(oferty-pracy-lq3.2/ASM-2)
 */
export const noteSaveFailedText =
  'Nie udało się zapisać notatki. Tekst został w polu.'

/**
 * The text for a failed note save: the refusal's text for its code (A-R10),
 * the code itself for a code without a text (D13), or the failure text
 * when the answer carries no code. ASSUMPTION(oferty-pracy-lq3.2/ASM-2)
 */
export function noteSaveFailureText(error: unknown): string {
  const code = refusalCodeOf(error)
  return code ? refusalText(code) : noteSaveFailedText
}
