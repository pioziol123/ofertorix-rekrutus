import { checkCount, inPoland, startOf } from './polish-zone.ts'

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

/** The Polish calendar day of a UTC moment, as `YYYY-MM-DD` (T6-R03). */
export function polishDay(moment: Date): string {
  const time = inPoland(moment)
  return `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}`
}

/** The Polish month of a UTC moment, as `YYYY-MM` (T6-R03). */
export function polishMonth(moment: Date): string {
  const time = inPoland(moment)
  return `${pad(time.year, 4)}-${pad(time.month)}`
}

/**
 * The UTC moment the Polish day containing `moment` starts, or the day
 * `daysBack` days before it (T6-R03).
 */
export function dayStart(moment: Date, daysBack = 0): Date {
  checkCount(daysBack, 'days')
  return startOf(inPoland(moment).toPlainDate().subtract({ days: daysBack }))
}

/**
 * The UTC moment the Polish month containing `moment` starts, or the month
 * `monthsBack` months before it (T6-R03).
 */
export function monthStart(moment: Date, monthsBack = 0): Date {
  checkCount(monthsBack, 'months')
  return startOf(
    inPoland(moment)
      .toPlainDate()
      .with({ day: 1 })
      .subtract({ months: monthsBack }),
  )
}
