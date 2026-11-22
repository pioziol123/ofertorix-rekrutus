import { describe, expect, it } from 'vitest'
import {
  assignedAssessmentState,
  assignmentRefusalMessage,
  failedAssignmentMessage,
} from './assessment-state.ts'
import {
  matchingBulkTexts,
  matchingDetailLabels,
  matchingExchangeLink,
  matchingPending,
  matchingStateLabels,
} from './assessment-view.ts'

/** The texts T8-R04 removes from the offer views for an assignment. */
const removed = [
  'Czeka na budżet',
  'W kolejce',
  'Wymaga sprawdzenia',
  'Wysyłka lub koszt wymagają sprawdzenia',
  'Grupa czeka na budżet.',
]

describe('the state the offer views show for an assessment with an assignment (T8-AC04)', () => {
  // What Matching's own data holds for an assignment in each status: in
  // progress and needing attention have no outcome; a succeeded one has a
  // published assessment, or the message of Matching's own check; a failed
  // one the message of a failed assignment.
  const cases = [
    [
      'in progress',
      { assessment: false, message: false },
      'Ocena w toku',
      'Ocena w toku',
    ],
    [
      'needs attention',
      { assessment: false, message: false },
      'Ocena w toku',
      'Ocena w toku',
    ],
    [
      'succeeded and published',
      { assessment: true, message: false },
      'Ocena gotowa',
      'Ocena gotowa',
    ],
    [
      'succeeded, failed its own check',
      { assessment: false, message: true },
      'Ocena nie powiodła się',
      'Błąd oceny',
    ],
    [
      'failed',
      { assessment: false, message: true },
      'Ocena nie powiodła się',
      'Błąd oceny',
    ],
  ] as const
  it.each(cases)(
    'an assignment %s shows the texts of T8-R04 in the details and the list',
    (_status, saved, details, list) => {
      const state = assignedAssessmentState(saved)
      expect(matchingDetailLabels[state]).toBe(details)
      expect(matchingStateLabels[state]).toBe(list)
      expect(removed).not.toContain(matchingDetailLabels[state])
      expect(removed).not.toContain(matchingStateLabels[state])
    },
  )

  it('keeps the offer list refreshing only while the assessment is in progress', () => {
    expect(
      matchingPending.some(
        (s) =>
          s === assignedAssessmentState({ assessment: false, message: false }),
      ),
    ).toBe(true)
    for (const saved of [
      { assessment: true, message: false },
      { assessment: false, message: true },
    ])
      expect(
        matchingPending.some((s) => s === assignedAssessmentState(saved)),
      ).toBe(false)
  })

  it('gives a failed assignment a message without a cause, and an oversized one the input limit (sq2.9 ASM-2, T8-R05)', () => {
    expect(failedAssignmentMessage).not.toMatch(/\[AI:/)
    expect(assignmentRefusalMessage('request_too_large', 'single')).toBe(
      'Wejście przekracza skonfigurowany limit tokenów. Zwiększ limit lub skróć profil.',
    )
    expect(assignmentRefusalMessage('not_configured', 'group')).toBe(
      'Skonfiguruj model i cennik przed oceną ofert.',
    )
  })
})

describe('the texts of the bulk assessment in the offer list (T8-R04, sq2.9 ASM-2)', () => {
  it('names no shared batch, no Batch price list and no group waiting for the budget', () => {
    const texts = [
      matchingBulkTexts.reservation('0,265000'),
      matchingBulkTexts.notConfigured,
      matchingBulkTexts.notConfirmed,
      matchingBulkTexts.repeated,
      matchingBulkTexts.accepted([
        { reused: true, state: 'waiting_budget' },
        { reused: false, state: 'excluded' },
        { reused: false, state: 'running' },
      ]),
    ]
    for (const text of texts) {
      expect(text).not.toMatch(/Batch|parti|Grupa czeka na budżet/)
      for (const gone of removed) expect(text).not.toContain(gone)
    }
    expect(texts[4]).toBe(
      'Zlecenie zapisane: 3 ofert. Już oczekujące: 1. Niezgodne z wymaganiami: 1.',
    )
    expect(matchingBulkTexts.notConfigured).toBe(
      'Oceny AI wymagają konfiguracji modelu i cennika.',
    )
  })
})

describe('the link to the provider exchange of an assessment (T8-R07, sq2.9 ASM-2)', () => {
  it('names the exchange for an assessment with an assignment and keeps the batch archive for one of the old way', () => {
    expect(matchingExchangeLink(true)).toBe(
      'Pobierz zapis wymiany z dostawcą (JSON)',
    )
    expect(matchingExchangeLink(true)).not.toMatch(/parti/)
    expect(matchingExchangeLink(false)).toBe(
      'Pobierz archiwum całej partii (JSON)',
    )
  })
})
