import { describe, expect, it } from 'vitest'
import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  formatDateTime,
} from './index.ts'

const at = (iso: string) => new Date(iso)
const HOUR = 3_600_000
const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / HOUR

// ASSUMPTION(oferty-pracy-nq3.6/ASM-1): the shown format is "DD.MM.RRRR HH:mm".
describe('calendar days keep the Polish wall-clock time (T6-AC02)', () => {
  it.each([
    // spring change: noon CET = 11:00 UTC, noon CEST = 10:00 UTC
    ['2026-03-25T11:00:00Z', 7, '2026-04-01T10:00:00.000Z', 167],
    ['2026-04-01T10:00:00Z', -7, '2026-03-25T11:00:00.000Z', -167],
    // autumn change: noon CEST = 10:00 UTC, noon CET = 11:00 UTC
    ['2026-10-21T10:00:00Z', 7, '2026-10-28T11:00:00.000Z', 169],
    ['2026-10-28T11:00:00Z', -7, '2026-10-21T10:00:00.000Z', -169],
  ])('noon %s plus %i days is noon %s', (from, days, to, hours) => {
    const result = addDays(at(from), days)
    expect(result.toISOString()).toBe(to)
    expect(formatDateTime(result)).toMatch(/ 12:00$/)
    expect(hoursBetween(at(from), result)).toBe(hours)
  })
})

// ASSUMPTION(oferty-pracy-nq3.6/ASM-1): the shown format is "DD.MM.RRRR HH:mm".
describe('hours and minutes are exact elapsed time (T6-AC02)', () => {
  it.each([
    ['2026-03-28T11:00:00Z', '2026-03-29T11:00:00.000Z', '29.03.2026 13:00'],
    ['2026-10-24T10:00:00Z', '2026-10-25T10:00:00.000Z', '25.10.2026 11:00'],
  ])('%s plus 24 hours across a change is %s', (from, to, shown) => {
    const result = addHours(at(from), 24)
    expect(result.toISOString()).toBe(to)
    expect(hoursBetween(at(from), result)).toBe(24)
    expect(formatDateTime(result)).toBe(shown)
  })
  it('counts minutes across the spring gap as elapsed time', () => {
    // 01:30 CET plus 60 minutes is 03:30 CEST
    const result = addMinutes(at('2026-03-29T00:30:00Z'), 60)
    expect(result.toISOString()).toBe('2026-03-29T01:30:00.000Z')
    expect(formatDateTime(result)).toBe('29.03.2026 03:30')
    expect(addHours(result, -72).toISOString()).toBe('2026-03-26T01:30:00.000Z')
  })
})

// ASSUMPTION(oferty-pracy-nq3.6/ASM-1): the shown format is "DD.MM.RRRR HH:mm".
describe('a time the change skips or repeats (T6-AC03)', () => {
  it.each([
    // 02:30 on 28 March (CET) plus one day: 02:30 does not exist on 29 March
    ['2026-03-28T01:30:00Z', 1],
    // 02:30 on 5 April (CEST) minus 7 days
    ['2026-04-05T00:30:00Z', -7],
  ])(
    '02:30 on the spring change day becomes 03:30 (from %s, %i days)',
    (from, days) => {
      const result = addDays(at(from), days)
      expect(formatDateTime(result)).toBe('29.03.2026 03:30')
      expect(result.toISOString()).toBe('2026-03-29T01:30:00.000Z')
    },
  )
  it.each([
    // 02:30 on 24 October (CEST) plus one day
    ['2026-10-24T00:30:00Z', 1],
    // 02:30 on 1 November (CET) minus 7 days
    ['2026-11-01T01:30:00Z', -7],
  ])(
    '02:30 on the autumn change day is the earlier one (from %s, %i days)',
    (from, days) => {
      const result = addDays(at(from), days)
      expect(formatDateTime(result)).toBe('25.10.2026 02:30')
      // the earlier 02:30 is still summer time, 00:30 UTC; the later is 01:30 UTC
      expect(result.toISOString()).toBe('2026-10-25T00:30:00.000Z')
    },
  )
})

describe('month ends (T6-AC04)', () => {
  it.each([
    ['2026-01-31T11:00:00Z', 1, '2026-02-28T11:00:00.000Z'],
    ['2028-01-31T11:00:00Z', 1, '2028-02-29T11:00:00.000Z'],
    ['2026-03-31T10:00:00Z', -1, '2026-02-28T11:00:00.000Z'],
    ['2028-02-29T11:00:00Z', 12, '2029-02-28T11:00:00.000Z'],
  ])('noon %s plus %i months is noon %s', (from, months, to) => {
    expect(addMonths(at(from), months).toISOString()).toBe(to)
  })
})

describe('malformed input', () => {
  it('throws naming an invalid moment or count', () => {
    expect(() => addDays(new Date('x'), 1)).toThrow('Invalid moment')
    expect(() => addMonths(at('2026-01-01T00:00:00Z'), 0.5)).toThrow('0.5')
    expect(() => addHours(at('2026-01-01T00:00:00Z'), Infinity)).toThrow(
      'Infinity',
    )
  })
})
