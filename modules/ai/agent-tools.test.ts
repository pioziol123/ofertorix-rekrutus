import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  AiRequestError,
  agentTools,
  requestExecution,
  type AgentTool,
  type ExecutionRequest,
} from './index.ts'
import { registerProviderAdapter } from './provider-registry.ts'

// A client of a provider whose agent offers no tool.
vi.mock('./client-settings.ts', () => ({
  clientSettings: {
    notes: {
      provider: 'toolless',
      model: 'toolless-model',
      reasoningEffort: null,
    },
  },
}))
vi.mock('./model-catalog.ts', () => ({
  aiCatalog: {
    providers: { toolless: { credentialEnv: null } },
    models: [
      {
        provider: 'toolless',
        model: 'toolless-model',
        reasoningEfforts: [null],
        prices: {
          agent: {
            model: 'toolless-model',
            version: 'prices-1',
            inputUsdPerMillion: '1',
            outputUsdPerMillion: '1',
            usdPln: '4',
            fxVersion: 'fx-1',
            maxInputTokens: 1000,
            maxOutputTokens: 500,
          },
        },
      },
    ],
  },
}))

registerProviderAdapter({
  provider: 'toolless',
  modes: {
    agent: () => ({
      tools: [],
      fits: () => true,
      run: () => Promise.reject(new Error('Not sent')),
      materials: () => [],
    }),
  },
  endOf: () => ({ state: 'failed', cause: 'unknown' }),
})

const request = (tools: string[]): ExecutionRequest => ({
  settingsKey: 'notes',
  operationId: randomUUID(),
  mode: {
    kind: 'agent',
    tools: tools as AgentTool[],
    resultInstruction: 'Write the notes from the evidence.',
  },
  instruction: 'Gather notes.',
  responseSchema: { name: 'notes', schema: { type: 'object' } },
  input: 'Topic',
})

describe('the tools of agent work, one closed list owned by AI (0mq.22 ASM-3)', () => {
  it('lists web search', () => {
    expect(agentTools).toEqual(['web_search'])
  })
  it('refuses a tool outside the list as an invalid request, before anything is reserved', async () => {
    await expect(requestExecution(request(['shell']))).rejects.toEqual(
      new AiRequestError('invalid_request'),
    )
    await expect(requestExecution(request([]))).rejects.toEqual(
      new AiRequestError('invalid_request'),
    )
  })
  it("refuses a listed tool the provider's agent does not offer as unsupported_mode, before anything is reserved", async () => {
    await expect(requestExecution(request(['web_search']))).rejects.toEqual(
      new AiRequestError('unsupported_mode'),
    )
  })
})
