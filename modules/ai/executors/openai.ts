import { defineJob } from '../../../lib/queues/index.ts'
import { hasCredentials } from '../configuration.ts'
import { agentTools } from '../domain/execution-mode.ts'
import { agentFits } from '../infrastructure/adapters/openai-agent.ts'
import { aiCatalog, type CatalogModel } from '../model-catalog.ts'
import type {
  Executor,
  ExecutorParameters,
  OperationJobData,
  PriceList,
  ServiceOffer,
} from './declaration.ts'
import {
  carryOutSession,
  sessionMaterials,
  sessionMeter,
} from './openai-agent-session.ts'
import { carryOutSingle, singleBody } from './openai-single.ts'
import { withinMaxRunTime } from './run.ts'

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

/**
 * The maximum run times of the paid services (T2-R06): 2 minutes for a
 * single answer, 15 minutes for an agent session.
 */
export const paidMaxRunSeconds = { single: 120, agent: 900 } as const

/** Whether the agent session runs its steps with the price list's caps. */
const sessionFits = (parameters: ExecutorParameters, priceList: PriceList) =>
  agentFits({
    provider,
    model: String(parameters.model),
    reasoningEffort: parameters.reasoningEffort ?? null,
    maxInputTokens: priceList.maxInputTokens,
    maxOutputTokens: priceList.maxOutputTokens,
    ...(priceList.maxToolCalls === undefined
      ? {}
      : { maxToolCalls: priceList.maxToolCalls }),
    runtime: null,
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
          // The agent runs its steps only with caps that fit them.
          mode !== 'agent' || sessionFits(offer.parameters, priceList),
      )
  })
}

const paidModels = () =>
  aiCatalog.models.filter(
    (model) => model.provider === provider && !model.local,
  )

/** The price list of the parameters' model today, for the request's caps. */
const priceListOf = (
  parameters: ExecutorParameters,
  mode: 'single' | 'agent',
): PriceList | null =>
  paidModels().find((model) => model.model === parameters.model)?.prices[
    mode
  ] ?? null

/**
 * The paid executor: OpenAI's single answer and agent session with web
 * search, with the models, reasoning efforts and price lists of the AI
 * configuration. It is configured when the provider's secret is present.
 * A simulated transport replaces OpenAI in tests.
 */
export function openAiExecutor(
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): Executor {
  const models = paidModels()
  return {
    name: provider,
    job: openAiOperationJob,
    services: {
      single: {
        offers: offers(models, 'single'),
        tools: [],
        maxRunSeconds: paidMaxRunSeconds.single,
      },
      agent: {
        offers: offers(models, 'agent'),
        tools: agentTools,
        maxRunSeconds: paidMaxRunSeconds.agent,
      },
    },
    configured: () => hasCredentials(provider),
    // The exact body of a single answer; an agent session is measured by
    // the common rule.
    requestSize(content, parameters, priceList) {
      if (content.type !== 'single' || !content.responseFormat) return
      return Buffer.byteLength(
        singleBody(content, parameters, priceList.maxOutputTokens),
      )
    },
    carryOut(work) {
      const { content, parameters } = work
      if (content.type === 'agent') {
        const priceList = priceListOf(parameters, 'agent')
        return withinMaxRunTime(
          paidMaxRunSeconds.agent,
          work,
          (run) =>
            carryOutSession(
              run,
              content,
              parameters,
              priceList,
              priceList !== null && sessionFits(parameters, priceList),
              fetcher,
            ),
          sessionMeter(parameters.model),
        )
      }
      return withinMaxRunTime(paidMaxRunSeconds.single, work, (run) =>
        carryOutSingle(
          run,
          content,
          parameters,
          priceListOf(parameters, 'single'),
          fetcher,
        ),
      )
    },
    materials: sessionMaterials,
  }
}
