/**
 * The schedule day of a moment: the Warsaw calendar day once the daily sync
 * time (HH:mm) has passed, otherwise the day before. Throws when the time is
 * not HH:mm.
 */
export function scheduleDay(now: Date, time: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('SOURCE_SYNC_TIME must be HH:mm')
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
