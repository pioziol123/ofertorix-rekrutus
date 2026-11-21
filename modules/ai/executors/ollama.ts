import { defineJob } from '../../../lib/queues/index.ts'
import { resolveEndpoint } from '../configuration.ts'
import { aiCatalog } from '../model-catalog.ts'
import type { ExecutorDeclaration, OperationJobData } from './declaration.ts'

/**
 * The job of the local executor's operations: exclusivity on a constant
 * key, at most one operation on the local model at a time (ZA-D01). Its
 * queue is created by a queue migration with the same key mode.
 */
export const ollamaOperationJob = defineJob<OperationJobData>({
  queue: 'ai-operation-ollama',
  key: { mode: 'exclusivity', value: 'ai-operation-ollama' },
})

const localModels = () =>
  aiCatalog.models.filter(
    (model) => model.provider === 'ollama' && model.local !== undefined,
  )

/**
 * The local executor: a single answer on a model of the installation's
 * local runtime, at no cost. It is configured when the endpoint of the
 * model's runtime is present in the configuration. The version of the
 * model is fixed when an operation starts, not when an assignment is
 * placed (requirements T1, scope).
 */
export function ollamaDeclaration(): ExecutorDeclaration {
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
      },
    },
    configured(parameters) {
      const runtime = localModels().find(
        (model) => model.model === parameters.model,
      )?.local
      if (!runtime) return false
      try {
        resolveEndpoint(runtime.endpointRef, runtime.endpointVersion)
        return true
      } catch {
        return false
      }
    },
  }
}
