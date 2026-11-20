import type { PgBoss, QueuePolicy } from 'pg-boss'
import type { QueueConfiguration, QueueSettings } from './configuration.ts'
import { createQueueClient } from './connection.ts'
import {
  failureQueueOf,
  keyModeOf,
  type AnyJobDefinition,
  type KeyMode,
} from './definition.ts'

/** Every queue sends the job heartbeat the worker relies on (B1-D08). */
export const jobHeartbeatSeconds = 30

/**
 * pg-boss 12.38's defaults, written out so that a setting removed from the
 * file returns the queue to the default when the queue is updated (B1-D02).
 */
const defaults = {
  retryLimit: 2,
  retryDelay: 0,
  retryBackoff: false,
  expireInSeconds: 900,
  retentionSeconds: 14 * 24 * 3600,
  deleteAfterSeconds: 7 * 24 * 3600,
} as const

const policies: Record<KeyMode | 'none', QueuePolicy> = {
  none: 'standard',
  exclusivity: 'singleton',
  deduplication: 'exclusive',
}

/** A file entry or job definition the existing queues do not agree with. */
export class QueuePreparationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueuePreparationError'
  }
}

/** Runs `use` with a started pg-boss client that installs its schema. */
async function withClient<T>(use: (boss: PgBoss) => Promise<T>): Promise<T> {
  const boss = createQueueClient({ migrate: true })
  try {
    await boss.start()
    return await use(boss)
  } finally {
    await boss.stop({ graceful: false })
  }
}

/**
 * What a queue migration calls (B1-R03, B1-D05): creates the failure queue,
 * then the queue with that failure queue as its dead letter queue and the
 * key mode the migration names, both with the mechanism's defaults and the
 * job heartbeat. The migration writes the name and key mode in itself and
 * imports no module. A queue that already exists is left as it is.
 */
export async function createQueue(
  name: string,
  keyMode: KeyMode | 'none',
): Promise<void> {
  await withClient(async (boss) => {
    const failureQueue = failureQueueOf(name)
    if (!(await boss.getQueue(failureQueue)))
      await boss.createQueue(failureQueue, {
        ...defaults,
        heartbeatSeconds: jobHeartbeatSeconds,
      })
    if (!(await boss.getQueue(name)))
      await boss.createQueue(name, {
        ...defaults,
        heartbeatSeconds: jobHeartbeatSeconds,
        deadLetter: failureQueue,
        policy: policies[keyMode],
      })
  })
}

/**
 * The migration step's part after the migrations (B1-R03, B1-D05): updates
 * the changeable settings of every queue a queue migration created from
 * its file entry, a queue without an entry to the mechanism's defaults. It
 * stops with an error naming the queue when an entry names no such queue.
 * It needs no job definition.
 */
export async function applyQueueConfiguration(
  configuration: QueueConfiguration,
): Promise<void> {
  await withClient(async (boss) => {
    const queues = await queueMigrationQueues(boss)
    for (const name of Object.keys(configuration))
      if (!queues.includes(name))
        throw new QueuePreparationError(
          `Queue configuration names queue "${name}", which no queue migration has created`,
        )
    for (const name of queues)
      await boss.updateQueue(name, {
        ...queueOptions(configuration[name] ?? {}),
        heartbeatSeconds: jobHeartbeatSeconds,
        deadLetter: failureQueueOf(name),
      })
  })
}

/** The queues a queue migration created: those with their failure queue. */
async function queueMigrationQueues(boss: PgBoss): Promise<string[]> {
  return (await boss.getQueues())
    .filter((queue) => queue.deadLetter === failureQueueOf(queue.name))
    .map((queue) => queue.name)
}

/**
 * The automated check of B1-R18 (B1-D15): the queue of every definition
 * exists with the key mode the definition names. Throws naming each queue
 * that does not agree.
 */
export async function checkKeyModes(
  definitions: readonly AnyJobDefinition[],
): Promise<void> {
  const problems = await withClient(async (boss) => {
    const found: string[] = []
    for (const definition of definitions) {
      const queue = await boss.getQueue(definition.queue)
      const mode = keyModeOf(definition)
      if (!queue)
        found.push(
          `queue "${definition.queue}" of a job definition is created by no queue migration`,
        )
      else if (queue.policy !== policies[mode])
        found.push(
          `queue "${definition.queue}" was created with policy "${queue.policy}", but its job definition names key mode "${mode}" (policy "${policies[mode]}")`,
        )
    }
    return found
  })
  if (problems.length > 0)
    throw new QueuePreparationError(
      `Job definitions disagree with their queues: ${problems.join('; ')}`,
    )
}

/** The pg-boss options of the file's settings, defaults for the rest. */
function queueOptions(settings: QueueSettings) {
  return {
    retryLimit:
      settings.attempts === undefined
        ? defaults.retryLimit
        : settings.attempts - 1,
    retryDelay: settings.retryDelaySeconds ?? defaults.retryDelay,
    retryBackoff: settings.retryBackoff ?? defaults.retryBackoff,
    expireInSeconds: settings.timeLimitSeconds ?? defaults.expireInSeconds,
    retentionSeconds:
      settings.waitingRetentionSeconds ?? defaults.retentionSeconds,
    deleteAfterSeconds:
      settings.finishedRetentionSeconds ?? defaults.deleteAfterSeconds,
  }
}
