import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatDay, formatTime } from './index.ts'

const at = (iso: string) => new Date(iso)

describe('showing a moment in Polish time (T6-AC05)', () => {
  it.each([
    ['2026-07-04T08:05:00Z', '04.07.2026', '10:05'],
    ['2026-01-04T08:05:00Z', '04.01.2026', '09:05'],
    ['2026-12-31T22:59:00Z', '31.12.2026', '23:59'],
    ['2026-12-31T23:30:00Z', '01.01.2027', '00:30'],
    ['2028-02-29T11:00:00Z', '29.02.2028', '12:00'],
    ['2026-10-25T00:30:00Z', '25.10.2026', '02:30'],
    ['2026-10-25T01:30:00Z', '25.10.2026', '02:30'],
  ])('%s shows as %s %s', (moment, date, time) => {
    expect(formatDate(at(moment))).toBe(date)
    expect(formatTime(at(moment))).toBe(time)
    // ASSUMPTION(oferty-pracy-nq3.6/ASM-1): a date with time is "DD.MM.RRRR HH:mm".
    expect(formatDateTime(at(moment))).toBe(`${date} ${time}`)
  })
})

describe('"Dziś" and "Wczoraj" switch at Polish midnight (T6-AC05)', () => {
  it.each([
    // winter
    ['2026-01-15T10:00:00Z', '2026-01-14T23:00:00Z', 'Dziś'],
    ['2026-01-15T10:00:00Z', '2026-01-14T22:59:59Z', 'Wczoraj'],
    ['2026-01-15T10:00:00Z', '2026-01-13T23:00:00Z', 'Wczoraj'],
    // ASSUMPTION(oferty-pracy-nq3.6/ASM-1): an older day shows as its date.
    ['2026-01-15T10:00:00Z', '2026-01-13T22:59:59Z', '13.01.2026'],
    // summer, now just after Polish midnight
    ['2026-07-14T22:00:00Z', '2026-07-14T22:00:00Z', 'Dziś'],
    ['2026-07-14T22:00:00Z', '2026-07-14T21:59:59Z', 'Wczoraj'],
    // spring change day (29 March starts 23:00 UTC, 30 March 22:00 UTC)
    ['2026-03-29T21:59:59Z', '2026-03-28T23:00:00Z', 'Dziś'],
    ['2026-03-29T21:59:59Z', '2026-03-28T22:59:59Z', 'Wczoraj'],
    ['2026-03-29T21:59:59Z', '2026-03-27T23:00:00Z', 'Wczoraj'],
    ['2026-03-29T21:59:59Z', '2026-03-27T22:59:59Z', '27.03.2026'],
    ['2026-03-29T22:00:00Z', '2026-03-29T22:00:00Z', 'Dziś'],
    ['2026-03-29T22:00:00Z', '2026-03-29T21:59:59Z', 'Wczoraj'],
    ['2026-03-29T22:00:00Z', '2026-03-28T23:00:00Z', 'Wczoraj'],
    ['2026-03-29T22:00:00Z', '2026-03-28T22:59:59Z', '28.03.2026'],
    // autumn change day (25 October starts 22:00 UTC, 26 October 23:00 UTC)
    ['2026-10-25T22:59:59Z', '2026-10-24T22:00:00Z', 'Dziś'],
    ['2026-10-25T22:59:59Z', '2026-10-24T21:59:59Z', 'Wczoraj'],
    ['2026-10-25T23:00:00Z', '2026-10-25T23:00:00Z', 'Dziś'],
    ['2026-10-25T23:00:00Z', '2026-10-25T22:59:59Z', 'Wczoraj'],
    ['2026-10-25T23:00:00Z', '2026-10-24T22:00:00Z', 'Wczoraj'],
    ['2026-10-25T23:00:00Z', '2026-10-24T21:59:59Z', '24.10.2026'],
  ])('now %s: %s shows as %s', (now, moment, shown) => {
    expect(formatDay(at(moment), at(now))).toBe(shown)
  })
  it('compares with the current moment by default', () => {
    expect(formatDay(new Date())).toBe('Dziś')
  })
  it('throws naming an invalid moment', () => {
    expect(() => formatDate(new Date('x'))).toThrow('Invalid moment')
  })
})
