import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canPlaceAssignments, readPotentialCost } from '../index.ts'

// Settings names on the two executors of the application, with today's
// AI configuration, and the gaps of T1-R04 a configuration can have.
vi.mock('./assignment-settings.ts', () => ({
  assignmentSettings: {
    paid: {
      executor: 'openai',
      parameters: { model: 'gpt-6-luna', reasoningEffort: 'low' },
      requestingModule: 'Paid',
    },
    local: {
      executor: 'ollama',
      parameters: { model: 'gpt-oss:20b' },
      requestingModule: 'Local',
    },
    incomplete: {
      executor: 'openai',
      parameters: { model: 'gpt-6-luna', reasoningEffort: 'low' },
    },
    unknownExecutor: {
      executor: 'nobody',
      parameters: {},
      requestingModule: 'Nobody',
    },
    unknownModel: {
      executor: 'openai',
      parameters: { model: 'gpt-0', reasoningEffort: 'low' },
      requestingModule: 'Paid',
    },
    unknownEffort: {
      executor: 'openai',
      parameters: { model: 'gpt-6-luna', reasoningEffort: 'extreme' },
      requestingModule: 'Paid',
    },
    extraParameter: {
      executor: 'ollama',
      parameters: { model: 'gpt-oss:20b', reasoningEffort: 'low' },
      requestingModule: 'Local',
    },
  },
}))

const endpoints = JSON.stringify([
  {
    ref: 'ollama',
    version: 1,
    url: 'http://localhost:11434',
    credentialEnv: null,
  },
])

describe('whether assignments can be placed under a settings name, with no provider called (T1-AC06, T1-R08)', () => {
  const fetchSpy = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    vi.stubEnv('AI_ENDPOINTS_JSON', endpoints)
  })
  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('answers yes for complete settings of the paid executor, single and agent, and of the local executor, single', () => {
    expect(canPlaceAssignments('paid', 'single')).toBe(true)
    expect(canPlaceAssignments('paid', 'agent')).toBe(true)
    expect(canPlaceAssignments('local', 'single')).toBe(true)
  })

  it('answers no for an unknown settings name and incomplete settings, for both types', () => {
    for (const type of ['single', 'agent'] as const) {
      expect(canPlaceAssignments('nobody', type)).toBe(false)
      expect(canPlaceAssignments('incomplete', type)).toBe(false)
      expect(canPlaceAssignments('unknownExecutor', type)).toBe(false)
    }
  })

  it('answers no for a type the executor does not offer: the local executor has no agent session', () => {
    expect(canPlaceAssignments('local', 'agent')).toBe(false)
  })

  it('answers no for parameters outside the executor’s catalogue, for both types', () => {
    for (const type of ['single', 'agent'] as const) {
      expect(canPlaceAssignments('unknownModel', type)).toBe(false)
      expect(canPlaceAssignments('unknownEffort', type)).toBe(false)
    }
    expect(canPlaceAssignments('extraParameter', 'single')).toBe(false)
  })

  it('answers no when the paid executor lacks its secret, for both types', () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(canPlaceAssignments('paid', 'single')).toBe(false)
    expect(canPlaceAssignments('paid', 'agent')).toBe(false)
    expect(canPlaceAssignments('local', 'single')).toBe(true)
  })

  it('answers no when the local executor lacks the address of its runtime', () => {
    vi.stubEnv('AI_ENDPOINTS_JSON', '[]')
    expect(canPlaceAssignments('local', 'single')).toBe(false)
    expect(canPlaceAssignments('paid', 'single')).toBe(true)
  })
})

describe('the potential cost of one operation under a settings name, with no provider called (sq2.11 ASM-2, sq2.9 ASM-3)', () => {
  const fetchSpy = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    vi.stubEnv('AI_ENDPOINTS_JSON', endpoints)
  })
  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('is the cost of the caps of the price list the executor declares, the amount the old way reserved for one execution', () => {
    // gpt-6-luna, standard rates: 500000 input and 6000 output tokens at
    // 0.10 and 0.50 USD per million, 5 PLN per USD; the agent adds three
    // web searches at 0.01 USD.
    expect(readPotentialCost('paid', 'single')).toBe('0.265000')
    expect(readPotentialCost('paid', 'agent')).toBe('0.415000')
    expect(readPotentialCost('local', 'single')).toBe('0.000000')
  })

  it('is null wherever an assignment cannot be placed', () => {
    expect(readPotentialCost('nobody', 'single')).toBeNull()
    expect(readPotentialCost('local', 'agent')).toBeNull()
    expect(readPotentialCost('unknownModel', 'single')).toBeNull()
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(readPotentialCost('paid', 'single')).toBeNull()
  })
})
