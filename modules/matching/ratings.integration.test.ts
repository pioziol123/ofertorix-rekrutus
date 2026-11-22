import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { closePool, setPool, transaction } from '../../lib/db.ts'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { emptyProfile } from '../profile/view.ts'
import { confirmProfile, saveDraft } from '../profile/index.ts'
import {
  activeProfileVersion,
  currentAdVersions,
} from './read-assessment-inputs.ts'
import {
  manualContext,
  publishAiRating,
  readRatings,
  readWeights,
  saveManualRating,
  saveWeights,
} from './ratings.ts'
import { defaultWeights } from './domain/weights.ts'
import type { Assessment, MatchingInput } from './domain/assessment.ts'
import { readMatching } from './read-assessments.ts'
import { removePricing } from '../../tests/ai-test-configuration.ts'
import { migrate, pricing } from '../../tests/matching-ai.fixtures.ts'

// The price lists AI keeps in code, replaced for the test.
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock(
  '../ai/infrastructure/adapters/model-catalog.ts',
  () => import('../../tests/ai-test-configuration.ts'),
)
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
      await migrate(pool)
      // Profile reads go through the shared accessor (T-03).
      setPool(pool)
    })
    beforeEach(async () => {
      vi.stubEnv('OPENAI_API_KEY', '')
      removePricing(pricing.model)
      await pool.query(
        'TRUNCATE matching_rating_heads,matching_rating_revisions,matching_weight_head,matching_weight_versions,matching_requests,ai_operations,ai_assignments,ai_budget_months,profile_head,profile_versions,source_ads,source_scopes CASCADE',
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
      await closePool()
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await admin.end()
      }
    })
    const activeId = async () => (await activeProfileVersion())?.id ?? null
    async function manualCommand() {
      const context = (await manualContext(ad))!
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
      const ctx = context ?? (await manualContext(ad))!,
        id = randomUUID()
      // With its assessment saved, as Matching's receiver saves it; the
      // history shows it from Matching's own data.
      await pool.query(
        "INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state,result) VALUES($1,$2,$3,$4,$5,'{}','requested',$6)",
        [
          id,
          ad,
          ctx.adRevisionId,
          ctx.profileVersionId,
          ctx.input,
          unknownResult(ctx.input),
        ],
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
      // As the AI result path: the active version and the ad's current
      // version are read before the transaction.
      const active = (await activeProfileVersion())?.id ?? null
      const current = (await currentAdVersions([request.ad_id])).get(
        request.ad_id,
      )
      return transaction(() =>
        publishAiRating(request, unknownResult(request.input), active, current),
      )
    }
    it('saves owner knowledge for unknown profile criteria without AI configuration, reservations or queue', async () => {
      const context = (await manualContext(ad))!
      expect(context.input.criteria[0]!.unknown).toBe(true)
      const saved = await saveManualRating(ad, await manualCommand())
      const view = await readRatings(ad, await activeId())
      expect(view.current).toMatchObject({
        id: saved.id,
        author: 'owner',
        assessment_author: 'owner',
        calculation: { rating: 80 },
        stale: false,
      })
      expect(
        (await pool.query('SELECT count(*) FROM ai_operations')).rows[0].count,
      ).toBe('0')
      expect(
        (await pool.query('SELECT count(*) FROM matching_requests')).rows[0]
          .count,
      ).toBe('0')
    })
    it('deduplicates manual commands and rejects same command with changed content', async () => {
      const command = await manualCommand(),
        a = await saveManualRating(ad, command),
        b = await saveManualRating(ad, command)
      expect(b).toEqual({ id: a.id, reused: true })
      await expect(
        saveManualRating(ad, { ...command, reason: 'Different' }),
      ).rejects.toThrow('innej treści')
      expect((await readRatings(ad, await activeId())).ratings).toHaveLength(1)
    })
    it.each(['head', 'profile', 'ad'])(
      'rejects optimistic %s conflict without mutation',
      async (kind) => {
        const command = await manualCommand()
        if (kind === 'head')
          await saveManualRating(ad, {
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
        const before = (await readRatings(ad, await activeId())).ratings.length
        await expect(saveManualRating(ad, command)).rejects.toThrow(
          'zmieniły się',
        )
        expect((await readRatings(ad, await activeId())).ratings).toHaveLength(
          before,
        )
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
        await expect(saveManualRating(ad, command)).rejects.toThrow()
        expect((await readRatings(ad, await activeId())).ratings).toHaveLength(
          0,
        )
      },
    )
    it('keeps identical weights as no-op and snapshots recalculated owner history with system author', async () => {
      const manual = await saveManualRating(ad, await manualCommand()),
        initial = (await readWeights()).current
      expect(
        await saveWeights({
          commandId: randomUUID(),
          expectedVersionId: initial.id,
          weights: defaultWeights,
        }),
      ).toMatchObject({ versionId: initial.id, updated: 0 })
      expect((await readRatings(ad, await activeId())).ratings).toHaveLength(1)
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
        result = await saveWeights(command)
      const ratings = await readRatings(ad, await activeId())
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
      expect(await saveWeights(command)).toMatchObject({
        versionId: result.versionId,
        reused: true,
      })
      await expect(
        saveWeights({ ...command, weights: defaultWeights }),
      ).rejects.toThrow('innych wag')
    })
    it('remembers a no-op command across subsequent weight changes without reverting or recalculating', async () => {
      await saveManualRating(ad, await manualCommand())
      const original = (await readWeights()).current
      const noop = {
        commandId: randomUUID(),
        expectedVersionId: original.id,
        weights: defaultWeights,
      }
      expect(await saveWeights(noop)).toEqual({
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
      const changed = await saveWeights({
        commandId: randomUUID(),
        expectedVersionId: original.id,
        weights: nextWeights,
      })
      const before = await readRatings(ad, await activeId())
      expect(await saveWeights(noop)).toEqual({
        versionId: original.id,
        updated: 0,
        reused: true,
      })
      expect((await readWeights()).current.id).toBe(changed.versionId)
      expect((await readWeights()).history).toHaveLength(2)
      expect(await readRatings(ad, await activeId())).toEqual(before)
      await expect(
        saveWeights({ ...noop, weights: nextWeights }),
      ).rejects.toThrow('innych wag')
      expect(await readRatings(ad, await activeId())).toEqual(before)
    })
    it('allows only one owner save for an expected rating head', async () => {
      const command = await manualCommand()
      const outcomes = await Promise.allSettled([
        saveManualRating(ad, command),
        saveManualRating(ad, {
          ...command,
          commandId: randomUUID(),
          reason: 'Druga edycja',
        }),
      ])
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1)
      expect((await readRatings(ad, await activeId())).ratings).toHaveLength(1)
    })
    it('confirms a new profile version and changes the ad without waiting for an AI rating being published (A10-AC04)', async () => {
      const request = await newRequest()
      const active = (await activeProfileVersion())?.id ?? null
      const current = (await currentAdVersions([request.ad_id])).get(
        request.ad_id,
      )
      // The publication's transaction stays open until the test ends it.
      let end!: () => void
      const ended = new Promise<void>((resolve) => (end = resolve))
      let published!: () => void
      const publishing = new Promise<void>((resolve) => (published = resolve))
      const publication = transaction(async () => {
        await publishAiRating(
          request,
          unknownResult(request.input),
          active,
          current,
        )
        published()
        await ended
      })
      try {
        await Promise.race([publishing, publication])
        // The publication's transaction is still open while the owner confirms.
        const draft = await saveDraft(emptyProfile(), 0)
        const [confirmed] = await Promise.all([
          Promise.race([
            confirmProfile(draft.revision, profileVersion, randomUUID()),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error('Confirmation waited for publication')),
                3000,
              ),
            ),
          ]),
        ])
        // Nor does it lock the ad: Sources can change it meanwhile.
        await Promise.race([
          pool.query('UPDATE source_ads SET valid_to=now() WHERE id=$1', [ad]),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Ad change waited for publication')),
              3000,
            ),
          ),
        ])
        end()
        await publication
        expect((await activeProfileVersion())?.id).toBe(confirmed.id)
        expect((await readRatings(ad, await activeId())).current).toMatchObject(
          {
            request_id: request.id,
            profile_number: 1,
            stale: true,
          },
        )
      } finally {
        end()
        await publication.catch(() => undefined)
      }
    })
    it('reads the profile a fixed number of times for the assessment history, whatever its versions (A10-AC05)', async () => {
      const profileReads = async (read: () => Promise<unknown>) => {
        const spy = vi.spyOn(pool, 'query')
        try {
          await read()
          return spy.mock.calls.filter(([sql]) =>
            /profile_(versions|head)/.test(String(sql)),
          ).length
        } finally {
          spy.mockRestore()
        }
      }
      await saveManualRating(ad, await manualCommand())
      await newRequest()
      const one = {
        ratings: await profileReads(async () =>
          readRatings(ad, await activeId()),
        ),
        history: await profileReads(() => readMatching(ad)),
      }
      for (const number of [2, 3]) {
        const version = randomUUID()
        await pool.query(
          'INSERT INTO profile_versions(id,number,data,command_id,draft_revision) VALUES($1,$2,$3,$4,$2)',
          [version, number, emptyProfile(), randomUUID()],
        )
        await pool.query('UPDATE profile_head SET active_version_id=$1', [
          version,
        ])
        await saveManualRating(ad, await manualCommand())
        await newRequest()
      }
      const view = await readMatching(ad)
      expect(view.ratings.map((rating) => rating.profile_number)).toEqual([
        3, 2, 1,
      ])
      expect(
        view.history.map((request) => request.profile_number).sort(),
      ).toEqual([1, 2, 3])
      expect(view.profileReady).toBe(true)
      expect({
        ratings: await profileReads(async () =>
          readRatings(ad, await activeId()),
        ),
        history: await profileReads(() => readMatching(ad)),
      }).toEqual(one)
      expect(one).toEqual({ ratings: 2, history: 3 })
    })
    it('publishes AI with weights active at completion and spends no budget on reweighting', async () => {
      const request = await newRequest()
      const weights = {
        technologies: 0,
        experience: 100,
        conditions: 0,
        direction: 0,
      }
      const changed = await saveWeights({
        commandId: randomUUID(),
        expectedVersionId: (await readWeights()).current.id,
        weights,
      })
      const ai = await publish(request)
      expect((await readRatings(ad, await activeId())).current).toMatchObject({
        id: ai.id,
        weights_version_id: changed.versionId,
        weights,
      })
      await saveWeights({
        commandId: randomUUID(),
        expectedVersionId: changed.versionId,
        weights: defaultWeights,
      })
      expect((await readRatings(ad, await activeId())).ratings).toHaveLength(2)
      // Reweighting requested no AI work.
      for (const table of ['ai_assignments', 'ai_operations'])
        expect(
          (await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,
        ).toBe('0')
      expect(
        (await pool.query('SELECT count(*) FROM ai_budget_months')).rows[0]
          .count,
      ).toBe('0')
    })
    it('allows only one concurrent weight edit from the same expected version', async () => {
      const current = (await readWeights()).current
      const outcomes = await Promise.allSettled([
        saveWeights({
          commandId: randomUUID(),
          expectedVersionId: current.id,
          weights: {
            technologies: 100,
            experience: 0,
            conditions: 0,
            direction: 0,
          },
        }),
        saveWeights({
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
      expect((await readWeights()).history).toHaveLength(2)
    })
    it('promotes a fresh AI request over owner rating once, retaining history and AI provenance after reweighting', async () => {
      const owner = await saveManualRating(ad, await manualCommand()),
        request = await newRequest()
      const ai = await publish(request),
        again = await publish(request)
      expect(again.id).toBe(ai.id)
      expect((await readRatings(ad, await activeId())).current).toMatchObject({
        id: ai.id,
        author: 'ai',
        assessment_author: 'ai',
      })
      expect(
        (await readRatings(ad, await activeId())).ratings.find(
          (r) => r.id === owner.id,
        ),
      ).toMatchObject({ author: 'owner', is_current: false })
      await saveWeights({
        commandId: randomUUID(),
        expectedVersionId: (await readWeights()).current.id,
        weights: {
          technologies: 100,
          experience: 0,
          conditions: 0,
          direction: 0,
        },
      })
      expect((await readRatings(ad, await activeId())).current).toMatchObject({
        author: 'system',
        assessment_author: 'ai',
      })
    })
    it('archives stale AI without replacing a current owner rating', async () => {
      const old = (await manualContext(ad))!,
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
      const owner = await saveManualRating(ad, await manualCommand())
      const archived = await publish(request),
        view = await readRatings(ad, await activeId())
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
