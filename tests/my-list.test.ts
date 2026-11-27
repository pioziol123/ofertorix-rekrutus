import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from '../lib/time/index.ts'
import { escapeCloses } from '../app/utils/page-controls.ts'
import {
  detailsReadFailureText,
  emptyListText,
  listReadFailureText,
  noteCheckText,
  noteSaveFailedText,
  noteSaveFailureText,
  noteSavedText,
  queryAfterMove,
  readApplicationDrawer,
  readMyListPage,
} from '../app/utils/my-list.ts'
import {
  applicationsAddress,
  readApplicationsQuery,
  type ApplicationsQuery,
} from '../modules/recruitments/view.ts'

/**
 * The page logic of Moja lista and its application details (task
 * oferty-pracy-lq3.2, T2): the reads joined by offer ID, the page after a
 * move, opening and closing the details, the shown dates, the note's
 * messages and what a failed read shows.
 */

/** The shape of the error a failed `$fetch` throws. */
function fetchError(status?: number, code?: string) {
  return Object.assign(new Error('request failed'), {
    status,
    statusCode: status,
    data: code ? { statusCode: status, data: { code } } : undefined,
  })
}

const offerId = '0b8f2a4e-1c3d-4e5f-8a9b-0c1d2e3f4a5b'
const application = {
  offerId,
  stage: 'cv_sent',
  stageChangedAt: '2026-11-26T10:00:00.000Z',
  note: 'Notatka',
  history: [{ stage: 'cv_sent', changedAt: '2026-11-26T10:00:00.000Z' }],
}
const summary = {
  id: offerId,
  title: 'PHP',
  company: 'Firma',
  salaries: [],
  availability: 'available',
}

describe('the reads of Moja lista', () => {
  it('joins a page of the applications with one read of their offers by ID, leaving a row without its offer as stage only', async () => {
    const calls: [string, unknown][] = []
    const missing = '1b8f2a4e-1c3d-4e5f-8a9b-0c1d2e3f4a5b'
    const page = await readMyListPage(
      async (path, options) => {
        calls.push([path, options?.query])
        if (path === '/api/applications')
          return {
            items: [
              { offerId, stage: 'cv_sent', stageChangedAt: 'x' },
              { offerId: missing, stage: 'to_consider', stageChangedAt: 'y' },
            ],
            total: 2,
            page: 1,
            pages: 1,
            size: 20,
            stage: 'active',
          }
        return [summary]
      },
      { stage: 'all' },
    )
    expect(calls).toEqual([
      ['/api/applications', { stage: 'all' }],
      ['/api/offer-summaries', { ids: `${offerId},${missing}` }],
    ])
    expect(page.offers).toEqual({ [offerId]: summary })
    expect(page.list.items).toHaveLength(2)
  })

  it('reads no offers for an empty page and says so with the text of T2-R07 (T2-AC06)', async () => {
    const calls: string[] = []
    const page = await readMyListPage(async (path) => {
      calls.push(path)
      return {
        items: [],
        total: 0,
        page: 1,
        pages: 1,
        size: 20,
        stage: 'active',
      }
    }, {})
    expect(calls).toEqual(['/api/applications'])
    expect(page.offers).toEqual({})
    expect(emptyListText).toBe('Brak ofert na liście dla wybranego etapu')
  })

  it('reads the open application and its offer', async () => {
    const drawer = await readApplicationDrawer(
      async (path) =>
        path.startsWith('/api/applications/') ? application : [summary],
      offerId,
    )
    expect(drawer).toEqual({ application, offer: summary })
    expect(await readApplicationDrawer(async () => [], '')).toBeNull()
  })

  it('shows the list without details for an address naming a missing application or a malformed ID (T2-AC05)', async () => {
    const missing = async (path: string) => {
      if (path.startsWith('/api/applications/'))
        throw fetchError(404, 'application_not_found')
      return []
    }
    expect(await readApplicationDrawer(missing, offerId)).toBeNull()
    const malformed = async (path: string) => {
      throw path.startsWith('/api/applications/')
        ? fetchError(404, 'application_not_found')
        : fetchError(422, 'invalid_input')
    }
    expect(await readApplicationDrawer(malformed, 'not-an-id')).toBeNull()
  })

  it('fails the read of the details for any failure but a missing application, and of the list for any failure (ASSUMPTION(oferty-pracy-lq3.2/ASM-1))', async () => {
    for (const failure of [
      fetchError(500),
      fetchError(503),
      fetchError(403),
      new TypeError('fetch failed'),
    ]) {
      await expect(
        readApplicationDrawer(async (path) => {
          if (path.startsWith('/api/applications/')) throw failure
          return [summary]
        }, offerId),
      ).rejects.toBe(failure)
      await expect(
        readApplicationDrawer(async (path) => {
          if (path.startsWith('/api/applications/')) return application
          throw failure
        }, offerId),
      ).rejects.toBe(failure)
      await expect(
        readMyListPage(async () => {
          throw failure
        }, {}),
      ).rejects.toBe(failure)
    }
    expect(listReadFailureText).toBe(
      'Nie udało się wczytać listy aplikacji. Spróbuj odświeżyć stronę.',
    )
    expect(detailsReadFailureText).toBe(
      'Nie udało się wczytać szczegółów aplikacji. Spróbuj odświeżyć stronę.',
    )
  })
})

describe('the page after a move in the details (T2-AC12)', () => {
  it('moves the address to the previous page when the move took the only row of the last page under Aktywne', () => {
    const shown: ApplicationsQuery = { stage: 'active', page: 3, size: 10 }
    expect(queryAfterMove(shown, { page: 2 })).toEqual({
      stage: 'active',
      page: 2,
      size: 10,
    })
    expect(
      applicationsAddress(queryAfterMove(shown, { page: 2 })!, offerId),
    ).toEqual({ page: '2', size: '10', offer: offerId })
  })

  it('keeps the address when the page still exists', () => {
    expect(
      queryAfterMove({ stage: 'active', page: 2, size: 20 }, { page: 2 }),
    ).toBeNull()
  })
})

describe('opening and closing the application details (T2-AC13)', () => {
  it('opens a row in the address and closes it back to the same list', () => {
    const shown: ApplicationsQuery = { stage: 'all', page: 2, size: 50 }
    const opened = applicationsAddress(shown, offerId)
    expect(opened).toEqual({
      stage: 'all',
      page: '2',
      size: '50',
      offer: offerId,
    })
    expect(readApplicationsQuery(opened)).toEqual(shown)
    expect(applicationsAddress(readApplicationsQuery(opened), null)).toEqual({
      stage: 'all',
      page: '2',
      size: '50',
    })
  })

  it('lets Escape close the open page list first, then the details', () => {
    const open = { dialog: false, filterList: false }
    expect(escapeCloses({ ...open, pageList: true, details: true })).toBe(
      'pageList',
    )
    expect(escapeCloses({ ...open, pageList: false, details: true })).toBe(
      'details',
    )
    expect(escapeCloses({ ...open, pageList: false, details: false })).toBe(
      null,
    )
  })
})

describe('the shown dates (T2-AC02, T2-AC08)', () => {
  it('shows the stage date as DD.MM.RRRR in Polish time, also for a move just after midnight', () => {
    expect(formatDate(new Date('2026-11-26T23:05:00.000Z'))).toBe('27.11.2026')
    expect(formatDate(new Date('2026-06-30T22:01:00.000Z'))).toBe('01.07.2026')
    expect(formatDate(new Date('2026-11-26T22:59:00.000Z'))).toBe('26.11.2026')
  })

  it('shows a history record as DD.MM.RRRR HH:mm in Polish time', () => {
    expect(formatDateTime(new Date('2026-11-26T23:05:00.000Z'))).toBe(
      '27.11.2026 00:05',
    )
  })
})

describe('the messages of the note', () => {
  it('stops a note over 10 000 characters before saving with the message of A-R10 (A-AC03)', () => {
    expect(noteCheckText('a'.repeat(10_000))).toBeNull()
    expect(noteCheckText('a'.repeat(10_001))).toBe(
      'Notatka może mieć najwyżej 10 000 znaków',
    )
  })

  it('shows the text of a refusal code, and a failure text when the answer has no code (ASSUMPTION(oferty-pracy-lq3.2/ASM-2))', () => {
    expect(noteSaveFailureText(fetchError(422, 'note_too_long'))).toBe(
      'Notatka może mieć najwyżej 10 000 znaków',
    )
    expect(noteSaveFailureText(fetchError(404, 'application_not_found'))).toBe(
      'application_not_found',
    )
    for (const failure of [
      new TypeError('fetch failed'),
      fetchError(500),
      fetchError(413),
    ])
      expect(noteSaveFailureText(failure)).toBe(noteSaveFailedText)
    expect(noteSaveFailedText).toBe(
      'Nie udało się zapisać notatki. Tekst został w polu.',
    )
    expect(noteSavedText).toBe('Notatka zapisana.')
  })
})
