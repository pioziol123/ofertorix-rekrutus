import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'
import { PgBoss } from 'pg-boss'
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
  applyProposal,
  emptyProfile,
  emptySkill,
  type ProfileData,
} from '../modules/profile/domain/profile-data.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { digest } from '../modules/profile/domain/cv-document.ts'
import {
  confirmProfile,
  failPreparationsOfOldWay,
  importCvDocument,
  importCvText,
  prepareProposal,
  proposalAssignmentReceiver,
  readCvText,
  readImport,
  readOriginalFile,
  readProfile,
  saveDraft,
} from '../modules/profile/index.ts'
import { importStatusLabel } from '../modules/profile/view.ts'
import { closePool, setPool, transaction } from '../lib/db.ts'
import { registerAssignmentReceivers } from '../receivers/index.ts'
import { prepareCvTextQueue } from './profile.fixtures.ts'
import { aiQueue } from './ai-queue.fixtures.ts'
import {
  failAssignmentsPastTimeLimit,
  runOperation,
} from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { openAiExecutor } from '../modules/ai/executors/openai.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { registerExecutor } from '../modules/ai/executors/registry.ts'
import { usePricing } from './ai-test-configuration.ts'

// The price lists AI keeps in code, replaced for the test; the Profile's
// settings of assignments are the application's own.
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
vi.mock(
  '../modules/ai/model-catalog.ts',
  () => import('./ai-test-configuration.ts'),
)

const quoteMessage =
  'Nie udało się potwierdzić cytatów AI w tekście CV. Profil pozostaje bez zmian.'
const formatMessage =
  'Odpowiedź AI ma nieprawidłowy format danych. Profil pozostaje bez zmian.'
const failedMessage =
  'Nie udało się przygotować propozycji. Profil pozostaje bez zmian. Szczegóły są w panelu zleceń AI.'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration(
  'profiles in isolated PostgreSQL and private document storage',
  () => {
    const schema = `profile_test_${randomUUID().replaceAll('-', '')}`
    const queue = aiQueue()
    let admin: Pool, pool: Pool, root: string
    // The model of the Profile's settings, with a test price list.
    const pricing = {
      model: 'gpt-6-luna',
      version: 'test',
      inputUsdPerMillion: '1',
      outputUsdPerMillion: '1',
      usdPln: '1',
      fxVersion: 'test',
      maxInputTokens: 1000,
      maxOutputTokens: 500,
    }
    beforeAll(async () => {
      admin = new Pool({ connectionString: process.env.DATABASE_URL })
      await admin.query(`CREATE SCHEMA ${schema}`)
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema}`,
        max: 10,
      })
      const sql: string[] = []
      for (const migration of [
        '1770000000001_sources',
        '1770000000004_profiles',
        '1770000000006_matching',
        '1770000000013_local_ai',
        '1770000000016_ai_execution_requests',
        '1770000000017_profile_ai_executions',
        '1770000000007_matching_payload',
        '1770000000008_matching_groups',
        '1770000000012_matching_batch_archives',
        '1770000000018_matching_ai_executions',
        '1770000000020_ai_execution_lease',
        '1770000000026_ai_without_local_slot_and_lease',
        '1770000000027_ai_assignments',
        '1770000000030_ai_operation_exchange',
        '1770000000031_ai_budget_default_limit',
        '1770000000035_ai_budget_carried_amounts',
        '1770000000032_profile_assignment',
      ])
        createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
          sql: (s: string) => sql.push(s),
        })
      await pool.query(sql.join('\n'))
      setPool(pool)
      // The executors' queues and the queue of reading a CV share the
      // test's queue schema.
      await queue.start()
      await prepareCvTextQueue(queue.queueSchema)
      // The receivers of the shared registration.
      registerAssignmentReceivers()
      root = await mkdtemp(join(tmpdir(), 'profile-tests-'))
    }, 30000)
    beforeEach(async () => {
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'test-key-never-send')
      usePricing(pricing)
      // The paid executor with the test's price list, on the provider
      // simulated by the fetcher each test sets.
      registerExecutor(openAiExecutor((input, init) => provider(input, init)))
      provider = () => {
        throw new Error('Unexpected provider call')
      }
      await pool.query(
        'TRUNCATE profile_import_texts,ai_attempts,ai_executions,ai_budget_months,ai_operation_exchange,ai_operations,ai_assignments,profile_imports,profile_drafts,profile_head,profile_versions CASCADE',
      )
      await pool.query('INSERT INTO profile_head(singleton) VALUES(true)')
      await queue.reset()
    })
    afterAll(async () => {
      vi.unstubAllEnvs()
      await queue.stop()
      await closePool()
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await admin.end()
      }
      if (root) await rm(root, { recursive: true, force: true })
    })
    const fixture = (name: string) =>
      readFile(new URL(`./fixtures/profile/${name}`, import.meta.url))
    let provider: typeof fetch = () => {
      throw new Error('Unexpected provider call')
    }
    const importOf = async (id: string) =>
      (
        await pool.query(
          'SELECT status,proposal,error,text_revision,assignment_id FROM profile_imports WHERE id=$1',
          [id],
        )
      ).rows[0]
    const assignmentOf = async (assignmentId: string) =>
      (
        await pool.query(
          'SELECT label,settings_name,type,input,response_format,status,failure_reason FROM ai_assignments WHERE id=$1',
          [assignmentId],
        )
      ).rows[0]
    const count = async (table: string) =>
      (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]
        .n as number
    /** Requests a preparation and returns the import and its assignment. */
    async function requested(text = 'PHP professional', revision = 0) {
      const id = revision === 0 ? await importCvText(text) : null
      return prepared(id!, text, revision)
    }
    async function prepared(id: string, text: string, revision: number) {
      expect(await prepareProposal(id, text, revision)).toEqual({
        state: 'in_progress',
      })
      return { id, assignmentId: (await importOf(id)).assignment_id as string }
    }
    /**
     * Carries out the pending operations of an assignment, as the worker
     * would, with the provider answering by the fetcher.
     */
    async function carryOut(assignmentId: string, fetcher: typeof fetch) {
      provider = fetcher
      const pending = (
        await pool.query(
          "SELECT id FROM ai_operations WHERE assignment_id=$1 AND state='pending' ORDER BY ordinal",
          [assignmentId],
        )
      ).rows
      for (const { id } of pending) await runOperation({ operationId: id })
    }
    /** Moves an assignment's deadline into the past. */
    const pastDeadline = (assignmentId: string) =>
      pool.query(
        `UPDATE ai_assignments SET placed_at=now()-interval '8 days',
          deadline=now()-interval '1 day' WHERE id=$1`,
        [assignmentId],
      )
    const response = (
      facts: unknown,
      usage: unknown = { input_tokens: 100, output_tokens: 50 },
    ) =>
      new Response(
        JSON.stringify({
          id: 'synthetic-response',
          status: 'completed',
          usage,
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: JSON.stringify(facts) }],
            },
          ],
        }),
        { status: 200 },
      )
    const answer = (facts: unknown) =>
      vi.fn<typeof fetch>().mockResolvedValue(response(facts))
    const phpFacts = {
      summary: null,
      skills: [{ name: 'PHP', description: '', evidence: 'PHP' }],
      experience: [],
    }
    /** What the page shows for an import: its label and message. */
    const shown = async (id: string) => {
      // The read returns the import's stored row, typed loosely.
      const view: Record<string, unknown> = (await readImport(id))!
      return {
        label: importStatusLabel(String(view.status)),
        message: view.error as string | null,
      }
    }
    it('separates draft from active version, detects stale saves and confirms idempotently', async () => {
      expect((await readProfile()).active).toBeNull()
      const data = emptyProfile()
      data.summary = 'First'
      const draft = await saveDraft(data, 0)
      expect((await readProfile()).active).toBeNull()
      await expect(saveDraft(data, 0)).rejects.toThrow('Draft changed')
      const command = randomUUID(),
        version = await confirmProfile(draft.revision, null, command)
      expect((await confirmProfile(draft.revision, null, command)).id).toBe(
        version.id,
      )
      expect((await readProfile()).versions).toHaveLength(1)
      await expect(
        confirmProfile(draft.revision, null, randomUUID()),
      ).rejects.toThrow('Profile changed')
      const state = await readProfile()
      data.summary = 'Second draft'
      await saveDraft(data, state.draft.revision)
      expect(((await readProfile()).active!.data as ProfileData).summary).toBe(
        'First',
      )
    })
    it('allows only one concurrent draft writer and validates import references', async () => {
      const results = await Promise.allSettled([
        saveDraft(emptyProfile(), 0),
        saveDraft(emptyProfile(), 0),
      ])
      expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1)
      const data = emptyProfile()
      data.sources = [randomUUID()]
      await expect(saveDraft(data, 1)).rejects.toThrow(
        'Invalid import references',
      )
      const id = await importCvText('PHP')
      data.sources = [id]
      expect(((await saveDraft(data, 1)).data as ProfileData).sources).toEqual([
        id,
      ])
    })
    it('validates every provenance against immutable reviewed text and listed imports', async () => {
      const id = await importCvText('PHP experience')
      await pool.query(
        'INSERT INTO profile_import_texts(import_id,revision,text) VALUES($1,1,$2)',
        [id, 'PHP experience'],
      )
      const data = emptyProfile()
      data.skills = [
        {
          ...emptySkill(),
          name: 'PHP',
          source: { importId: id, textRevision: 1, evidence: 'PHP' },
        },
      ]
      await expect(saveDraft(data, 0)).rejects.toThrow('Missing provenance')
      data.sources = [id]
      data.skills[0]!.source!.textRevision = 2
      await expect(saveDraft(data, 0)).rejects.toThrow('Invalid provenance')
      data.skills[0]!.source!.textRevision = 1
      data.skills[0]!.source!.evidence = 'Vue'
      await expect(saveDraft(data, 0)).rejects.toThrow('Invalid provenance')
      data.skills[0]!.source!.evidence = 'PHP'
      expect(
        ((await saveDraft(data, 0)).data as ProfileData).skills[0]!.source,
      ).toEqual(data.skills[0]!.source)
    })
    it('rejects command reuse with different confirmation arguments', async () => {
      const draft = await saveDraft(emptyProfile(), 0),
        command = randomUUID()
      const version = await confirmProfile(draft.revision, null, command)
      await expect(
        confirmProfile(draft.revision + 1, null, command),
      ).rejects.toThrow('Command already used')
      await expect(
        confirmProfile(draft.revision, version.id, command),
      ).rejects.toThrow('Command already used')
    })
    it('stores repeated originals independently and checks hashes', async () => {
      const bytes = await fixture('text.pdf'),
        first = await importCvDocument('../CV.pdf', bytes, root),
        second = await importCvDocument('../CV.pdf', bytes, root)
      expect(first).not.toBe(second)
      expect((await readOriginalFile(first, root))?.bytes).toEqual(bytes)
      const rows = (
        await pool.query('SELECT * FROM profile_imports ORDER BY created_at')
      ).rows
      expect(rows[0].sha256).toBe(digest(bytes))
      expect(rows[0].path_key).not.toBe(rows[1].path_key)
      expect(rows[0].original_name).not.toContain('/')
      await writeFile(join(root, rows[0].path_key), 'changed')
      await expect(readOriginalFile(first, root)).rejects.toThrow(
        'hash mismatch',
      )
    })
    it.each(['text.pdf', 'text.docx'])(
      'extracts synthetic %s locally and retains original',
      async (name) => {
        const bytes = await fixture(name),
          id = await importCvDocument(name, bytes, root)
        await readCvText({ importId: id }, root)
        const row = (
          await pool.query('SELECT * FROM profile_imports WHERE id=$1', [id])
        ).rows[0]
        expect(row.status).toBe('ready')
        expect(row.source_text).toMatch(/PHP/i)
        expect((await readOriginalFile(id, root))?.bytes).toEqual(bytes)
      },
      30000,
    )
    it.each(['scan.pdf', 'corrupt.docx'])(
      'falls back to manual text for %s without losing original',
      async (name) => {
        const bytes =
            name === 'scan.pdf'
              ? await fixture(name)
              : Buffer.from([80, 75, 3, 4, 1, 2, 3]),
          id = await importCvDocument(name, bytes, root)
        await readCvText({ importId: id }, root)
        expect(
          (
            await pool.query('SELECT status FROM profile_imports WHERE id=$1', [
              id,
            ])
          ).rows[0].status,
        ).toBe('needs_text')
        expect((await readOriginalFile(id, root))?.bytes).toEqual(bytes)
      },
      30000,
    )
    it('does not place an assignment without configuration and keeps reviewed text revisions', async () => {
      vi.stubEnv('OPENAI_API_KEY', '')
      const id = await importCvText('PHP mail@example.com')
      expect(await prepareProposal(id, 'PHP mail@example.com', 0)).toEqual({
        state: 'needs_configuration',
      })
      expect(await count('ai_assignments')).toBe(0)
      const row = (
        await pool.query('SELECT * FROM profile_imports WHERE id=$1', [id])
      ).rows[0]
      expect(row.professional_text).not.toContain('mail@example.com')
      expect(row.source_text).toContain('mail@example.com')
      expect(row.assignment_id).toBeNull()
      expect(await shown(id)).toEqual({
        label: 'Wymaga konfiguracji AI',
        message: null,
      })
      await expect(prepareProposal(id, 'PHP', 0)).rejects.toThrow(
        'text changed',
      )
    })
    describe('a proposal by assignment (epic sq2, T7)', () => {
      it('T7-AC01: places one assignment labelled with the CV file name in the save that starts the preparation and keeps its identifier with the text revision', async () => {
        const bytes = await fixture('text.pdf'),
          id = await importCvDocument('Moje CV.pdf', bytes, root)
        await readCvText({ importId: id }, root)
        const text = 'PHP backend developer'
        const { assignmentId } = await prepared(id, text, 0)
        expect(await count('ai_assignments')).toBe(1)
        expect(await assignmentOf(assignmentId)).toMatchObject({
          label: 'Moje CV.pdf',
          settings_name: 'profile',
          type: 'single',
          input: text,
          response_format: { name: 'profile_proposal' },
          status: 'in_progress',
        })
        expect(await importOf(id)).toMatchObject({
          status: 'ai_running',
          text_revision: 1,
          assignment_id: assignmentId,
        })
        // The job of its operation is sent with it.
        expect(await queue.jobs()).toHaveLength(1)
      })
      it('T7-AC01, ASSUMPTION(oferty-pracy-sq2.8/ASM-1): labels the assignment of a pasted CV "Wklejony tekst"', async () => {
        const { assignmentId } = await requested()
        expect((await assignmentOf(assignmentId)).label).toBe('Wklejony tekst')
      })
      it('T7-AC01: rolling the request back leaves neither the assignment nor its identifier', async () => {
        const id = await importCvText('PHP')
        await expect(
          transaction(async () => {
            await prepareProposal(id, 'PHP', 0)
            throw new Error('rolled back')
          }),
        ).rejects.toThrow('rolled back')
        expect(await count('ai_assignments')).toBe(0)
        expect(await count('ai_operations')).toBe(0)
        expect(await count('profile_import_texts')).toBe(0)
        expect(await importOf(id)).toMatchObject({
          status: 'ready',
          text_revision: 0,
          assignment_id: null,
        })
        // A failed request of the operation's job rolls back the same way.
        const fail = vi
          .spyOn(PgBoss.prototype, 'send')
          .mockRejectedValueOnce(new Error('queue failure'))
        try {
          await expect(prepareProposal(id, 'PHP', 0)).rejects.toThrow(
            'queue failure',
          )
        } finally {
          fail.mockRestore()
        }
        expect(await count('ai_assignments')).toBe(0)
        expect(await importOf(id)).toMatchObject({
          text_revision: 0,
          assignment_id: null,
        })
      })
      it('T7-AC01: refuses a second request for the same CV while the first is in progress, also one sent at the same time', async () => {
        const { id, assignmentId } = await requested('PHP')
        await expect(prepareProposal(id, 'PHP', 1)).rejects.toThrow(
          'already pending',
        )
        vi.stubEnv('OPENAI_API_KEY', '')
        await expect(prepareProposal(id, 'PHP', 1)).rejects.toThrow(
          'already pending',
        )
        vi.stubEnv('OPENAI_API_KEY', 'test-key-never-send')
        expect(await count('ai_assignments')).toBe(1)
        expect(await importOf(id)).toMatchObject({
          text_revision: 1,
          assignment_id: assignmentId,
        })
        const other = await importCvText('PHP')
        const results = await Promise.allSettled([
          prepareProposal(other, 'PHP', 0),
          prepareProposal(other, 'PHP', 0),
        ])
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(await count('ai_assignments')).toBe(2)
      })
      it('ASSUMPTION(oferty-pracy-sq2.8/ASM-2): refuses a request for a CV whose import records a preparation as in progress, also one of the old way without an assignment, until the deployment ends it (T10-R02)', async () => {
        const old: Record<string, string> = {}
        for (const status of ['ai_queued', 'ai_running', 'waiting_budget']) {
          const id = await importCvText('PHP')
          await pool.query('UPDATE profile_imports SET status=$2 WHERE id=$1', [
            id,
            status,
          ])
          old[status] = id
        }
        // The import's own status decides: a preparation of the old way the
        // import records as running is refused although it has no
        // assignment.
        await expect(
          prepareProposal(old.ai_running!, 'PHP', 0),
        ).rejects.toThrow('already pending')
        expect(await count('ai_assignments')).toBe(0)
        // The deployment ends every preparation of the old way with the
        // message of a failed assignment, and a new one can be requested.
        const { assignmentId } = await requested()
        expect(await failPreparationsOfOldWay()).toBe(3)
        for (const id of Object.values(old)) {
          expect(await importOf(id)).toMatchObject({
            status: 'needs_attention',
            proposal: null,
            error: failedMessage,
            assignment_id: null,
          })
          expect(await shown(id)).toEqual({
            label: 'Wymaga sprawdzenia',
            message: failedMessage,
          })
        }
        // A preparation with an assignment is left to its receiver.
        expect((await assignmentOf(assignmentId)).status).toBe('in_progress')
        expect(await failPreparationsOfOldWay()).toBe(0)
        await prepared(old.ai_running!, 'PHP', 0)
      })
      it('T7-AC02: a correct result gives the proposal for the revision the assignment was placed for, and the assignment succeeds', async () => {
        const { id, assignmentId } = await requested()
        const fetcher = answer(phpFacts)
        await carryOut(assignmentId, fetcher)
        expect(fetcher).toHaveBeenCalledTimes(1)
        const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body))
        expect(body).toMatchObject({
          model: 'gpt-6-luna',
          reasoning: { effort: 'low' },
          input: [
            {
              role: 'user',
              content: [{ type: 'input_text', text: 'PHP professional' }],
            },
          ],
          text: { format: { type: 'json_schema', name: 'profile_proposal' } },
        })
        expect((await assignmentOf(assignmentId)).status).toBe('succeeded')
        expect(await importOf(id)).toMatchObject({
          status: 'proposal',
          text_revision: 1,
          error: null,
          proposal: { skills: [{ name: 'PHP', evidence: 'PHP' }] },
        })
        expect(await shown(id)).toEqual({
          label: 'Propozycja gotowa',
          message: null,
        })
        expect((await readProfile()).active).toBeNull()
      })
      it.each([
        [
          'a quote not in the text',
          {
            summary: null,
            skills: [{ name: 'Vue', description: '', evidence: 'PRIVATE' }],
            experience: [],
          },
          quoteMessage,
        ],
        [
          'a proposal not in the format',
          { summary: null, skills: 'PRIVATE', experience: [] },
          formatMessage,
        ],
      ])(
        'T7-AC02, T7-AC03: %s leaves the assignment succeeded and ends the preparation with its own message',
        async (_case, facts, message) => {
          const { id, assignmentId } = await requested()
          await carryOut(assignmentId, answer(facts))
          expect(await assignmentOf(assignmentId)).toMatchObject({
            status: 'succeeded',
            failure_reason: null,
          })
          expect(await importOf(id)).toMatchObject({
            status: 'needs_attention',
            proposal: null,
            error: message,
          })
          expect(await shown(id)).toEqual({
            label: 'Wymaga sprawdzenia',
            message,
          })
          // The preparation has ended: a new one can be requested.
          await prepared(id, 'PHP professional', 1)
        },
      )
      it('accepts flattened PDF citations and saves selected facts with exact source provenance', async () => {
        const text = 'PHP\n\tbackend\r\nSenior Developer   Acme'
        const { id, assignmentId } = await requested(text)
        await carryOut(
          assignmentId,
          answer({
            summary: null,
            skills: [
              { name: 'PHP', description: 'Backend', evidence: 'PHP backend' },
            ],
            experience: [
              {
                role: 'Senior Developer',
                company: 'Acme',
                start: null,
                end: null,
                ongoing: false,
                description: '',
                technologies: ['PHP'],
                evidence: 'Senior Developer Acme',
              },
            ],
          }),
        )
        const imported = await importOf(id)
        expect(imported.status).toBe('proposal')
        expect(imported.proposal.skills[0].evidence).toBe('PHP\n\tbackend')
        expect(imported.proposal.experience[0].evidence).toBe(
          'Senior Developer   Acme',
        )
        const selected = applyProposal(
            emptyProfile(),
            imported.proposal,
            { skills: [0], experience: [0], summary: false },
            id,
            imported.text_revision,
          ),
          saved = (await saveDraft(selected, 0)).data as ProfileData
        expect(saved.skills[0]!.source!.evidence).toBe('PHP\n\tbackend')
        expect(saved.experience[0]!.source!.evidence).toBe(
          'Senior Developer   Acme',
        )
        expect((await readProfile()).active).toBeNull()
      })
      it('T7-AC03, T7-AC07: shows the preparation in progress while its assignment needs attention, and after the failure reaches the receiver ends it with the message of a failed assignment so a new one can be requested', async () => {
        const { id, assignmentId } = await requested()
        expect(await shown(id)).toEqual({
          label: 'Przygotowywanie propozycji',
          message: null,
        })
        // The model refuses, a non-retryable failure by the mapping of the
        // solution design (T2): the assignment needs attention.
        const refused = vi.fn<typeof fetch>().mockResolvedValue(
          new Response(
            JSON.stringify({
              id: 'synthetic-response',
              status: 'completed',
              usage: { input_tokens: 100, output_tokens: 5 },
              output: [
                {
                  type: 'message',
                  content: [{ type: 'refusal', text: 'I cannot help' }],
                },
              ],
            }),
            { status: 200 },
          ),
        )
        await carryOut(assignmentId, refused)
        expect(refused).toHaveBeenCalledTimes(1)
        expect((await assignmentOf(assignmentId)).status).toBe(
          'needs_attention',
        )
        expect(await shown(id)).toEqual({
          label: 'Przygotowywanie propozycji',
          message: null,
        })
        await expect(
          prepareProposal(id, 'PHP professional', 1),
        ).rejects.toThrow('already pending')
        // The time limit fails it and tells the Profile's receiver.
        await pastDeadline(assignmentId)
        expect(await failAssignmentsPastTimeLimit()).toEqual([assignmentId])
        expect(await assignmentOf(assignmentId)).toMatchObject({
          status: 'failed',
          failure_reason: 'time_limit',
        })
        expect(await importOf(id)).toMatchObject({
          status: 'needs_attention',
          proposal: null,
          error: failedMessage,
          text_revision: 1,
        })
        expect(await shown(id)).toEqual({
          label: 'Wymaga sprawdzenia',
          message: failedMessage,
        })
        const next = await prepared(id, 'PHP professional', 1)
        expect(next.assignmentId).not.toBe(assignmentId)
        expect(await importOf(id)).toMatchObject({
          status: 'ai_running',
          text_revision: 2,
          error: null,
        })
      })
      it('T7-AC02: a result for an older revision does not replace a newer proposal', async () => {
        const { id, assignmentId: older } = await requested()
        await pastDeadline(older)
        await failAssignmentsPastTimeLimit()
        const { assignmentId: newer } = await prepared(
          id,
          'PHP professional',
          1,
        )
        await carryOut(newer, answer(phpFacts))
        const after = await importOf(id)
        expect(after).toMatchObject({ status: 'proposal', text_revision: 2 })
        // The older assignment's result and failure, delivered late.
        await transaction(() =>
          proposalAssignmentReceiver.receiveResult({
            assignmentId: older,
            result: { summary: 'old', skills: [], experience: [] },
          }),
        )
        await transaction(() =>
          proposalAssignmentReceiver.receiveFailure({ assignmentId: older }),
        )
        expect(await importOf(id)).toEqual(after)
      })
      it('T7-AC08: the receiver called twice with the same result, and twice with the same failure, leaves the same data as after one call', async () => {
        const snapshot = async () => ({
          imports: (
            await pool.query('SELECT * FROM profile_imports ORDER BY id')
          ).rows,
          texts: (
            await pool.query(
              'SELECT * FROM profile_import_texts ORDER BY import_id,revision',
            )
          ).rows,
        })
        const succeeded = await requested()
        const result = {
          assignmentId: succeeded.assignmentId,
          result: phpFacts,
        }
        await transaction(() =>
          proposalAssignmentReceiver.receiveResult(result),
        )
        const once = await snapshot()
        await transaction(() =>
          proposalAssignmentReceiver.receiveResult(result),
        )
        expect(await snapshot()).toEqual(once)
        expect((await importOf(succeeded.id)).status).toBe('proposal')
        const failed = await requested()
        const failure = { assignmentId: failed.assignmentId }
        await transaction(() =>
          proposalAssignmentReceiver.receiveFailure(failure),
        )
        const failedOnce = await snapshot()
        await transaction(() =>
          proposalAssignmentReceiver.receiveFailure(failure),
        )
        expect(await snapshot()).toEqual(failedOnce)
        expect((await importOf(failed.id)).error).toBe(failedMessage)
      })
      it('the receiver of an assignment no import keeps changes nothing', async () => {
        const { id } = await requested()
        const before = await importOf(id)
        await transaction(async () => {
          await proposalAssignmentReceiver.receiveResult({
            assignmentId: randomUUID(),
            result: phpFacts,
          })
          await proposalAssignmentReceiver.receiveFailure({
            assignmentId: randomUUID(),
          })
        })
        expect(await importOf(id)).toEqual(before)
      })
    })
  },
)
