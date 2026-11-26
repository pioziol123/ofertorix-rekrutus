import { describe, expect, it } from 'vitest'
import { addHours } from '../../../lib/time/index.ts'
import {
  healthReasons,
  newWindowStart,
  sourceWarnings,
  type SourceRunFacts,
} from './source-health.ts'

const now = new Date('2026-11-26T12:00:00Z')
const facts = (
  source: string,
  options: Partial<SourceRunFacts> = {},
): SourceRunFacts => ({
  source,
  name: source,
  latestCompleteAt: addHours(now, -1),
  latestFinished: ['complete'],
  ...options,
})

describe('source health rules (T4)', () => {
  it('lists a source without a complete sync for more than 72 hours or ever, not one within 72 hours (T4-R04)', () => {
    expect(
      healthReasons(facts('a', { latestCompleteAt: addHours(now, -73) }), now),
    ).toEqual(['no-complete'])
    expect(healthReasons(facts('a', { latestCompleteAt: null }), now)).toEqual([
      'no-complete',
    ])
    expect(
      healthReasons(facts('a', { latestCompleteAt: addHours(now, -71) }), now),
    ).toEqual([])
    expect(
      healthReasons(facts('a', { latestCompleteAt: addHours(now, -72) }), now),
    ).toEqual([])
  })

  it('lists three failed syncs in a row; an incomplete one or fewer than three breaks the run (T4-R05)', () => {
    const reasons = (latestFinished: SourceRunFacts['latestFinished']) =>
      healthReasons(facts('a', { latestFinished }), now)
    expect(reasons(['failed', 'failed', 'failed'])).toEqual(['failing'])
    expect(reasons(['failed', 'partial', 'failed'])).toEqual([])
    expect(reasons(['failed', 'failed'])).toEqual([])
  })

  it('gives a source meeting both conditions both reasons (T4-R05)', () => {
    expect(
      healthReasons(
        facts('a', {
          latestCompleteAt: null,
          latestFinished: ['failed', 'failed', 'failed'],
        }),
        now,
      ),
    ).toEqual(['no-complete', 'failing'])
  })

  it('counts sources whose latest finished sync is incomplete or failed and lists warnings alphabetically by name (T4-R02, R06)', () => {
    const result = sourceWarnings(
      [
        facts('z', { name: 'Zeta', latestCompleteAt: null }),
        facts('a', { name: 'Alfa', latestFinished: ['failed', 'complete'] }),
        facts('p', { name: 'Pracuj', latestFinished: ['partial'] }),
        facts('o', { name: 'Ćma', latestCompleteAt: null, latestFinished: [] }),
        facts('b', { name: 'Beta', latestFinished: ['complete', 'failed'] }),
      ],
      now,
    )
    expect(result.latestProblem).toBe(2)
    expect(result.warnings.map((warning) => warning.name)).toEqual([
      'Ćma',
      'Zeta',
    ])
    expect(result.warnings[0]).toEqual({
      source: 'o',
      name: 'Ćma',
      latestCompleteAt: null,
      reasons: ['no-complete'],
    })
  })

  it('counts new ads from 24 hours before the read (T4-R03)', () => {
    expect(newWindowStart(now)).toEqual(new Date('2026-11-25T12:00:00Z'))
  })
})
