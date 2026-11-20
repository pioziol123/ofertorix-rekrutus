import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The queue configuration: the operational settings of each queue, keyed by
 * queue name, in one editable JSON file of the repository. It does not own
 * the list of queues; the job definitions do. A setting the file does not
 * give takes pg-boss's default (B1-D02).
 */

/** The settings of one queue as the file gives them; every field optional. */
export type QueueSettings = {
  /** Highest number of attempts, the first one included. */
  attempts?: number
  /** Delay before a retry. */
  retryDelaySeconds?: number
  /** The delay grows with each retry. */
  retryBackoff?: boolean
  /** Time limit of one attempt. */
  timeLimitSeconds?: number
  /** How long a job may wait to be taken before it is deleted. */
  waitingRetentionSeconds?: number
  /** How long a finished job is kept. */
  finishedRetentionSeconds?: number
}

export type QueueConfiguration = Readonly<Record<string, QueueSettings>>

/** A configuration that cannot be read or holds a value it does not allow. */
export class QueueConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueueConfigurationError'
  }
}

type Rule = { check: (value: unknown) => boolean; allowed: string }

const integer = (min: number, max = Number.MAX_SAFE_INTEGER): Rule => ({
  check: (value) =>
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max,
  allowed:
    max === Number.MAX_SAFE_INTEGER
      ? `an integer ≥ ${min}`
      : `an integer from ${min} to ${max}`,
})

const rules: Record<keyof QueueSettings, Rule> = {
  attempts: integer(1),
  retryDelaySeconds: integer(0),
  retryBackoff: {
    check: (value) => typeof value === 'boolean',
    allowed: 'true or false',
  },
  timeLimitSeconds: integer(1, 86_400),
  waitingRetentionSeconds: integer(1),
  finishedRetentionSeconds: integer(0),
}

/** The file the processes read unless `QUEUE_CONFIGURATION` names another. */
export function queueConfigurationPath(): string {
  return resolve(process.env.QUEUE_CONFIGURATION ?? 'queues.json')
}

/**
 * Reads and validates the queue configuration. Throws a
 * `QueueConfigurationError` naming the file, the queue and the field.
 */
export function readQueueConfiguration(
  path = queueConfigurationPath(),
): QueueConfiguration {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw new QueueConfigurationError(
      `Queue configuration ${path} cannot be read: ${(error as Error).message}`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new QueueConfigurationError(
      `Queue configuration ${path} is not valid JSON: ${(error as Error).message}`,
    )
  }
  return validateQueueConfiguration(parsed, path)
}

/** Checks a parsed configuration; `source` names it in errors. */
export function validateQueueConfiguration(
  value: unknown,
  source: string,
): QueueConfiguration {
  if (!isObject(value))
    throw new QueueConfigurationError(
      `Queue configuration ${source} must be a JSON object keyed by queue name`,
    )
  const configuration: Record<string, QueueSettings> = {}
  for (const [queue, entry] of Object.entries(value)) {
    if (!isObject(entry))
      throw new QueueConfigurationError(
        `Queue configuration ${source}: queue "${queue}" must be an object of settings`,
      )
    for (const [field, setting] of Object.entries(entry)) {
      const rule = rules[field as keyof QueueSettings]
      if (!rule)
        throw new QueueConfigurationError(
          `Queue configuration ${source}: queue "${queue}", field "${field}" is not a known setting (known: ${Object.keys(rules).join(', ')})`,
        )
      if (!rule.check(setting))
        throw new QueueConfigurationError(
          `Queue configuration ${source}: queue "${queue}", field "${field}" must be ${rule.allowed}`,
        )
    }
    configuration[queue] = entry as QueueSettings
  }
  return configuration
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
