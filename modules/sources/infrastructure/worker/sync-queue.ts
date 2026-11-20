import { defineJob } from '../../../../lib/queues/index.ts'

/** The data of a request to carry out a sync run. */
export type SyncJobData = { runId: string; source: string }

/**
 * The job of carrying out a sync run of any source. Jobs of one source are
 * never carried out at the same time, so an attempt that finds its run
 * running knows the previous attempt has ended (B5-D01, B5-D02): the key is
 * the source in exclusivity mode. Its queue is created by its queue
 * migration with the same key mode; its attempts and time limit are in the
 * queue configuration.
 */
export const syncJob = defineJob<SyncJobData>({
  queue: 'source-sync-run',
  key: { mode: 'exclusivity', field: 'source' },
})
