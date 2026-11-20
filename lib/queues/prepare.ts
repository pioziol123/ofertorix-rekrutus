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

/** A definition or file entry the existing queues cannot take. */
export class QueuePreparationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueuePreparationError'
  }
}

/**
 * The migration step's part (B1-R03, B1-D05): creates the failure queue and
 * the queue of every job definition, updates their changeable settings from
 * the file, and stops with an error naming the queue when a file entry names
 * no definition's queue or an existing queue's key mode differs. Repeating
 * it creates nothing new.
 */
export async function prepareQueues(
  definitions: readonly AnyJobDefinition[],
  configuration: QueueConfiguration,
): Promise<void> {
  const queues = new Set(definitions.map((definition) => definition.queue))
  for (const name of Object.keys(configuration))
    if (!queues.has(name))
      throw new QueuePreparationError(
        `Queue configuration names queue "${name}", which no job definition has`,
      )
  const boss = createQueueClient({ migrate: true })
  try {
    await boss.start()
    for (const definition of definitions) await checkKeyMode(boss, definition)
    for (const definition of definitions)
      await prepareQueue(
        boss,
        definition,
        configuration[definition.queue] ?? {},
      )
  } finally {
    await boss.stop({ graceful: false })
  }
}

async function checkKeyMode(boss: PgBoss, definition: AnyJobDefinition) {
  const existing = await boss.getQueue(definition.queue)
  const policy = policies[keyModeOf(definition)]
  if (existing && existing.policy !== policy)
    throw new QueuePreparationError(
      `Queue "${definition.queue}" exists with policy "${existing.policy}", but its job definition asks for key mode "${keyModeOf(definition)}" (policy "${policy}"); a key mode cannot change on an existing queue, so give the definition a new queue`,
    )
}

async function prepareQueue(
  boss: PgBoss,
  definition: AnyJobDefinition,
  settings: QueueSettings,
) {
  const failureQueue = failureQueueOf(definition.queue)
  const failureOptions = { ...defaults, heartbeatSeconds: jobHeartbeatSeconds }
  if (await boss.getQueue(failureQueue))
    await boss.updateQueue(failureQueue, failureOptions)
  else await boss.createQueue(failureQueue, failureOptions)
  const options = {
    ...queueOptions(settings),
    heartbeatSeconds: jobHeartbeatSeconds,
    deadLetter: failureQueue,
  }
  if (await boss.getQueue(definition.queue))
    await boss.updateQueue(definition.queue, options)
  else
    await boss.createQueue(definition.queue, {
      ...options,
      policy: policies[keyModeOf(definition)],
    })
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
