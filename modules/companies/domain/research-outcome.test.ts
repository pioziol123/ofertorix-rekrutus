import { describe, expect, it } from 'vitest'
import { rejectionMessage } from './research-outcome.ts'

describe('what the owner sees of a report Companies did not accept (0mq.22 ASM-2)', () => {
  it('keeps the earlier messages of a report without sourced findings and of an invalid report', () => {
    expect(rejectionMessage('no_sourced_findings')).toBe(
      'Raport nie zawiera żadnych ustaleń popartych źródłami. Nie uznano go za gotowy research. Poprzedni raport pozostaje dostępny. Ponowienie wymaga nowego żądania i kosztu.',
    )
    expect(rejectionMessage('invalid_report')).toBe(
      'Nie udało się uzyskać kompletnego raportu z dowodami (validation). Poprzedni raport pozostaje dostępny.',
    )
  })
})
