import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
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
import { budgetMonth, resumeAi } from '../lib/profile/ai.ts'
import {
  BatchClient,
  type batchRequest,
  type Batch,
  type BatchLine,
} from '../lib/matching/batch.ts'
import {
  enqueueMatching,
  executeMatching,
  recoverMatching,
} from '../lib/matching/store.ts'

import {
  enqueueMatchingGroup,
  executeMatchingGroup,
  recoverMatchingGroups,
  matchingGroupQueue,
} from '../lib/matching/groups.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration(
  'multi-offer matching groups with isolated PostgreSQL and fake API',
  () => {
    const schema = `matching_groups_test_${randomUUID().replaceAll('-', '')}`
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
    })
    beforeEach(async () => {
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'never-send-test-key')
      vi.stubEnv('AI_MATCHING_PRICING_JSON', JSON.stringify(pricing))
      send.mockClear()
      await pool.query(
        'TRUNCATE matching_groups,matching_requests,matching_batches,ai_attempts,ai_budget_months,profile_imports,profile_head,profile_versions,source_ads,source_scopes CASCADE',
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
      await pool?.end()
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
      failures = new Set<string>()
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
        const results = new Map<string, BatchLine>()
        for (const id of [...expected].reverse()) {
          const { input } = (
            await pool.query(
              'SELECT input FROM matching_requests WHERE id=$1',
              [id],
            )
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
              reason: 'Brak danych',
            })),
          }
          results.set(id, {
            custom_id: id,
            response: {
              status_code: 200,
              body: {
                id: `resp_${id}`,
                status: 'completed',
                usage: {
                  input_tokens: this.failures.has(id) ? 200 : 100,
                  output_tokens: 20,
                },
                output: [
                  {
                    type: 'message',
                    content: [
                      {
                        type: this.failures.has(id) ? 'refusal' : 'output_text',
                        text: JSON.stringify(assessment),
                      },
                    ],
                  },
                ],
              },
            },
          })
        }
        return results
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
    const groupRow = async (id: string) =>
      (await pool.query('SELECT * FROM matching_groups WHERE id=$1', [id]))
        .rows[0]
    async function anotherAd(description = 'PHP backend') {
      const id = randomUUID(),
        rev = randomUUID()
      await pool.query(
        "INSERT INTO source_ads(id,source,external_id,last_seen_scope_id) SELECT $1,'solid',$2,last_seen_scope_id FROM source_ads WHERE id=$3",
        [id, randomUUID(), ad],
      )
      await pool.query(
        "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'test',$3)",
        [
          rev,
          id,
          { title: 'Developer', description, skills: [{ name: 'PHP' }] },
        ],
      )
      await pool.query(
        'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
        [id, rev],
      )
      return id
    }
    const enqueue = async (ids: string[], commandId = randomUUID()) =>
      enqueueMatchingGroup(pool, boss, { commandId, offerIds: ids })
    it('submits multiple offers in one upload/create, maps unordered results and settles each cost independently', async () => {
      const group = await enqueue([ad, await anotherAd()]),
        provider = new Provider()
      provider.failures.add(group.items[1]!.id)
      await executeMatchingGroup(pool, boss, group.groupId, provider)
      expect(provider.uploads).toBe(1)
      expect(provider.creates).toBe(1)
      expect(provider.uploaded.map((i) => i.custom_id).sort()).toEqual(
        group.items.map((i) => i.id).sort(),
      )
      expect(await row(group.items[0]!.id)).toMatchObject({
        state: 'completed',
      })
      expect(await row(group.items[1]!.id)).toMatchObject({
        state: 'failed',
        result: null,
      })
      expect(await attempt(group.items[0]!.id)).toMatchObject({
        state: 'settled',
        actual_pln: '0.000120',
      })
      expect(await attempt(group.items[1]!.id)).toMatchObject({
        state: 'settled',
        actual_pln: '0.000220',
      })
      expect(await groupRow(group.groupId)).toMatchObject({
        state: 'completed',
        cleaned: true,
      })
      expect(provider.removed).toEqual(['file_input', 'file_output'])
      await executeMatchingGroup(pool, boss, group.groupId, provider)
      expect(provider.uploads).toBe(1)
      expect(provider.removed).toHaveLength(2)
    })
    it('persists safe HTTP upload diagnostics for every member without resubmission or analysis cost', async () => {
      const group = await enqueue([ad, await anotherAd()])
      const fetcher = vi.fn(
        async (_url: RequestInfo | URL, _init?: RequestInit) =>
          new Response('never-send-test-key private CV provider body', {
            status: 403,
          }),
      )
      const provider = new BatchClient('never-send-test-key', fetcher)
      await executeMatchingGroup(pool, boss, group.groupId, provider)
      const failure = {
        state: 'failed',
        error:
          'Nie udało się przesłać pliku partii. Nie zlecono analiz. [Batch: http; HTTP 403]',
      }
      expect(await groupRow(group.groupId)).toMatchObject(failure)
      for (const member of group.items) {
        expect(await row(member.id)).toMatchObject({
          ...failure,
          result: null,
          calculation: null,
        })
        expect(await attempt(member.id)).toMatchObject({
          state: 'settled',
          actual_pln: '0.000000',
          usage: null,
        })
      }
      await recoverMatchingGroups(pool, boss)
      await executeMatchingGroup(pool, boss, group.groupId, provider)
      expect(fetcher).toHaveBeenCalledOnce()
      expect(fetcher.mock.calls[0]![0]).toBe('https://api.openai.com/v1/files')
    })
    it('deduplicates concurrent command ID even reordered offers and rejects changed selection', async () => {
      const other = await anotherAd(),
        commandId = randomUUID()
      const [a, b] = await Promise.all([
        enqueue([ad, other], commandId),
        enqueue([other, ad], commandId),
      ])
      expect(a.groupId).toBe(b.groupId)
      expect([a.reused, b.reused].sort()).toEqual([false, true])
      expect(send).toHaveBeenCalledOnce()
      await expect(enqueue([ad], commandId)).rejects.toThrow('innych ofert')
      expect(
        (await pool.query('SELECT count(*) FROM matching_groups')).rows[0]
          .count,
      ).toBe('1')
    })
    it('canonicalizes UUID casing for idempotent commands and duplicate selection checks', async () => {
      const commandId = randomUUID()
      const first = await enqueue([ad], commandId)
      const again = await enqueue([ad.toUpperCase()], commandId.toUpperCase())
      expect(again).toMatchObject({ groupId: first.groupId, reused: true })
      expect(send).toHaveBeenCalledOnce()
      await expect(enqueue([ad, ad.toUpperCase()])).rejects.toThrow()
      expect(
        (await pool.query('SELECT count(*) FROM matching_groups')).rows[0]
          .count,
      ).toBe('1')
    })
    it('does not absorb reused single pending requests into group submission', async () => {
      const single = await enqueueMatching(pool, boss, ad)
      const group = await enqueue([ad, await anotherAd()]),
        provider = new Provider()
      expect(group.items.find((i) => i.offerId === ad)).toMatchObject({
        id: single.id,
        reused: true,
      })
      expect((await row(single.id)).group_id).toBeNull()
      await executeMatchingGroup(pool, boss, group.groupId, provider)
      expect(provider.uploaded).toHaveLength(1)
      expect(provider.uploaded[0]!.custom_id).not.toBe(single.id)
      expect((await row(single.id)).state).toBe('queued')
    })
    it('reserves all-or-none group budget and resumes after budget increases', async () => {
      await pool.query(
        'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,0.03)',
        [budgetMonth()],
      )
      const group = await enqueue([ad, await anotherAd()])
      expect((await groupRow(group.groupId)).state).toBe('waiting_budget')
      expect(
        (await pool.query('SELECT count(*) FROM ai_attempts')).rows[0].count,
      ).toBe('0')
      expect(send).not.toHaveBeenCalled()
      for (const member of group.items)
        expect((await row(member.id)).state).toBe('waiting_budget')
      await pool.query('UPDATE ai_budget_months SET limit_pln=1')
      await executeMatchingGroup(pool, boss, group.groupId, new Provider())
      expect((await groupRow(group.groupId)).state).toBe('queued')
      expect(
        (await pool.query('SELECT count(*) FROM ai_attempts')).rows[0].count,
      ).toBe('2')
      expect(send).toHaveBeenCalledOnce()
    })
    it.each(['uploading', 'submitting'])(
      'does not recreate a paid batch after interrupted %s',
      async (state) => {
        const group = await enqueue([ad, await anotherAd()]),
          provider = new Provider()
        await pool.query('UPDATE matching_groups SET state=$2 WHERE id=$1', [
          group.groupId,
          state,
        ])
        await pool.query(
          'UPDATE matching_requests SET state=$2 WHERE group_id=$1',
          [group.groupId, state],
        )
        await executeMatchingGroup(pool, boss, group.groupId, provider)
        expect(provider.uploads + provider.creates).toBe(0)
        expect((await groupRow(group.groupId)).state).toBe(
          state === 'submitting' ? 'unknown' : 'failed',
        )
        for (const member of group.items)
          expect(await attempt(member.id)).toMatchObject({
            state: state === 'submitting' ? 'unknown' : 'settled',
            actual_pln: state === 'submitting' ? null : '0.000000',
          })
      },
    )
    it('does not settle an already completed member again after partial recovery', async () => {
      const group = await enqueue([ad, await anotherAd()]),
        provider = new Provider()
      provider.status = 'in_progress'
      await executeMatchingGroup(pool, boss, group.groupId, provider)
      const member = group.items[0]!
      await pool.query(
        "UPDATE matching_requests SET state='completed',result='{}' WHERE id=$1",
        [member.id],
      )
      await pool.query(
        "UPDATE ai_attempts SET state='settled',actual_pln=0.000123,finished_at=now() WHERE id=(SELECT attempt_id FROM matching_requests WHERE id=$1)",
        [member.id],
      )
      provider.status = 'completed'
      await executeMatchingGroup(pool, boss, group.groupId, provider)
      expect(await attempt(member.id)).toMatchObject({ actual_pln: '0.000123' })
      expect((await row(member.id)).result).toEqual({})
      expect(provider.creates).toBe(1)
    })
    it('keeps group attempts isolated from CV and single recovery and execution', async () => {
      const group = await enqueue([ad, await anotherAd()]),
        provider = new Provider()
      send.mockClear()
      await resumeAi(pool, boss)
      await recoverMatching(pool, boss)
      expect(send).not.toHaveBeenCalled()
      await executeMatching(pool, boss, group.items[0]!.id, provider)
      expect(provider.uploads + provider.creates).toBe(0)
      await recoverMatchingGroups(pool, boss)
      expect(send).toHaveBeenCalledWith(
        matchingGroupQueue,
        { groupId: group.groupId },
        expect.any(Object),
      )
      expect((await row(group.items[0]!.id)).state).toBe('queued')
    })
    it('rejects duplicate IDs and more than100 selected offers before any mutations', async () => {
      await expect(enqueue([ad, ad])).rejects.toThrow()
      await expect(
        enqueue(Array.from({ length: 101 }, () => randomUUID())),
      ).rejects.toThrow()
      expect(
        (await pool.query('SELECT count(*) FROM matching_groups')).rows[0]
          .count,
      ).toBe('0')
      expect(
        (await pool.query('SELECT count(*) FROM matching_requests')).rows[0]
          .count,
      ).toBe('0')
      expect(send).not.toHaveBeenCalled()
    })
    it('rolls back a group whose JSONL exceeds2MiB without reserving or queueing', async () => {
      const larger = { ...pricing, maxInputTokens: 1000000 }
      vi.stubEnv('AI_MATCHING_PRICING_JSON', JSON.stringify(larger))
      const ids = await Promise.all(
        Array.from({ length: 12 }, () =>
          anotherAd('PHP backend '.repeat(18000)),
        ),
      )
      await expect(enqueue(ids)).rejects.toThrow('2 MiB')
      expect(
        (await pool.query('SELECT count(*) FROM matching_groups')).rows[0]
          .count,
      ).toBe('0')
      expect(
        (await pool.query('SELECT count(*) FROM matching_requests')).rows[0]
          .count,
      ).toBe('0')
      expect(
        (await pool.query('SELECT count(*) FROM ai_attempts')).rows[0].count,
      ).toBe('0')
      expect(send).not.toHaveBeenCalled()
    })
  },
)
