import { scheduleDay } from './domain/schedule-day.ts'

/** The configured daily sync time (SOURCE_SYNC_TIME, HH:mm, default 08:00). */
export const scheduleTime = () => process.env.SOURCE_SYNC_TIME ?? '08:00'

/**
 * The schedule day of a moment under the configured sync time. Throws when
 * the configured time is not HH:mm, so the worker checks it at start.
 */
export const currentScheduleDay = (now = new Date()) =>
  scheduleDay(now, scheduleTime())
