import { queueFor } from './jobspy.ts'
import { jobspySources, type JobspySource } from './jobspy-catalog.ts'
import { polishQueue, polishSources, type PolishSource } from './polish.ts'
import { importQueue, source as solidJobs } from './solid.ts'

/**
 * The queue that carries a source's sync jobs, or null for a source without
 * one (Himalayas runs in the CLI process). Until 0mq.16 replaces them with
 * one sync queue, each queued source keeps its own queue.
 */
export function syncQueueFor(source: string): string | null {
  if (source === solidJobs) return importQueue
  if ((jobspySources as readonly string[]).includes(source))
    return queueFor(source as JobspySource)
  if ((polishSources as readonly string[]).includes(source))
    return polishQueue(source as PolishSource)
  return null
}

/** Every queue that carries sync jobs. */
export const syncQueues = [
  importQueue,
  ...jobspySources.map((source) => queueFor(source)),
  ...polishSources.map((source) => polishQueue(source)),
]
