import { defineJob } from '../../../lib/queues/index.ts'

/**
 * What a test job does, read by the test handlers:
 * - `ok`: waits `ms` and ends normally;
 * - `throw`: throws `boom <id>`;
 * - `busy`: blocks its process for `ms`, so it stops reporting;
 * - `resume`: waits `ms` on its first attempt and ends at once on a later one.
 */
export type TestJob = {
  id: string
  action: 'ok' | 'throw' | 'busy' | 'resume'
  ms?: number
  group?: string
  /** The failure handler throws on its first call. */
  failureThrowsOnce?: boolean
}

/** No key; 2 attempts in the test configuration. */
export const plainJob = defineJob<TestJob>({ queue: 'wt-plain' })
/** No key; the queue mechanism's defaults. */
export const secondJob = defineJob<TestJob>({ queue: 'wt-second' })
/** 2 attempts of 3 s. */
export const limitedJob = defineJob<TestJob>({ queue: 'wt-limited' })
/** 1 attempt of an hour. */
export const singleJob = defineJob<TestJob>({ queue: 'wt-single' })
export const exclusiveJob = defineJob<TestJob>({
  queue: 'wt-exclusive',
  key: { mode: 'exclusivity', field: 'group' },
})
export const deduplicatedJob = defineJob<TestJob>({
  queue: 'wt-dedup',
  key: { mode: 'deduplication', field: 'group' },
})
/** Its queue exists, but no module plugin registers a handler for it. */
export const orphanJob = defineJob<TestJob>({ queue: 'wt-orphan' })

export const registeredDefinitions = [
  plainJob,
  secondJob,
  limitedJob,
  singleJob,
  exclusiveJob,
  deduplicatedJob,
]
export const allDefinitions = [...registeredDefinitions, orphanJob]
