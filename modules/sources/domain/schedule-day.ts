import { addDays, formatTime, polishDay } from '../../../lib/time/index.ts'

/**
 * The schedule day of a moment: the Polish calendar day once the daily sync
 * time (HH:mm) has passed on the Polish wall clock, otherwise the day before.
 * Throws when the time is not HH:mm. Polish time comes from the time library
 * (T6-R09); the day is the one the earlier own formatting gave (T6-R10).
 */
export function scheduleDay(now: Date, time: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('SOURCE_SYNC_TIME must be HH:mm')
  // ASSUMPTION(oferty-pracy-nq3.6/ASM-1): the shown time is 24-hour HH:mm.
  if (formatTime(now) >= time) return polishDay(now)
  return polishDay(addDays(now, -1))
}
