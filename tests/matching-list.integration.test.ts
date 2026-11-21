import { randomUUID } from 'node:crypto'
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
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  decorateMatching,
  matchingListStatus,
} from '../modules/matching/read-offer-assessments.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { projectSourceAd } from '../modules/sources/domain/ad-projection.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { activeProfileVersion } from '../modules/matching/read-assessment-inputs.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  manualContext,
  readRatings,
  readWeights,
  saveManualRating,
  saveWeights,
} from '../modules/matching/ratings.ts'
import { emptyProfile } from '../modules/profile/view.ts'
import { listOffers, parseFilters } from '../modules/offers/index.ts'
import { usePricing } from './ai-test-configuration.ts'
import { insertExecution, migrate } from './matching-ai.fixtures.ts'

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
    model: 'gpt-6-luna',
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
    await migrate(pool)
    // Profile reads go through the shared accessor (T-03).
    setPool(pool)
  })
  beforeEach(async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('OPENAI_API_KEY', 'never-send-test-key')
    usePricing('matching', pricing, ['single', 'batch'])
    await pool.query(
      'TRUNCATE matching_requests,matching_rating_heads,matching_rating_revisions,ai_operations,ai_assignments,ai_executions,ai_attempts,ai_budget_months,profile_imports,profile_head,profile_versions,source_ads,source_scopes CASCADE',
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
  /**
   * A request whose latest AI execution is in the given public state, or an
   * excluded one.
   */
  async function request(
    state: string,
    at: string,
    calculation: unknown = null,
  ) {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state,calculation,created_at) VALUES($1,$2,$3,$4,'{}','{}',$5,$6,$7)`,
      [
        id,
        ad,
        revision,
        profileVersion,
        state === 'excluded' ? 'excluded' : 'requested',
        calculation,
        at,
      ],
    )
    if (state !== 'excluded') await insertExecution(pool, id, state)
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
    // Profile, current versions, assessments, and their AI work (0mq.21).
    expect(one.queries).toBeLessThanOrEqual(5)
  })
  it('keeps an empty catalog and unassessed offers free of fabricated scores', async () => {
    expect(await decorateMatching([])).toEqual([])
    expect((await decorateMatching(offers()))[0]).not.toHaveProperty(
      'assessment',
    )
  })
  it.each([
    ['failed', 'failed'],
    ['running', 'running'],
    ['delivering', 'running'],
    ['rejected', 'failed'],
    ['uncertain', 'unknown'],
    ['excluded', 'excluded'],
  ])(
    'retains the latest successful score beside a newer request whose AI work is %s (0mq.21 ASM-3)',
    async (state, shown) => {
      const older = await request('completed', '2026-01-01', {
        ...calculation,
        rating: 20,
      })
      const score = await request('completed', '2026-01-02', calculation)
      const latest = await request(state, '2026-01-03')
      const result = (await decorateMatching(offers()))[0]!
      expect(result.assessment).toEqual({
        requestId: latest,
        author: 'ai',
        state: shown,
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
    expect((await decorateMatching(offers()))[0]!.assessment).toMatchObject({
      rating: 0,
      completeness: 0,
      components: { conditions: null, direction: 0 },
    })
    await pool.query(
      'UPDATE matching_rating_revisions SET calculation=calculation || \'{"rating":null}\'::jsonb',
    )
    expect((await decorateMatching(offers()))[0]!.assessment!.rating).toBeNull()
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
    expect((await decorateMatching(offers()))[0]!.assessment!.stale).toBe(true)
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [ad, revision],
    )
    await pool.query('UPDATE profile_head SET active_version_id=NULL')
    expect((await decorateMatching(offers()))[0]!.assessment!.stale).toBe(true)
    await pool.query('UPDATE profile_head SET active_version_id=$1', [
      profileVersion,
    ])
    expect((await decorateMatching(offers()))[0]!.assessment!.stale).toBe(false)
  })
  it('uses the same owner head as details before and after reweighting without an AI request', async () => {
    const context = (await manualContext(ad))!
    const assessment = structuredClone(context.assessment)
    assessment.criteria[0] = {
      ...assessment.criteria[0]!,
      state: 'match',
      score: 70,
      reason: 'Własna wiedza',
    }
    await saveManualRating(ad, {
      commandId: randomUUID(),
      expectedRevisionId: context.headId,
      profileVersionId: context.profileVersionId,
      adRevisionId: context.adRevisionId,
      assessment,
      reason: 'Własna ocena',
    })
    const assertSame = async () => {
      const detail = (await readRatings(ad, await activeId())).current!
      expect((await decorateMatching(offers()))[0]!.assessment).toMatchObject({
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
    await assertSame()
  })
  it('reports configuration, profile readiness, pending count and reservation ceiling through AI reads without any provider call (0mq.21 ASM-4, sq2.9 ASM-3)', async () => {
    // A group command is one assignment per offer: the single price list
    // gives its ceiling per offer, also without a Batch price list.
    usePricing('matching', pricing, 'single')
    await request('running', '2026-01-01')
    await request('completed', '2026-01-02', calculation)
    expect(await matchingListStatus()).toEqual({
      configured: true,
      profileReady: true,
      pending: 1,
      maximumCostPln: '0.020500',
    })
    usePricing('matching', null)
    vi.stubEnv('OPENAI_API_KEY', '')
    await pool.query('UPDATE profile_head SET active_version_id=NULL')
    expect(await matchingListStatus()).toEqual({
      configured: false,
      profileReady: false,
      pending: 1,
      maximumCostPln: null,
    })
  })

  /**
   * A request with an assignment in the given status, its outcome saved
   * when the assignment ended, as Matching's receiver saves it.
   */
  async function assignedRequest(
    status: 'in_progress' | 'needs_attention' | 'succeeded' | 'failed',
  ) {
    const id = randomUUID(),
      assignmentId = randomUUID()
    await pool.query(
      `INSERT INTO ai_assignments(id,settings_name,type,label,instruction,input,executor,executor_parameters,status,failure_reason,automatic_operation_limit,placed_at,deadline)
       VALUES($1,'matching','single','Oferta','Oceń','{}','openai','{}',$2,$3,3,now(),now()+interval '7 days')`,
      [assignmentId, status, status === 'failed' ? 'time_limit' : null],
    )
    await pool.query(
      `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state,assignment_id,calculation,result,error)
       VALUES($1,$2,$3,$4,'{}','{}','requested',$5,$6,$7,$8)`,
      [
        id,
        ad,
        revision,
        profileVersion,
        assignmentId,
        status === 'succeeded' ? calculation : null,
        status === 'succeeded'
          ? { summary: 'x', strengths: [], gaps: [], criteria: [] }
          : null,
        status === 'failed' ? 'Ocena nie została wykonana.' : null,
      ],
    )
    return { id, assignmentId }
  }
  it('keeps the offer list refreshing while an assessment with an assignment is in progress or needs attention, and stops once none is (T8-AC06, T8-R06)', async () => {
    const running = await assignedRequest('in_progress')
    const attention = await assignedRequest('needs_attention')
    expect((await matchingListStatus()).pending).toBe(2)
    const [offer] = await decorateMatching(offers())
    expect(offer!.assessment).toMatchObject({ state: 'running' })
    // Their receiver saved an outcome when they ended.
    await pool.query(
      "UPDATE ai_assignments SET status='succeeded' WHERE id=$1",
      [running.assignmentId],
    )
    await pool.query(
      'UPDATE matching_requests SET calculation=$2,result=$3 WHERE id=$1',
      [
        running.id,
        calculation,
        { summary: 'x', strengths: [], gaps: [], criteria: [] },
      ],
    )
    expect((await matchingListStatus()).pending).toBe(1)
    await pool.query(
      "UPDATE ai_assignments SET status='failed',failure_reason='rejected' WHERE id=$1",
      [attention.assignmentId],
    )
    await pool.query("UPDATE matching_requests SET error='x' WHERE id=$1", [
      attention.id,
    ])
    expect((await matchingListStatus()).pending).toBe(0)
  })
  it('counts an assessment in progress of an offer that is not shown, as the count before the task did (sq2.9 ASM-5)', async () => {
    // An ad the list does not show: no offer of the page carries it.
    const hidden = randomUUID()
    await pool.query(
      "INSERT INTO source_ads(id,source,external_id,last_seen_scope_id) SELECT $1,'solid',$2,last_seen_scope_id FROM source_ads WHERE id=$3",
      [hidden, randomUUID(), ad],
    )
    const assignmentId = randomUUID()
    await pool.query(
      `INSERT INTO ai_assignments(id,settings_name,type,label,instruction,input,executor,executor_parameters,status,automatic_operation_limit,placed_at,deadline)
       VALUES($1,'matching','single','Oferta','Oceń','{}','openai','{}','in_progress',3,now(),now()+interval '7 days')`,
      [assignmentId],
    )
    await pool.query(
      `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state,assignment_id)
       VALUES($1,$2,$3,$4,'{}','{}','requested',$5)`,
      [randomUUID(), hidden, revision, profileVersion, assignmentId],
    )
    const [shown] = await decorateMatching(offers())
    expect(shown!.assessment).toBeUndefined()
    expect((await matchingListStatus()).pending).toBe(1)
  })
  it('shows an assessment with an assignment in the list as in progress, ready or failed, never with a removed text (T8-AC04)', async () => {
    const shown = async () => (await decorateMatching(offers()))[0]!.assessment
    await assignedRequest('needs_attention')
    expect((await shown())!.state).toBe('running')
    await pool.query('TRUNCATE matching_requests,ai_assignments CASCADE')
    await assignedRequest('failed')
    expect((await shown())!.state).toBe('failed')
    await pool.query('TRUNCATE matching_requests,ai_assignments CASCADE')
    await assignedRequest('succeeded')
    expect((await shown())!.state).toBe('completed')
  })
})
