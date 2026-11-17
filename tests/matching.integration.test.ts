import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { closePool, setPool } from '../lib/db.ts'
import type { PgBoss } from 'pg-boss'
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
import { budgetMonth } from '../lib/ai/budget.ts'
import { resumeAi } from '../lib/profile/ai.ts'
import {
  BatchClient,
  type batchRequest,
  type Batch,
  type BatchLine,
} from '../lib/matching/batch.ts'
import {
  enqueueMatching,
  executeMatching,
  readMatching,
  recoverMatching,
} from '../lib/matching/store.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration(
  'matching lifecycle in isolated PostgreSQL with no external API',
  () => {
    const schema = `matching_test_${randomUUID().replaceAll('-', '')}`
    let admin: Pool,
      pool: Pool,
      ad: string,
      revision: string,
      profileVersion: string
    const pricing = {
      model: 'test-only',
      version: 'test',
      inputUsdPerMillion: '1',
      outputUsdPerMillion: '1',
      usdPln: '1',
      fxVersion: 'test',
      maxInputTokens: 20000,
      maxOutputTokens: 500,
    }
    const send = vi.fn(async () => randomUUID())
    const boss = { send } as unknown as PgBoss
    beforeAll(async () => {
      admin = new Pool({ connectionString: process.env.DATABASE_URL })
      await admin.query(`CREATE SCHEMA ${schema}`)
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema}`,
      })
      const statements: string[] = []
      for (const name of [
        '1770000000000_setup',
        '1770000000001_sources',
        '1770000000004_profiles',
        '1770000000006_matching',
        '1770000000007_matching_payload',
        '1770000000008_matching_groups',
        '1770000000009_rating_revisions',
      ]) {
        createRequire(import.meta.url)(`../migrations/${name}.cjs`).up({
          sql: (s: string) => statements.push(s),
        })
      }
      await pool.query(statements.join('\n'))
      // Profile reads go through the shared accessor (T-03).
      setPool(pool)
    })
    beforeEach(async () => {
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'never-send-test-key')
      vi.stubEnv('AI_MATCHING_PRICING_JSON', JSON.stringify(pricing))
      send.mockClear()
      await pool.query(
        'TRUNCATE matching_requests,matching_batches,ai_attempts,ai_budget_months,profile_imports,profile_head,profile_versions,source_ads,source_scopes CASCADE',
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
    class Provider extends BatchClient {
      uploaded: ReturnType<typeof batchRequest>[] = []
      uploads = 0
      creates = 0
      removed: string[] = []
      status: Batch['status'] = 'completed'
      refusal = false
      missing = false
      constructor() {
        super('test', async () => {
          throw new Error('No external calls allowed')
        })
      }
      override async upload(lines: ReturnType<typeof batchRequest>[]) {
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
        if (this.missing) return new Map<string, BatchLine>()
        const id = expected[0]!
        const { input } = (
          await pool.query('SELECT input FROM matching_requests WHERE id=$1', [
            id,
          ])
        ).rows[0]
        const assessment = {
          summary: 'Brak danych',
          strengths: [],
          gaps: [],
          criteria: input.criteria.map((c: { id: string }) => ({
            id: c.id,
            state: 'unknown',
            score: null,
            profileEvidence: null,
            offerEvidence: null,
            reason: 'Brak potwierdzenia',
          })),
        }
        return new Map<string, BatchLine>([
          [
            id,
            {
              custom_id: id,
              response: {
                status_code: 200,
                body: {
                  id: 'resp_test',
                  status: 'completed',
                  usage: { input_tokens: 100, output_tokens: 20 },
                  output: [
                    {
                      type: 'message',
                      content: [
                        {
                          type: this.refusal ? 'refusal' : 'output_text',
                          text: JSON.stringify(assessment),
                        },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        ])
      }
      override async remove(file: string) {
        this.removed.push(file)
      }
    }
    const row = async (id: string) =>
      (await pool.query('SELECT * FROM matching_requests WHERE id=$1', [id]))
        .rows[0]
    const attempt = async (id: string) =>
      (
        await pool.query(
          'SELECT a.* FROM ai_attempts a JOIN matching_requests r ON r.attempt_id=a.id WHERE r.id=$1',
          [id],
        )
      ).rows[0]
    it('deduplicates concurrent enqueue and reserves one attempt with version snapshots', async () => {
      const [a, b] = await Promise.all([
        enqueueMatching(pool, boss, ad),
        enqueueMatching(pool, boss, ad),
      ])
      expect(a.id).toBe(b.id)
      expect([a.reused, b.reused].sort()).toEqual([false, true])
      expect(send).toHaveBeenCalledOnce()
      expect(await row(a.id)).toMatchObject({
        state: 'queued',
        profile_version_id: profileVersion,
        ad_revision_id: revision,
      })
      expect(await attempt(a.id)).toMatchObject({
        state: 'queued',
        operation_type: 'matching',
      })
    })
    it('uploads the exact snapshotted provider body with prompt and schema versions despite configuration changes', async () => {
      const request = await enqueueMatching(pool, boss, ad)
      const snapshot = await row(request.id)
      expect(snapshot).toMatchObject({
        prompt_version: 'matching-v1',
        schema_version: 1,
        request_payload: { model: 'test-only', max_output_tokens: 500 },
      })
      expect(snapshot.request_payload).not.toHaveProperty('Authorization')
      vi.stubEnv(
        'AI_MATCHING_PRICING_JSON',
        JSON.stringify({
          ...pricing,
          model: 'changed-model',
          maxOutputTokens: 50,
        }),
      )
      const provider = new Provider()
      await executeMatching(pool, boss, request.id, provider)
      expect(provider.uploaded).toEqual([
        {
          custom_id: request.id,
          method: 'POST',
          url: '/v1/responses',
          body: snapshot.request_payload,
        },
      ])
      expect((await row(request.id)).configuration).toEqual(pricing)
    })
    it('settles usage, saves completed assessment, cleans files and preserves unknown rating', async () => {
      const request = await enqueueMatching(pool, boss, ad),
        provider = new Provider()
      await executeMatching(pool, boss, request.id, provider)
      expect(await row(request.id)).toMatchObject({
        state: 'completed',
        calculation: { rating: null, completeness: 0 },
      })
      expect(await attempt(request.id)).toMatchObject({
        state: 'settled',
        actual_pln: '0.000120',
        usage: { input_tokens: 100, output_tokens: 20 },
      })
      expect(provider.removed).toEqual(['file_input', 'file_output'])
      expect((await readMatching(pool, ad)).history[0]).toMatchObject({
        stale: false,
        cleaned: true,
      })
      await executeMatching(pool, boss, request.id, provider)
      expect(provider.uploads).toBe(1)
      expect(provider.creates).toBe(1)
    })
    it('persists a safe HTTP upload failure without resubmission or analysis cost', async () => {
      const request = await enqueueMatching(pool, boss, ad)
      const fetcher = vi.fn(
        async (_url: RequestInfo | URL, _init?: RequestInit) =>
          new Response('never-send-test-key private CV provider body', {
            status: 403,
          }),
      )
      const provider = new BatchClient('never-send-test-key', fetcher)
      await executeMatching(pool, boss, request.id, provider)
      expect(await row(request.id)).toMatchObject({
        state: 'failed',
        error:
          'Nie udało się przesłać pliku Batch. Nie zlecono analizy. [Batch: http; HTTP 403]',
        result: null,
        calculation: null,
      })
      expect(await attempt(request.id)).toMatchObject({
        state: 'settled',
        actual_pln: '0.000000',
        usage: null,
      })
      send.mockClear()
      await recoverMatching(pool, boss)
      await executeMatching(pool, boss, request.id, provider)
      expect(fetcher).toHaveBeenCalledOnce()
      expect(fetcher.mock.calls[0]![0]).toBe('https://api.openai.com/v1/files')
    })
    it('does not resubmit an interrupted submission and retains unknown cost', async () => {
      const request = await enqueueMatching(pool, boss, ad),
        provider = new Provider()
      await pool.query(
        "UPDATE matching_requests SET state='submitting' WHERE id=$1",
        [request.id],
      )
      await executeMatching(pool, boss, request.id, provider)
      expect(await row(request.id)).toMatchObject({ state: 'unknown' })
      expect(await attempt(request.id)).toMatchObject({
        state: 'unknown',
        actual_pln: null,
      })
      expect(provider.uploads + provider.creates).toBe(0)
      send.mockClear()
      await recoverMatching(pool, boss)
      expect(send).not.toHaveBeenCalled()
    })
    it('keeps submitted work retryable during polling without a second upload', async () => {
      const request = await enqueueMatching(pool, boss, ad),
        provider = new Provider()
      provider.status = 'in_progress'
      await executeMatching(pool, boss, request.id, provider)
      expect((await row(request.id)).state).toBe('submitted')
      await recoverMatching(pool, boss)
      provider.status = 'completed'
      await executeMatching(pool, boss, request.id, provider)
      expect((await row(request.id)).state).toBe('completed')
      expect(provider.uploads).toBe(1)
      expect(provider.creates).toBe(1)
    })
    it('settles paid usage on refusal without publishing an assessment', async () => {
      const request = await enqueueMatching(pool, boss, ad),
        provider = new Provider()
      provider.refusal = true
      await executeMatching(pool, boss, request.id, provider)
      expect(await row(request.id)).toMatchObject({
        state: 'failed',
        result: null,
        calculation: null,
      })
      expect(await attempt(request.id)).toMatchObject({
        state: 'settled',
        actual_pln: '0.000120',
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
      'response_incomplete',
      'response_refusal',
      'response_text_count',
      'response_json',
      'response_format',
      'accepted',
    ])(
      'retains safe %s diagnostic after files are cleaned and settles known usage',
      async (code) => {
        const request = await enqueueMatching(pool, boss, ad)
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
          },
        ])
        class DiagnosticProvider extends Provider {
          override async results(batch: Batch, expected: string[]) {
            const lines = await super.results(batch, expected)
            const line = lines.get(expected[0]!)!
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
            if (code === 'schema')
              Object.assign(value, {
                secretProviderField: 'provider private source secret',
              })
            if (code === 'criterion_mismatch') value.criteria = []
            if (code === 'missing_criterion')
              criterion.id = 'private forged identifier'
            if (code === 'unknown_score') criterion.state = 'unknown'
            if (code === 'rated_score_missing') criterion.score = null
            if (code === 'rated_evidence_missing')
              criterion.offerEvidence = null
            if (code === 'unsupported_assessment') criterion.reason = '   '
            if (code === 'profile_evidence_missing')
              criterion.profileEvidence = 'private invented profile secret'
            if (code === 'offer_evidence_missing')
              criterion.offerEvidence = 'private invented offer secret'
            const body = line.response!.body as {
              status: string
              usage: { input_tokens: number; output_tokens: number }
              output: {
                type: string
                content: { type: string; text: string }[]
              }[]
            }
            body.output[0]!.content[0]!.text = JSON.stringify(value)
            if (code === 'response_incomplete') body.status = 'incomplete'
            if (code === 'response_refusal')
              body.output[0]!.content[0]!.type = 'refusal'
            if (code === 'response_text_count')
              body.output[0]!.content.push({ ...body.output[0]!.content[0]! })
            if (code === 'response_json')
              body.output[0]!.content[0]!.text =
                'private provider invalid JSON secret'
            if (code === 'response_format') body.usage.input_tokens = -1
            return lines
          }
        }
        const provider = new DiagnosticProvider()
        await executeMatching(pool, boss, request.id, provider)
        const saved = await row(request.id)
        expect(saved).toMatchObject(
          code === 'accepted'
            ? {
                state: 'completed',
                error: null,
                result: { criteria: [{ id: 'php', score: 100 }] },
                calculation: { rating: 100, completeness: 40 },
              }
            : {
                state: 'failed',
                result: null,
                calculation: null,
                error: `Nie udało się potwierdzić wiarygodnej oceny. Poprzednie wyniki pozostały bez zmian. [Ocena: ${code}]`,
              },
        )
        expect(saved.error ?? '').not.toMatch(
          /private|secret|provider|forged|Zod/,
        )
        expect(await attempt(request.id)).toMatchObject(
          code === 'response_format'
            ? {
                state: 'unknown',
                actual_pln: null,
                usage: null,
              }
            : {
                state: 'settled',
                actual_pln: '0.000120',
                usage: { input_tokens: 100, output_tokens: 20 },
                response_id: 'resp_test',
              },
        )
        expect(provider.removed).toEqual(['file_input', 'file_output'])
        expect((await readMatching(pool, ad)).history[0]!.error).toBe(
          saved.error,
        )
      },
    )
    it('retains unknown cost if completed batch has no result rather than charging zero', async () => {
      const request = await enqueueMatching(pool, boss, ad),
        provider = new Provider()
      provider.missing = true
      await executeMatching(pool, boss, request.id, provider)
      expect((await row(request.id)).state).toBe('failed')
      expect(await attempt(request.id)).toMatchObject({
        state: 'unknown',
        actual_pln: null,
      })
    })
    it('marks history stale after either active profile or source revision changes', async () => {
      const request = await enqueueMatching(pool, boss, ad)
      await executeMatching(pool, boss, request.id, new Provider())
      const next = randomUUID()
      await pool.query(
        "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'changed','{}')",
        [next, ad],
      )
      await pool.query(
        'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
        [ad, next],
      )
      expect((await readMatching(pool, ad)).history[0].stale).toBe(true)
      await pool.query(
        'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
        [ad, revision],
      )
      await pool.query('UPDATE profile_head SET active_version_id=NULL')
      expect((await readMatching(pool, ad)).history[0].stale).toBe(true)
      expect((await row(request.id)).result).not.toBeNull()
    })
    it('rejects missing active profile or pricing before queueing or reserving', async () => {
      await pool.query('UPDATE profile_head SET active_version_id=NULL')
      await expect(enqueueMatching(pool, boss, ad)).rejects.toThrow(
        'zatwierdź profil',
      )
      vi.stubEnv('AI_MATCHING_PRICING_JSON', '')
      await expect(enqueueMatching(pool, boss, ad)).rejects.toThrow(
        'cennik Batch',
      )
      expect(send).not.toHaveBeenCalled()
      expect(
        (await pool.query('SELECT count(*) FROM ai_attempts')).rows[0].count,
      ).toBe('0')
    })
    it('excludes a confirmed required workmode conflict without reserving money or calling provider', async () => {
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
      const request = await enqueueMatching(pool, boss, ad)
      expect((await row(request.id)).state).toBe('excluded')
      expect(
        (await pool.query('SELECT count(*) FROM ai_attempts')).rows[0].count,
      ).toBe('0')
      expect(send).not.toHaveBeenCalled()
    })
    it('preserves a previous successful result when a later refusal is settled', async () => {
      const first = await enqueueMatching(pool, boss, ad)
      await executeMatching(pool, boss, first.id, new Provider())
      const second = await enqueueMatching(pool, boss, ad),
        provider = new Provider()
      provider.refusal = true
      // Each real submission receives a distinct provider batch ID.
      provider.create = async () => ({
        id: 'batch_second',
        input_file_id: 'file_input',
        status: 'in_progress',
      })
      provider.retrieve = async () => ({
        id: 'batch_second',
        input_file_id: 'file_input',
        output_file_id: 'file_output',
        status: 'completed',
      })
      await executeMatching(pool, boss, second.id, provider)
      const history = (await readMatching(pool, ad)).history
      expect(history).toHaveLength(2)
      expect(history.find((r) => r.id === first.id)).toMatchObject({
        state: 'completed',
        result: expect.objectContaining({ criteria: expect.any(Array) }),
      })
      expect(history.find((r) => r.id === second.id)).toMatchObject({
        state: 'failed',
        result: null,
      })
    })
    it('does not let CV recovery claim matching ledger attempts in any pending state', async () => {
      const request = await enqueueMatching(pool, boss, ad)
      for (const state of ['queued', 'running', 'waiting_budget']) {
        await pool.query(
          'UPDATE ai_attempts SET state=$2 WHERE id=(SELECT attempt_id FROM matching_requests WHERE id=$1)',
          [request.id, state],
        )
        send.mockClear()
        await resumeAi(pool, boss)
        expect((await attempt(request.id)).state).toBe(state)
        expect(send).not.toHaveBeenCalled()
      }
    })
    it('shares the budget with pending CV reservations and resumes when room returns', async () => {
      const month = budgetMonth(),
        imported = randomUUID(),
        reservation = randomUUID()
      await pool.query(
        'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,1)',
        [month],
      )
      await pool.query(
        "INSERT INTO profile_imports(id,kind,status) VALUES($1,'text','ready')",
        [imported],
      )
      await pool.query(
        "INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,state,reserved_pln,configuration) VALUES($1,$2,1,$3,1,$4,'running',1,$5)",
        [reservation, imported, month, randomUUID(), pricing],
      )
      const request = await enqueueMatching(pool, boss, ad)
      expect((await row(request.id)).state).toBe('waiting_budget')
      expect(send).not.toHaveBeenCalled()
      await pool.query(
        "UPDATE ai_attempts SET state='settled',actual_pln=0 WHERE id=$1",
        [reservation],
      )
      await executeMatching(pool, boss, request.id, new Provider())
      expect((await row(request.id)).state).toBe('queued')
      expect(send).toHaveBeenCalledOnce()
    })
  },
)
