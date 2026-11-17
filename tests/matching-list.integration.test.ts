import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
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
import { decorateMatching, matchingListStatus } from '../lib/matching/list.ts'
import { projectSourceAd } from '../modules/sources/domain/ad-projection.ts'
import {
  activeProfileVersion,
  manualContext,
  readRatings,
  readWeights,
  saveManualRating,
  saveWeights,
} from '../lib/matching/ratings.ts'
import { emptyProfile } from '../lib/profile/model.ts'
import { listOffers, parseFilters } from '../modules/offers/index.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration('list matching projections in isolated PostgreSQL', () => {
  const schema = `matching_list_test_${randomUUID().replaceAll('-', '')}`
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
    await pool.query(
      'TRUNCATE matching_requests,matching_batches,matching_groups,ai_attempts,ai_budget_months,profile_imports,profile_head,profile_versions,source_ads,source_scopes CASCADE',
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
      "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'test','{}')",
      [revision, ad],
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
  const offers = () => [
    projectSourceAd({
      id: ad,
      payload: {},
      first_seen_at: new Date(),
      last_seen_at: new Date(),
    }),
  ]
  async function request(
    state: string,
    at: string,
    calculation: unknown = null,
  ) {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state,calculation,created_at) VALUES($1,$2,$3,$4,'{}','{}',$5,$6,$7)`,
      [id, ad, revision, profileVersion, state, calculation, at],
    )
    if (state === 'completed') {
      await pool.query(
        `INSERT INTO matching_rating_revisions(id,ad_id,request_id,profile_version_id,ad_revision_id,input,result,calculation,weights_version_id,author,assessment_author,reason) VALUES($1,$2,$1,$3,$4,'{}','{}',$5,(SELECT version_id FROM matching_weight_head),'ai','ai','Fixture')`,
        [id, ad, profileVersion, revision, calculation],
      )
      await pool.query(
        'INSERT INTO matching_rating_heads(ad_id,revision_id) VALUES($1,$2) ON CONFLICT(ad_id) DO UPDATE SET revision_id=excluded.revision_id',
        [ad, id],
      )
    }
    return id
  }
  const calculation = {
    rating: 80,
    completeness: 75,
    components: [
      { group: 'technologies', score: 90 },
      { group: 'experience', score: 60 },
      { group: 'conditions', score: null },
      { group: 'direction', score: 0 },
    ],
  }
  it('reads the offer list with assessments in a fixed number of queries, whatever the number of offers (A6-AC05)', async () => {
    /** The list page and the number of queries sent to read it. */
    const countedList = async () => {
      const spy = vi.spyOn(pool, 'query')
      try {
        const list = await listOffers(parseFilters({}))
        return { list, queries: spy.mock.calls.length }
      } finally {
        spy.mockRestore()
      }
    }
    await request('completed', '2026-01-01', calculation)
    const one = await countedList()
    expect(one.list.total).toBe(1)
    const scope = (
      await pool.query(
        'SELECT last_seen_scope_id FROM source_ads WHERE id=$1',
        [ad],
      )
    ).rows[0].last_seen_scope_id
    for (let n = 0; n < 5; n++) {
      ad = randomUUID()
      revision = randomUUID()
      await pool.query(
        "INSERT INTO source_ads(id,source,external_id,last_seen_scope_id) VALUES($1,'solid',$2,$3)",
        [ad, randomUUID(), scope],
      )
      await pool.query(
        "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'test','{}')",
        [revision, ad],
      )
      await pool.query(
        'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
        [ad, revision],
      )
      await request('completed', '2026-01-01', calculation)
    }
    const six = await countedList()
    expect(six.list.total).toBe(6)
    expect(
      six.list.items.every((offer) => offer.assessment?.rating === 80),
    ).toBe(true)
    expect(six.queries).toBe(one.queries)
    expect(one.queries).toBeLessThanOrEqual(4)
  })
  it('keeps an empty catalog and unassessed offers free of fabricated scores', async () => {
    expect(await decorateMatching(pool, [])).toEqual([])
    expect((await decorateMatching(pool, offers()))[0]).not.toHaveProperty(
      'assessment',
    )
  })
  it.each(['failed', 'submitted'])(
    'retains the latest successful score beside a newer %s request',
    async (state) => {
      const older = await request('completed', '2026-01-01', {
        ...calculation,
        rating: 20,
      })
      const score = await request('completed', '2026-01-02', calculation)
      const latest = await request(state, '2026-01-03')
      const result = (await decorateMatching(pool, offers()))[0]!
      expect(result.assessment).toEqual({
        requestId: latest,
        author: 'ai',
        state,
        scoreId: score,
        rating: 80,
        completeness: 75,
        stale: false,
        components: {
          technologies: 90,
          experience: 60,
          conditions: null,
          direction: 0,
        },
      })
      expect(result.assessment!.scoreId).not.toBe(older)
    },
  )
  it('preserves zero and unknown scores as distinct values', async () => {
    await request('completed', '2026-01-01', {
      ...calculation,
      rating: 0,
      completeness: 0,
    })
    expect(
      (await decorateMatching(pool, offers()))[0]!.assessment,
    ).toMatchObject({
      rating: 0,
      completeness: 0,
      components: { conditions: null, direction: 0 },
    })
    await pool.query(
      'UPDATE matching_rating_revisions SET calculation=calculation || \'{"rating":null}\'::jsonb',
    )
    expect(
      (await decorateMatching(pool, offers()))[0]!.assessment!.rating,
    ).toBeNull()
  })
  it('marks scores stale independently after either source revision or active profile changes', async () => {
    await request('completed', '2026-01-01', calculation)
    const next = randomUUID()
    await pool.query(
      "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'next','{}')",
      [next, ad],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [ad, next],
    )
    expect((await decorateMatching(pool, offers()))[0]!.assessment!.stale).toBe(
      true,
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [ad, revision],
    )
    await pool.query('UPDATE profile_head SET active_version_id=NULL')
    expect((await decorateMatching(pool, offers()))[0]!.assessment!.stale).toBe(
      true,
    )
    await pool.query('UPDATE profile_head SET active_version_id=$1', [
      profileVersion,
    ])
    expect((await decorateMatching(pool, offers()))[0]!.assessment!.stale).toBe(
      false,
    )
  })
  it('uses the same owner head as details before and after reweighting without an AI request', async () => {
    const context = (await manualContext(pool, ad))!
    const assessment = structuredClone(context.assessment)
    assessment.criteria[0] = {
      ...assessment.criteria[0]!,
      state: 'match',
      score: 70,
      reason: 'Własna wiedza',
    }
    await saveManualRating(pool, ad, {
      commandId: randomUUID(),
      expectedRevisionId: context.headId,
      profileVersionId: context.profileVersionId,
      adRevisionId: context.adRevisionId,
      assessment,
      reason: 'Własna ocena',
    })
    const assertSame = async () => {
      const detail = (await readRatings(pool, ad, await activeId())).current!
      expect(
        (await decorateMatching(pool, offers()))[0]!.assessment,
      ).toMatchObject({
        requestId: null,
        state: 'completed',
        author: 'owner',
        scoreId: detail.id,
        rating: detail.calculation.rating,
        completeness: detail.calculation.completeness,
        stale: false,
      })
    }
    await assertSame()
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
    await assertSame()
  })
  it('reports configuration, profile readiness, pending count and reservation ceiling without any provider call', async () => {
    await request('submitted', '2026-01-01')
    expect(await matchingListStatus(pool)).toEqual({
      configured: true,
      profileReady: true,
      pending: 1,
      maximumCostPln: '0.020500',
    })
    vi.stubEnv('AI_MATCHING_PRICING_JSON', '')
    await pool.query('UPDATE profile_head SET active_version_id=NULL')
    expect(await matchingListStatus(pool)).toEqual({
      configured: false,
      profileReady: false,
      pending: 1,
      maximumCostPln: null,
    })
  })
})
