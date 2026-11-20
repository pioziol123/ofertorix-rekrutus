/**
 * The queue library: the only code that talks to pg-boss for the job
 * definitions of the modules. Modules define jobs and send them in their
 * operation's transaction; the migration step prepares the queues; the
 * worker takes jobs through a job source. Design: docs/specs/2ba-praca-w-tle/
 * solution-design.md#b1.
 */
export {
  defineJob,
  type AnyJobDefinition,
  failureQueueOf,
  type JobDefinition,
  type KeyMode,
  type KeyRule,
} from './definition.ts'
export { sendJob, type SendResult } from './send.ts'
export {
  QueueConfigurationError,
  queueConfigurationPath,
  readQueueConfiguration,
  validateQueueConfiguration,
  type QueueConfiguration,
  type QueueSettings,
} from './configuration.ts'
export { onQueueError, startQueues, stopQueues } from './connection.ts'
export { prepareQueues, QueuePreparationError } from './prepare.ts'
export {
  openJobSource,
  type FailureReason,
  type JobSource,
  type TakenJob,
} from './consumer.ts'
