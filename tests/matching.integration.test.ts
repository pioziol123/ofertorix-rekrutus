import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { z } from 'zod'
import { closePool, setPool } from '../lib/db.ts'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { emptyProfile } from '../lib/profile/model.ts'
import {
  readExecution,
  readExecutionHistory,
  recoverExecutions,
  registerResultReceiver,
  useAiQueue,
} from '../modules/ai/index.ts'
import { budgetMonth } from '../modules/ai/domain/cost.ts'
import {
  assessmentReceiver,
  assessmentSettingsKey,
} from '../modules/matching/index.ts'
import { assessmentSchema, type MatchingInput } from '../lib/matching/model.ts'
import { readBatchArchive } from '../lib/matching/archive.ts'
import { enqueueMatching, readMatching } from '../lib/matching/store.ts'
import { usePricing } from './ai-test-configuration.ts'
import {
  migrate,
  pricing,
  recordingQueue,
  responseBody,
  SimulatedOpenAi,
  unknownAssessment,
} from './matching-ai.fixtures.ts'

// The settings and price lists AI keeps in code, replaced for the test.
vi.mock(
  '../modules/ai/client-settings.ts',
  () => import('./ai-test-configuration.ts'),
)
vi.mock(
  '../modules/ai/model-catalog.ts',
  () => import('./ai-test-configuration.ts'),
)

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration(
  'single assessments through the AI contract in isolated PostgreSQL with no external API (0mq.21)',
  () => {
    const schema = `matching_test_${randomUUID().replaceAll('-', '')}`
    let admin: Pool,
      pool: Pool,
      ad: string,
      revision: string,
      profileVersion: string,
      openAi: SimulatedOpenAi
    const queue = recordingQueue()
    beforeAll(async () => {
      admin = new Pool({ connectionString: process.env.DATABASE_URL })
      await admin.query(`CREATE SCHEMA ${schema}`)
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema}`,
      })
      await migrate(pool)
      setPool(pool)
      useAiQueue(queue.boss)
      registerResultReceiver(assessmentSettingsKey, assessmentReceiver)
    })
    beforeEach(async () => {
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'never-send-test-key')
      usePricing('matching', pricing, ['single', 'batch'])
      openAi = new SimulatedOpenAi()
      queue.reset()
      await pool.query(
        'TRUNCATE matching_requests,matching_rating_heads,matching_rating_revisions,ai_executions,ai_attempts,ai_budget_months,profile_imports,profile_head,profile_versions,source_ads,source_scopes CASCADE',
      )
      ad = randomUUID()
      revision = randomUUID()
      profileVersion = randomUUID()
      const scope = randomUUID()
      await pool.query(
        "INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,'solid',$2,'{}')",
        [scope, randomUUID()],
      )
      await pool.query(
        "INSERT INTO source_ads(id,source,external_id,last_seen_scope_id) VALUES($1,'solid',$2,$3)",
        [ad, randomUUID(), scope],
      )
      await pool.query(
        "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'test',$3)",
        [
          revision,
          ad,
          {
            title: 'PHP developer',
            description: 'PHP backend',
            skills: [{ name: 'PHP' }],
            seniority: 'senior',
          },
        ],
      )
      await pool.query(
        'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
        [ad, revision],
      )
      await pool.query(
        'INSERT INTO profile_versions(id,number,data,command_id,draft_revision) VALUES($1,1,$2,$3,1)',
        [profileVersion, emptyProfile(), randomUUID()],
      )
      await pool.query(
        'INSERT INTO profile_head(singleton,active_version_id) VALUES(true,$1)',
        [profileVersion],
      )
    })
    afterAll(async () => {
      vi.unstubAllEnvs()
      await closePool()
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await admin.end()
      }
    })
    const row = async (id: string) =>
      (await pool.query('SELECT * FROM matching_requests WHERE id=$1', [id]))
        .rows[0]
    const latest = async (id: string) =>
      (await readExecutionHistory(id)).at(-1)!
    const revisions = async (id: string) =>
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM matching_rating_revisions WHERE request_id=$1',
          [id],
        )
      ).rows[0].n

    it('keeps the exact request body and raw response of a single assessment in the archive its history row opens (E03-AC02, SD 0mq.17 decision 5)', async () => {
      const request = await enqueueMatching(ad)
      await queue.work()
      const archive = await readBatchArchive(request.id)
      const execution = await latest(request.id)
      expect(archive!.operationId).toBe(execution.id)
      expect(archive!.reconstructedInput).toBeNull()
      const byKind = Object.fromEntries(
        archive!.artifacts.map((a) => [a.kind, a]),
      )
      expect(archive!.artifacts).toHaveLength(2)
      // Exactly what was sent and what came back.
      expect(JSON.parse(byKind.input!.content)).toEqual(openAi.singleCalls[0])
      expect(JSON.parse(byKind.output!.content)).toEqual(
        openAi.answer(
          JSON.parse(openAi.singleCalls[0]!.input[0]!.content[0]!.text),
          openAi.singleCalls[0]!,
        ),
      )
      // ASSUMPTION(oferty-pracy-0mq.21/ASM-3): the history row carries no
      // provider batch number.
      const [row] = (await readMatching(ad)).history
      expect(row).not.toHaveProperty('batch_id')
    })

    it('deduplicates concurrent requests of one offer into one single execution of the request (AM-AC01)', async () => {
      const [a, b] = await Promise.all([
        enqueueMatching(ad),
        enqueueMatching(ad),
      ])
      expect(a.id).toBe(b.id)
      expect([a.reused, b.reused].sort()).toEqual([false, true])
      expect(queue.executionJobs()).toHaveLength(1)
      const stored = await row(a.id)
      expect(stored).toMatchObject({
        state: 'requested',
        profile_version_id: profileVersion,
        ad_revision_id: revision,
        attempt_id: null,
        request_payload: null,
      })
      expect(await readExecutionHistory(a.id)).toMatchObject([
        {
          id: stored.execution_id,
          settingsKey: 'matching',
          mode: 'single',
          state: 'queued',
          cost: { reserved: '0.020500', actual: null },
        },
      ])
    })

    it('sends the instruction, the schema and the input of the request (E03-AC01)', async () => {
      const request = await enqueueMatching(ad)
      const stored = await row(request.id)
      await queue.work()
      expect(openAi.singleCalls).toHaveLength(1)
      const body = openAi.singleCalls[0]!
      expect(body).toMatchObject({
        model: 'test-only',
        max_output_tokens: 500,
        reasoning: { effort: 'low' },
        instructions: expect.stringMatching(
          /^Evaluate job fit in Polish using only supplied professional profile and offer/,
        ),
        text: {
          format: {
            name: 'offer_assessment',
            schema: z.toJSONSchema(assessmentSchema),
          },
        },
      })
      expect(JSON.parse(body.input[0]!.content[0]!.text)).toEqual(stored.input)
      expect(JSON.stringify(body)).not.toContain('never-send-test-key')
    })

    it('settles usage, publishes the assessment and shows its state and cost in the history (AM-AC01)', async () => {
      const request = await enqueueMatching(ad)
      await queue.work()
      expect(await row(request.id)).toMatchObject({
        state: 'requested',
        error: null,
        calculation: { rating: null, completeness: 0 },
      })
      expect(await latest(request.id)).toMatchObject({
        state: 'completed',
        cost: { reserved: '0.020500', actual: '0.000120' },
        usage: { inputTokens: 100, outputTokens: 20 },
      })
      expect(await revisions(request.id)).toBe(1)
      const view = await readMatching(ad)
      expect(view).toMatchObject({
        configured: true,
        maximumCostPln: '0.020500',
        current: { request_id: request.id, stale: false },
      })
      expect(view.history[0]).toMatchObject({
        id: request.id,
        state: 'completed',
        cost: { reserved: '0.020500', actual: '0.000120' },
        stale: false,
      })
      await queue.work()
      expect(openAi.singleCalls).toHaveLength(1)
    })

    it('calls the provider and publishes once when the job of an execution runs twice at the same time (E03-AC04)', async () => {
      const request = await enqueueMatching(ad)
      const [job] = queue.executionJobs()
      const { runExecution } = await import('../modules/ai/index.ts')
      await Promise.all([runExecution(job!), runExecution(job!)])
      expect(openAi.singleCalls).toHaveLength(1)
      expect(await revisions(request.id)).toBe(1)
      expect((await latest(request.id)).cost.actual).toBe('0.000120')
    })

    it('keeps the result when its delivery fails and publishes it once on the next delivery (E03-AC04)', async () => {
      const request = await enqueueMatching(ad)
      // The ad is gone from the Sources read for the first delivery.
      await pool.query(
        'UPDATE source_ads SET current_revision_id=NULL WHERE id=$1',
        [ad],
      )
      await expect(queue.work()).rejects.toThrow('Nie znaleziono oferty.')
      expect(await latest(request.id)).toMatchObject({
        state: 'delivering',
        cost: { actual: null },
        delivery: { attempts: 1 },
      })
      expect(await revisions(request.id)).toBe(0)
      await pool.query(
        'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
        [ad, revision],
      )
      const { runExecution } = await import('../modules/ai/index.ts')
      await runExecution((await latest(request.id)).id)
      await runExecution((await latest(request.id)).id)
      expect(await latest(request.id)).toMatchObject({
        state: 'completed',
        cost: { actual: '0.000120' },
      })
      expect(openAi.singleCalls).toHaveLength(1)
      expect(await revisions(request.id)).toBe(1)
    })

    it('publishes a result for the profile version the request recorded and shows it stale after a newer one is confirmed', async () => {
      const request = await enqueueMatching(ad)
      const confirmed = randomUUID()
      await pool.query(
        'INSERT INTO profile_versions(id,number,data,command_id,draft_revision) VALUES($1,2,$2,$3,2)',
        [confirmed, emptyProfile(), randomUUID()],
      )
      await pool.query('UPDATE profile_head SET active_version_id=$1', [
        confirmed,
      ])
      await queue.work()
      const view = await readMatching(ad)
      expect(view.current).toMatchObject({
        request_id: request.id,
        profile_number: 1,
        stale: true,
      })
      expect(view.history[0]).toMatchObject({ state: 'completed', stale: true })
    })

    it('settles paid usage on a refusal without publishing an assessment', async () => {
      openAi.answer = (input) =>
        responseBody(JSON.stringify(unknownAssessment(input)), {
          type: 'refusal',
        })
      const request = await enqueueMatching(ad)
      await queue.work()
      expect(await row(request.id)).toMatchObject({
        result: null,
        calculation: null,
        error:
          'Nie udało się potwierdzić wiarygodnej oceny. Poprzednie wyniki pozostały bez zmian. [Ocena: response_refusal]',
      })
      expect(await latest(request.id)).toMatchObject({
        state: 'failed',
        cause: 'refused',
        cost: { actual: '0.000120' },
      })
      expect(await revisions(request.id)).toBe(0)
      expect((await readMatching(ad)).history[0]).toMatchObject({
        state: 'failed',
        cost: { actual: '0.000120' },
      })
    })

    it.each([
      'schema',
      'criterion_mismatch',
      'missing_criterion',
      'unknown_score',
      'unknown_criterion_rated',
      'rated_score_missing',
      'rated_evidence_missing',
      'unsupported_assessment',
      'profile_evidence_missing',
      'offer_evidence_missing',
      'accepted',
    ])(
      'rejects an assessment Matching cannot confirm (%s) with a safe diagnostic and settles its cost (E03-AC01)',
      async (code) => {
        const request = await enqueueMatching(ad)
        await pool.query('UPDATE matching_requests SET input=$2 WHERE id=$1', [
          request.id,
          {
            profile: 'PHP private profile source',
            offer: 'PHP private offer source',
            criteria: [
              {
                id: 'php',
                group: 'technologies',
                label: 'PHP',
                unknown: code === 'unknown_criterion_rated',
              },
            ],
            checks: [],
          } satisfies MatchingInput,
        ])
        openAi.answer = () => {
          const value = {
            summary: 'Potwierdzone PHP',
            strengths: [],
            gaps: [],
            criteria: [
              {
                id: 'php',
                state: 'match',
                score: 100 as number | null,
                profileEvidence: 'PHP' as string | null,
                offerEvidence: 'PHP' as string | null,
                reason: 'PHP obecne w obu źródłach',
              },
            ],
          }
          const criterion = value.criteria[0]!
          if (code === 'schema') criterion.score = 101
          if (code === 'criterion_mismatch') value.criteria = []
          if (code === 'missing_criterion')
            criterion.id = 'private forged identifier'
          if (code === 'unknown_score') criterion.state = 'unknown'
          if (code === 'rated_score_missing') criterion.score = null
          if (code === 'rated_evidence_missing') criterion.offerEvidence = null
          if (code === 'unsupported_assessment') criterion.reason = '   '
          if (code === 'profile_evidence_missing')
            criterion.profileEvidence = 'private invented profile secret'
          if (code === 'offer_evidence_missing')
            criterion.offerEvidence = 'private invented offer secret'
          return responseBody(JSON.stringify(value))
        }
        await queue.work()
        const saved = await row(request.id)
        const execution = await latest(request.id)
        if (code === 'accepted') {
          expect(saved).toMatchObject({
            error: null,
            result: { criteria: [{ id: 'php', score: 100 }] },
            calculation: { rating: 100, completeness: 40 },
          })
          expect(execution.state).toBe('completed')
        } else if (code === 'schema') {
          // AI passes on only a result that matches the response schema.
          expect(saved).toMatchObject({
            result: null,
            error:
              'Nie udało się potwierdzić wiarygodnej oceny. Poprzednie wyniki pozostały bez zmian. [Ocena: response_json]',
          })
          expect(execution).toMatchObject({ state: 'failed', cause: 'format' })
        } else {
          expect(saved).toMatchObject({
            result: null,
            calculation: null,
            error: `Nie udało się potwierdzić wiarygodnej oceny. Poprzednie wyniki pozostały bez zmian. [Ocena: ${code}]`,
          })
          expect(execution).toMatchObject({
            state: 'rejected',
            rejectionReason: code,
          })
        }
        expect(saved.error ?? '').not.toMatch(
          /private|secret|provider|forged|Zod/,
        )
        expect(execution.cost.actual).toBe('0.000120')
        expect((await readMatching(ad)).history[0]!.error).toBe(saved.error)
      },
    )

    it('refuses a single assessment whose input is above the input cap of the price list, before reserving (0mq.21 ASM-5)', async () => {
      usePricing('matching', { ...pricing, maxInputTokens: 100 }, [
        'single',
        'batch',
      ])
      await expect(enqueueMatching(ad)).rejects.toThrow(
        'Wejście przekracza skonfigurowany limit tokenów. Zwiększ limit lub skróć profil.',
      )
      expect(queue.send).not.toHaveBeenCalled()
      for (const table of ['matching_requests', 'ai_executions', 'ai_attempts'])
        expect(
          (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]
            .n,
        ).toBe(0)
    })

    it('rejects a missing active profile or configuration before reserving or queueing', async () => {
      await pool.query('UPDATE profile_head SET active_version_id=NULL')
      await expect(enqueueMatching(ad)).rejects.toThrow('zatwierdź profil')
      usePricing('matching', null)
      await expect(enqueueMatching(ad)).rejects.toThrow('cennik')
      expect(queue.send).not.toHaveBeenCalled()
      expect(
        (await pool.query('SELECT count(*)::int AS n FROM ai_attempts')).rows[0]
          .n,
      ).toBe(0)
    })

    it('excludes a confirmed required work mode conflict without requesting AI work', async () => {
      const data = emptyProfile()
      data.expectations.workMode = {
        state: 'specified',
        value: 'remote',
        importance: 'required',
      }
      await pool.query('UPDATE profile_versions SET data=$2 WHERE id=$1', [
        profileVersion,
        data,
      ])
      await pool.query(
        'UPDATE source_ad_revisions SET payload=payload || \'{"isRemote":false,"isHybrid":false}\'::jsonb WHERE id=$1',
        [revision],
      )
      const request = await enqueueMatching(ad)
      expect(request.state).toBe('excluded')
      expect(await row(request.id)).toMatchObject({
        state: 'excluded',
        execution_id: null,
      })
      expect(await readExecutionHistory(request.id)).toEqual([])
      expect(queue.send).not.toHaveBeenCalled()
      expect((await readMatching(ad)).history[0]).toMatchObject({
        state: 'excluded',
        cost: null,
      })
    })

    it('keeps an earlier published assessment when a later one is refused', async () => {
      const first = await enqueueMatching(ad)
      await queue.work()
      openAi.answer = (input) =>
        responseBody(JSON.stringify(unknownAssessment(input)), {
          type: 'refusal',
        })
      const second = await enqueueMatching(ad)
      expect(second.id).not.toBe(first.id)
      await queue.work()
      const view = await readMatching(ad)
      expect(view.history).toHaveLength(2)
      expect(view.history.find((r) => r.id === first.id)).toMatchObject({
        state: 'completed',
        result: expect.objectContaining({ criteria: expect.any(Array) }),
      })
      expect(view.history.find((r) => r.id === second.id)).toMatchObject({
        state: 'failed',
        result: null,
      })
      expect(view.current).toMatchObject({ request_id: first.id })
    })

    it('shares the budget with other AI work and is funded when room returns', async () => {
      await pool.query(
        'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,0)',
        [budgetMonth()],
      )
      const request = await enqueueMatching(ad)
      expect(request.state).toBe('waiting_budget')
      expect((await readMatching(ad)).history[0]!.state).toBe('waiting_budget')
      expect(queue.executionJobs()).toEqual([])
      // A second request of the offer meets the waiting one.
      expect(await enqueueMatching(ad)).toMatchObject({
        id: request.id,
        reused: true,
      })
      await pool.query('UPDATE ai_budget_months SET limit_pln=1')
      await recoverExecutions()
      expect((await latest(request.id)).state).toBe('queued')
      await queue.work()
      expect((await latest(request.id)).state).toBe('completed')
    })

    it('ends a response without usage as published with its cost unknown and reserved', async () => {
      openAi.answer = (input) => ({
        ...responseBody(JSON.stringify(unknownAssessment(input))),
        usage: null,
      })
      const request = await enqueueMatching(ad)
      await queue.work()
      const execution = await readExecution((await latest(request.id)).id)
      expect(execution).toMatchObject({
        state: 'completed',
        cost: { reserved: '0.020500', actual: null },
      })
    })
  },
)
