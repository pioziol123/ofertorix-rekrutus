/**
 * The time library: the one shared way to answer questions about Polish
 * time (T6). Moments go in and out as `Date` values (UTC instants); calendar
 * days are `YYYY-MM-DD` and months `YYYY-MM` text. The zone is fixed inside
 * the library and no Temporal value leaves it. Functions are pure; one that
 * needs the current moment takes it as an argument defaulting to now.
 * It has no server-only dependency, so pages in the browser use it too.
 * Rules: docs/architecture/moduly-i-zasady-kodu.md#polish-time
 */
export { dayStart, monthStart, polishDay, polishMonth } from './calendar.ts'
export { addDays, addHours, addMinutes, addMonths } from './arithmetic.ts'
export { formatDate, formatDateTime, formatDay, formatTime } from './display.ts'
