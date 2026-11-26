import { polishDay } from './calendar.ts'
import { addDays } from './arithmetic.ts'
import { inPoland } from './polish-zone.ts'

const pad = (value: number) => String(value).padStart(2, '0')

/** A UTC moment as its Polish date `DD.MM.RRRR` (T6-R08). */
export function formatDate(moment: Date): string {
  const time = inPoland(moment)
  return `${pad(time.day)}.${pad(time.month)}.${String(time.year).padStart(4, '0')}`
}

// ASSUMPTION(oferty-pracy-nq3.6/ASM-1): a time shows as `HH:mm` (24-hour, as
// the mock-up shows it) and a date with time as `DD.MM.RRRR HH:mm`.
/** A UTC moment as its Polish time `HH:mm` (T6-R08). */
export function formatTime(moment: Date): string {
  const time = inPoland(moment)
  return `${pad(time.hour)}:${pad(time.minute)}`
}

// ASSUMPTION(oferty-pracy-nq3.6/ASM-1): date with time is `DD.MM.RRRR HH:mm`.
/** A UTC moment as its Polish date and time `DD.MM.RRRR HH:mm` (T6-R08). */
export const formatDateTime = (moment: Date): string =>
  `${formatDate(moment)} ${formatTime(moment)}`

/**
 * A UTC moment's Polish day: "Dziś" when it is the Polish day of `now`,
 * "Wczoraj" when it is the day before, otherwise `DD.MM.RRRR` (T6-R08).
 */
// ASSUMPTION(oferty-pracy-nq3.6/ASM-1): any other day shows as its date.
export function formatDay(moment: Date, now: Date = new Date()): string {
  const day = polishDay(moment)
  if (day === polishDay(now)) return 'Dziś'
  if (day === polishDay(addDays(now, -1))) return 'Wczoraj'
  return formatDate(moment)
}
