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
import {
  createQueue,
  defineJob,
  stopQueues,
} from '../../../lib/queues/index.ts'
import {
  AssignmentError,
  placeAssignment,
  readAssignmentStatuses,
  type AssignmentErrorCode,
  type AssignmentRequest,
} from '../index.ts'
import type {
  ExecutorDeclaration,
  OperationJobData,
  PriceList,
} from '../executors/declaration.ts'
import { registerExecutor } from '../executors/registry.ts'

// The settings of requesting modules in this test: names a test defines,
// on test executors. A test may change them after placing.
const settings = vi.hoisted(() => ({}) as Record<string, unknown>)
vi.mock('./assignment-settings.ts', () => ({ assignmentSettings: settings }))

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

const priceList: PriceList = {
  model: 'simulated-model',
  version: 'prices-1',
  inputUsdPerMillion: '1',
  outputUsdPerMillion: '2',
  usdPln: '4',
  fxVersion: 'fx-1',
  maxInputTokens: 1000,
  maxOutputTokens: 500,
}

const job = defineJob<OperationJobData>({
  queue: 'wt-ai-operation',
  key: { mode: 'exclusivity', value: 'wt-ai-operation' },
})

let configured = true

/** A test executor: both types, two models, web search for the agent. */
const simulated: ExecutorDeclaration = {
  name: 'simulated',
  job,
  services: {
    single: {
      offers: [
        { parameters: { model: 'simulated-model', effort: 'low' }, priceList },
        { parameters: { model: 'simulated-model', effort: 'high' }, priceList },
      ],
      tools: [],
    },
    agent: {
      offers: [
        { parameters: { model: 'simulated-model', effort: 'low' }, priceList },
      ],
      tools: ['web_search'],
    },
  },
  configured: () => configured,
}

/** A test executor of single answers only, whose agent offers no tool. */
const singleOnly: ExecutorDeclaration = {
  name: 'single-only',
  job,
  services: {
    single: {
      offers: [{ parameters: { model: 'small' }, priceList: null }],
      tools: [],
    },
  },
  configured: () => true,
}
const toolless: ExecutorDeclaration = {
  ...singleOnly,
  name: 'toolless',
  services: {
    agent: {
      offers: [{ parameters: { model: 'small' }, priceList: null }],
      tools: [],
    },
  },
}

const single = (
  overrides: Partial<AssignmentRequest> = {},
): AssignmentRequest =>
  ({
    settingsName: 'summaries',
    type: 'single',
    label: 'Offer 12 at Example',
    instruction: 'Summarise the text.',
    input: 'Some text',
    responseFormat: {
      name: 'summary',
      schema: { type: 'object', properties: { text: { type: 'string' } } },
    },
    ...overrides,
  }) as AssignmentRequest

const agent = (overrides: Partial<AssignmentRequest> = {}): AssignmentRequest =>
  ({
    settingsName: 'summaries',
    type: 'agent',
    label: 'Example Ltd',
    instruction: 'Gather sources about the company.',
    input: 'Example Ltd, Warsaw',
    agent: {
      tools: ['web_search'],
      resultInstruction: 'Write the report from the evidence.',
    },
    ...overrides,
  }) as AssignmentRequest

integration(
  'placing assignments and reading their status on a real database',
  () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
    const schema = `ai_asg_${suffix}`
    const queueSchema = `aiq_asg_${suffix}`
    let previousQueueSchema: string | undefined
    let admin: Pool
    let pool: Pool

    const assignments = async () =>
      (await pool.query('SELECT * FROM ai_assignments ORDER BY placed_at,id'))
        .rows
    const operations = async () =>
      (
        await pool.query(
          'SELECT * FROM ai_operations ORDER BY pending_since,id',
        )
      ).rows
    const jobs = async () =>
      (
        await admin.query(
          `SELECT data->>'operationId' AS "operationId" FROM ${queueSchema}.job WHERE name=$1 ORDER BY created_on`,
          [job.queue],
        )
      ).rows.map((row: { operationId: string }) => row.operationId)

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
      ])
        createRequire(import.meta.url)(
          `../../../migrations/${migration}.cjs`,
        ).up({ sql: (statement: string) => sql.push(statement) })
      await pool.query(sql.join('\n'))
      setPool(pool)
      previousQueueSchema = process.env.PG_BOSS_SCHEMA
      process.env.PG_BOSS_SCHEMA = queueSchema
      await createQueue(job.queue, 'exclusivity')
      for (const executor of [simulated, singleOnly, toolless])
        registerExecutor(executor)
    }, 30_000)

    afterAll(async () => {
      await stopQueues()
      await closePool()
      if (previousQueueSchema === undefined) delete process.env.PG_BOSS_SCHEMA
      else process.env.PG_BOSS_SCHEMA = previousQueueSchema
      await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin?.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin?.end()
    })

    beforeEach(async () => {
      configured = true
      for (const name of Object.keys(settings))
        Reflect.deleteProperty(settings, name)
      Object.assign(settings, {
        summaries: {
          executor: 'simulated',
          parameters: { model: 'simulated-model', effort: 'low' },
          requestingModule: 'Summaries',
        },
      })
      await pool.query('TRUNCATE ai_operations, ai_assignments')
      await admin.query(`DELETE FROM ${queueSchema}.job WHERE name=$1`, [
        job.queue,
      ])
    })

    it('creates an assignment placed in a committed save in progress with one pending operation, its job sent, and the time limit of 7 days (T1-AC01, T1-R01, T1-R05)', async () => {
      const { assignmentId } = await transaction(() =>
        placeAssignment(single()),
      )
      const [assignment] = await assignments()
      expect(assignment).toMatchObject({
        id: assignmentId,
        status: 'in_progress',
        failure_reason: null,
        finished_at: null,
        automatic_operation_limit: 3,
      })
      expect(
        assignment.deadline.getTime() - assignment.placed_at.getTime(),
      ).toBe(7 * 24 * 3600 * 1000)
      const rows = await operations()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        assignment_id: assignmentId,
        ordinal: 1,
        origin: 'automatic',
        state: 'pending',
        waits_for: 'executor',
        cause: null,
        retryable: null,
        potential_cost: null,
        actual_cost: null,
        budget_month: null,
        price_list: null,
        started_at: null,
        finished_at: null,
      })
      expect(await jobs()).toEqual([rows[0].id])
    })

    it('leaves no assignment, operation or job of a save that is rolled back (T1-AC01, T1-R01)', async () => {
      await expect(
        transaction(async () => {
          await placeAssignment(single())
          await placeAssignment(agent())
          throw new Error('The requesting module rolls back')
        }),
      ).rejects.toThrow('The requesting module rolls back')
      expect(await assignments()).toEqual([])
      expect(await operations()).toEqual([])
      expect(await jobs()).toEqual([])
    })

    it('keeps every value of a single and an agent assignment with the executor and parameters of the settings, also after the settings change (T1-AC02, T1-R02, T1-R03)', async () => {
      const first = await placeAssignment(single())
      const second = await placeAssignment(
        agent({
          responseFormat: { name: 'report', schema: { type: 'object' } },
        }),
      )
      const expected = [
        {
          id: first.assignmentId,
          settings_name: 'summaries',
          type: 'single',
          label: 'Offer 12 at Example',
          instruction: 'Summarise the text.',
          input: 'Some text',
          response_format: {
            name: 'summary',
            schema: {
              type: 'object',
              properties: { text: { type: 'string' } },
            },
          },
          agent_options: null,
          executor: 'simulated',
          executor_parameters: { model: 'simulated-model', effort: 'low' },
        },
        {
          id: second.assignmentId,
          settings_name: 'summaries',
          type: 'agent',
          label: 'Example Ltd',
          instruction: 'Gather sources about the company.',
          input: 'Example Ltd, Warsaw',
          response_format: { name: 'report', schema: { type: 'object' } },
          agent_options: {
            tools: ['web_search'],
            resultInstruction: 'Write the report from the evidence.',
          },
          executor: 'simulated',
          executor_parameters: { model: 'simulated-model', effort: 'low' },
        },
      ]
      expect(await assignments()).toMatchObject(expected)

      settings.summaries = {
        executor: 'single-only',
        parameters: { model: 'small' },
        requestingModule: 'Summaries',
      }
      const third = await placeAssignment(single({ responseFormat: null }))
      const rows = await assignments()
      expect(rows.slice(0, 2)).toMatchObject(expected)
      expect(rows[2]).toMatchObject({
        id: third.assignmentId,
        response_format: null,
        executor: 'single-only',
        executor_parameters: { model: 'small' },
      })
    })

    const refusals: Array<
      [string, AssignmentErrorCode, () => AssignmentRequest]
    > = [
      [
        'an unknown settings name',
        'unknown_settings',
        () => single({ settingsName: 'nobody' }),
      ],
      [
        'incomplete settings',
        'unknown_settings',
        () => {
          settings.incomplete = { executor: 'simulated' }
          return single({ settingsName: 'incomplete' })
        },
      ],
      [
        'settings naming an executor that does not exist',
        'unknown_settings',
        () => {
          settings.lost = {
            executor: 'lost',
            parameters: {},
            requestingModule: 'Lost',
          }
          return single({ settingsName: 'lost' })
        },
      ],
      [
        'a type the executor does not offer',
        'unsupported_type',
        () => {
          settings.small = {
            executor: 'single-only',
            parameters: { model: 'small' },
            requestingModule: 'Small',
          }
          return agent({ settingsName: 'small' })
        },
      ],
      [
        'a parameter outside the executor’s catalogue',
        'invalid_parameters',
        () => {
          settings.summaries = {
            executor: 'simulated',
            parameters: { model: 'simulated-model', effort: 'extreme' },
            requestingModule: 'Summaries',
          }
          return single()
        },
      ],
      [
        'a parameter set the executor offers for another type only',
        'invalid_parameters',
        () => {
          settings.summaries = {
            executor: 'simulated',
            parameters: { model: 'simulated-model', effort: 'high' },
            requestingModule: 'Summaries',
          }
          return agent()
        },
      ],
      [
        'an agent tool the executor does not offer',
        'invalid_parameters',
        () => {
          settings.toolless = {
            executor: 'toolless',
            parameters: { model: 'small' },
            requestingModule: 'Toolless',
          }
          return agent({ settingsName: 'toolless' })
        },
      ],
      [
        'an executor without its configuration',
        'not_configured',
        () => {
          configured = false
          return single()
        },
      ],
      [
        'an unknown agent tool',
        'unknown_tool',
        () =>
          agent({
            agent: {
              tools: ['shell' as 'web_search'],
              resultInstruction: 'Write.',
            },
          } as Partial<AssignmentRequest>),
      ],
      ['an empty label', 'empty_content', () => single({ label: '  ' })],
      [
        'an empty instruction',
        'empty_content',
        () => single({ instruction: '' }),
      ],
      ['an empty input', 'empty_content', () => single({ input: '\n' })],
      [
        'an empty result instruction',
        'empty_content',
        () =>
          agent({
            agent: { tools: ['web_search'], resultInstruction: ' ' },
          } as Partial<AssignmentRequest>),
      ],
      [
        'a request larger than the price list covers, when the check is asked for',
        'request_too_large',
        () => single({ input: 'x'.repeat(1001), refuseOversized: true }),
      ],
    ]

    it.each(refusals)(
      'refuses %s with its error and creates nothing (T1-AC03, T1-R04)',
      async (_case, code, request) => {
        await expect(placeAssignment(request())).rejects.toEqual(
          new AssignmentError(code),
        )
        expect(await assignments()).toEqual([])
        expect(await operations()).toEqual([])
        expect(await jobs()).toEqual([])
      },
    )

    it('places a large request when the requesting module did not ask for the size check (T1-R04)', async () => {
      await placeAssignment(single({ input: 'x'.repeat(1001) }))
      expect(await assignments()).toHaveLength(1)
    })

    it('places two assignments with the same input under the same settings name (T1-AC04, T1-R06)', async () => {
      const first = await placeAssignment(single())
      const second = await placeAssignment(single())
      expect(first.assignmentId).not.toBe(second.assignmentId)
      expect((await assignments()).map((row) => row.id).sort()).toEqual(
        [first.assignmentId, second.assignmentId].sort(),
      )
      expect(await operations()).toHaveLength(2)
    })

    it('reads the status of each known identifier of a list, reports an unknown one as not found and gives nothing beyond identifier and status (T1-AC05, T1-R07)', async () => {
      const first = await placeAssignment(single())
      const second = await placeAssignment(agent())
      await pool.query(
        `UPDATE ai_assignments SET status='needs_attention' WHERE id=$1`,
        [second.assignmentId],
      )
      const unknown = randomUUID()
      const statuses = await readAssignmentStatuses([
        second.assignmentId,
        unknown,
        first.assignmentId,
        'not-an-identifier',
        first.assignmentId,
      ])
      expect(statuses).toStrictEqual({
        found: [
          { assignmentId: second.assignmentId, status: 'needs_attention' },
          { assignmentId: first.assignmentId, status: 'in_progress' },
        ],
        notFound: [unknown, 'not-an-identifier'],
      })
      expect(await readAssignmentStatuses([])).toStrictEqual({
        found: [],
        notFound: [],
      })
    })
  },
)
