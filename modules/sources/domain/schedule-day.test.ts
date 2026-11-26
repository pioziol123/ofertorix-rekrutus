import { describe, expect, it } from 'vitest'
import { scheduleDay } from './schedule-day.ts'

/**
 * The schedule day as the Sources module computed it before the time
 * library (commit 3af7f04), kept here only as the reference of T6-AC07.
 */
function scheduleDayBeforeTimeLibrary(now: Date, time: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  const today = `${part('year')}-${part('month')}-${part('day')}`
  if (`${part('hour')}:${part('minute')}` >= time) return today
  return new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10)
}

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

// ASSUMPTION(oferty-pracy-nq3.6/ASM-1): the schedule day compares the shown 24-hour HH:mm time.
describe('the schedule day is kept after the move to the time library (T6-AC07)', () => {
  // The default sync time, times inside the spring gap and the autumn
  // overlap, and both ends of the day.
  it.each(['08:00', '02:30', '02:00', '03:00', '00:00', '23:59'])(
    'gives the same day as before for every 15 minutes of 2026 at %s',
    (time) => {
      const from = Date.parse('2026-01-01T00:00:00Z')
      const to = Date.parse('2027-01-01T00:00:00Z')
      const differences: string[] = []
      let checked = 0
      for (let t = from; t < to; t += 15 * 60_000) {
        const now = new Date(t)
        const before = scheduleDayBeforeTimeLibrary(now, time)
        const after = scheduleDay(now, time)
        if (before !== after)
          differences.push(`${now.toISOString()}: ${before} → ${after}`)
        checked++
      }
      expect(checked).toBe(365 * 96)
      expect(differences).toEqual([])
    },
    60_000,
  )
  it('covers both time-change nights minute by minute', () => {
    for (const night of ['2026-03-28T22:00:00Z', '2026-10-24T21:00:00Z']) {
      const from = Date.parse(night)
      for (let t = from; t < from + 6 * 3_600_000; t += 60_000) {
        const now = new Date(t)
        for (const time of ['02:00', '02:30', '02:59', '03:00', '08:00'])
          expect(scheduleDay(now, time)).toBe(
            scheduleDayBeforeTimeLibrary(now, time),
          )
      }
    }
  })
})
