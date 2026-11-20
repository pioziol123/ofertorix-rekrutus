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
import {
  advanceSentBatches,
  cleanUpEndedBatches,
  fundWaitingExecutions,
  readExecutionHistory,
  registerResultReceiver,
  runExecution,
} from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { budgetMonth } from '../modules/ai/domain/cost.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { BatchError } from '../modules/ai/infrastructure/adapters/openai-batch.ts'
import {
  assessmentReceiver,
  assessmentSettingsKey,
} from '../modules/matching/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { enqueueMatching } from '../modules/matching/request-assessment.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { readMatching } from '../modules/matching/read-assessments.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { enqueueMatchingGroup } from '../modules/matching/request-assessment-group.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { readBatchArchive } from '../modules/matching/read-assessment-archive.ts'
import { aiQueue } from './ai-queue.fixtures.ts'
import { usePricing } from './ai-test-configuration.ts'
import { migrate, pricing, SimulatedOpenAi } from './matching-ai.fixtures.ts'

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
integration(
  'assessment groups as provider batches in AI, with isolated PostgreSQL and a fake API (0mq.21)',
  () => {
    const schema = `matching_groups_test_${randomUUID().replaceAll('-', '')}`
    let admin: Pool,
      pool: Pool,
      ad: string,
      revision: string,
      profileVersion: string,
      openAi: SimulatedOpenAi
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
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'never-send-test-key')
      usePricing('matching', pricing, ['single', 'batch'])
      openAi = new SimulatedOpenAi()
      await queue.reset()
      await pool.query(
        'TRUNCATE matching_requests,matching_rating_heads,matching_rating_revisions,matching_batch_artifacts,ai_executions,ai_attempts,ai_budget_months,profile_imports,profile_head,profile_versions,source_ads,source_scopes CASCADE',
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
    const latest = async (id: string) =>
      (await readExecutionHistory(id)).at(-1)!
    const revisions = async (id: string) =>
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM matching_rating_revisions WHERE request_id=$1',
          [id],
        )
      ).rows[0].n
    const count = async (table: string) =>
      (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n
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

    it('sends several offers in one batch, maps unordered results to their items and settles each one (AM-AC01, E03-AC02, E03-AC03)', async () => {
      const group = await enqueue([ad, await anotherAd()])
      const [first, second] = group.items.map((item) => item.id) as [
        string,
        string,
      ]
      openAi.batch.refusals.add(second)
      await queue.work()
      expect(openAi.batch.uploads).toBe(1)
      expect(openAi.batch.creates).toBe(1)
      // The batch items keep the request identifiers as their custom_id.
      expect(openAi.batch.uploaded.map((i) => i.custom_id).sort()).toEqual(
        [first, second].sort(),
      )
      expect(await latest(first)).toMatchObject({
        mode: 'batch',
        groupId: group.groupId,
        state: 'completed',
        cost: { actual: '0.000120' },
      })
      expect(await latest(second)).toMatchObject({
        state: 'failed',
        cause: 'refused',
        cost: { actual: '0.000220' },
      })
      expect(await revisions(first)).toBe(1)
      expect(await revisions(second)).toBe(0)
      expect((await row(second)).result).toBeNull()
      // A pass of the periodic process removes the files of the ended batch.
      await cleanUpEndedBatches()
      expect(openAi.batch.removed).toEqual(['file_input', 'file_output'])
      await advanceSentBatches()
      await cleanUpEndedBatches()
      await queue.work()
      expect(openAi.batch.uploads).toBe(1)
      expect(openAi.batch.removed).toHaveLength(2)
      // The archive of the batch is read through AI, the same for every item.
      const archive = await readBatchArchive(first)
      expect(await readBatchArchive(second)).toEqual(archive)
      expect(archive).toMatchObject({
        operationId: group.groupId,
        reconstructedInput: null,
      })
      expect(archive!.artifacts.map((a) => a.kind).sort()).toEqual([
        'input',
        'output',
      ])
    })

    it('B6-AC03: a sent batch still in progress is completed by a later pass of the periodic process, without sending it again', async () => {
      openAi.batch.status = 'in_progress'
      const group = await enqueue([ad, await anotherAd()])
      await queue.work()
      for (const item of group.items)
        expect((await latest(item.id)).state).toBe('running')
      expect((await readMatching(ad)).history[0]!.state).toBe('running')
      openAi.batch.status = 'completed'
      await advanceSentBatches()
      await queue.work()
      for (const item of group.items)
        expect((await latest(item.id)).state).toBe('completed')
      expect(openAi.batch.uploads).toBe(1)
      expect(openAi.batch.creates).toBe(1)
    })

    it('ends every item without cost when the upload fails, with the message of its cause, and does not send again (AM-AC01, 0mq.21 ASM-3)', async () => {
      const group = await enqueue([ad, await anotherAd()])
      openAi.batch.upload = async () => {
        throw new BatchError('http', 403)
      }
      await queue.work()
      for (const item of group.items) {
        expect(await latest(item.id)).toMatchObject({
          state: 'failed',
          cause: 'http',
          cost: { actual: '0.000000' },
        })
        expect((await row(item.id)).error).toBe(
          'Ocena nie została wykonana. Poprzednie wyniki pozostały bez zmian. [AI: http]',
        )
      }
      await advanceSentBatches()
      await queue.work()
      expect(openAi.batch.creates).toBe(0)
    })

    it('keeps an unconfirmed batch creation uncertain with its cost reserved and creates no other paid batch (E03-AC05)', async () => {
      const group = await enqueue([ad, await anotherAd()])
      openAi.batch.create = async () => {
        openAi.batch.creates++
        throw new BatchError('network')
      }
      await queue.work()
      await advanceSentBatches()
      await cleanUpEndedBatches()
      await queue.work()
      expect(openAi.batch.creates).toBe(1)
      for (const item of group.items) {
        expect(await latest(item.id)).toMatchObject({
          state: 'uncertain',
          cause: 'network',
          cost: { reserved: '0.020500', actual: null },
        })
        expect((await readMatching(ad)).history.length).toBe(1)
      }
      expect(
        (await readMatching(group.items[0]!.offerId)).history[0],
      ).toMatchObject({
        state: 'unknown',
        cost: { actual: null },
        error: expect.stringContaining('Koszt pozostaje zarezerwowany'),
      })
      // The uncertain batch keeps its input file for the owner to check.
      expect(openAi.batch.removed).toEqual([])
    })

    it('ends an item without a result with its cost unknown, apart from the valid ones (E03-AC02)', async () => {
      const group = await enqueue([ad, await anotherAd()])
      const [first, second] = group.items.map((item) => item.id) as [
        string,
        string,
      ]
      openAi.batch.missing.add(second)
      await queue.work()
      expect(await latest(first)).toMatchObject({ state: 'completed' })
      expect(await latest(second)).toMatchObject({
        state: 'failed',
        cause: 'unknown',
        cost: { actual: null },
      })
    })

    it('keeps results retryable and remote files intact when archiving fails', async () => {
      const group = await enqueue([ad, await anotherAd()])
      const original = openAi.batch.results.bind(openAi.batch)
      openAi.batch.results = vi.fn(async () => {
        throw new BatchError('archive')
      })
      await queue.work()
      for (const item of group.items)
        expect(await latest(item.id)).toMatchObject({
          state: 'running',
          cost: { actual: null },
        })
      expect(openAi.batch.removed).toEqual([])
      openAi.batch.results = original
      await advanceSentBatches()
      await queue.work()
      for (const item of group.items)
        expect((await latest(item.id)).state).toBe('completed')
      expect(openAi.batch.uploads).toBe(1)
      expect(openAi.batch.creates).toBe(1)
      await cleanUpEndedBatches()
      expect(openAi.batch.removed).toEqual(['file_input', 'file_output'])
    })

    it('delivers each item on its own: a failed delivery of one does not hold back the others, and a repeated delivery publishes once (E03-AC03, E03-AC04)', async () => {
      const other = await anotherAd()
      const group = await enqueue([ad, other])
      const blocked = group.items.find((item) => item.offerId === other)!
      const free = group.items.find((item) => item.offerId === ad)!
      await pool.query(
        'UPDATE source_ads SET current_revision_id=NULL WHERE id=$1',
        [other],
      )
      // The blocked item's delivery fails; the queue retries its job later.
      await expect(queue.work()).rejects.toThrow('Nie znaleziono oferty.')
      expect(await latest(free.id)).toMatchObject({ state: 'completed' })
      expect(await latest(blocked.id)).toMatchObject({
        state: 'delivering',
        cost: { actual: null },
      })
      await pool.query(
        'UPDATE source_ads SET current_revision_id=(SELECT id FROM source_ad_revisions WHERE source_ad_id=$1) WHERE id=$1',
        [other],
      )
      const execution = (await latest(blocked.id)).id
      await Promise.all([
        runExecution({ executionId: execution }),
        runExecution({ executionId: execution }),
      ])
      expect(await latest(blocked.id)).toMatchObject({
        state: 'completed',
        cost: { actual: '0.000120' },
      })
      expect(await revisions(blocked.id)).toBe(1)
      expect(openAi.batch.creates).toBe(1)
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
      expect(await count('ai_executions')).toBe(2)
      await expect(enqueue([ad], commandId)).rejects.toThrow('innych ofert')
      expect(await count('ai_executions')).toBe(2)
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
      expect(await count('ai_executions')).toBe(1)
    })

    it('recognises the repeat of an accepted command whose selection held an excluded offer (E03-AC04, FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      await excludeAd()
      const other = await anotherAd(),
        commandId = randomUUID()
      const first = await enqueue([ad, other], commandId)
      expect(first.items.map((i) => i.state).sort()).toEqual([
        'excluded',
        'queued',
      ])
      const again = await enqueue([other, ad], commandId)
      expect(again).toMatchObject({ groupId: commandId, reused: true })
      // Every item of the command, the excluded one included.
      expect(again.items.map((i) => [i.offerId, i.id]).sort()).toEqual(
        first.items.map((i) => [i.offerId, i.id]).sort(),
      )
      expect(again.items.find((i) => i.offerId === ad)!.state).toBe('excluded')
      expect(await count('matching_requests')).toBe(2)
      expect(await count('ai_executions')).toBe(1)
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
      await queue.work()
      expect((await latest(single.id)).state).toBe('completed')
      const again = await enqueue([ad, other], commandId)
      expect(again).toMatchObject({ groupId: commandId, reused: true })
      expect(again.items.map((i) => [i.offerId, i.id]).sort()).toEqual(
        first.items.map((i) => [i.offerId, i.id]).sort(),
      )
      expect(again.items.find((i) => i.offerId === ad)).toMatchObject({
        state: 'completed',
        reused: true,
      })
      expect(await count('ai_executions')).toBe(2)
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
      expect(await count('ai_executions')).toBe(0)
      expect(await queue.executionJobs()).toEqual([])
    })

    it('does not recognise a repeated command whose every offer reused an assessment in progress: once that assessment has ended, the repeat requests new paid AI work (FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      const single = await enqueueMatching(ad)
      const commandId = randomUUID()
      const first = await enqueue([ad], commandId)
      expect(first.items).toMatchObject([{ id: single.id, reused: true }])
      expect(await count('ai_executions')).toBe(1)
      // While the reused assessment is in progress, a repeat reuses it
      // again, without new work.
      await expect(enqueue([ad], commandId)).resolves.toMatchObject({
        items: [{ id: single.id, reused: true }],
      })
      expect(await count('ai_executions')).toBe(1)
      await queue.work()
      // Nothing records the command, so after the assessment ended the
      // repeat is a new command: a new request, a new reservation.
      const again = await enqueue([ad], commandId)
      expect(again).toMatchObject({ groupId: commandId, reused: false })
      expect(again.items).toMatchObject([{ reused: false, state: 'queued' }])
      expect(again.items[0]!.id).not.toBe(single.id)
      expect(await count('matching_requests')).toBe(2)
      expect(await count('ai_executions')).toBe(2)
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
      expect(await count('ai_executions')).toBe(2)

      // (b) A wider selection that adds an offer whose assessment was in
      // progress when the command was accepted: it is shown as reused,
      // though the command never named it.
      const third = await anotherAd()
      const inProgress = await enqueueMatching(third)
      const secondCommand = randomUUID()
      const fourth = await anotherAd()
      await enqueue([fourth], secondCommand)
      const executions = await count('ai_executions')
      const wider = await enqueue([third, fourth], secondCommand)
      expect(wider).toMatchObject({ groupId: secondCommand, reused: true })
      expect(wider.items.find((i) => i.offerId === third)).toMatchObject({
        id: inProgress.id,
        reused: true,
      })
      expect(await count('ai_executions')).toBe(executions)
    })

    it('handles the identical repeat of a command accepted before migration 18 as a new command: an offer whose assessment has ended gets new paid AI work (FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      // As migration 18 leaves it: the old group key differs from the
      // command id, and the moved execution is grouped under the old key.
      const commandId = randomUUID(),
        oldGroup = randomUUID(),
        old = randomUUID()
      await pool.query(
        "INSERT INTO matching_groups(id,command_id,ad_ids,state,configuration) VALUES($1,$2,$3,'completed','{}')",
        [oldGroup, commandId, [ad]],
      )
      await pool.query(
        `INSERT INTO ai_executions(id,settings_key,operation_id,configuration,publication_token,state,mode,group_id)
         VALUES($1,'matching',$1,'{}',$2,'completed','batch',$3)`,
        [old, randomUUID(), oldGroup],
      )
      await pool.query(
        `INSERT INTO ai_attempts(id,import_id,text_revision,attempt,generation,operation_type,state,reserved_pln,actual_pln,configuration,execution_id)
         VALUES($1,NULL,0,1,$2,'matching','settled',0,0,'{}',$1)`,
        [old, randomUUID()],
      )
      await pool.query(
        `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state,group_id,execution_id)
         VALUES($1,$2,$3,$4,'{}','{}','requested',$5,$1)`,
        [old, ad, revision, profileVersion, oldGroup],
      )
      const again = await enqueue([ad], commandId)
      expect(again).toMatchObject({ groupId: commandId, reused: false })
      expect(again.items).toMatchObject([{ reused: false, state: 'queued' }])
      expect(again.items[0]!.id).not.toBe(old)
      expect(await count('ai_executions')).toBe(2)
    })

    it('refuses a repeated command whose selection shares no offer with the group it requested, with nothing requested (0mq.21 ASM-7, FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))', async () => {
      const other = await anotherAd(),
        commandId = randomUUID()
      await enqueue([ad], commandId)
      await expect(enqueue([other], commandId)).rejects.toThrow('innych ofert')
      expect(await count('matching_requests')).toBe(1)
      expect(await count('ai_executions')).toBe(1)
    })

    it.todo(
      'recognises every repeated command from its recorded selection, including one that requested no AI work, and refuses any other selection, also one that differs only in offers outside the AI group, and recognises commands accepted before migration 18 (E03-AC04, target of FOLLOW-UP(oferty-pracy-0mq.21/DEV-1))',
    )

    it('canonicalizes UUID casing for idempotent commands and duplicate selection checks', async () => {
      const commandId = randomUUID()
      const first = await enqueue([ad], commandId)
      const again = await enqueue([ad.toUpperCase()], commandId.toUpperCase())
      expect(again).toMatchObject({ groupId: first.groupId, reused: true })
      expect(await count('ai_executions')).toBe(1)
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
      expect((await latest(single.id)).mode).toBe('single')
      await queue.work()
      expect(openAi.batch.uploaded).toHaveLength(1)
      expect(openAi.batch.uploaded[0]!.custom_id).not.toBe(single.id)
      expect(openAi.singleCalls).toHaveLength(1)
    })

    it('reserves the budget of the whole group or nothing, and funds it when room returns (E03-AC03)', async () => {
      await pool.query(
        'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,0.03)',
        [budgetMonth()],
      )
      const group = await enqueue([ad, await anotherAd()])
      expect(group.state).toBe('waiting_budget')
      expect(await queue.executionJobs()).toEqual([])
      for (const item of group.items)
        expect(await latest(item.id)).toMatchObject({
          state: 'waiting_budget',
          cost: { reserved: '0.000000' },
        })
      await pool.query('UPDATE ai_budget_months SET limit_pln=1')
      await fundWaitingExecutions()
      for (const item of group.items)
        expect(await latest(item.id)).toMatchObject({
          state: 'queued',
          cost: { reserved: '0.020500' },
        })
      await queue.work()
      expect(openAi.batch.uploads).toBe(1)
    })

    it('leaves a group being sent to the job sending it: a pass of the periodic process neither sends nor ends it (B6-R09)', async () => {
      const group = await enqueue([ad, await anotherAd()])
      // A job took the group and is sending it.
      await pool.query(
        "UPDATE ai_executions SET state='running',adapter_state=$1 WHERE group_id=$2",
        [
          {
            stage: 'sending',
            inputFileId: null,
            batchId: null,
            status: null,
            outputFileId: null,
            errorFileId: null,
            cleaned: false,
          },
          group.groupId,
        ],
      )
      await advanceSentBatches()
      expect(openAi.batch.uploads + openAi.batch.creates).toBe(0)
      for (const item of group.items)
        expect(await latest(item.id)).toMatchObject({
          state: 'running',
          cost: { actual: null },
        })
    })

    it('B6-AC05 a batch being sent: a later job of an item ends every running item as uncertain with the cause unknown, keeps the whole reservation, delivers that end and sends nothing more', async () => {
      const group = await enqueue([ad, await anotherAd()])
      const reserved = (await latest(group.items[0]!.id)).cost.reserved
      let release!: () => void, entered!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      const uploading = new Promise<void>((resolve) => (entered = resolve))
      const upload = openAi.batch.upload.bind(openAi.batch)
      openAi.batch.upload = async (lines) => {
        entered()
        await gate
        return upload(lines)
      }
      // The job that took the group stops in the upload.
      const [first, second] = await queue.executionJobs()
      const sending = runExecution({ executionId: first! })
      await uploading
      // A later job of an item finds the group still being sent.
      await runExecution({ executionId: second! })
      // The jobs that deliver the end of every item.
      await queue.work()
      for (const item of group.items) {
        expect(await latest(item.id)).toMatchObject({
          state: 'uncertain',
          cause: 'unknown',
          cost: { reserved, actual: null },
        })
        expect((await readMatching(item.offerId)).history[0]).toMatchObject({
          state: 'unknown',
          cost: { actual: null },
          error: expect.stringContaining('Koszt pozostaje zarezerwowany'),
        })
      }
      // The stopped job returns: it saves nothing and creates no batch.
      release()
      await sending
      await advanceSentBatches()
      await queue.work()
      expect(openAi.batch.uploads).toBe(1)
      expect(openAi.batch.creates).toBe(0)
      for (const item of group.items) {
        expect(await latest(item.id)).toMatchObject({
          state: 'uncertain',
          cause: 'unknown',
        })
        expect(await readExecutionHistory(item.id)).toHaveLength(1)
      }
      expect(
        (
          await pool.query(
            "SELECT DISTINCT adapter_state->>'inputFileId' AS file FROM ai_executions WHERE group_id=$1",
            [group.groupId],
          )
        ).rows,
      ).toEqual([{ file: null }])
    })

    it('B6-AC05 a sent batch is not ended, B6-AC03 a sent batch is completed by later passes: a later job of an item leaves a sent group running, and later passes of the periodic process complete it', async () => {
      openAi.batch.status = 'in_progress'
      const group = await enqueue([ad, await anotherAd()])
      await queue.work()
      expect(openAi.batch.creates).toBe(1)
      // A later job of an item, as after an attempt that ended.
      const [job] = await queue.executionJobs()
      await runExecution({ executionId: job! })
      for (const item of group.items)
        expect((await latest(item.id)).state).toBe('running')
      // A pass while the batch is still in progress changes nothing.
      await advanceSentBatches()
      for (const item of group.items)
        expect((await latest(item.id)).state).toBe('running')
      // A later pass completes it, and the items' jobs deliver it.
      openAi.batch.status = 'completed'
      await advanceSentBatches()
      await queue.work()
      for (const item of group.items)
        expect(await latest(item.id)).toMatchObject({
          state: 'completed',
          cost: { actual: '0.000120' },
        })
      expect(openAi.batch.uploads).toBe(1)
      expect(openAi.batch.creates).toBe(1)
    })

    it('refuses duplicate IDs and more than 100 offers before any change', async () => {
      await expect(enqueue([ad, ad])).rejects.toThrow()
      await expect(
        enqueue(Array.from({ length: 101 }, () => randomUUID())),
      ).rejects.toThrow()
      expect(await count('matching_requests')).toBe(0)
      expect(await queue.executionJobs()).toEqual([])
    })

    it('refuses a group without the Batch price list with the old group message, before any change (0mq.21 ASM-3)', async () => {
      usePricing('matching', pricing, 'single')
      await expect(enqueue([ad])).rejects.toThrow(
        'Skonfiguruj model i cennik Batch przed oceną ofert.',
      )
      expect(await count('matching_requests')).toBe(0)
      expect(await queue.executionJobs()).toEqual([])
    })

    it('rolls back a group too large for one batch file without reserving or queueing', async () => {
      usePricing('matching', { ...pricing, maxInputTokens: 1000000 }, [
        'single',
        'batch',
      ])
      const ids = await Promise.all(
        Array.from({ length: 12 }, () =>
          anotherAd('PHP backend '.repeat(18000)),
        ),
      )
      await expect(enqueue(ids)).rejects.toThrow('2 MiB')
      expect(await count('matching_requests')).toBe(0)
      expect(await count('ai_executions')).toBe(0)
      expect(await count('ai_attempts')).toBe(0)
      expect(await queue.executionJobs()).toEqual([])
    })
  },
)
