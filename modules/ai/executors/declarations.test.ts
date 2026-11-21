import { describe, expect, it } from 'vitest'
import { aiCatalog } from '../model-catalog.ts'
import { openAiProvider } from '../infrastructure/adapters/openai.ts'
import queues from '../../../queues.json' with { type: 'json' }
import { ollamaExecutor } from './ollama.ts'
import { openAiExecutor } from './openai.ts'

const luna = aiCatalog.models.find((model) => model.model === 'gpt-6-luna')!

describe('the declarations of the two executors, from today’s AI configuration (T1 scope, T2-R01)', () => {
  it('the paid executor offers a single answer and an agent session with web search on each reasoning effort of its model, with the price lists of the configuration', () => {
    const declaration = openAiExecutor()
    expect(declaration.name).toBe('openai')
    expect(declaration.job).toEqual({
      queue: 'ai-operation-openai',
      key: { mode: 'exclusivity', value: 'ai-operation-openai' },
    })
    expect(declaration.services.single).toEqual({
      offers: ['low', 'medium', 'high'].map((reasoningEffort) => ({
        parameters: { model: 'gpt-6-luna', reasoningEffort },
        priceList: luna.prices.single,
      })),
      tools: [],
      maxRunSeconds: 120,
    })
    expect(declaration.services.agent).toEqual({
      offers: ['low', 'medium', 'high'].map((reasoningEffort) => ({
        parameters: { model: 'gpt-6-luna', reasoningEffort },
        priceList: luna.prices.agent,
      })),
      tools: ['web_search'],
      maxRunSeconds: 900,
    })
  })

  it('the paid executor measures a single answer by the exact body the old way sends', () => {
    const content = {
      type: 'single' as const,
      instruction: 'Assess the offer.',
      input: 'Ad text',
      responseFormat: { name: 'assessment', schema: { type: 'object' } },
      agent: null,
    }
    const parameters = { model: 'gpt-6-luna', reasoningEffort: 'low' }
    const priceList = luna.prices.single!
    expect(openAiExecutor().requestSize!(content, parameters, priceList)).toBe(
      openAiProvider().singleRequestBytes!(
        {
          provider: 'openai',
          model: 'gpt-6-luna',
          reasoningEffort: 'low',
          maxOutputTokens: priceList.maxOutputTokens,
          runtime: null,
        },
        {
          model: 'gpt-6-luna',
          instructions: content.instruction,
          input: content.input,
          output: content.responseFormat,
        },
      ),
    )
  })

  it('the local executor offers a single answer on the local model at no cost, and no agent session', () => {
    const declaration = ollamaExecutor()
    expect(declaration.name).toBe('ollama')
    expect(declaration.job).toEqual({
      queue: 'ai-operation-ollama',
      key: { mode: 'exclusivity', value: 'ai-operation-ollama' },
    })
    expect(declaration.services).toEqual({
      single: {
        offers: [{ parameters: { model: 'gpt-oss:20b' }, priceList: null }],
        tools: [],
        maxRunSeconds: 1800,
      },
    })
  })

  it('T2-AC03: every declared maximum run time is below the time limit of the executor’s queue', () => {
    for (const executor of [openAiExecutor(), ollamaExecutor()]) {
      const queue = (queues as Record<string, { timeLimitSeconds: number }>)[
        executor.job.queue
      ]!
      const services = Object.values(executor.services)
      expect(services.length).toBeGreaterThan(0)
      for (const service of services)
        expect(service.maxRunSeconds).toBeLessThan(queue.timeLimitSeconds)
    }
  })
})
