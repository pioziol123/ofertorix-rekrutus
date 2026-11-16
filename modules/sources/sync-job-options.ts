/**
 * Queue options of every sync run job (F2-13): the worker refreshes the
 * heartbeat while it executes the run; a lost worker misses it and the
 * queue retries the job, whose next attempt continues the same run, at most
 * twice. An attempt may take at most an hour.
 */
export const syncJobOptions = {
  heartbeatSeconds: 30,
  retryLimit: 2,
  expireInSeconds: 3600,
} as const
