import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import { vi } from 'vitest'
import { aiExecutionQueue, runExecution } from '../modules/ai/index.ts'
import {
  BatchClient,
  openAiBatch,
  type Batch,
  type BatchLine,
  type BatchRequestLine,
} from '../modules/ai/infrastructure/adapters/openai-batch.ts'
import { openAiProvider } from '../modules/ai/infrastructure/adapters/openai.ts'
import { registerProviderAdapter } from '../modules/ai/provider-registry.ts'
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

export async function migrate(pool: Pool, names = matchingMigrations) {
  const statements: string[] = []
  for (const name of names)
    createRequire(import.meta.url)(`../migrations/${name}.cjs`).up({
      sql: (s: string) => statements.push(s),
    })
  await pool.query(statements.join('\n'))
}

/** The test price list; it holds for single calls and batch items. */
export const pricing = {
  model: 'test-only',
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

/** A queue client that keeps the jobs sent to it, for the test to run. */
export function recordingQueue() {
  const send = vi.fn(async (..._args: unknown[]) => randomUUID())
  const boss = { send } as unknown as PgBoss
  let done = 0
  const executionJobs = () =>
    send.mock.calls
      .filter((call) => call[0] === aiExecutionQueue)
      .map((call) => (call[1] as { executionId: string }).executionId)
  return {
    boss,
    send,
    executionJobs,
    /** Forgets the jobs sent so far. */
    reset() {
      send.mockClear()
      done = 0
    },
    /**
     * Runs every AI execution job sent and not run yet, until none is left,
     * as the queue would: a job that fails does not stop the others. The
     * first failure is raised once every job ran.
     */
    async work() {
      const failures: unknown[] = []
      for (;;) {
        const jobs = executionJobs()
        if (done >= jobs.length) break
        const next = jobs.slice(done)
        done = jobs.length
        for (const executionId of next)
          await runExecution(executionId).catch((error: unknown) => {
            failures.push(error)
          })
      }
      if (failures.length) throw failures[0]
    },
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
