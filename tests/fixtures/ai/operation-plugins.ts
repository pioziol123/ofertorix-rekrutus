/**
 * The plugins index of the tests of assignments' operations: the queues of
 * the test executors get the handler of operations and their failure
 * handler, as the AI module plugin registers them for every executor's
 * queue. Its receivers of assignments stand in for the shared registration
 * of receivers, which the plugins index of the application runs before its
 * module plugins (epic sq2, T6).
 */
import { runPlugins, type HandlerRegistry } from '../../../lib/workers/index.ts'
import { endFailedOperation, runOperation } from '../../../modules/ai/index.ts'
import {
  localTestJob,
  paidTestJob,
  registerTestExecutors,
} from './operation-executors.ts'
import { registerTestReceivers } from './operation-receivers.ts'

export async function runModulePlugins(registry: HandlerRegistry) {
  registerTestReceivers()
  await runPlugins(
    {
      ai: (registry) => {
        registerTestExecutors()
        for (const job of [paidTestJob, localTestJob])
          registry.register(
            job,
            (data) => runOperation(data),
            (data) => endFailedOperation(data),
          )
      },
    },
    registry,
  )
}
