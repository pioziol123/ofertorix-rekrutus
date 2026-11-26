import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import { manualContext, saveManualRating } from '../modules/matching/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { defaultWeights } from '../modules/matching/domain/weights.ts'
import { OfferNotFound, startApplication } from '../modules/offers/index.ts'
import { emptyProfile } from '../modules/profile/view.ts'
import {
  ApplicationMissing,
  moveApplication,
  readApplication,
  readCurrentStages,
  StageChanged,
  stages,
  TransitionNotAllowed,
  type Stage,
} from '../modules/recruitments/index.ts'
import {
  aiLeaseMigration,
  aiWithoutLeaseMigration,
  assignmentMigrations,
  matchingMigrations,
  migrate,
} from './matching-ai.fixtures.ts'

/**
 * The application of an offer in the Recruitments module (task
 * oferty-pracy-lq3.1, T1 of epic lq3) on an isolated database: the
 * transitions of A-R03 (A-AC01), the stale page (A-AC02), a restart
 * (A-AC04), independence from the ad and its assessment (A-AC05), the same
 * choice twice (A-AC08) and parallel moves (A-AC09).
 */

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/** The transition table of A-R03, written out as the requirement lists it. */
const allowed: Record<Stage, Stage[]> = {
  to_consider: ['cv_sent', 'rejected', 'removed'],
  cv_sent: ['rejected', 'to_consider'],
  rejected: ['to_consider', 'cv_sent', 'removed'],
  removed: ['to_consider', 'cv_sent', 'rejected'],
}
const firstStages: Stage[] = ['to_consider', 'cv_sent', 'rejected']

integration('applications of offers in isolated PostgreSQL', () => {
  const schema = `recruitments_test_${randomUUID().replaceAll('-', '')}`
  const connection = { connectionString: process.env.DATABASE_URL }
  let admin: Pool, pool: Pool, scope: string
  let clock = Date.parse('2026-11-26T10:00:00.000Z')
  /** A new moment for each move, one second after the previous one. */
  const tick = () => new Date((clock += 1000))

  const count = async (table: string, offerId: string) =>
    Number(
      (
        await pool.query(
          table === 'applications'
            ? 'SELECT count(*) AS n FROM recruitment_applications WHERE offer_id=$1'
            : `SELECT count(*) AS n FROM recruitment_stage_changes c
               JOIN recruitment_applications a ON a.id=c.application_id
               WHERE a.offer_id=$1`,
          [offerId],
        )
      ).rows[0].n,
    )

  /** Stores an ad of the source with a current version: an offer. */
  async function offer(): Promise<string> {
    const id = randomUUID(),
      revision = randomUUID()
    await pool.query(
      "INSERT INTO source_ads(id,source,external_id,last_seen_scope_id) VALUES($1,'solid',$2,$3)",
      [id, randomUUID(), scope],
    )
    await pool.query(
      "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'h',$3)",
      [revision, id, { title: 'PHP Developer', skills: [{ name: 'PHP' }] }],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [id, revision],
    )
    return id
  }

  /** An offer whose application is in the given stage. */
  async function offerIn(stage: Stage): Promise<string> {
    const id = await offer()
    if (stage === 'removed') {
      await startApplication(id, 'to_consider', tick())
      await moveApplication({
        offerId: id,
        expected: 'to_consider',
        target: 'removed',
        now: tick(),
      })
    } else await startApplication(id, stage, tick())
    return id
  }

  beforeAll(async () => {
    admin = new Pool(connection)
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({ ...connection, options: `-c search_path=${schema}` })
    await migrate(pool, [
      ...matchingMigrations,
      aiLeaseMigration,
      aiWithoutLeaseMigration,
      ...assignmentMigrations,
      '1770000000039_recruitments',
    ])
    setPool(pool)
    scope = randomUUID()
    await pool.query(
      "INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,'solid',$2,'{}')",
      [scope, randomUUID()],
    )
  })
  beforeEach(() => {
    clock += 60_000
  })
  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  it('creates one application on the first move and records its stage and moment (A-AC01)', async () => {
    for (const stage of firstStages) {
      const id = await offer()
      const now = tick()
      expect(await startApplication(id, stage, now)).toEqual({
        stage,
        stageChangedAt: now,
      })
      expect(await readApplication(id)).toEqual({
        offerId: id,
        stage,
        stageChangedAt: now,
        note: '',
        history: [{ stage, changedAt: now }],
      })
      expect(await count('applications', id)).toBe(1)
    }
  })

  it('refuses "Zdjęta z listy" as a first move and creates nothing (A-AC01)', async () => {
    const id = await offer()
    await expect(startApplication(id, 'removed', tick())).rejects.toThrow(
      TransitionNotAllowed,
    )
    expect(await readApplication(id)).toBeNull()
    expect(await count('applications', id)).toBe(0)
  })

  it('applies every transition of A-R03 with its moment and a history record (A-AC01)', async () => {
    for (const from of stages)
      for (const to of allowed[from]) {
        const id = await offerIn(from)
        const before = (await readApplication(id))!
        const now = tick()
        expect(
          await moveApplication({
            offerId: id,
            expected: from,
            target: to,
            now,
          }),
        ).toEqual({ stage: to, stageChangedAt: now })
        const after = (await readApplication(id))!
        expect(after.stage, `${from} → ${to}`).toBe(to)
        expect(after.stageChangedAt).toEqual(now)
        expect(after.history).toEqual([
          { stage: to, changedAt: now },
          ...before.history,
        ])
        expect(await count('applications', id)).toBe(1)
      }
  })

  it('refuses every other pair, "CV wysłane" → "Zdjęta z listy" included, without a change (A-AC01)', async () => {
    for (const from of stages)
      for (const to of stages.filter((s) => !allowed[from].includes(s))) {
        const id = await offerIn(from)
        const before = await readApplication(id)
        await expect(
          moveApplication({
            offerId: id,
            expected: from,
            target: to,
            now: tick(),
          }),
          `${from} → ${to}`,
        ).rejects.toThrow(TransitionNotAllowed)
        expect(await readApplication(id)).toEqual(before)
      }
  })

  it('never creates a second application for an offer (A-AC01)', async () => {
    const id = await offerIn('to_consider')
    await expect(startApplication(id, 'cv_sent', tick())).rejects.toThrow(
      StageChanged,
    )
    await moveApplication({
      offerId: id,
      expected: 'to_consider',
      target: 'cv_sent',
      now: tick(),
    })
    expect(await count('applications', id)).toBe(1)
  })

  it('refuses a move with a stage that is no longer current and saves nothing (A-AC02)', async () => {
    const id = await offerIn('to_consider')
    await moveApplication({
      offerId: id,
      expected: 'to_consider',
      target: 'cv_sent',
      now: tick(),
    })
    const before = await readApplication(id)
    await expect(
      moveApplication({
        offerId: id,
        expected: 'to_consider',
        target: 'rejected',
        now: tick(),
      }),
    ).rejects.toThrow(StageChanged)
    expect(await readApplication(id)).toEqual(before)
  })

  it('refuses a first move from a page that showed no application when one exists, and saves nothing (A-AC02)', async () => {
    const id = await offerIn('cv_sent')
    const before = await readApplication(id)
    await expect(startApplication(id, 'rejected', tick())).rejects.toThrow(
      StageChanged,
    )
    expect(await readApplication(id)).toEqual(before)
    expect(await count('applications', id)).toBe(1)
  })

  it('refuses a move of an offer without an application and creates none', async () => {
    const id = await offer()
    await expect(
      moveApplication({
        offerId: id,
        expected: 'to_consider',
        target: 'cv_sent',
        now: tick(),
      }),
    ).rejects.toThrow(ApplicationMissing)
    expect(await count('applications', id)).toBe(0)
  })

  it('refuses the first move of an offer that does not exist', async () => {
    await expect(
      startApplication(randomUUID(), 'to_consider', tick()),
    ).rejects.toThrow(OfferNotFound)
    await expect(
      startApplication('not-an-id', 'to_consider', tick()),
    ).rejects.toThrow(OfferNotFound)
  })

  it('counts a choice of the current stage again as done without a record (A-AC08)', async () => {
    const id = await offerIn('to_consider')
    const moved = tick()
    await moveApplication({
      offerId: id,
      expected: 'to_consider',
      target: 'cv_sent',
      now: moved,
    })
    const before = await readApplication(id)
    // A retry after a lost answer, or the same choice from a second page.
    expect(
      await moveApplication({
        offerId: id,
        expected: 'to_consider',
        target: 'cv_sent',
        now: tick(),
      }),
    ).toEqual({ stage: 'cv_sent', stageChangedAt: moved })
    // The first move again from a page that still showed no application.
    const first = await offer()
    const created = tick()
    await startApplication(first, 'to_consider', created)
    expect(await startApplication(first, 'to_consider', tick())).toEqual({
      stage: 'to_consider',
      stageChangedAt: created,
    })
    expect(await readApplication(id)).toEqual(before)
    expect(await count('changes', first)).toBe(1)
  })

  it('keeps stages and their moments after the server restarts (A-AC04)', async () => {
    const ids = await Promise.all(stages.map(offerIn))
    const before = await Promise.all(ids.map(readApplication))
    await closePool()
    const restarted = new Pool({
      ...connection,
      options: `-c search_path=${schema}`,
    })
    setPool(restarted)
    pool = restarted
    expect(await Promise.all(ids.map(readApplication))).toEqual(before)
    expect(before.map((application) => application!.stage)).toEqual([...stages])
  })

  it('keeps the stage and its moment when the ad becomes unavailable and a new assessment is recorded (A-AC05)', async () => {
    const id = await offerIn('cv_sent')
    const before = await readApplication(id)
    await pool.query(
      "UPDATE source_ads SET availability='unavailable' WHERE id=$1",
      [id],
    )
    const weights = randomUUID(),
      profile = randomUUID()
    await pool.query(
      'INSERT INTO matching_weight_versions(id,weights) VALUES($1,$2)',
      [weights, defaultWeights],
    )
    await pool.query(
      'INSERT INTO matching_weight_head(singleton,version_id) VALUES(true,$1) ON CONFLICT (singleton) DO UPDATE SET version_id=$1',
      [weights],
    )
    await pool.query(
      'INSERT INTO profile_versions(id,number,data,command_id,draft_revision) VALUES($1,1,$2,$3,1)',
      [profile, emptyProfile(), randomUUID()],
    )
    await pool.query(
      'INSERT INTO profile_head(singleton,active_version_id) VALUES(true,$1) ON CONFLICT (singleton) DO UPDATE SET active_version_id=$1',
      [profile],
    )
    const context = (await manualContext(id))!
    const assessment = structuredClone(context.assessment)
    assessment.criteria[0] = {
      ...assessment.criteria[0]!,
      state: 'match',
      score: 80,
      reason: 'Własna znajomość PHP.',
      profileEvidence: null,
      offerEvidence: null,
    }
    await saveManualRating(id, {
      commandId: randomUUID(),
      expectedRevisionId: context.headId,
      profileVersionId: context.profileVersionId,
      adRevisionId: context.adRevisionId,
      assessment,
      reason: 'Ręczna ocena w teście niezależności etapu.',
    })
    expect(
      (await pool.query('SELECT count(*) AS n FROM matching_rating_revisions'))
        .rows[0].n,
    ).not.toBe('0')
    expect(await readApplication(id)).toEqual(before)
  })

  it('reads the current stage of every application, "Zdjęta z listy" included', async () => {
    const removed = await offerIn('removed')
    const current = await readCurrentStages()
    expect(current.get(removed)).toBe('removed')
    expect(current.size).toBe(
      Number(
        (await pool.query('SELECT count(*) AS n FROM recruitment_applications'))
          .rows[0].n,
      ),
    )
  })

  describe('parallel calls (A-AC09)', () => {
    const outcome = (result: PromiseSettledResult<unknown>) =>
      result.status === 'fulfilled'
        ? 'done'
        : result.reason instanceof StageChanged
          ? 'stage changed'
          : String(result.reason)

    it('two first moves to different stages create one application and refuse the other', async () => {
      for (let i = 0; i < 5; i++) {
        const id = await offer()
        const results = await Promise.allSettled([
          startApplication(id, 'to_consider', tick()),
          startApplication(id, 'cv_sent', tick()),
        ])
        expect(results.map(outcome).sort()).toEqual(['done', 'stage changed'])
        expect(await count('applications', id)).toBe(1)
        expect(await count('changes', id)).toBe(1)
        const winner =
          results[0]!.status === 'fulfilled' ? 'to_consider' : 'cv_sent'
        expect((await readApplication(id))!.stage).toBe(winner)
      }
    })

    it('two first moves to the same stage create one application and both succeed', async () => {
      for (let i = 0; i < 5; i++) {
        const id = await offer()
        const results = await Promise.allSettled([
          startApplication(id, 'rejected', tick()),
          startApplication(id, 'rejected', tick()),
        ])
        expect(results.map(outcome)).toEqual(['done', 'done'])
        expect(await count('applications', id)).toBe(1)
        expect(await count('changes', id)).toBe(1)
      }
    })

    it('two moves from one stage to different stages apply one and refuse the other', async () => {
      for (let i = 0; i < 5; i++) {
        const id = await offerIn('to_consider')
        const results = await Promise.allSettled([
          moveApplication({
            offerId: id,
            expected: 'to_consider',
            target: 'cv_sent',
            now: tick(),
          }),
          moveApplication({
            offerId: id,
            expected: 'to_consider',
            target: 'rejected',
            now: tick(),
          }),
        ])
        expect(results.map(outcome).sort()).toEqual(['done', 'stage changed'])
        expect(await count('changes', id)).toBe(2)
        const winner =
          results[0]!.status === 'fulfilled' ? 'cv_sent' : 'rejected'
        expect((await readApplication(id))!.stage).toBe(winner)
      }
    })

    it('two moves from one stage to the same stage both succeed with one record', async () => {
      const id = await offerIn('to_consider')
      const results = await Promise.allSettled([
        moveApplication({
          offerId: id,
          expected: 'to_consider',
          target: 'cv_sent',
          now: tick(),
        }),
        moveApplication({
          offerId: id,
          expected: 'to_consider',
          target: 'cv_sent',
          now: tick(),
        }),
      ])
      expect(results.map(outcome)).toEqual(['done', 'done'])
      expect(await count('changes', id)).toBe(2)
    })
  })
})
