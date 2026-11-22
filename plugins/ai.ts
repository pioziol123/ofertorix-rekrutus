/**
 * The AI module plugin: the queue of each executor of assignments gets the
 * handler of operations (epic sq2, T3) and their failure handler (T4). The
 * receivers of the requesting modules are registered by the shared
 * registration of receivers, not here (T6).
 */
import type { HandlerRegistry } from '../lib/workers/index.ts'
import {
  endFailedOperation,
  executorJobs,
  runOperation,
} from '../modules/ai/index.ts'

export function registerAiJobs(registry: HandlerRegistry): void {
  for (const job of executorJobs())
    registry.register(
      job,
      (data) => runOperation(data),
      (data) => endFailedOperation(data),
    )
}
