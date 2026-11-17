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
import { closePool, setPool } from '../lib/db.ts'
import type { Assessment, MatchingInput } from '../lib/matching/model.ts'
import {
  currentAdVersions,
  manualContext,
  publishAiRating,
  RatingConflict,
  saveManualRating,
} from '../lib/matching/ratings.ts'
import {
  BatchClient,
  type Batch,
  type BatchLine,
} from '../lib/matching/batch.ts'
import {
  enqueueMatching,
  executeMatching,
  readMatching,
} from '../lib/matching/store.ts'
import { defaultWeights } from '../lib/matching/weights.ts'
import { emptyProfile } from '../lib/profile/model.ts'

// A change of the ad injected between reading its current version and
// reading that version's content, the window an assessment must survive
// (`change`), or right after the read of the current versions that a
// published AI result relies on (`afterCurrentVersions`).
const injected = vi.hoisted(() => ({
  change: null as null | (() => Promise<void>),
  afterCurrentVersions: null as null | (() => Promise<void>),
}))
vi.mock('../modules/sources/index.ts', async (importOriginal) => {
  const sources =
    await importOriginal<typeof import('../modules/sources/index.ts')>()
  return {
    ...sources,
    readCurrentAdVersions: async (ids: readonly string[]) => {
      const versions = await sources.readCurrentAdVersions(ids)
      const change = injected.afterCurrentVersions
      injected.afterCurrentVersions = null
      if (change) await change()
      return versions
    },
    readAdVersions: async (ids: readonly string[]) => {
      const change = injected.change
      injected.change = null
      injected.afterCurrentVersions = null
      if (change) await change()
      return sources.readAdVersions(ids)
    },
  }
})

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration(
  'assessment of an ad that changes during the assessment (A6-AC03)',
  () => {
    const schema = `matching_ad_version_${randomUUID().replaceAll('-', '')}`
    let admin: Pool, pool: Pool, ad: string, assessed: string, changed: string
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
    const boss = { send: vi.fn(async () => randomUUID()) } as unknown as PgBoss

    beforeAll(async () => {
      admin = new Pool({ connectionString: process.env.DATABASE_URL })
      await admin.query(`CREATE SCHEMA ${schema}`)
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema}`,
      })
      const sql: string[] = []
      for (const migration of [
        '1770000000000_setup',
        '1770000000001_sources',
        '1770000000004_profiles',
        '1770000000006_matching',
        '1770000000007_matching_payload',
        '1770000000008_matching_groups',
        '1770000000009_rating_revisions',
      ])
        createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
          sql: (s: string) => sql.push(s),
        })
      await pool.query(sql.join('\n'))
      setPool(pool)
    })

    beforeEach(async () => {
      vi.stubEnv('OPENAI_API_KEY', 'never-send-test-key')
      vi.stubEnv('AI_MATCHING_PRICING_JSON', JSON.stringify(pricing))
      injected.change = null
      await pool.query(
        'TRUNCATE matching_rating_heads,matching_rating_revisions,matching_weight_head,matching_weight_versions,matching_groups,matching_requests,matching_batches,ai_attempts,ai_budget_months,profile_head,profile_versions,source_ads,source_scopes CASCADE',
      )
      const weights = randomUUID()
      await pool.query(
        'INSERT INTO matching_weight_versions(id,weights) VALUES($1,$2)',
        [weights, defaultWeights],
      )
      await pool.query(
        'INSERT INTO matching_weight_head(singleton,version_id) VALUES(true,$1)',
        [weights],
      )
      ad = randomUUID()
      assessed = randomUUID()
      changed = randomUUID()
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
        "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'assessed',$3)",
        [assessed, ad, { title: 'Assessed PHP', skills: [{ name: 'PHP' }] }],
      )
      await pool.query(
        'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
        [ad, assessed],
      )
      const profile = randomUUID()
      await pool.query(
        'INSERT INTO profile_versions(id,number,data,command_id,draft_revision) VALUES($1,1,$2,$3,1)',
        [profile, emptyProfile(), randomUUID()],
      )
      await pool.query(
        'INSERT INTO profile_head(singleton,active_version_id) VALUES(true,$1)',
        [profile],
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

    /** Makes a new version with other content the ad's current one. */
    const changeAd = async () => {
      await pool.query(
        "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'changed',$3)",
        [changed, ad, { title: 'Changed Java', skills: [{ name: 'Java' }] }],
      )
      await pool.query(
        'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
        [ad, changed],
      )
    }

    const unknownResult = (input: MatchingInput): Assessment => ({
      summary: 'Brak potwierdzonych danych.',
      strengths: [],
      gaps: [],
      criteria: input.criteria.map((c) => ({
        id: c.id,
        state: 'unknown',
        score: null,
        profileEvidence: null,
        offerEvidence: null,
        reason: 'Brak danych',
      })),
    })

    /** A batch provider that answers every request with unknown criteria. */
    class Provider extends BatchClient {
      constructor() {
        super('test', async () => {
          throw new Error('No external calls allowed')
        })
      }
      override async upload() {
        return 'file_input'
      }
      override async create() {
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
          status: 'completed',
        } satisfies Batch
      }
      override async results(_batch: Batch, expected: string[]) {
        const id = expected[0]!
        const { input } = (
          await pool.query('SELECT input FROM matching_requests WHERE id=$1', [
            id,
          ])
        ).rows[0]
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
                          type: 'output_text',
                          text: JSON.stringify(unknownResult(input)),
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
      override async remove() {}
    }

    it('saves the AI assessment for the version whose content it assessed', async () => {
      injected.change = changeAd
      const request = await enqueueMatching(pool, boss, ad)
      const stored = (
        await pool.query('SELECT * FROM matching_requests WHERE id=$1', [
          request.id,
        ])
      ).rows[0]
      expect(stored.ad_revision_id).toBe(assessed)
      expect(stored.input.offer).toContain('Assessed PHP')
      expect(stored.input.offer).not.toContain('Changed Java')

      const current = (await currentAdVersions([ad])).get(ad)
      expect(current).toBe(changed)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await publishAiRating(
          client,
          stored,
          unknownResult(stored.input),
          stored.profile_version_id,
          current,
        )
        await client.query('COMMIT')
      } finally {
        client.release()
      }
      const rating = (
        await pool.query(
          'SELECT ad_revision_id,input FROM matching_rating_revisions WHERE request_id=$1',
          [request.id],
        )
      ).rows[0]
      expect(rating.ad_revision_id).toBe(assessed)
      expect(rating.input.offer).toContain('Assessed PHP')
      const view = await readMatching(pool, ad)
      expect(view.current).toMatchObject({
        ad_revision_id: assessed,
        stale: true,
      })
    })

    it('publishes an AI result for the version assessed when the ad changes after the run read its current version (ASM-1)', async () => {
      const request = await enqueueMatching(pool, boss, ad)
      // The run reads the current version before it takes its connection;
      // the ad changes right after that read, before the result is saved.
      injected.afterCurrentVersions = changeAd
      await executeMatching(pool, boss, request.id, new Provider())
      expect(injected.afterCurrentVersions).toBeNull()
      expect((await currentAdVersions([ad])).get(ad)).toBe(changed)
      const rating = (
        await pool.query(
          'SELECT ad_revision_id,input FROM matching_rating_revisions WHERE request_id=$1',
          [request.id],
        )
      ).rows[0]
      expect(rating.ad_revision_id).toBe(assessed)
      expect(rating.input.offer).toContain('Assessed PHP')
      // Only promotion relied on the earlier read: the result became the
      // current assessment, and it shows as stale against the changed ad.
      const view = await readMatching(pool, ad)
      expect(view.current).toMatchObject({
        request_id: request.id,
        ad_revision_id: assessed,
        stale: true,
      })
    })

    it("pairs the owner's assessment form with the version whose content it shows", async () => {
      injected.change = changeAd
      const context = (await manualContext(pool, ad))!
      expect(context.adRevisionId).toBe(assessed)
      expect(context.input.offer).toContain('Assessed PHP')
      // The ad changed after the form was read: saving it is a conflict, not
      // an assessment of the old content filed under the new version.
      await expect(
        saveManualRating(pool, ad, {
          commandId: randomUUID(),
          expectedRevisionId: context.headId,
          profileVersionId: context.profileVersionId,
          adRevisionId: context.adRevisionId,
          assessment: context.assessment,
          reason: 'Ocena właściciela.',
        }),
      ).rejects.toBeInstanceOf(RatingConflict)
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM matching_rating_revisions',
          )
        ).rows[0].n,
      ).toBe(0)
    })

    it("saves the owner's assessment with the content of the version the form names", async () => {
      const context = (await manualContext(pool, ad))!
      const saved = await saveManualRating(pool, ad, {
        commandId: randomUUID(),
        expectedRevisionId: context.headId,
        profileVersionId: context.profileVersionId,
        adRevisionId: context.adRevisionId,
        assessment: context.assessment,
        reason: 'Ocena właściciela.',
      })
      const rating = (
        await pool.query(
          'SELECT ad_revision_id,input FROM matching_rating_revisions WHERE id=$1',
          [saved.id],
        )
      ).rows[0]
      expect(rating.ad_revision_id).toBe(assessed)
      expect(rating.input).toEqual(context.input)
    })
  },
)
