/**
 * A job definition: a module's description of one kind of queue job. It
 * names the job's queue, types the data the job carries and gives the key
 * (B1-R02, B1-D03). The job definitions are the only owner of the list of
 * queues.
 */

/**
 * - `exclusivity`: jobs with the same key value are not carried out at the
 *   same time;
 * - `deduplication`: a second job with the same key value does not enter the
 *   queue while the first one waits or is carried out.
 */
export type KeyMode = 'exclusivity' | 'deduplication'

/** Where the key value comes from: a field of the data or a constant. */
export type KeyRule<Data> =
  | { mode: KeyMode; field: StringFields<Data> }
  | { mode: KeyMode; value: string }

type StringFields<Data> = {
  [Field in keyof Data]-?: Data[Field] extends string ? Field : never
}[keyof Data] &
  string

export type JobDefinition<Data extends object = object> = {
  /** The queue of the job, also the name the handler registry uses. */
  readonly queue: string
  /** No key when absent. */
  readonly key?: KeyRule<Data>
  /** Carries the data type only; never set. */
  readonly data?: Data
}

/** Any job definition, its data type erased: what the libraries handle. */
export type AnyJobDefinition = {
  readonly queue: string
  readonly key?: { readonly mode: KeyMode }
}

const queueName = /^[A-Za-z0-9_-]+$/

/** The suffix that names the failure queue of a queue. */
export const failureQueueSuffix = '.failed'

/** Describes a kind of queue job; validates the queue name at definition. */
export function defineJob<Data extends object>(definition: {
  queue: string
  key?: KeyRule<Data>
}): JobDefinition<Data> {
  if (!queueName.test(definition.queue))
    throw new Error(
      `Queue name "${definition.queue}" may hold only letters, digits, hyphens and underscores`,
    )
  return Object.freeze({ ...definition })
}

/** The name of the failure queue that receives the queue's failed jobs. */
export function failureQueueOf(queue: string): string {
  return `${queue}${failureQueueSuffix}`
}

/** The key mode of a definition, `none` without a key. */
export function keyModeOf(definition: AnyJobDefinition): KeyMode | 'none' {
  return definition.key?.mode ?? 'none'
}

/** The key value for the data; throws when the data has no usable value. */
export function keyValueOf<Data extends object>(
  definition: JobDefinition<Data>,
  data: Data,
): string | undefined {
  const key = definition.key
  if (!key) return undefined
  if ('value' in key) return key.value
  const value = (data as Record<string, unknown>)[key.field]
  if (typeof value !== 'string' || value === '')
    throw new Error(
      `Job of queue "${definition.queue}" has no key value in field "${key.field}"`,
    )
  return value
}
