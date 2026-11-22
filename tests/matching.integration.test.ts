import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { z } from 'zod'
import { closePool, setPool, transaction } from '../lib/db.ts'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { emptyProfile } from '../modules/profile/view.ts'
import { failAssignmentsPastTimeLimit } from '../modules/ai/index.ts'
import { assessmentAssignmentReceiver } from '../modules/matching/index.ts'
import { registerAssignmentReceivers } from '../receivers/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  assessmentSchema,
  type MatchingInput,
} from '../modules/matching/domain/assessment.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { readAssessmentExchange } from '../modules/matching/read-assessment-exchange.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { enqueueMatching } from '../modules/matching/request-assessment.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { readMatching } from '../modules/matching/read-assessments.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { manualContext, saveManualRating } from '../modules/matching/ratings.ts'
import { aiQueue } from './ai-queue.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'
import {
  migrate,
  pricing,
  responseBody,
  unknownAssessment,
} from './matching-ai.fixtures.ts'
import {
  assessmentTables,
  assignmentOfRequest,
  carryOut,
  insertActiveProfile,
  insertAd,
  pastDeadline,
  prepareExecutorQueue,
  SimulatedProvider,
} from './matching-assignments.fixtures.ts'

// The price lists AI keeps in code, replaced for the test; Matching's
// settings of assignments are the application's own.
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock(
  '../modules/ai/infrastructure/adapters/model-catalog.ts',
  () => import('./ai-test-configuration.ts'),
)

const failedMessage =
  'Ocena nie została wykonana. Poprzednie wyniki pozostały bez zmian. Szczegóły są w panelu zleceń AI.'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration(
  'single assessments through AI assignments in isolated PostgreSQL with no external API (sq2.9)',
  () => {
    const schema = `matching_test_${randomUUID().replaceAll('-', '')}`
    let admin: Pool,
      pool: Pool,
      ad: string,
      revision: string,
      profileVersion: string,
      provider: SimulatedProvider
    const queue = aiQueue()
    beforeAll(async () => {
      admin = new Pool({ connectionString: process.env.DATABASE_URL })
      await admin.query(`CREATE SCHEMA ${schema}`)
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema}`,
      })
      await migrate(pool)
      setPool(pool)
      await queue.start()
      await prepareExecutorQueue()
      registerAssignmentReceivers()
    })
    beforeEach(async () => {
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'never-send-test-key')
      usePricing(pricing)
      provider = new SimulatedProvider().register()
      await pool.query(`TRUNCATE ${assessmentTables} CASCADE`)
      ;({ ad, revision } = await insertAd(pool))
      profileVersion = await insertActiveProfile(pool)
    })
    afterAll(async () => {
      vi.unstubAllEnvs()
      await queue.stop()
      await closePool()
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await admin.end()
      }
    })
    const row = async (id: string) =>
      (await pool.query('SELECT * FROM matching_requests WHERE id=$1', [id]))
        .rows[0]
    const revisions = async (id: string) =>
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM matching_rating_revisions WHERE request_id=$1',
          [id],
        )
      ).rows[0].n
    const count = async (table: string) =>
      (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]
        .n as number
    /** Sets the input of a request to one PHP criterion. */
    const phpInput = (unknown = false): MatchingInput => ({
      profile: 'PHP private profile source',
      offer: 'PHP private offer source',
      criteria: [{ id: 'php', group: 'technologies', label: 'PHP', unknown }],
      checks: [],
    })
    const phpAnswer = () => ({
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
    })

    it('places one single-answer assignment labelled with the offer, keeps its identifier and sends the instruction, the schema and the input (T8-R01, E03-AC01)', async () => {
      const request = await enqueueMatching(ad)
      expect(request).toEqual({
        id: request.id,
        state: 'running',
        reused: false,
      })
      const stored = await row(request.id)
      const assignment = await assignmentOfRequest(pool, request.id)
      expect(stored.assignment_id).toBe(assignment.id)
      expect(assignment).toMatchObject({
        label: 'PHP developer — Firma niepodana',
        settings_name: 'matching',
        type: 'single',
        status: 'in_progress',
      })
      expect(JSON.parse(assignment.input)).toEqual(stored.input)
      await carryOut(pool)
      expect(provider.bodies).toHaveLength(1)
      const body = provider.bodies[0]!
      expect(body).toMatchObject({
        model: 'gpt-6-luna',
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

    it('rolls a request back with its assignment when the save that places it fails (T1-R01)', async () => {
      await expect(
        transaction(async () => {
          await enqueueMatching(ad)
          throw new Error('rolled back')
        }),
      ).rejects.toThrow('rolled back')
      expect(await count('matching_requests')).toBe(0)
      expect(await count('ai_assignments')).toBe(0)
    })

    it('reuses the assessment of an offer in progress for concurrent requests (AM-AC01)', async () => {
      const [a, b] = await Promise.all([
        enqueueMatching(ad),
        enqueueMatching(ad),
      ])
      expect(a.id).toBe(b.id)
      expect([a.reused, b.reused].sort()).toEqual([false, true])
      expect(await count('ai_assignments')).toBe(1)
      expect(await row(a.id)).toMatchObject({
        state: 'requested',
        profile_version_id: profileVersion,
        ad_revision_id: revision,
        attempt_id: null,
        request_payload: null,
      })
    })

    it('publishes a correct result and shows the assessment ready, with the assignment succeeded (T8-AC03, T8-AC04)', async () => {
      const request = await enqueueMatching(ad)
      expect((await readMatching(ad)).history[0]).toMatchObject({
        state: 'running',
        assignment: true,
      })
      await carryOut(pool)
      expect(await row(request.id)).toMatchObject({
        error: null,
        calculation: { rating: null, completeness: 0 },
      })
      expect((await assignmentOfRequest(pool, request.id)).status).toBe(
        'succeeded',
      )
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
        stale: false,
      })
    })

    it.each([
      [
        'schema',
        (v: ReturnType<typeof phpAnswer>) => (v.criteria[0]!.score = 101),
      ],
      [
        'profile_evidence_missing',
        (v: ReturnType<typeof phpAnswer>) =>
          (v.criteria[0]!.profileEvidence = 'private invented profile secret'),
      ],
      [
        'offer_evidence_missing',
        (v: ReturnType<typeof phpAnswer>) =>
          (v.criteria[0]!.offerEvidence = 'private invented offer secret'),
      ],
      [
        'criterion_mismatch',
        (v: ReturnType<typeof phpAnswer>) => (v.criteria = []),
      ],
    ])(
      "ends a result that fails Matching's own check (%s) as a failed assessment with a safe diagnostic, the assignment succeeded (T8-AC03, T8-R03)",
      async (code, spoil) => {
        const request = await enqueueMatching(ad)
        await pool.query('UPDATE matching_requests SET input=$2 WHERE id=$1', [
          request.id,
          phpInput(),
        ])
        provider.answer = () => {
          const value = phpAnswer()
          spoil(value)
          return responseBody(JSON.stringify(value))
        }
        await carryOut(pool)
        const saved = await row(request.id)
        expect(saved).toMatchObject({
          result: null,
          calculation: null,
          error: `Nie udało się potwierdzić wiarygodnej oceny. Poprzednie wyniki pozostały bez zmian. [Ocena: ${code}]`,
        })
        expect(saved.error).not.toMatch(/private|secret|provider|Zod/)
        expect(await assignmentOfRequest(pool, request.id)).toMatchObject({
          status: 'succeeded',
          failure_reason: null,
        })
        expect(await revisions(request.id)).toBe(0)
        const [history] = (await readMatching(ad)).history
        expect(history).toMatchObject({ state: 'failed', error: saved.error })
      },
    )

    it('publishes an assessment that passes the check with its rating (E03-AC01)', async () => {
      const request = await enqueueMatching(ad)
      await pool.query('UPDATE matching_requests SET input=$2 WHERE id=$1', [
        request.id,
        phpInput(),
      ])
      provider.answer = () => responseBody(JSON.stringify(phpAnswer()))
      await carryOut(pool)
      expect(await row(request.id)).toMatchObject({
        error: null,
        result: { criteria: [{ id: 'php', score: 100 }] },
        calculation: { rating: 100, completeness: 40 },
      })
    })

    it('does not publish a result for a replaced profile version over a current assessment, and keeps it in the history as stale (T8-AC03)', async () => {
      const request = await enqueueMatching(ad)
      // A newer version is confirmed and the owner rates the offer for it
      // before the result arrives.
      const confirmed = randomUUID()
      await pool.query(
        'INSERT INTO profile_versions(id,number,data,command_id,draft_revision) VALUES($1,2,$2,$3,2)',
        [confirmed, emptyProfile(), randomUUID()],
      )
      await pool.query('UPDATE profile_head SET active_version_id=$1', [
        confirmed,
      ])
      const context = (await manualContext(ad))!
      const owner = await saveManualRating(ad, {
        commandId: randomUUID(),
        expectedRevisionId: context.headId,
        profileVersionId: context.profileVersionId,
        adRevisionId: context.adRevisionId,
        assessment: context.assessment,
        reason: 'Własna ocena przed wynikiem AI.',
      })
      await carryOut(pool)
      const view = await readMatching(ad)
      expect(view.current).toMatchObject({
        id: owner.id,
        assessment_author: 'owner',
      })
      expect(view.history[0]).toMatchObject({
        id: request.id,
        state: 'completed',
        stale: true,
      })
    })

    it('shows a stale assessment for a result of the version the request recorded when a newer one is confirmed without a current one', async () => {
      const request = await enqueueMatching(ad)
      await insertActiveProfile(pool, 2)
      await carryOut(pool)
      const view = await readMatching(ad)
      expect(view.current).toMatchObject({
        request_id: request.id,
        profile_number: 1,
        stale: true,
      })
      expect(view.history[0]).toMatchObject({ state: 'completed', stale: true })
    })

    it('keeps an assessment whose assignment needs attention in progress, and shows it failed once a failure reaches the receiver (T8-AC10, T8-AC04)', async () => {
      // A refusal of the model is a non-retryable failure: the assignment
      // needs attention.
      provider.answer = (input) =>
        responseBody(JSON.stringify(unknownAssessment(input)), {
          type: 'refusal',
        })
      const request = await enqueueMatching(ad)
      await carryOut(pool)
      const assignment = await assignmentOfRequest(pool, request.id)
      expect(assignment.status).toBe('needs_attention')
      expect((await readMatching(ad)).history[0]).toMatchObject({
        state: 'running',
        error: null,
      })
      // A new request of the offer meets the assessment in progress.
      expect(await enqueueMatching(ad)).toMatchObject({
        id: request.id,
        reused: true,
      })
      await pastDeadline(pool, assignment.id)
      await failAssignmentsPastTimeLimit()
      expect(await assignmentOfRequest(pool, request.id)).toMatchObject({
        status: 'failed',
        failure_reason: 'time_limit',
      })
      expect(await row(request.id)).toMatchObject({
        result: null,
        calculation: null,
        error: failedMessage,
      })
      expect((await readMatching(ad)).history[0]).toMatchObject({
        state: 'failed',
        error: failedMessage,
      })
      // The offer can be assessed again.
      expect(await enqueueMatching(ad)).toMatchObject({ reused: false })
    })

    it("leaves the same data after Matching's receiver is called twice with the same result and twice with the same failure (T8-AC11, T6-R09)", async () => {
      const snapshot = async () =>
        (
          await pool.query(
            `SELECT r.id,r.result,r.calculation,r.error,r.updated_at,
              (SELECT count(*)::int FROM matching_rating_revisions v WHERE v.request_id=r.id) AS revisions,
              (SELECT count(*)::int FROM matching_rating_heads) AS heads
             FROM matching_requests r ORDER BY r.id`,
          )
        ).rows
      const first = await enqueueMatching(ad)
      const firstAssignment = (await row(first.id)).assignment_id
      const result = unknownAssessment((await row(first.id)).input)
      await transaction(() =>
        assessmentAssignmentReceiver.receiveResult({
          assignmentId: firstAssignment,
          result,
        }),
      )
      const once = await snapshot()
      await transaction(() =>
        assessmentAssignmentReceiver.receiveResult({
          assignmentId: firstAssignment,
          result,
        }),
      )
      expect(await snapshot()).toEqual(once)
      expect(once[0]).toMatchObject({ revisions: 1, error: null })

      const { ad: other } = await insertAd(pool)
      const second = await enqueueMatching(other)
      const secondAssignment = (await row(second.id)).assignment_id
      await transaction(() =>
        assessmentAssignmentReceiver.receiveFailure({
          assignmentId: secondAssignment,
        }),
      )
      const failedOnce = await snapshot()
      await transaction(() =>
        assessmentAssignmentReceiver.receiveFailure({
          assignmentId: secondAssignment,
        }),
      )
      expect(await snapshot()).toEqual(failedOnce)
      expect(failedOnce.find((r) => r.id === second.id)).toMatchObject({
        error: failedMessage,
      })
      // A failure after a result, and an unknown assignment, change nothing.
      await transaction(() =>
        assessmentAssignmentReceiver.receiveFailure({
          assignmentId: firstAssignment,
        }),
      )
      await transaction(() =>
        assessmentAssignmentReceiver.receiveResult({
          assignmentId: randomUUID(),
          result,
        }),
      )
      expect(await snapshot()).toEqual(failedOnce)
    })

    it('shows the request and the raw response of each operation in the exchange view of a new assessment (T8-AC07)', async () => {
      // The first operation's answer cannot be read, so the assignment gets
      // a second operation, which answers.
      let calls = 0
      provider.answer = (input) =>
        ++calls === 1
          ? responseBody('not json')
          : responseBody(JSON.stringify(unknownAssessment(input)))
      const request = await enqueueMatching(ad)
      await carryOut(pool)
      const archive = await readAssessmentExchange(request.id)
      const assignmentId = (await row(request.id)).assignment_id
      expect(archive).toEqual({
        kind: 'exchange',
        assignmentId,
        operations: [
          {
            ordinal: 1,
            entries: [
              { kind: 'request', content: expect.any(String) },
              { kind: 'response', content: provider.responses[0] },
            ],
          },
          {
            ordinal: 2,
            entries: [
              { kind: 'request', content: expect.any(String) },
              { kind: 'response', content: provider.responses[1] },
            ],
          },
        ],
      })
      if (archive?.kind !== 'exchange') throw new Error('No exchange')
      for (const [index, operation] of archive.operations.entries())
        expect(JSON.parse(operation.entries[0]!.content)).toEqual(
          provider.bodies[index],
        )
      expect(JSON.stringify(archive)).not.toContain('never-send-test-key')
      expect(await readAssessmentExchange(randomUUID())).toBeNull()
      // An assessment made before the deployment of assignments has no
      // exchange view (T10-R08).
      await pool.query(
        'UPDATE matching_requests SET assignment_id=NULL WHERE id=$1',
        [request.id],
      )
      expect(await readAssessmentExchange(request.id)).toBeNull()
    })

    it('refuses an assessment whose request exceeds what the price list covers, with nothing placed (T8-AC05, 0mq.21 ASM-5)', async () => {
      usePricing({ ...pricing, maxInputTokens: 100 })
      provider.register()
      await expect(enqueueMatching(ad)).rejects.toThrow(
        'Wejście przekracza skonfigurowany limit tokenów. Zwiększ limit lub skróć profil.',
      )
      for (const table of [
        'matching_requests',
        'ai_assignments',
        'ai_operations',
      ])
        expect(await count(table)).toBe(0)
    })

    it('rejects a missing active profile or configuration before placing anything', async () => {
      await pool.query('UPDATE profile_head SET active_version_id=NULL')
      await expect(enqueueMatching(ad)).rejects.toThrow('zatwierdź profil')
      vi.stubEnv('OPENAI_API_KEY', '')
      await expect(enqueueMatching(ad)).rejects.toThrow('cennik')
      expect(await count('ai_assignments')).toBe(0)
      expect(await count('matching_requests')).toBe(0)
    })

    it('excludes a confirmed required work mode conflict without placing an assignment', async () => {
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
        assignment_id: null,
      })
      expect(await count('ai_assignments')).toBe(0)
      expect((await readMatching(ad)).history[0]).toMatchObject({
        state: 'excluded',
      })
    })

    it('keeps an earlier published assessment when a later one fails', async () => {
      const first = await enqueueMatching(ad)
      await carryOut(pool)
      provider.answer = () => responseBody(JSON.stringify({ summary: 1 }))
      const second = await enqueueMatching(ad)
      expect(second.id).not.toBe(first.id)
      await carryOut(pool)
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
  },
)
