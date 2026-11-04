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
import { emptyProfile } from '../lib/profile/model.ts'
import {
  manualContext,
  publishAiRating,
  readRatings,
  readWeights,
  saveManualRating,
  saveWeights,
} from '../lib/matching/ratings.ts'
import { defaultWeights } from '../lib/matching/weights.ts'
import type { Assessment, MatchingInput } from '../lib/matching/model.ts'
const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration(
  'owner ratings, weight revisions and AI publication without network or queue',
  () => {
    const schema = `matching_ratings_test_${randomUUID().replaceAll('-', '')}`
    let admin: Pool,
      pool: Pool,
      ad: string,
      revision: string,
      profileVersion: string
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
    })
    beforeEach(async () => {
      vi.stubEnv('OPENAI_API_KEY', '')
      vi.stubEnv('AI_MATCHING_PRICING_JSON', '')
      await pool.query(
        'TRUNCATE matching_rating_heads,matching_rating_revisions,matching_weight_head,matching_weight_versions,matching_groups,matching_requests,ai_attempts,ai_budget_months,profile_head,profile_versions,source_ads,source_scopes CASCADE',
      )
      await pool.query(
        'INSERT INTO matching_weight_versions(id,weights) VALUES($1,$2)',
        ['00000000-0000-4000-8000-000000000009', defaultWeights],
      )
      await pool.query(
        'INSERT INTO matching_weight_head(singleton,version_id) VALUES(true,$1)',
        ['00000000-0000-4000-8000-000000000009'],
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
        "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'original',$3)",
        [
          revision,
          ad,
          {
            title: 'PHP Developer',
            description: 'PHP backend',
            skills: [{ name: 'PHP' }],
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
    async function manualCommand() {
      const context = (await manualContext(pool, ad))!
      const assessment = structuredClone(context.assessment)
      assessment.criteria[0] = {
        ...assessment.criteria[0]!,
        state: 'match',
        score: 80,
        reason: 'Własna znajomość PHP poza obecnym profilem.',
        profileEvidence: null,
        offerEvidence: null,
      }
      return {
        commandId: randomUUID(),
        expectedRevisionId: context.headId,
        profileVersionId: context.profileVersionId,
        adRevisionId: context.adRevisionId,
        assessment,
        reason: 'Ręczna korekta na podstawie własnego doświadczenia.',
      }
    }
    async function newRequest(context?: {
      input: MatchingInput
      profileVersionId: string
      adRevisionId: string
    }) {
      const ctx = context ?? (await manualContext(pool, ad))!,
        id = randomUUID()
      await pool.query(
        "INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state) VALUES($1,$2,$3,$4,$5,'{}','completed')",
        [id, ad, ctx.adRevisionId, ctx.profileVersionId, ctx.input],
      )
      return {
        id,
        ad_id: ad,
        profile_version_id: ctx.profileVersionId,
        ad_revision_id: ctx.adRevisionId,
        input: ctx.input,
      }
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
    async function publish(request: Awaited<ReturnType<typeof newRequest>>) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await publishAiRating(
          client,
          request,
          unknownResult(request.input),
        )
        await client.query('COMMIT')
        return result
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    }
    it('saves owner knowledge for unknown profile criteria without AI configuration, reservations or queue', async () => {
      const context = (await manualContext(pool, ad))!
      expect(context.input.criteria[0]!.unknown).toBe(true)
      const saved = await saveManualRating(pool, ad, await manualCommand())
      const view = await readRatings(pool, ad)
      expect(view.current).toMatchObject({
        id: saved.id,
        author: 'owner',
        assessment_author: 'owner',
        calculation: { rating: 80 },
        stale: false,
      })
      expect(
        (await pool.query('SELECT count(*) FROM ai_attempts')).rows[0].count,
      ).toBe('0')
      expect(
        (await pool.query('SELECT count(*) FROM matching_requests')).rows[0]
          .count,
      ).toBe('0')
    })
    it('deduplicates manual commands and rejects same command with changed content', async () => {
      const command = await manualCommand(),
        a = await saveManualRating(pool, ad, command),
        b = await saveManualRating(pool, ad, command)
      expect(b).toEqual({ id: a.id, reused: true })
      await expect(
        saveManualRating(pool, ad, { ...command, reason: 'Different' }),
      ).rejects.toThrow('innej treści')
      expect((await readRatings(pool, ad)).ratings).toHaveLength(1)
    })
    it.each(['head', 'profile', 'ad'])(
      'rejects optimistic %s conflict without mutation',
      async (kind) => {
        const command = await manualCommand()
        if (kind === 'head')
          await saveManualRating(pool, ad, {
            ...command,
            commandId: randomUUID(),
          })
        if (kind === 'profile')
          await pool.query('UPDATE profile_head SET active_version_id=NULL')
        if (kind === 'ad') {
          const next = randomUUID()
          await pool.query(
            "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'next','{}')",
            [next, ad],
          )
          await pool.query(
            'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
            [ad, next],
          )
        }
        const before = (await readRatings(pool, ad)).ratings.length
        await expect(saveManualRating(pool, ad, command)).rejects.toThrow(
          'zmieniły się',
        )
        expect((await readRatings(pool, ad)).ratings).toHaveLength(before)
      },
    )
    it.each(['missing', 'blank-reason', 'unknown-score'])(
      'rejects invalid manual assessment %s',
      async (kind) => {
        const command = await manualCommand()
        if (kind === 'missing') command.assessment.criteria.pop()
        if (kind === 'blank-reason')
          command.assessment.criteria[0]!.reason = '  '
        if (kind === 'unknown-score')
          command.assessment.criteria[0]!.state = 'unknown'
        await expect(saveManualRating(pool, ad, command)).rejects.toThrow()
        expect((await readRatings(pool, ad)).ratings).toHaveLength(0)
      },
    )
    it('keeps identical weights as no-op and snapshots recalculated owner history with system author', async () => {
      const manual = await saveManualRating(pool, ad, await manualCommand()),
        initial = (await readWeights(pool)).current
      expect(
        await saveWeights(pool, {
          commandId: randomUUID(),
          expectedVersionId: initial.id,
          weights: defaultWeights,
        }),
      ).toMatchObject({ versionId: initial.id, updated: 0 })
      expect((await readRatings(pool, ad)).ratings).toHaveLength(1)
      const weights = {
        technologies: 100,
        experience: 0,
        conditions: 0,
        direction: 0,
      }
      const command = {
          commandId: randomUUID(),
          expectedVersionId: initial.id,
          weights,
        },
        result = await saveWeights(pool, command)
      const ratings = await readRatings(pool, ad)
      expect(result.updated).toBe(1)
      expect(ratings.current).toMatchObject({
        author: 'system',
        assessment_author: 'owner',
        weights,
        weights_version_id: result.versionId,
        calculation: { rating: 80, completeness: 100 },
      })
      expect(ratings.ratings.find((r) => r.id === manual.id)).toMatchObject({
        author: 'owner',
        weights: defaultWeights,
        is_current: false,
      })
      expect(await saveWeights(pool, command)).toMatchObject({
        versionId: result.versionId,
        reused: true,
      })
      await expect(
        saveWeights(pool, { ...command, weights: defaultWeights }),
      ).rejects.toThrow('innych wag')
    })
    it('remembers a no-op command across subsequent weight changes without reverting or recalculating', async () => {
      await saveManualRating(pool, ad, await manualCommand())
      const original = (await readWeights(pool)).current
      const noop = {
        commandId: randomUUID(),
        expectedVersionId: original.id,
        weights: defaultWeights,
      }
      expect(await saveWeights(pool, noop)).toEqual({
        versionId: original.id,
        updated: 0,
        reused: false,
      })
      const nextWeights = {
        technologies: 100,
        experience: 0,
        conditions: 0,
        direction: 0,
      }
      const changed = await saveWeights(pool, {
        commandId: randomUUID(),
        expectedVersionId: original.id,
        weights: nextWeights,
      })
      const before = await readRatings(pool, ad)
      expect(await saveWeights(pool, noop)).toEqual({
        versionId: original.id,
        updated: 0,
        reused: true,
      })
      expect((await readWeights(pool)).current.id).toBe(changed.versionId)
      expect((await readWeights(pool)).history).toHaveLength(2)
      expect(await readRatings(pool, ad)).toEqual(before)
      await expect(
        saveWeights(pool, { ...noop, weights: nextWeights }),
      ).rejects.toThrow('innych wag')
      expect(await readRatings(pool, ad)).toEqual(before)
    })
    it('allows only one owner save for an expected rating head', async () => {
      const command = await manualCommand()
      const outcomes = await Promise.allSettled([
        saveManualRating(pool, ad, command),
        saveManualRating(pool, ad, {
          ...command,
          commandId: randomUUID(),
          reason: 'Druga edycja',
        }),
      ])
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1)
      expect((await readRatings(pool, ad)).ratings).toHaveLength(1)
    })
    it('publishes AI with weights active at completion and spends no budget on reweighting', async () => {
      const request = await newRequest()
      const weights = {
        technologies: 0,
        experience: 100,
        conditions: 0,
        direction: 0,
      }
      const changed = await saveWeights(pool, {
        commandId: randomUUID(),
        expectedVersionId: (await readWeights(pool)).current.id,
        weights,
      })
      const ai = await publish(request)
      expect((await readRatings(pool, ad)).current).toMatchObject({
        id: ai.id,
        weights_version_id: changed.versionId,
        weights,
      })
      await saveWeights(pool, {
        commandId: randomUUID(),
        expectedVersionId: changed.versionId,
        weights: defaultWeights,
      })
      expect((await readRatings(pool, ad)).ratings).toHaveLength(2)
      expect(
        (await pool.query('SELECT count(*) FROM ai_attempts')).rows[0].count,
      ).toBe('0')
      expect(
        (await pool.query('SELECT count(*) FROM ai_budget_months')).rows[0]
          .count,
      ).toBe('0')
    })
    it('allows only one concurrent weight edit from the same expected version', async () => {
      const current = (await readWeights(pool)).current
      const outcomes = await Promise.allSettled([
        saveWeights(pool, {
          commandId: randomUUID(),
          expectedVersionId: current.id,
          weights: {
            technologies: 100,
            experience: 0,
            conditions: 0,
            direction: 0,
          },
        }),
        saveWeights(pool, {
          commandId: randomUUID(),
          expectedVersionId: current.id,
          weights: {
            technologies: 0,
            experience: 100,
            conditions: 0,
            direction: 0,
          },
        }),
      ])
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1)
      expect((await readWeights(pool)).history).toHaveLength(2)
    })
    it('promotes a fresh AI request over owner rating once, retaining history and AI provenance after reweighting', async () => {
      const owner = await saveManualRating(pool, ad, await manualCommand()),
        request = await newRequest()
      const ai = await publish(request),
        again = await publish(request)
      expect(again.id).toBe(ai.id)
      expect((await readRatings(pool, ad)).current).toMatchObject({
        id: ai.id,
        author: 'ai',
        assessment_author: 'ai',
      })
      expect(
        (await readRatings(pool, ad)).ratings.find((r) => r.id === owner.id),
      ).toMatchObject({ author: 'owner', is_current: false })
      await saveWeights(pool, {
        commandId: randomUUID(),
        expectedVersionId: (await readWeights(pool)).current.id,
        weights: {
          technologies: 100,
          experience: 0,
          conditions: 0,
          direction: 0,
        },
      })
      expect((await readRatings(pool, ad)).current).toMatchObject({
        author: 'system',
        assessment_author: 'ai',
      })
    })
    it('archives stale AI without replacing a current owner rating', async () => {
      const old = (await manualContext(pool, ad))!,
        request = await newRequest(old)
      const next = randomUUID()
      await pool.query(
        "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'next',$3)",
        [
          next,
          ad,
          { title: 'Changed', description: 'PHP', skills: [{ name: 'PHP' }] },
        ],
      )
      await pool.query(
        'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
        [ad, next],
      )
      const owner = await saveManualRating(pool, ad, await manualCommand())
      const archived = await publish(request),
        view = await readRatings(pool, ad)
      expect(view.current).toMatchObject({
        id: owner.id,
        stale: false,
        author: 'owner',
      })
      expect(view.ratings.find((r) => r.id === archived.id)).toMatchObject({
        stale: true,
        is_current: false,
        author: 'ai',
      })
    })
  },
)
