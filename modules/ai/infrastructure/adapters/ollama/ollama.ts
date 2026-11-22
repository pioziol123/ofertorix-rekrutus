import { defineJob } from '../../../../../lib/queues/index.ts'
import { resolveEndpoint } from '../configuration.ts'
import { localFetch } from './local-http.ts'
import { aiCatalog } from '../model-catalog.ts'
import type {
  Executor,
  ExecutorParameters,
  OperationJobData,
} from '../../../ports/executor.ts'
import { carryOutLocalSingle, type LocalModel } from './ollama-single.ts'
import { nothingSent } from '../../../domain/usage.ts'
import { withinMaxRunTime } from '../run.ts'

/**
 * The job of the local executor's operations: exclusivity on a constant
 * key, at most one operation on the local model at a time (ZA-D01). Its
 * queue is created by a queue migration with the same key mode.
 */
export const ollamaOperationJob = defineJob<OperationJobData>({
  queue: 'ai-operation-ollama',
  key: { mode: 'exclusivity', value: 'ai-operation-ollama' },
})

/** The maximum run time of a local single answer (T2-R06): 30 minutes. */
export const localMaxRunSeconds = 1800

const localModels = () =>
  aiCatalog.models.filter(
    (model) => model.provider === 'ollama' && model.local !== undefined,
  )

/** The model's runtime with its endpoint now, or null when not configured. */
function localModel(parameters: ExecutorParameters): LocalModel | null {
  const runtime = localModels().find(
    (model) => model.model === parameters.model,
  )?.local
  if (!runtime) return null
  try {
    return {
      endpoint: resolveEndpoint(runtime.endpointRef, runtime.endpointVersion),
      numCtx: runtime.numCtx,
    }
  } catch {
    return null
  }
}

/**
 * The local executor: a single answer on a model of the installation's
 * local runtime, at no cost. It is configured when the endpoint of the
 * model's runtime is present in the configuration. The model's
 * availability is fixed when an operation starts, not when an assignment
 * is placed (requirements T1, scope). A simulated transport replaces the
 * runtime in tests.
 */
export function ollamaExecutor(fetcher: typeof fetch = localFetch): Executor {
  return {
    name: 'ollama',
    job: ollamaOperationJob,
    services: {
      single: {
        offers: localModels().map((model) => ({
          parameters: { model: model.model },
          priceList: null,
        })),
        tools: [],
        maxRunSeconds: localMaxRunSeconds,
      },
    },
    configured: (parameters) => localModel(parameters) !== null,
    async carryOut(work) {
      const local = localModel(work.parameters)
      if (!local || work.content.type !== 'single')
        return {
          kind: 'failed',
          retryable: false,
          cause: 'configuration',
          usage: nothingSent(),
        }
      return withinMaxRunTime(localMaxRunSeconds, work, (run) =>
        carryOutLocalSingle(run, work.content, work.parameters, local, fetcher),
      )
    },
    materials: () => null,
  }
}
