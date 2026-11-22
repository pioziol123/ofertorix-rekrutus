import { matchingMigrations } from './matching-ai.fixtures.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type { AiConfiguration } from '../modules/ai/model-catalog.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  researchTopics,
  type ResearchDraft,
} from '../modules/companies/domain/research-report.ts'
export const pricing: AiConfiguration = {
  model: 'gpt-4.1-mini',
  version: 'test',
  inputUsdPerMillion: '1',
  outputUsdPerMillion: '1',
  usdPln: '4',
  fxVersion: 'test',
  maxInputTokens: 100000,
  maxOutputTokens: 4000,
  // The web search price per call, at most three calls, as research had.
  toolCallUsd: '0.01',
  maxToolCalls: 3,
}
export const draft = (): ResearchDraft => ({
  identity: 'Tożsamość wymaga dalszego potwierdzenia.',
  claims: researchTopics.map((topic) => ({
    topic,
    kind: 'fact',
    scope: 'project',
    text: 'Firma deklaruje realizację projektu PHP.',
    evidence: [{ id: 0, quote: 'Project uses PHP.' }],
  })),
})
export const searchResponse = () => ({
  id: 'search-id',
  status: 'completed',
  usage: { input_tokens: 100, output_tokens: 50 },
  output: [
    {
      type: 'web_search_call',
      status: 'completed',
      action: { type: 'search' },
    },
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: 'Project uses PHP.',
          annotations: [
            {
              type: 'url_citation',
              url: 'https://company.example/project',
              title: 'Project',
              start_index: 0,
              end_index: 17,
            },
          ],
        },
      ],
    },
  ],
})
export const synthesisResponse = () => ({
  id: 'synthesis-id',
  status: 'completed',
  usage: { input_tokens: 200, output_tokens: 70 },
  output: [
    {
      type: 'message',
      content: [{ type: 'output_text', text: JSON.stringify(draft()) }],
    },
  ],
})

/** The schema of research before its move to AI executions (0mq.22). */
export const researchMigrations = [
  ...matchingMigrations,
  '1770000000010_companies',
  '1770000000011_company_research',
].sort()

/**
 * The agent price list of the model research's assignments use
 * (`gpt-6-luna`), with caps the paid agent session takes: the whole input
 * cap of the model, an output cap of at least 4000 tokens and the web
 * search price per call.
 */
export const assignmentPricing: AiConfiguration = {
  model: 'gpt-6-luna',
  version: 'test',
  inputUsdPerMillion: '1',
  outputUsdPerMillion: '1',
  usdPln: '4',
  fxVersion: 'test',
  maxInputTokens: 500000,
  maxOutputTokens: 6000,
  toolCallUsd: '0.01',
  maxToolCalls: 3,
}

/** The schema of research with assignments (oferty-pracy-sq2.10). */
export const researchAssignmentMigrations = [
  ...researchMigrations,
  '1770000000019_research_ai_executions',
  '1770000000020_ai_execution_lease',
  '1770000000026_ai_without_local_slot_and_lease',
  '1770000000027_ai_assignments',
  '1770000000030_ai_operation_exchange',
  '1770000000031_ai_budget_default_limit',
  '1770000000034_company_research_assignment',
  '1770000000035_ai_budget_carried_amounts',
]
