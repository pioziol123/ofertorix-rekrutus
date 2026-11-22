import { defineJob } from '../../../../../lib/queues/index.ts'
import { hasCredentials } from '../configuration.ts'
import { agentTools } from '../../../domain/agent-tools.ts'
import { agentFits } from './openai-search.ts'
import { aiCatalog, type CatalogModel } from '../model-catalog.ts'
import type {
  Executor,
  ExecutorParameters,
  OperationJobData,
  ServiceOffer,
} from '../../../ports/executor.ts'
import type { PriceList } from '../../../domain/price-list.ts'
import { carryOutSession, sessionMaterials } from './openai-agent-session.ts'
import { carryOutSingle, singleBody } from './openai-single.ts'
import { withinMaxRunTime } from '../run.ts'

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

/**
 * Whether the agent session runs its steps with the price list's caps. The
 * old agent also runs gpt-4.1-mini, charged a fixed block of input tokens
 * per search; the session has no such rule of usage, so it does not take
 * that model.
 */
export const sessionFits = (
  parameters: ExecutorParameters,
  priceList: PriceList,
) =>
  parameters.model !== 'gpt-4.1-mini' &&
  agentFits({
    model: String(parameters.model),
    maxInputTokens: priceList.maxInputTokens,
    maxOutputTokens: priceList.maxOutputTokens,
    ...(priceList.maxToolCalls === undefined
      ? {}
      : { maxToolCalls: priceList.maxToolCalls }),
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
        return withinMaxRunTime(paidMaxRunSeconds.agent, work, (run) =>
          carryOutSession(
            run,
            content,
            parameters,
            priceList,
            priceList !== null && sessionFits(parameters, priceList),
            fetcher,
          ),
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
