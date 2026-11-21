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
import { emptyProfile } from '../modules/profile/view.ts'
import { confirmProfile, saveDraft } from '../modules/profile/index.ts'
import { sendOperationsWaitingForBudget } from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { budgetMonth } from '../modules/ai/domain/cost.ts'
import { registerAssignmentReceivers } from '../receivers/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { enqueueMatching } from '../modules/matching/request-assessment.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { readMatching } from '../modules/matching/read-assessments.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  commandRequestId,
  enqueueMatchingGroup,
} from '../modules/matching/request-assessment-group.ts'
import { aiQueue } from './ai-queue.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'
import {
  insertExecution,
  migrate,
  pricing,
  responseBody,
  unknownAssessment,
} from './matching-ai.fixtures.ts'
import {
  assessmentTables,
  carryOut,
  insertActiveProfile,
  insertAd,
  prepareExecutorQueue,
  SimulatedProvider,
} from './matching-assignments.fixtures.ts'

// The price lists AI keeps in code, replaced for the test; Matching's
// settings of assignments are the application's own.
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
integration(
  'assessment groups as one assignment per offer, with isolated PostgreSQL and a simulated API (sq2.9)',
  () => {
    const schema = `matching_groups_test_${randomUUID().replaceAll('-', '')}`
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
      usePricing('matching', pricing)
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
    const count = async (table: string) =>
      (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]
        .n as number
    async function anotherAd(description = 'PHP backend', title = 'Developer') {
      return (
        await insertAd(pool, {
          title,
          company: `Firma ${randomUUID().slice(0, 8)}`,
          description,
          skills: [{ name: 'PHP' }],
        })
      ).ad
    }
    const enqueue = async (ids: string[], commandId = randomUUID()) =>
      enqueueMatchingGroup({ commandId, offerIds: ids })

    it('uses one profile version for the whole group when a version is confirmed meanwhile (A10-AC03)', async () => {
      let active = profileVersion,
        revision = 0
      for (let round = 0; round < 5; round++) {
        const offers = [
          await anotherAd(),
          await anotherAd(),
          await anotherAd(),
          await anotherAd(),
        ]
        const data = emptyProfile()
        data.summary = `Round ${round}`
        const draft = await saveDraft(data, revision)
        const [group, confirmed] = await Promise.all([
          enqueue(offers),
          confirmProfile(draft.revision, active, randomUUID()),
        ])
        active = confirmed.id
        revision = draft.revision + 1
        const versions = (
          await pool.query(
            'SELECT DISTINCT profile_version_id FROM matching_requests WHERE id=ANY($1::uuid[])',
            [group.items.map((item) => item.id)],
          )
        ).rows
        expect(group.items).toHaveLength(offers.length)
        expect(versions).toHaveLength(1)
      }
    })

    it('places one labelled assignment per offer for a command of 30 offers and keeps each identifier with its request (T8-AC01)', async () => {
      const offers = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          anotherAd('PHP backend', `Stanowisko ${i}`),
        ),
      )
      const group = await enqueue(offers)
      expect(group).toMatchObject({ reused: false, state: 'running' })
      expect(group.items).toHaveLength(30)
      const placed = (
        await pool.query(
          `SELECT r.id,r.ad_id,a.label,a.status,a.settings_name
           FROM matching_requests r JOIN ai_assignments a ON a.id=r.assignment_id`,
        )
      ).rows
      expect(placed).toHaveLength(30)
      expect(new Set(placed.map((p) => p.label)).size).toBe(30)
      for (const item of group.items) {
        const assignment = placed.find((p) => p.id === item.id)!
        expect(assignment).toMatchObject({
          ad_id: item.offerId,
          status: 'in_progress',
          settings_name: 'matching',
        })
        expect(assignment.label).toMatch(/^Stanowisko \d+ — Firma /)
        expect(item).toMatchObject({ state: 'running', reused: false })
      }
      expect(await count('ai_assignments')).toBe(30)
      // Nothing goes through the old way, and no provider batch is sent.
      expect(await count('ai_executions')).toBe(0)
      expect(await queue.jobs()).toEqual([])
      await carryOut(pool)
      expect(provider.bodies).toHaveLength(30)
      const ended = (
        await pool.query(
          'SELECT count(*)::int AS n FROM matching_requests WHERE calculation IS NOT NULL',
        )
      ).rows[0].n
      expect(ended).toBe(30)
    })

    it('leaves no request and no assignment when placing one assignment of the command fails (T8-AC01)', async () => {
      usePricing('matching', { ...pricing, maxInputTokens: 6000 })
      provider.register()
      const offers = [
        ...(await Promise.all(Array.from({ length: 29 }, () => anotherAd()))),
        await anotherAd('PHP backend '.repeat(1000)),
      ]
      await expect(enqueue(offers)).rejects.toThrow(
        'Jedna z ofert przekracza limit danych oceny. Zmień zaznaczenie lub limit wejścia.',
      )
      expect(await count('matching_requests')).toBe(0)
      expect(await count('ai_assignments')).toBe(0)
      expect(await count('ai_operations')).toBe(0)
    })

    it('carries out the assessments the budget covers and leaves the rest in progress until the limit is raised (T8-AC02)', async () => {
      // Each assessment uses its whole potential cost, 0.0205 PLN, so a
      // limit of 0.05 PLN covers two of them.
      provider.answer = (input) => ({
        ...responseBody(JSON.stringify(unknownAssessment(input))),
        usage: { input_tokens: 20000, output_tokens: 500 },
      })
      await pool.query(
        'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,0.05)',
        [budgetMonth()],
      )
      const offers = await Promise.all(
        Array.from({ length: 5 }, () => anotherAd()),
      )
      const group = await enqueue(offers)
      await carryOut(pool)
      const published = async () =>
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM matching_requests WHERE calculation IS NOT NULL',
          )
        ).rows[0].n
      expect(await published()).toBe(2)
      expect(provider.bodies).toHaveLength(2)
      const states = await Promise.all(
        group.items.map(
          async (item) => (await readMatching(item.offerId)).history[0]!.state,
        ),
      )
      expect(states.sort()).toEqual([
        'completed',
        'completed',
        'running',
        'running',
        'running',
      ])
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM ai_operations WHERE waits_for='budget'",
          )
        ).rows[0].n,
      ).toBe(3)
      await pool.query('UPDATE ai_budget_months SET limit_pln=1')
      await sendOperationsWaitingForBudget()
      await carryOut(pool)
      expect(await published()).toBe(5)
      for (const item of group.items)
        expect((await readMatching(item.offerId)).history[0]!.state).toBe(
          'completed',
        )
    })

    it('accepts a command once, even with reordered offers, and refuses a changed selection (E03-AC04)', async () => {
      const other = await anotherAd(),
        commandId = randomUUID()
      const [a, b] = await Promise.all([
        enqueue([ad, other], commandId),
        enqueue([other, ad], commandId),
      ])
      expect(a.groupId).toBe(b.groupId)
      expect([a.reused, b.reused].sort()).toEqual([false, true])
      expect(await count('matching_requests')).toBe(2)
      expect(await count('ai_assignments')).toBe(2)
      await expect(enqueue([ad], commandId)).rejects.toThrow('innych ofert')
      expect(await count('ai_assignments')).toBe(2)
    })

    it('gives the requests a command saves with AI work identifiers derived from the command and the offer, and recognises its repeat after they ended (sq2.9 ASM-1)', async () => {
      const other = await anotherAd(),
        commandId = randomUUID()
      const first = await enqueue([ad, other], commandId)
      for (const item of first.items)
        expect(item.id).toBe(commandRequestId(commandId, item.offerId))
      await carryOut(pool)
      const again = await enqueue([other, ad], commandId)
      expect(again).toMatchObject({
        groupId: commandId,
        reused: true,
        state: 'completed',
      })
      expect(again.items.map((i) => [i.offerId, i.id, i.state]).sort()).toEqual(
        first.items.map((i) => [i.offerId, i.id, 'completed']).sort(),
      )
      expect(await count('ai_assignments')).toBe(2)
      // Another command for the same offers gets other identifiers.
      const second = await enqueue([ad], randomUUID())
      expect(second.items[0]!.id).not.toBe(commandRequestId(commandId, ad))
    })

    /** The ad's required work mode conflicts: its requests are excluded. */
    async function excludeAd() {
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
    }

    it('refuses a larger selection under an accepted command instead of leaving the added offers unassessed (E03-AC04, FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      const other = await anotherAd(),
        commandId = randomUUID()
      await enqueue([ad], commandId)
      await expect(enqueue([ad, other], commandId)).rejects.toThrow(
        'innych ofert',
      )
      expect(await count('matching_requests')).toBe(1)
      expect(await count('ai_assignments')).toBe(1)
    })

    it('recognises the repeat of an accepted command whose selection held an excluded offer (E03-AC04, FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      await excludeAd()
      const other = await anotherAd(),
        commandId = randomUUID()
      const first = await enqueue([ad, other], commandId)
      expect(first.items.map((i) => i.state).sort()).toEqual([
        'excluded',
        'running',
      ])
      const again = await enqueue([other, ad], commandId)
      expect(again).toMatchObject({ groupId: commandId, reused: true })
      // Every item of the command, the excluded one included.
      expect(again.items.map((i) => [i.offerId, i.id]).sort()).toEqual(
        first.items.map((i) => [i.offerId, i.id]).sort(),
      )
      expect(again.items.find((i) => i.offerId === ad)!.state).toBe('excluded')
      expect(await count('matching_requests')).toBe(2)
      expect(await count('ai_assignments')).toBe(1)
      // A newer request of the excluded offer does not hide it from the
      // command that excluded it.
      await enqueueMatching(ad)
      await expect(enqueue([ad, other], commandId)).resolves.toMatchObject({
        reused: true,
      })
    })

    it('recognises the identical repeat of a command after the single assessment it reused has finished (E03-AC04, FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      const single = await enqueueMatching(ad)
      const other = await anotherAd(),
        commandId = randomUUID()
      const first = await enqueue([ad, other], commandId)
      expect(first.items.find((i) => i.offerId === ad)).toMatchObject({
        id: single.id,
        reused: true,
      })
      await carryOut(pool)
      expect((await row(single.id)).calculation).not.toBeNull()
      const again = await enqueue([ad, other], commandId)
      expect(again).toMatchObject({ groupId: commandId, reused: true })
      expect(again.items.map((i) => [i.offerId, i.id]).sort()).toEqual(
        first.items.map((i) => [i.offerId, i.id]).sort(),
      )
      expect(again.items.find((i) => i.offerId === ad)).toMatchObject({
        state: 'completed',
        reused: true,
      })
      expect(await count('ai_assignments')).toBe(2)
      // An offer the command never named is still refused.
      await expect(
        enqueue([ad, other, await anotherAd()], commandId),
      ).rejects.toThrow('innych ofert')
    })

    it('does not recognise a repeated command that requested no AI work: the exclusion is recorded again, without AI work or cost (FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      await excludeAd()
      const commandId = randomUUID()
      const first = await enqueue([ad], commandId)
      expect(first.items).toMatchObject([{ state: 'excluded', reused: false }])
      // Nothing was requested from AI, so the repeat is a new command: the
      // exclusion is recorded again, still without AI work or cost.
      const again = await enqueue([ad], commandId)
      expect(again).toMatchObject({ groupId: commandId, reused: false })
      expect(await count('matching_requests')).toBe(2)
      expect(await count('ai_assignments')).toBe(0)
    })

    it('does not recognise a repeated command whose every offer reused an assessment in progress: once that assessment has ended, the repeat requests new paid AI work (FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      const single = await enqueueMatching(ad)
      const commandId = randomUUID()
      const first = await enqueue([ad], commandId)
      expect(first.items).toMatchObject([{ id: single.id, reused: true }])
      expect(await count('ai_assignments')).toBe(1)
      // While the reused assessment is in progress, a repeat reuses it
      // again, without new work.
      await expect(enqueue([ad], commandId)).resolves.toMatchObject({
        items: [{ id: single.id, reused: true }],
      })
      expect(await count('ai_assignments')).toBe(1)
      await carryOut(pool)
      // Nothing records the command, so after the assessment ended the
      // repeat is a new command: a new request, a new assignment.
      const again = await enqueue([ad], commandId)
      expect(again).toMatchObject({ groupId: commandId, reused: false })
      expect(again.items).toMatchObject([{ reused: false, state: 'running' }])
      expect(again.items[0]!.id).not.toBe(single.id)
      expect(await count('matching_requests')).toBe(2)
      expect(await count('ai_assignments')).toBe(2)
    })

    it('accepts as a repeat a changed selection that differs only in offers the command reused, excluded or could have reused, without AI work or cost (FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      // (a) A narrower selection that drops an offer the command reused.
      const single = await enqueueMatching(ad)
      const other = await anotherAd(),
        commandId = randomUUID()
      const first = await enqueue([ad, other], commandId)
      expect(first.items.find((i) => i.offerId === ad)).toMatchObject({
        id: single.id,
        reused: true,
      })
      const narrower = await enqueue([other], commandId)
      expect(narrower).toMatchObject({ groupId: commandId, reused: true })
      expect(narrower.items.map((i) => i.offerId)).toEqual([other])
      expect(await count('matching_requests')).toBe(2)
      expect(await count('ai_assignments')).toBe(2)

      // (b) A wider selection that adds an offer whose assessment was in
      // progress when the command was accepted: it is shown as reused,
      // though the command never named it.
      const third = await anotherAd()
      const inProgress = await enqueueMatching(third)
      const secondCommand = randomUUID()
      const fourth = await anotherAd()
      await enqueue([fourth], secondCommand)
      const assignments = await count('ai_assignments')
      const wider = await enqueue([third, fourth], secondCommand)
      expect(wider).toMatchObject({ groupId: secondCommand, reused: true })
      expect(wider.items.find((i) => i.offerId === third)).toMatchObject({
        id: inProgress.id,
        reused: true,
      })
      expect(await count('ai_assignments')).toBe(assignments)
    })

    it('handles the identical repeat of a command whose requests the old way saved as a new command: an offer whose assessment has ended gets a new assignment (FOLLOW-UP(oferty-pracy-0mq.21/DEV-1), sq2.9 ASM-1)', async () => {
      // As the old way left it: the request has a random identifier and its
      // execution is grouped under the command.
      const commandId = randomUUID(),
        old = randomUUID()
      await pool.query(
        `INSERT INTO ai_executions(id,settings_key,operation_id,configuration,publication_token,state,mode,group_id)
         VALUES($1,'matching',$1,'{}',$2,'completed','batch',$3)`,
        [old, randomUUID(), commandId],
      )
      await pool.query(
        `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state,execution_id)
         VALUES($1,$2,$3,$4,'{}','{}','requested',$1)`,
        [old, ad, revision, profileVersion],
      )
      const again = await enqueue([ad], commandId)
      expect(again).toMatchObject({ groupId: commandId, reused: false })
      expect(again.items).toMatchObject([{ reused: false, state: 'running' }])
      expect(again.items[0]!.id).not.toBe(old)
      expect(await count('ai_assignments')).toBe(1)
    })

    it('handles a repeated command whose selection shares no offer with the requests it saved as a new command (sq2.9 ASM-1, FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      const other = await anotherAd(),
        commandId = randomUUID()
      await enqueue([ad], commandId)
      // With no AI group, nothing names the command apart from its requests,
      // which the selection does not reach.
      const again = await enqueue([other], commandId)
      expect(again).toMatchObject({ groupId: commandId, reused: false })
      expect(again.items[0]!.id).toBe(commandRequestId(commandId, other))
      expect(await count('matching_requests')).toBe(2)
      expect(await count('ai_assignments')).toBe(2)
    })

    /** A request of the old way whose execution is in the given state. */
    async function oldRequest(offerId: string, state: string) {
      const id = randomUUID()
      await pool.query(
        `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state)
         SELECT $1,$2,current_revision_id,$3,'{}','{}','requested' FROM source_ads WHERE id=$2`,
        [id, offerId, profileVersion],
      )
      await insertExecution(pool, id, state)
      return id
    }

    it('reuses an assessment of the old way still in progress instead of placing a new paid assignment, and places one once it has ended (sq2.9 ASM-4)', async () => {
      const old = await oldRequest(ad, 'queued')
      expect(await enqueueMatching(ad)).toMatchObject({
        id: old,
        reused: true,
        state: 'queued',
      })
      expect(await count('ai_assignments')).toBe(0)
      await pool.query(
        "UPDATE ai_executions SET state='completed' WHERE operation_id=$1",
        [old],
      )
      const next = await enqueueMatching(ad)
      expect(next).toMatchObject({ reused: false, state: 'running' })
      expect(await count('ai_assignments')).toBe(1)
    })

    it('recognises the repeat of a command that reused an assessment of the old way in progress (sq2.9 ASM-4, FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      const old = await oldRequest(ad, 'running')
      const other = await anotherAd(),
        commandId = randomUUID()
      const first = await enqueue([ad, other], commandId)
      expect(first.items.find((i) => i.offerId === ad)).toMatchObject({
        id: old,
        reused: true,
      })
      const again = await enqueue([other, ad], commandId)
      expect(again).toMatchObject({ groupId: commandId, reused: true })
      expect(again.items.find((i) => i.offerId === ad)).toMatchObject({
        id: old,
        reused: true,
        state: 'running',
      })
      expect(await count('ai_assignments')).toBe(1)
    })

    it.todo(
      'recognises every repeated command from its recorded selection, including one that requested no AI work, and refuses any other selection, also one that differs only in offers outside the AI group, and recognises commands accepted before migration 18 (E03-AC04, target of FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))',
    )

    it('canonicalizes UUID casing for idempotent commands and duplicate selection checks', async () => {
      const commandId = randomUUID()
      const first = await enqueue([ad], commandId)
      const again = await enqueue([ad.toUpperCase()], commandId.toUpperCase())
      expect(again).toMatchObject({ groupId: first.groupId, reused: true })
      expect(await count('ai_assignments')).toBe(1)
      await expect(enqueue([ad, ad.toUpperCase()])).rejects.toThrow()
      expect(await count('matching_requests')).toBe(1)
    })

    it('keeps a single assessment in progress out of the group', async () => {
      const single = await enqueueMatching(ad)
      const group = await enqueue([ad, await anotherAd()])
      expect(group.items.find((i) => i.offerId === ad)).toMatchObject({
        id: single.id,
        reused: true,
      })
      expect(await count('ai_assignments')).toBe(2)
      await carryOut(pool)
      expect(provider.bodies).toHaveLength(2)
    })

    it('refuses duplicate IDs and more than 100 offers before any change', async () => {
      await expect(enqueue([ad, ad])).rejects.toThrow()
      await expect(
        enqueue(Array.from({ length: 101 }, () => randomUUID())),
      ).rejects.toThrow()
      expect(await count('matching_requests')).toBe(0)
      expect(await count('ai_assignments')).toBe(0)
    })

    it('refuses a group without the AI configuration with the configuration message, before any change (sq2.9 ASM-2)', async () => {
      vi.stubEnv('OPENAI_API_KEY', '')
      await expect(enqueue([ad])).rejects.toThrow(
        'Skonfiguruj model i cennik przed oceną ofert.',
      )
      expect(await count('matching_requests')).toBe(0)
      expect(await count('ai_assignments')).toBe(0)
    })
  },
)
