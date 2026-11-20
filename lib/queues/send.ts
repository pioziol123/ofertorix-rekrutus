import { queueDatabase } from '../db.ts'
import { queueClient } from './connection.ts'
import { keyModeOf, keyValueOf, type JobDefinition } from './definition.ts'

/**
 * `created` when the job entered the queue; `duplicate`, only in
 * deduplication mode, when a job with the same key value waits or is carried
 * out, so nothing was created.
 */
export type SendResult = 'created' | 'duplicate'

/**
 * Requests a job as part of the caller's operation: the insert runs on the
 * caller's transaction, so rolling the operation back removes the job
 * (B1-R01). A missing queue, a missing key value or a job not created
 * outside deduplication mode throws, which rolls the caller back (B1-R05).
 * The data's content is not validated (B1-D11).
 */
export async function sendJob<Data extends object>(
  definition: JobDefinition<Data>,
  data: Data,
): Promise<SendResult> {
  const singletonKey = keyValueOf(definition, data)
  const boss = await queueClient()
  const id = await boss.send(definition.queue, data, {
    db: queueDatabase,
    ...(singletonKey === undefined ? {} : { singletonKey }),
  })
  if (id) return 'created'
  if (keyModeOf(definition) === 'deduplication') return 'duplicate'
  throw new Error(`Queue "${definition.queue}" did not accept the job`)
}
