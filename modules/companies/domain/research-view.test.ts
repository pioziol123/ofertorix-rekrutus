import { describe, expect, it } from 'vitest'
import { failedAssignmentMessage } from './research-outcome.ts'
import {
  assignedResearchState,
  researchActiveStates,
  researchStateLabels,
} from './research-view.ts'

/** The texts T9-R03 removes from the company view for an assignment. */
const removed = [
  'Czeka na dostępny budżet',
  'Czeka na wykonanie',
  'Przerwano — koszt wymaga sprawdzenia',
]

describe('the state the company view shows for research with an assignment (T9-AC03)', () => {
  // What Companies' own data holds for an assignment in each status: in
  // progress and needing attention have no outcome; a succeeded one has a
  // published report, or the message of Companies' own check; a failed one
  // the message of a failed assignment.
  const cases = [
    [
      'in progress',
      { report: false, message: false },
      'Trwa zbieranie źródeł i przygotowywanie raportu',
    ],
    [
      'needs attention',
      { report: false, message: false },
      'Trwa zbieranie źródeł i przygotowywanie raportu',
    ],
    ['succeeded and published', { report: true, message: false }, 'Gotowy'],
    [
      'succeeded, failed its own check',
      { report: false, message: true },
      'Nie udało się przygotować raportu',
    ],
    [
      'failed',
      { report: false, message: true },
      'Nie udało się przygotować raportu',
    ],
  ] as const

  it.each(cases)(
    'an assignment %s shows the text of T9-R03',
    (_status, saved, text) => {
      expect(researchStateLabels[assignedResearchState(saved)]).toBe(text)
    },
  )

  it('never reaches one of the removed texts for research with an assignment', () => {
    for (const [, saved] of cases) {
      const label = researchStateLabels[assignedResearchState(saved)]
      for (const text of removed) expect(label).not.toBe(text)
    }
  })

  it('keeps showing research in progress while its assignment is in progress or needs attention', () => {
    expect(
      researchActiveStates.includes(
        assignedResearchState({ report: false, message: false }),
      ),
    ).toBe(true)
    for (const saved of [
      { report: true, message: false },
      { report: false, message: true },
    ])
      expect(researchActiveStates.includes(assignedResearchState(saved))).toBe(
        false,
      )
  })

  it('gives a failed assignment the message of research ended without a report, without a cause or an amount and with the panel (sq2.10 ASM-3)', () => {
    expect(failedAssignmentMessage).toBe(
      'Nie udało się uzyskać kompletnego raportu z dowodami. Poprzedni raport pozostaje dostępny. Szczegóły są w panelu zleceń AI.',
    )
    expect(failedAssignmentMessage).not.toMatch(/\d|PLN|zł|rezerw|koszt/i)
  })
})
