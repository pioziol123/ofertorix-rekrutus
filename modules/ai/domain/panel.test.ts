import { describe, expect, it } from 'vitest'
import {
  assignmentStatuses,
  assignmentTypes,
} from '../assignments/assignment.ts'
import { operationCauses } from '../executors/outcome.ts'
import { operationStates, operationWaits } from './operation-state.ts'
import {
  actualCostText,
  amountText,
  assignmentStatusLabels,
  assignmentTypeLabels,
  failureReasonLabels,
  operationCauseLabels,
  operationCauseText,
  operationStateText,
  parametersText,
  timeLeftText,
} from './panel.ts'

describe('texts of the AI assignments panel (T11-AC05, T11-R06)', () => {
  it('names each assignment status', () => {
    expect(
      Object.fromEntries(
        assignmentStatuses.map((s) => [s, assignmentStatusLabels[s]]),
      ),
    ).toEqual({
      in_progress: 'W toku',
      needs_attention: 'Wymaga uwagi',
      succeeded: 'Udane',
      failed: 'Nieudane',
    })
  })

  it('names each operation state, a pending one by what it waits for', () => {
    expect(
      [
        { state: 'pending', waitsFor: 'budget' },
        { state: 'pending', waitsFor: 'executor' },
        { state: 'running', waitsFor: null },
        { state: 'succeeded', waitsFor: null },
        { state: 'failed', waitsFor: null },
        { state: 'uncertain', waitsFor: null },
      ].map((operation) =>
        operationStateText(
          operation as Parameters<typeof operationStateText>[0],
        ),
      ),
    ).toEqual([
      'Oczekuje na budżet',
      'Oczekuje na wykonawcę',
      'W toku',
      'Udana',
      'Nieudana',
      'Niepewna',
    ])
  })

  it('names each reason of a failed assignment', () => {
    expect(failureReasonLabels).toEqual({
      rejected: 'Odrzucone przez właściciela',
      time_limit: 'Przekroczony limit czasu',
      delivery_failed: 'Wynik nie odebrany',
    })
  })

  it('names each assignment type', () => {
    expect(
      Object.fromEntries(
        assignmentTypes.map((t) => [t, assignmentTypeLabels[t]]),
      ),
    ).toEqual({ single: 'Pojedyncza odpowiedź', agent: 'Sesja agenta' })
  })

  it('words every cause in Polish, a non-retryable one marked', () => {
    for (const cause of operationCauses)
      expect(operationCauseLabels[cause]).toMatch(/\S/)
    expect(operationCauseText({ cause: 'http', retryable: true })).toBe(
      'Limit zapytań lub błąd serwera dostawcy',
    )
    expect(
      operationCauseText({ cause: 'context_overflow', retryable: false }),
    ).toBe(
      'Dane wejściowe nie mieszczą się w kontekście modelu (błąd bez ponawiania)',
    )
    expect(operationCauseText({ cause: null, retryable: null })).toBeNull()
  })

  it('shows the time left, a passed limit, and nothing for a final assignment', () => {
    expect(timeLeftText(6 * 86400 + 5 * 3600 + 59)).toBe('6 d 5 h')
    expect(timeLeftText(2 * 3600 + 7 * 60)).toBe('2 h 7 min')
    expect(timeLeftText(30)).toBe('1 min')
    expect(timeLeftText(0)).toBe('Limit czasu minął')
    expect(timeLeftText(null)).toBeNull()
  })

  it('shows amounts in złoty and an unknown actual cost as unknown', () => {
    expect(amountText('0.265000')).toBe('0,265 zł')
    expect(amountText('12.000000')).toBe('12,00 zł')
    expect(actualCostText({ actualCost: null, actualCostUnknown: true })).toBe(
      'nieznany',
    )
    expect(actualCostText({ actualCost: null, actualCostUnknown: false })).toBe(
      '—',
    )
    expect(
      actualCostText({ actualCost: '0.000080', actualCostUnknown: false }),
    ).toBe('0,00008 zł')
  })

  it('shows the executor parameters on one line', () => {
    expect(
      parametersText({ model: 'gpt-6-luna', reasoningEffort: 'low' }),
    ).toBe('model: gpt-6-luna, reasoningEffort: low')
    expect(parametersText({})).toBe('—')
  })
})

describe('one owner of the operation states and waits (architecture rules, costs, item 4)', () => {
  it('words every operation state and every wait of the one closed list', () => {
    for (const wait of operationWaits)
      expect(operationStateText({ state: 'pending', waitsFor: wait })).toMatch(
        /\S/,
      )
    for (const state of operationStates.filter((s) => s !== 'pending'))
      expect(operationStateText({ state, waitsFor: null })).toMatch(/\S/)
  })

  it('keeps the closed lists equal to the database checks of the operation table', async () => {
    const { readFileSync } = await import('node:fs')
    const migration = readFileSync(
      new URL(
        '../../../migrations/1770000000027_ai_assignments.cjs',
        import.meta.url,
      ),
      'utf8',
    )
    const list = (column: string) =>
      /CHECK\(\w+ IN \(([^)]*)\)\)/
        .exec(
          migration.split('\n').find((line) => line.startsWith(` ${column} `))!,
        )![1]!
        .split(',')
        .map((value) => value.replaceAll("'", ''))
    expect(list('state')).toEqual([...operationStates])
    expect(list('waits_for')).toEqual([...operationWaits])
  })
})
