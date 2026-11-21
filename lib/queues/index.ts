/**
 * The queue library: the only code that talks to pg-boss for the job
 * definitions of the modules. Modules define jobs and send them in their
 * operation's transaction; queue migrations create the queues and the
 * migration step applies the queue configuration; the worker takes jobs
 * through a job source. Design: docs/specs/2ba-praca-w-tle/
 * solution-design.md#b1.
 */
export {
  defineJob,
  type AnyJobDefinition,
  type JobDefinition,
} from './definition.ts'
export { sendJob } from './send.ts'
export {
  readQueueConfiguration,
  type QueueConfiguration,
} from './configuration.ts'
export {
  connectQueues,
  onQueueError,
  startQueues,
  stopQueues,
} from './connection.ts'
export {
  applyQueueConfiguration,
  checkKeyModes,
  createQueue,
  deleteQueue,
  queueExists,
} from './prepare.ts'
export {
  openJobSource,
  type FailureReason,
  type JobSource,
  type TakenJob,
} from './consumer.ts'
