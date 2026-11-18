import { describe, expect, it } from 'vitest'
import { executionCauses, executionStates } from '../../ai/index.ts'
import {
  endMessage,
  rejectionMessage,
  researchCostState,
  researchViewState,
} from './research-outcome.ts'

describe('what the owner sees of research, from the state and cause of its AI work alone (0mq.22 ASM-2)', () => {
  it('keeps the earlier messages of a search without cited material and of a report without sourced findings', () => {
    expect(endMessage({ state: 'failed', cause: 'no_content' })).toBe(
      'Wyszukiwanie nie dostarczyło materiałów z poprawnymi cytowaniami. Nie przygotowano raportu ani nie uruchomiono syntezy. Ponowienie wymaga nowego żądania i kosztu.',
    )
    expect(rejectionMessage('no_sourced_findings')).toBe(
      'Raport nie zawiera żadnych ustaleń popartych źródłami. Nie uznano go za gotowy research. Poprzedni raport pozostaje dostępny. Ponowienie wymaga nowego żądania i kosztu.',
    )
    expect(rejectionMessage('invalid_report')).toBe(
      'Nie udało się uzyskać kompletnego raportu z dowodami (validation). Poprzedni raport pozostaje dostępny.',
    )
  })
  it('names an HTTP error without the provider status, and keeps the previous report in every other end', () => {
    expect(endMessage({ state: 'uncertain', cause: 'http' })).toBe(
      'Usługa researchu zwróciła błąd HTTP. Koszt pozostaje zarezerwowany.',
    )
    for (const cause of executionCauses)
      if (cause !== 'http' && cause !== 'no_content')
        for (const state of ['failed', 'uncertain'] as const)
          expect(endMessage({ state, cause })).toBe(
            'Nie udało się uzyskać kompletnego raportu z dowodami. Poprzedni raport pozostaje dostępny.',
          )
  })
  it('shows every state of the AI work as one of the states research had', () => {
    expect(
      Object.fromEntries(
        executionStates.map((state) => [state, researchViewState({ state })]),
      ),
    ).toEqual({
      waiting_budget: 'waiting_budget',
      queued: 'queued',
      running: 'running',
      delivering: 'running',
      completed: 'completed',
      rejected: 'failed',
      failed: 'failed',
      retried: 'failed',
      uncertain: 'unknown',
    })
  })
  it('shows the cost as reserved while the work runs, then settled or unknown', () => {
    const cost = (actual: string | null) => ({ reserved: '0.5', actual })
    const at = new Date()
    expect(
      researchCostState({
        state: 'waiting_budget',
        cost: cost(null),
        finishedAt: null,
      }),
    ).toBeNull()
    expect(
      researchCostState({ state: 'running', cost: cost(null), finishedAt: null }),
    ).toBe('reserved')
    expect(
      researchCostState({ state: 'failed', cost: cost('0.1'), finishedAt: at }),
    ).toBe('settled')
    expect(
      researchCostState({ state: 'uncertain', cost: cost(null), finishedAt: at }),
    ).toBe('unknown')
  })
})
