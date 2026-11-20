/**
 * A queue migration as a module adds one (B1-D05): it names each queue and
 * its key mode itself and imports no job definition. It creates the queues
 * of the test job definitions, the queue without a registered handler
 * included.
 */
import { createQueue } from '../../../../lib/queues/index.ts'

export async function up(): Promise<void> {
  await createQueue('wt-plain', 'none')
  await createQueue('wt-second', 'none')
  await createQueue('wt-limited', 'none')
  await createQueue('wt-single', 'none')
  await createQueue('wt-exclusive', 'exclusivity')
  await createQueue('wt-dedup', 'deduplication')
  await createQueue('wt-orphan', 'none')
}
