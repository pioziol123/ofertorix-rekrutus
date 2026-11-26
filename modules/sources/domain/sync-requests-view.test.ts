import { describe, expect, it } from 'vitest'
import { countOutcomes, panelScope, panelScopeRequest } from './panel-syncs.ts'
import {
  defaultFilters,
  historyAddress,
  type CatalogSource,
  type SyncHistoryQuery,
} from './sync-history.ts'
import { syncRunStatuses } from './run-states.ts'
import {
  afterRequestQuery,
  canConfirm,
  dialogSources,
  initiallyChecked,
  listReadFor,
  requestFailure,
  requestSummary,
  rerunOffered,
  rerunOutcome,
  unansweredRequest,
} from './sync-requests-view.ts'

const source = (
  id: string,
  options: Partial<CatalogSource> = {},
): CatalogSource => ({
  id,
  name: id.toUpperCase(),
  enabled: true,
  marksUnavailable: false,
  unfinishedRun: null,
  ...options,
})

const catalogue = [
  source('solid-jobs'),
  source('himalayas', { unfinishedRun: 'run-h' }),
  source('bayt', { enabled: false }),
  source('indeed'),
  // Disabled while its last sync is still unfinished.
  source('glassdoor', { enabled: false, unfinishedRun: 'run-g' }),
]

describe('the dialog of the sources to sync (T3-R01, R02)', () => {
  it('opens "Synchronizuj wszystkie" with every enabled source without an unfinished sync checked (T3-AC01)', () => {
    const sources = dialogSources(catalogue)
    expect(sources.map((s) => s.id)).toEqual(catalogue.map((s) => s.id))
    expect(initiallyChecked(sources, 'all')).toEqual(['solid-jobs', 'indeed'])
  })

  it('opens "Wybierz źródła" with none checked, and "Synchronizuj" is inactive until one is (T3-AC01)', () => {
    const sources = dialogSources(catalogue)
    const checked = initiallyChecked(sources, 'none')
    expect(checked).toEqual([])
    expect(canConfirm(checked)).toBe(false)
    expect(canConfirm(['indeed'])).toBe(true)
  })

  it('marks a source with an unfinished sync "już trwa" and a disabled one "Wyłączone w konfiguracji aplikacji", neither checkable (T3-AC02)', () => {
    const byId = Object.fromEntries(
      dialogSources(catalogue).map((s) => [s.id, s]),
    )
    expect(byId.himalayas).toMatchObject({
      name: 'HIMALAYAS',
      checkable: false,
      note: 'już trwa',
    })
    expect(byId.bayt).toMatchObject({
      checkable: false,
      note: 'Wyłączone w konfiguracji aplikacji',
    })
    expect(byId.glassdoor).toMatchObject({
      checkable: false,
      note: 'Wyłączone w konfiguracji aplikacji',
    })
    expect(byId['solid-jobs']).toMatchObject({ checkable: true, note: null })
  })
})

describe('the fixed panel scope (T3-R03)', () => {
  it('is PHP · senior, given to a Polish portal as its scope input and to no other source', () => {
    expect(panelScope).toEqual({ technology: 'PHP', seniority: 'senior' })
    expect(panelScopeRequest('bulldogjob')).toEqual({
      source: 'bulldogjob',
      technology: 'PHP',
      seniority: 'senior',
    })
    for (const other of ['solid-jobs', 'himalayas', 'indeed'])
      expect(panelScopeRequest(other)).toBeUndefined()
  })
})

describe('after confirming (T3-R06, R07)', () => {
  const result = (
    ...outcomes: (
      'requested' | 'already-running' | 'skipped' | 'not-requested'
    )[]
  ) =>
    countOutcomes(
      outcomes.map((outcome, i) =>
        outcome === 'requested' || outcome === 'already-running'
          ? { source: `s${i}`, outcome, runId: `r${i}` }
          : { source: `s${i}`, outcome },
      ),
    )

  it('shows the summary of the requested, already running and skipped sources (T3-AC07)', () => {
    const counts = result(
      'requested',
      'requested',
      'already-running',
      'skipped',
      'skipped',
      'skipped',
    )
    expect(requestSummary(counts)).toBe(
      'Zlecono: 2 · już trwało: 1 · pominięto: 3',
    )
    expect(requestFailure(counts)).toBeNull()
  })

  it('says how many sources could not be requested (T3-AC06)', () => {
    const counts = result('requested', 'not-requested', 'requested')
    expect(requestFailure(counts)).toBe(
      'Nie udało się zlecić synchronizacji: 1.',
    )
    expect(requestSummary(counts)).toBe(
      'Zlecono: 2 · już trwało: 0 · pominięto: 0',
    )
  })

  // ASSUMPTION(oferty-pracy-nq3.3/ASM-2): a request without an answer counts every sent source as not requested.
  it('counts every sent source as not requested when the request gets no answer (ASM-2)', () => {
    const unanswered = unansweredRequest(['indeed', 'bayt', 'indeed'])
    expect(unanswered.outcomes).toEqual([
      { source: 'indeed', outcome: 'not-requested' },
      { source: 'bayt', outcome: 'not-requested' },
    ])
    expect(requestFailure(unanswered.counts)).toBe(
      'Nie udało się zlecić synchronizacji: 2.',
    )
  })

  const query = (change: Partial<SyncHistoryQuery> = {}): SyncHistoryQuery => ({
    ...defaultFilters,
    page: 1,
    size: 20,
    ...change,
  })

  it('reads the list with the state filter queued and running and the other filters at defaults, on page 1 (T3-AC07)', () => {
    const filtered = query({
      sources: ['indeed'],
      states: ['failed'],
      trigger: 'scheduled',
      period: 'all',
      page: 4,
      size: 50,
    })
    expect(afterRequestQuery(filtered)).toEqual({
      sources: [],
      states: ['queued', 'running'],
      trigger: null,
      period: '7d',
      page: 1,
      size: 50,
    })
  })

  it('reads the list once: through the navigation when the address changes, by a read of its own when it does not (T3-AC07)', () => {
    const next = afterRequestQuery(query())
    // From the default address the navigation reads the list.
    expect(listReadFor({}, next, null)).toBe('navigation')
    // Already showing that list: the address stays, so the page reads it.
    expect(listReadFor({ state: 'queued,running' }, next, null)).toBe('refresh')
    expect(
      listReadFor({ state: ['queued', 'running'], sync: 'a' }, next, 'a'),
    ).toBe('refresh')
    // Opening another sync changes the address, and so reads the list.
    expect(listReadFor({ state: 'queued,running' }, next, 'b')).toBe(
      'navigation',
    )
    expect(
      listReadFor({ state: 'queued,running', page: '3' }, next, null),
    ).toBe('navigation')
    expect(historyAddress(next)).toEqual({ state: 'queued,running' })
  })
})

describe('"Uruchom ponownie" (T3-R08)', () => {
  it('is offered for a finished sync of an enabled source only (T3-AC08)', () => {
    for (const status of syncRunStatuses)
      expect(
        rerunOffered({ status, source: 'solid-jobs' }, catalogue),
        status,
      ).toBe(['complete', 'partial', 'failed'].includes(status))
    expect(
      rerunOffered({ status: 'complete', source: 'bayt' }, catalogue),
    ).toBe(false)
    expect(
      rerunOffered({ status: 'failed', source: 'not-in-catalogue' }, catalogue),
    ).toBe(false)
    // A source with an unfinished sync still offers it; the answer opens that sync.
    expect(
      rerunOffered({ status: 'complete', source: 'himalayas' }, catalogue),
    ).toBe(true)
  })

  it('opens the new sync, or the source’s unfinished one (T3-AC08)', () => {
    const answer = (outcome: {
      outcome: 'requested' | 'already-running'
      runId: string
    }) => {
      const outcomes = [{ source: 'solid-jobs', ...outcome }]
      return { outcomes, counts: countOutcomes(outcomes) }
    }
    expect(
      rerunOutcome(answer({ outcome: 'requested', runId: 'new' })),
    ).toEqual({ open: 'new' })
    expect(
      rerunOutcome(answer({ outcome: 'already-running', runId: 'running' })),
    ).toEqual({ open: 'running' })
  })

  // ASSUMPTION(oferty-pracy-nq3.3/ASM-1): a rerun that requested nothing keeps the details and shows the dialog's summary and message.
  it('opens nothing and shows the summary and the message of a confirmation when nothing was requested (ASM-1)', () => {
    const skipped = [{ source: 'solid-jobs', outcome: 'skipped' as const }]
    expect(
      rerunOutcome({ outcomes: skipped, counts: countOutcomes(skipped) }),
    ).toEqual({
      summary: 'Zlecono: 0 · już trwało: 0 · pominięto: 1',
      failure: null,
    })
    expect(rerunOutcome(unansweredRequest(['solid-jobs']))).toEqual({
      summary: 'Zlecono: 0 · już trwało: 0 · pominięto: 0',
      failure: 'Nie udało się zlecić synchronizacji: 1.',
    })
  })
})
