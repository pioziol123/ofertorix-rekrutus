import { describe, expect, it } from 'vitest'
import { scheduleDay } from './schedule-day.ts'

describe('Warsaw schedule slots', () => {
  it.each([
    ['2026-03-29T05:59:00Z', '2026-03-28'],
    ['2026-03-29T06:00:00Z', '2026-03-29'],
    ['2026-10-25T06:59:00Z', '2026-10-24'],
    ['2026-10-25T07:00:00Z', '2026-10-25'],
    ['2027-01-01T00:00:00Z', '2026-12-31'],
  ])('assigns %s to the latest due daily slot %s', (now, expected) => {
    expect(scheduleDay(new Date(now), '08:00')).toBe(expected)
  })
  it('rejects invalid configuration rather than silently changing the schedule', () => {
    expect(() => scheduleDay(new Date(), '24:00')).toThrow('HH:mm')
    expect(() => scheduleDay(new Date(), '8:00')).toThrow('HH:mm')
  })
})
