import { checkCount, inPoland, toMoment } from './polish-zone.ts'

/*
 * Calendar arithmetic keeps the Polish wall-clock time (T6-R04). A result in
 * the spring gap moves forward by the gap (T6-R05) and one in the autumn
 * overlap is the earlier occurrence (T6-R06): Temporal's `compatible`
 * disambiguation. A day the target month lacks becomes its last day
 * (T6-R07): `constrain` overflow. Negative counts subtract.
 */
const calendar = {
  overflow: 'constrain',
  disambiguation: 'compatible',
} as const

/** `moment` plus `days` Polish calendar days, at the same wall-clock time. */
export const addDays = (moment: Date, days: number): Date =>
  toMoment(inPoland(moment).add({ days: checkCount(days, 'days') }, calendar))

/** `moment` plus `months` Polish calendar months, at the same wall-clock time. */
export const addMonths = (moment: Date, months: number): Date =>
  toMoment(
    inPoland(moment).add({ months: checkCount(months, 'months') }, calendar),
  )

/** `moment` plus `hours` hours of elapsed time, whatever the wall clock does. */
export const addHours = (moment: Date, hours: number): Date =>
  toMoment(inPoland(moment).add({ hours: checkCount(hours, 'hours') }))

/** `moment` plus `minutes` minutes of elapsed time, whatever the wall clock does. */
export const addMinutes = (moment: Date, minutes: number): Date =>
  toMoment(inPoland(moment).add({ minutes: checkCount(minutes, 'minutes') }))
