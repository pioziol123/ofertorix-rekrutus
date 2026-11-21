import { defineJob } from '../../../lib/queues/index.ts'
import { hasCredentials } from '../configuration.ts'
import { agentTools } from '../domain/execution-mode.ts'
import { agentFits } from '../infrastructure/adapters/openai-agent.ts'
import { responsesBody } from '../infrastructure/adapters/openai.ts'
import { aiCatalog, type CatalogModel } from '../model-catalog.ts'
import type {
  ExecutorDeclaration,
  OperationJobData,
  ServiceOffer,
} from './declaration.ts'

const provider = 'openai'

/**
 * The job of the paid executor's operations: exclusivity on a constant key,
 * at most one operation at a time in the whole system (ZA-D01). Its queue is
 * created by a queue migration with the same key mode.
 */
export const openAiOperationJob = defineJob<OperationJobData>({
  queue: 'ai-operation-openai',
  key: { mode: 'exclusivity', value: 'ai-operation-openai' },
})

/** One offer per reasoning effort of a model that has the price list. */
function offers(
  models: readonly CatalogModel[],
  mode: 'single' | 'agent',
): ServiceOffer[] {
  return models.flatMap((model) => {
    const priceList = model.prices[mode]
    if (!priceList) return []
    return model.reasoningEfforts
      .map((reasoningEffort) => ({
        parameters: { model: model.model, reasoningEffort },
        priceList,
      }))
      .filter(
        (offer) =>
          mode !== 'agent' ||
          // The agent runs its steps only with caps that fit them.
          agentFits({
            provider,
            model: offer.parameters.model,
            reasoningEffort: offer.parameters.reasoningEffort,
            maxInputTokens: priceList.maxInputTokens,
            maxOutputTokens: priceList.maxOutputTokens,
            ...(priceList.maxToolCalls === undefined
              ? {}
              : { maxToolCalls: priceList.maxToolCalls }),
            runtime: null,
          }),
      )
  })
}

/**
 * The paid executor: OpenAI's single answer and agent session with web
 * search, with the models, reasoning efforts and price lists of the AI
 * configuration. It is configured when the provider's secret is present.
 */
export function openAiDeclaration(): ExecutorDeclaration {
  const models = aiCatalog.models.filter(
    (model) => model.provider === provider && !model.local,
  )
  return {
    name: provider,
    job: openAiOperationJob,
    services: {
      single: { offers: offers(models, 'single'), tools: [] },
      agent: { offers: offers(models, 'agent'), tools: agentTools },
    },
    configured: () => hasCredentials(provider),
    // The exact body of a single answer, as the old way measures it; an
    // agent session is measured by the common rule.
    requestSize(content, parameters, priceList) {
      if (content.type !== 'single' || !content.responseFormat) return
      return Buffer.byteLength(
        responsesBody(
          {
            model: String(parameters.model),
            instructions: content.instruction,
            input: content.input,
            output: content.responseFormat,
          },
          {
            maxOutputTokens: priceList.maxOutputTokens,
            reasoningEffort: parameters.reasoningEffort ?? null,
          },
        ),
      )
    },
  }
}
