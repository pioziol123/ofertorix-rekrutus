import { describe, expect, it } from 'vitest'
import { importStatusLabel, importStatusLabels } from './import-status.ts'
import { failedAssignmentMessage } from './proposal-preparation.ts'
import { ProposalRejected, readProposal } from './proposal-result.ts'

describe('T7-AC03, T10-AC08: what the owner sees of a preparation', () => {
  const quoteMessage =
    'Nie udało się potwierdzić cytatów AI w tekście CV. Profil pozostaje bez zmian.'
  const formatMessage =
    'Odpowiedź AI ma nieprawidłowy format danych. Profil pozostaje bez zmian.'
  const failedMessage =
    'Nie udało się przygotować propozycji. Profil pozostaje bez zmian. Szczegóły są w panelu zleceń AI.'
  const removedLabels = [
    'Czeka na przygotowanie propozycji',
    'Czeka na środki w budżecie',
  ]
  /** The label and message the page shows for what the import stores. */
  const shown = (stored: { status: string; error: string | null }) => ({
    label: importStatusLabel(stored.status),
    message: stored.error,
  })
  const cases = [
    // The receiver has not ended the preparation: the assignment is in
    // progress or needs attention.
    [{ status: 'ai_running', error: null }, 'Przygotowywanie propozycji', null],
    [{ status: 'proposal', error: null }, 'Propozycja gotowa', null],
    [
      { status: 'needs_attention', error: failedAssignmentMessage },
      'Wymaga sprawdzenia',
      failedMessage,
    ],
    [
      { status: 'needs_attention', error: quoteMessage },
      'Wymaga sprawdzenia',
      quoteMessage,
    ],
    [
      { status: 'needs_attention', error: formatMessage },
      'Wymaga sprawdzenia',
      formatMessage,
    ],
  ] as const
  it.each(cases)(
    'shows the texts of T7-R04 from the import alone: %j',
    (stored, label, message) => {
      expect(shown(stored)).toEqual({ label, message })
    },
  )
  it('has no label of the old way any more', () => {
    for (const label of removedLabels)
      expect(Object.values(importStatusLabels)).not.toContain(label)
  })
  it('keeps the label of a missing configuration (T1-R08)', () => {
    expect(importStatusLabel('needs_configuration')).toBe(
      'Wymaga konfiguracji AI',
    )
  })
})

describe('safe proposal diagnostics', () => {
  const marker = 'PRIVATE_CV_SENTINEL'
  const valid = { summary: null, skills: [], experience: [] }
  it.each([
    [{ ...valid, unexpected: marker }, 'format danych'],
    [
      {
        ...valid,
        skills: [{ name: marker, description: marker, evidence: marker }],
      },
      'potwierdzić cytatów',
    ],
  ])(
    'rejects the result without leaking model or CV content',
    (value, message) => {
      let caught: unknown
      try {
        readProposal(value, 'Different reviewed professional text')
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(ProposalRejected)
      expect((caught as Error).message).toContain(message)
      expect((caught as Error).message).not.toContain(marker)
    },
  )
})
