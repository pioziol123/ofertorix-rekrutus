import { randomUUID } from 'node:crypto'
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
import { closePool, setPool, transaction } from '../lib/db.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type {
  Assessment,
  MatchingInput,
} from '../modules/matching/domain/assessment.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { currentAdVersions } from '../modules/matching/read-assessment-inputs.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  manualContext,
  publishAiRating,
  RatingConflict,
  saveManualRating,
} from '../modules/matching/ratings.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { enqueueMatching } from '../modules/matching/request-assessment.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { readMatching } from '../modules/matching/read-assessments.ts'
import { registerResultReceiver } from '../modules/ai/index.ts'
import {
  assessmentReceiver,
  assessmentSettingsKey,
} from '../modules/matching/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { defaultWeights } from '../modules/matching/domain/weights.ts'
import { emptyProfile } from '../modules/profile/view.ts'
import { aiQueue } from './ai-queue.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'
import { migrate, SimulatedOpenAi } from './matching-ai.fixtures.ts'

// The settings and price lists AI keeps in code, replaced for the test.
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock(
  '../modules/ai/client-settings.ts',
  () => import('./ai-test-configuration.ts'),
)
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock(
  '../modules/ai/model-catalog.ts',
  () => import('./ai-test-configuration.ts'),
)

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
      registerResultReceiver(assessmentSettingsKey, assessmentReceiver)
    })

    beforeEach(async () => {
      vi.stubEnv('OPENAI_API_KEY', 'never-send-test-key')
      usePricing('matching', pricing, ['single', 'batch'])
      new SimulatedOpenAi()
      await queue.reset()
      injected.change = null
      await pool.query(
        'TRUNCATE matching_rating_heads,matching_rating_revisions,matching_weight_head,matching_weight_versions,matching_requests,ai_executions,ai_attempts,ai_budget_months,profile_head,profile_versions,source_ads,source_scopes CASCADE',
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
      await queue.stop()
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

    it('saves the AI assessment for the version whose content it assessed', async () => {
      injected.change = changeAd
      const request = await enqueueMatching(ad)
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
      await transaction(() =>
        publishAiRating(
          stored,
          unknownResult(stored.input),
          stored.profile_version_id,
          current,
        ),
      )
      const rating = (
        await pool.query(
          'SELECT ad_revision_id,input FROM matching_rating_revisions WHERE request_id=$1',
          [request.id],
        )
      ).rows[0]
      expect(rating.ad_revision_id).toBe(assessed)
      expect(rating.input.offer).toContain('Assessed PHP')
      const view = await readMatching(ad)
      expect(view.current).toMatchObject({
        ad_revision_id: assessed,
        stale: true,
      })
    })

    it('publishes an AI result for the version assessed when the ad changes after the run read its current version (ASM-1)', async () => {
      const request = await enqueueMatching(ad)
      // The receiver reads the current version without a lock; the ad
      // changes right after that read, before the result is saved.
      injected.afterCurrentVersions = changeAd
      await queue.work()
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
      const view = await readMatching(ad)
      expect(view.current).toMatchObject({
        request_id: request.id,
        ad_revision_id: assessed,
        stale: true,
      })
    })

    it("pairs the owner's assessment form with the version whose content it shows", async () => {
      injected.change = changeAd
      const context = (await manualContext(ad))!
      expect(context.adRevisionId).toBe(assessed)
      expect(context.input.offer).toContain('Assessed PHP')
      // The ad changed after the form was read: saving it is a conflict, not
      // an assessment of the old content filed under the new version.
      await expect(
        saveManualRating(ad, {
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
      const context = (await manualContext(ad))!
      const saved = await saveManualRating(ad, {
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
