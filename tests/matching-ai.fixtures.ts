import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { Pool } from 'pg'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  BatchClient,
  openAiBatch,
  type Batch,
  type BatchLine,
  type BatchRequestLine,
} from '../modules/ai/infrastructure/adapters/openai-batch.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { openAiProvider } from '../modules/ai/infrastructure/adapters/openai.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { registerProviderAdapter } from '../modules/ai/provider-registry.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type { MatchingInput } from '../modules/matching/domain/assessment.ts'

/**
 * Shared setup of the Matching tests that run assessments through the AI
 * coordination with a simulated OpenAI: single calls answer through a fake
 * transport, provider batches through a fake Batch client. No external call
 * is made.
 */

/** The migrations a Matching test schema needs, in order. */
export const matchingMigrations = [
  '1770000000000_setup',
  '1770000000001_sources',
  '1770000000004_profiles',
  '1770000000006_matching',
  '1770000000007_matching_payload',
  '1770000000008_matching_groups',
  '1770000000009_rating_revisions',
  '1770000000012_matching_batch_archives',
  '1770000000013_local_ai',
  '1770000000016_ai_execution_requests',
  '1770000000017_profile_ai_executions',
  '1770000000018_matching_ai_executions',
]

/** The lease of running paid AI work (task oferty-pracy-0mq.15). */
export const aiLeaseMigration = '1770000000020_ai_execution_lease'

/**
 * AI work without the lease and the shared local slot (task
 * oferty-pracy-2ba.6); it follows the lease migration.
 */
export const aiWithoutLeaseMigration =
  '1770000000026_ai_without_local_slot_and_lease'

/**
 * The assignments of the AI module (epic sq2) and the assignment column of
 * Matching's requests (task oferty-pracy-sq2.9); they follow the migration
 * without the lease.
 */
export const assignmentMigrations = [
  '1770000000027_ai_assignments',
  '1770000000030_ai_operation_exchange',
  '1770000000031_ai_budget_default_limit',
  '1770000000033_matching_assignment',
]

export async function migrate(
  pool: Pool,
  names = [
    ...matchingMigrations,
    aiLeaseMigration,
    aiWithoutLeaseMigration,
    ...assignmentMigrations,
  ],
) {
  const statements: string[] = []
  for (const name of names)
    createRequire(import.meta.url)(`../migrations/${name}.cjs`).up({
      sql: (s: string) => statements.push(s),
    })
  await pool.query(statements.join('\n'))
}

/**
 * The test price list, for the model of Matching's settings of
 * assignments; it holds for single calls and batch items.
 */
export const pricing = {
  model: 'gpt-6-luna',
  version: 'test',
  inputUsdPerMillion: '1',
  outputUsdPerMillion: '1',
  usdPln: '1',
  fxVersion: 'test',
  maxInputTokens: 20000,
  maxOutputTokens: 500,
}

/** An answer with every criterion of the input unknown. */
export function unknownAssessment(input: MatchingInput) {
  return {
    summary: 'Brak danych',
    strengths: [],
    gaps: [],
    criteria: input.criteria.map((c) => ({
      id: c.id,
      state: 'unknown',
      score: null,
      profileEvidence: null,
      offerEvidence: null,
      reason: 'Brak potwierdzenia',
    })),
  }
}

/** A Responses API body with one content of the given type. */
export function responseBody(
  text: string,
  options: { type?: string; inputTokens?: number; id?: string } = {},
) {
  return {
    id: options.id ?? 'resp_test',
    status: 'completed',
    usage: { input_tokens: options.inputTokens ?? 100, output_tokens: 20 },
    output: [
      {
        type: 'message',
        content: [{ type: options.type ?? 'output_text', text }],
      },
    ],
  }
}

type SingleBody = {
  instructions: string
  input: { content: { text: string }[] }[]
  text: { format: { name: string; schema: unknown } }
  model: string
  max_output_tokens: number
  reasoning?: { effort: string }
}

/**
 * The simulated provider. `single` answers each single call from the
 * request's input; `batch` is the fake Batch client of every batch.
 */
export class SimulatedOpenAi {
  singleCalls: SingleBody[] = []
  answer: (input: MatchingInput, body: SingleBody) => unknown = (input) =>
    responseBody(JSON.stringify(unknownAssessment(input)))
  batch = new FakeBatchClient()
  constructor() {
    const fetcher = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as SingleBody
      this.singleCalls.push(body)
      const input = JSON.parse(body.input[0]!.content[0]!.text)
      return new Response(JSON.stringify(this.answer(input, body)))
    }
    const adapter = openAiProvider(fetcher as typeof fetch)
    registerProviderAdapter({
      ...adapter,
      modes: {
        ...adapter.modes,
        batch: (settings) => openAiBatch(settings, () => this.batch),
      },
    })
  }
}

/** A Batch client that keeps the uploaded lines and answers from them. */
export class FakeBatchClient extends BatchClient {
  uploaded: BatchRequestLine[] = []
  uploads = 0
  creates = 0
  removed: string[] = []
  status: Batch['status'] = 'completed'
  /** Items answered with a refusal (and a larger usage). */
  refusals = new Set<string>()
  /** Items left without any line. */
  missing = new Set<string>()
  constructor() {
    super('test', async () => {
      throw new Error('No external calls allowed')
    })
  }
  override async upload(lines: BatchRequestLine[]) {
    await this.archive?.(
      'input',
      'request',
      lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
    )
    this.uploaded.push(...structuredClone(lines))
    this.uploads++
    return 'file_input'
  }
  override async create() {
    this.creates++
    return {
      id: 'batch_test',
      input_file_id: 'file_input',
      status: 'in_progress',
    } satisfies Batch
  }
  override async retrieve() {
    return {
      id: 'batch_test',
      input_file_id: 'file_input',
      output_file_id: 'file_output',
      status: this.status,
    } satisfies Batch
  }
  override async results(_batch: Batch, expected: string[]) {
    const results = new Map<string, BatchLine>()
    // Out of order on purpose: each result must reach its own item.
    for (const id of [...expected].reverse()) {
      if (this.missing.has(id)) continue
      const line = this.uploaded.find((l) => l.custom_id === id)!
      const input = JSON.parse(
        (line.body.input as { content: { text: string }[] }[])[0]!.content[0]!
          .text,
      ) as MatchingInput
      const refused = this.refusals.has(id)
      results.set(id, {
        custom_id: id,
        response: {
          status_code: 200,
          body: responseBody(JSON.stringify(unknownAssessment(input)), {
            id: `resp_${id}`,
            type: refused ? 'refusal' : 'output_text',
            inputTokens: refused ? 200 : 100,
          }),
        },
      })
    }
    await this.archive?.('output', 'file_output', '{"archived":true}\n')
    return results
  }
  override async remove(file: string) {
    this.removed.push(file)
  }
}

/**
 * Saves an AI execution of a request directly, in the given public state,
 * with its attempt (for read tests that need no provider).
 */
export async function insertExecution(
  pool: Pool,
  operationId: string,
  state: string,
  cost: { reserved?: string; actual?: string | null } = {},
) {
  const id = randomUUID()
  await pool.query(
    `INSERT INTO ai_executions(id,settings_key,operation_id,configuration,publication_token,state,mode,cause)
     VALUES($1,'matching',$2,'{}',$3,$4,'single',$5)`,
    [
      id,
      operationId,
      randomUUID(),
      state,
      ['failed', 'uncertain', 'retried'].includes(state) ? 'unknown' : null,
    ],
  )
  await pool.query(
    `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,actual_pln,configuration,execution_id)
     VALUES($1,NULL,0,NULL,1,$2,'execution',$3,$4,$5,'{}',$1)`,
    [
      id,
      randomUUID(),
      cost.actual === undefined || cost.actual === null ? 'open' : 'settled',
      cost.reserved ?? '0.020500',
      cost.actual ?? null,
    ],
  )
  await pool.query('UPDATE matching_requests SET execution_id=$2 WHERE id=$1', [
    operationId,
    id,
  ])
  return id
}
