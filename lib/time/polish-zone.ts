import { Temporal } from 'temporal-polyfill'

/**
 * The application's only time zone (T6-R01). Nothing configures it and no
 * function of the time library takes a zone. Internal to the library: no
 * Temporal value and no zone leaves `lib/time`.
 */
const POLISH_ZONE = 'Europe/Warsaw'

/** The Polish wall-clock reading of a UTC moment. Throws on an invalid Date. */
export function inPoland(moment: Date): Temporal.ZonedDateTime {
  if (!(moment instanceof Date) || Number.isNaN(moment.getTime()))
    throw new Error(`Invalid moment: ${String(moment)}`)
  return Temporal.Instant.fromEpochMilliseconds(
    moment.getTime(),
  ).toZonedDateTimeISO(POLISH_ZONE)
}

/** The UTC moment of a Polish wall-clock reading. */
export const toMoment = (time: Temporal.ZonedDateTime): Date =>
  new Date(time.epochMilliseconds)

/** The UTC moment a Polish calendar date starts. */
export const startOf = (date: Temporal.PlainDate): Date =>
  toMoment(date.toZonedDateTime({ timeZone: POLISH_ZONE }))

/** A whole number of days, months, hours or minutes; throws otherwise. */
export function checkCount(count: number, unit: string): number {
  if (!Number.isInteger(count))
    throw new Error(`Invalid number of ${unit}: ${String(count)}`)
  return count
}
