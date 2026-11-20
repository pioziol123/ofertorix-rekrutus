import { PgBoss } from 'pg-boss'
import {
  readQueueConfiguration,
  type QueueConfiguration,
} from './configuration.ts'

/**
 * The process's one connection to the queue: a pg-boss client created from
 * `DATABASE_URL` in the schema `PG_BOSS_SCHEMA` (default `pgboss`), started
 * at first use or by `startQueues`.
 */

type ErrorListener = (error: Error) => void

let client: Promise<PgBoss> | undefined
let errorListener: ErrorListener = (error) =>
  console.error(`Queue unavailable: ${error.message}`)

/** A new pg-boss client of this process's queue schema. */
export function createQueueClient(options: { migrate?: boolean } = {}) {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')
  return new PgBoss({
    connectionString,
    migrate: options.migrate ?? false,
    schema: process.env.PG_BOSS_SCHEMA ?? 'pgboss',
  })
}

/** Sets what happens when the queue reports an error; logged by default. */
export function onQueueError(listener: ErrorListener): void {
  errorListener = listener
}

/** The started client of this process. */
export function queueClient(): Promise<PgBoss> {
  client ??= (async () => {
    const boss = createQueueClient()
    boss.on('error', (error) => errorListener(error))
    await boss.start()
    return boss
  })().catch((error) => {
    client = undefined
    throw error
  })
  return client
}

/**
 * Reads and validates the queue configuration, which throws on an invalid
 * one (B1-R04), then starts the connection in the background. A failed
 * start is reported to the error listener and retried at the next use.
 */
export function startQueues(): QueueConfiguration {
  const configuration = readQueueConfiguration()
  queueClient().catch((error: Error) => errorListener(error))
  return configuration
}

/** Stops the connection, if one was started, and forgets it. */
export async function stopQueues(): Promise<void> {
  const current = client
  client = undefined
  if (!current) return
  const boss = await current.catch(() => undefined)
  await boss?.stop({ graceful: false })
}
