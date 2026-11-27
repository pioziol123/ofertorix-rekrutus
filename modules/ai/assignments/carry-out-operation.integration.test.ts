import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { closePool, setPool, transaction } from '../../../lib/db.ts'
import { createQueue, stopQueues } from '../../../lib/queues/index.ts'
import { openAiExecutor } from '../infrastructure/adapters/openai/openai.ts'
import { registerExecutor } from '../infrastructure/adapters/registry.ts'
import {
  placeAssignment,
  runOperation,
  type AssignmentRequest,
} from '../index.ts'
import { carryOutOperation } from './carry-out-operation.ts'

/**
 * T2-AC06: after an operation, the request sent and every raw response
 * are stored with it, also when the response could not be read; the
 * writers stop when the operation no longer runs. T4-AC04: a provider
 * that cannot be reached is an ordinary failure, and the assignment gets
 * its next operation. The paid executor runs on a simulated OpenAI.
 */

const settings = vi.hoisted(() => ({}) as Record<string, unknown>)
vi.mock('./assignment-settings.ts', () => ({ assignmentSettings: settings }))

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/** The simulated provider's next answers, taken in order. */
let next: (() => Promise<Response>)[] = []
const fetcher = vi.fn<typeof fetch>(() => next.shift()!())

const single: AssignmentRequest = {
  settingsName: 'assessments',
  type: 'single',
  label: 'Offer 12',
  instruction: 'Assess the offer.',
  input: 'Ad text',
  responseFormat: { name: 'assessment', schema: { type: 'object' } },
}
const agent: AssignmentRequest = {
  settingsName: 'research',
  type: 'agent',
  label: 'Example Ltd',
  instruction: 'Gather facts about the company.',
  input: 'Example Ltd',
  responseFormat: { name: 'report', schema: { type: 'object' } },
  agent: { tools: ['web_search'], resultInstruction: 'Write the report.' },
}

const answer = JSON.stringify({
  id: 'resp-1',
  status: 'completed',
  usage: { input_tokens: 10, output_tokens: 5 },
  output: [
    { type: 'message', content: [{ type: 'output_text', text: '{"a":1}' }] },
  ],
})
const search = JSON.stringify({
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

integration('carrying out an operation on a real database', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const schema = `ai_run_${suffix}`
  const queueSchema = `aiq_run_${suffix}`
  let previousQueueSchema: string | undefined
  let admin: Pool
  let pool: Pool

  const exchangeOf = async (operationId: string) =>
    (
      await pool.query(
        `SELECT sequence,kind,content FROM ai_operation_exchange
         WHERE operation_id=$1 ORDER BY sequence`,
        [operationId],
      )
    ).rows

  /** Places an assignment and starts its operation, as T3 will. */
  async function runningOperation(request: AssignmentRequest) {
    const { assignmentId } = await transaction(() => placeAssignment(request))
    const { rows } = await pool.query(
      `UPDATE ai_operations SET state='running',waits_for=NULL,started_at=now()
       WHERE assignment_id=$1 RETURNING id`,
      [assignmentId],
    )
    return rows[0].id as string
  }

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 4,
    })
    const sql: string[] = []
    for (const migration of [
      '1770000000004_profiles',
      '1770000000027_ai_assignments',
      '1770000000030_ai_operation_exchange',
      '1770000000031_ai_budget_default_limit',
      '1770000000035_ai_budget_carried_amounts',
    ])
      createRequire(import.meta.url)(`../../../migrations/${migration}.cjs`).up(
        { sql: (statement: string) => sql.push(statement) },
      )
    await pool.query(sql.join('\n'))
    setPool(pool)
    previousQueueSchema = process.env.PG_BOSS_SCHEMA
    process.env.PG_BOSS_SCHEMA = queueSchema
    await createQueue('ai-operation-openai', 'exclusivity')
    registerExecutor(openAiExecutor(fetcher))
    Object.assign(settings, {
      assessments: {
        executor: 'openai',
        parameters: { model: 'gpt-6-luna', reasoningEffort: 'low' },
        requestingModule: 'Dopasowanie',
      },
      research: {
        executor: 'openai',
        parameters: { model: 'gpt-6-luna', reasoningEffort: 'low' },
        requestingModule: 'Firmy',
      },
    })
  }, 30_000)

  afterAll(async () => {
    await stopQueues()
    await closePool()
    if (previousQueueSchema === undefined) delete process.env.PG_BOSS_SCHEMA
    else process.env.PG_BOSS_SCHEMA = previousQueueSchema
    vi.unstubAllEnvs()
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin?.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
    await admin?.end()
  })

  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    fetcher.mockClear()
    next = []
  })

  it('stores the request sent and the raw response with the operation (T2-AC06)', async () => {
    const operationId = await runningOperation(single)
    next = [async () => new Response(answer)]
    const outcome = await carryOutOperation(operationId)
    expect(outcome).toMatchObject({ kind: 'result', content: { a: 1 } })
    expect(await exchangeOf(operationId)).toEqual([
      {
        sequence: 1,
        kind: 'request',
        content: String(fetcher.mock.calls[0]![1]!.body),
      },
      { sequence: 2, kind: 'response', content: answer },
    ])
  })

  it('stores a raw response that could not be read (T2-AC06)', async () => {
    const operationId = await runningOperation(single)
    next = [async () => new Response('<html>gateway</html>', { status: 200 })]
    const outcome = await carryOutOperation(operationId)
    expect(outcome).toMatchObject({ kind: 'failed', cause: 'format' })
    expect((await exchangeOf(operationId)).map((row) => row.content)).toEqual([
      String(fetcher.mock.calls[0]![1]!.body),
      '<html>gateway</html>',
    ])
  })

  it('stores both requests and responses of an agent session and its step log with the materials in the executor state (T2-AC06)', async () => {
    const operationId = await runningOperation(agent)
    next = [async () => new Response(search), async () => new Response(answer)]
    const outcome = await carryOutOperation(operationId)
    expect(outcome).toMatchObject({ kind: 'result', content: { a: 1 } })
    expect(
      (await exchangeOf(operationId)).map((row) => [row.kind, row.content]),
    ).toEqual([
      ['request', String(fetcher.mock.calls[0]![1]!.body)],
      ['response', search],
      ['request', String(fetcher.mock.calls[1]![1]!.body)],
      ['response', answer],
    ])
    const { rows } = await pool.query(
      'SELECT executor_state FROM ai_operations WHERE id=$1',
      [operationId],
    )
    expect(rows[0].executor_state.steps).toMatchObject([
      { step: 'search', status: 'completed' },
      { step: 'synthesis', status: 'completed' },
    ])
    expect(
      openAiExecutor(fetcher).materials(rows[0].executor_state),
    ).toMatchObject([{ id: 0, text: 'Project uses PHP.' }])
  })

  it('writes nothing more once the operation no longer runs, and carries out no operation that does not run', async () => {
    const operationId = await runningOperation(single)
    next = [
      async () => {
        await pool.query(
          `UPDATE ai_operations SET state='uncertain',cause='unknown',finished_at=now()
           WHERE id=$1`,
          [operationId],
        )
        return new Response(answer)
      },
    ]
    await carryOutOperation(operationId)
    expect((await exchangeOf(operationId)).map((row) => row.kind)).toEqual([
      'request',
    ])
    fetcher.mockClear()
    expect(await carryOutOperation(operationId)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails the attempt, deciding no outcome, when no executor exists under the frozen name', async () => {
    const operationId = await runningOperation(single)
    await pool.query(
      `UPDATE ai_assignments SET executor='gone'
       WHERE id=(SELECT assignment_id FROM ai_operations WHERE id=$1)`,
      [operationId],
    )
    await expect(carryOutOperation(operationId)).rejects.toThrow(
      'No executor gone',
    )
    expect(fetcher).not.toHaveBeenCalled()
    expect(await exchangeOf(operationId)).toEqual([])
    const { rows } = await pool.query(
      'SELECT state FROM ai_operations WHERE id=$1',
      [operationId],
    )
    expect(rows[0].state).toBe('running')
  })

  it('ends an operation whose provider cannot be reached as an ordinary failure, and adds the next operation of the assignment (T4-AC04, T4-R05)', async () => {
    const { assignmentId } = await transaction(() => placeAssignment(single))
    next = [
      async () => {
        throw Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('ECONNREFUSED'), {
            code: 'ECONNREFUSED',
          }),
        })
      },
    ]
    const { rows: placed } = await pool.query(
      'SELECT id FROM ai_operations WHERE assignment_id=$1',
      [assignmentId],
    )
    await runOperation({ operationId: placed[0].id })
    expect(fetcher).toHaveBeenCalledTimes(1)
    const { rows } = await pool.query(
      `SELECT ordinal,origin,state,waits_for,cause,retryable,actual_cost
       FROM ai_operations WHERE assignment_id=$1 ORDER BY ordinal`,
      [assignmentId],
    )
    expect(rows).toEqual([
      {
        ordinal: 1,
        origin: 'automatic',
        state: 'failed',
        waits_for: null,
        cause: 'network',
        retryable: true,
        actual_cost: '0.000000',
      },
      {
        ordinal: 2,
        origin: 'automatic',
        state: 'pending',
        waits_for: 'executor',
        cause: null,
        retryable: null,
        actual_cost: null,
      },
    ])
    const { rows: assignment } = await pool.query(
      'SELECT status FROM ai_assignments WHERE id=$1',
      [assignmentId],
    )
    expect(assignment[0].status).toBe('in_progress')
  })
})
