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
import {
  applyProposal,
  emptyProfile,
  emptySkill,
} from '../lib/profile/model.ts'
import { confirmProfile, readProfile, saveDraft } from '../lib/profile/store.ts'
import {
  aiQueue,
  createFileImport,
  createTextImport,
  digest,
  extractImport,
  originalFile,
  parseQueue,
} from '../lib/profile/imports.ts'
import { executeAi, prepareProposal, resumeAi } from '../lib/profile/ai.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration(
  'profiles in isolated PostgreSQL and private document storage',
  () => {
    const suffix = randomUUID().replaceAll('-', ''),
      schema = `profile_test_${suffix}`,
      queueSchema = `profile_queue_${suffix}`
    let admin: Pool, pool: Pool, boss: PgBoss, root: string
    const pricing = {
      model: 'test-only',
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
      createRequire(import.meta.url)(
        '../migrations/1770000000004_profiles.cjs',
      ).up({ sql: (s: string) => sql.push(s) })
      await pool.query(sql.join('\n'))
      boss = new PgBoss({
        connectionString: process.env.DATABASE_URL,
        schema: queueSchema,
      })
      boss.on('error', () => {})
      await boss.start()
      await boss.createQueue(parseQueue)
      await boss.createQueue(aiQueue)
      root = await mkdtemp(join(tmpdir(), 'profile-tests-'))
    }, 30000)
    beforeEach(async () => {
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'test-key-never-send')
      vi.stubEnv('AI_PROFILE_PRICING_JSON', JSON.stringify(pricing))
      await pool.query(
        'TRUNCATE profile_import_texts,ai_attempts,ai_budget_months,profile_imports,profile_drafts,profile_head,profile_versions CASCADE',
      )
      await pool.query('INSERT INTO profile_head(singleton) VALUES(true)')
    })
    afterAll(async () => {
      vi.unstubAllEnvs()
      await boss?.stop()
      await pool?.end()
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
        await admin.end()
      }
      if (root) await rm(root, { recursive: true, force: true })
    })
    const fixture = (name: string) =>
      readFile(new URL(`./fixtures/profile/${name}`, import.meta.url))
    async function readyAttempt(text = 'PHP professional') {
      const id = await createTextImport(pool, text)
      const result = await prepareProposal(pool, boss, id, text, 0)
      return { id, attemptId: ('id' in result ? result.id : '') as string }
    }
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
    it('separates draft from active version, detects stale saves and confirms idempotently', async () => {
      expect((await readProfile(pool)).active).toBeNull()
      const data = emptyProfile()
      data.summary = 'First'
      const draft = await saveDraft(pool, data, 0)
      expect((await readProfile(pool)).active).toBeNull()
      await expect(saveDraft(pool, data, 0)).rejects.toThrow('Draft changed')
      const command = randomUUID(),
        version = await confirmProfile(pool, draft.revision, null, command)
      expect(
        (await confirmProfile(pool, draft.revision, null, command)).id,
      ).toBe(version.id)
      expect((await readProfile(pool)).versions).toHaveLength(1)
      await expect(
        confirmProfile(pool, draft.revision, null, randomUUID()),
      ).rejects.toThrow('Profile changed')
      const state = await readProfile(pool)
      data.summary = 'Second draft'
      await saveDraft(pool, data, state.draft.revision)
      expect((await readProfile(pool)).active.data.summary).toBe('First')
    })
    it('allows only one concurrent draft writer and validates import references', async () => {
      const results = await Promise.allSettled([
        saveDraft(pool, emptyProfile(), 0),
        saveDraft(pool, emptyProfile(), 0),
      ])
      expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1)
      const data = emptyProfile()
      data.sources = [randomUUID()]
      await expect(saveDraft(pool, data, 1)).rejects.toThrow(
        'Invalid import references',
      )
      const id = await createTextImport(pool, 'PHP')
      data.sources = [id]
      expect((await saveDraft(pool, data, 1)).data.sources).toEqual([id])
    })
    it('validates every provenance against immutable reviewed text and listed imports', async () => {
      const id = await createTextImport(pool, 'PHP experience')
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
      await expect(saveDraft(pool, data, 0)).rejects.toThrow(
        'Missing provenance',
      )
      data.sources = [id]
      data.skills[0]!.source!.textRevision = 2
      await expect(saveDraft(pool, data, 0)).rejects.toThrow(
        'Invalid provenance',
      )
      data.skills[0]!.source!.textRevision = 1
      data.skills[0]!.source!.evidence = 'Vue'
      await expect(saveDraft(pool, data, 0)).rejects.toThrow(
        'Invalid provenance',
      )
      data.skills[0]!.source!.evidence = 'PHP'
      expect((await saveDraft(pool, data, 0)).data.skills[0].source).toEqual(
        data.skills[0]!.source,
      )
    })
    it('rejects command reuse with different confirmation arguments', async () => {
      const draft = await saveDraft(pool, emptyProfile(), 0),
        command = randomUUID()
      const version = await confirmProfile(pool, draft.revision, null, command)
      await expect(
        confirmProfile(pool, draft.revision + 1, null, command),
      ).rejects.toThrow('Command already used')
      await expect(
        confirmProfile(pool, draft.revision, version.id, command),
      ).rejects.toThrow('Command already used')
    })
    it('stores repeated originals independently, checks hashes, and rolls back failed enqueue', async () => {
      const bytes = await fixture('text.pdf'),
        first = await createFileImport(pool, boss, '../CV.pdf', bytes, root),
        second = await createFileImport(pool, boss, '../CV.pdf', bytes, root)
      expect(first).not.toBe(second)
      expect((await originalFile(pool, first, root))?.bytes).toEqual(bytes)
      const rows = (
        await pool.query('SELECT * FROM profile_imports ORDER BY created_at')
      ).rows
      expect(rows[0].sha256).toBe(digest(bytes))
      expect(rows[0].path_key).not.toBe(rows[1].path_key)
      expect(rows[0].original_name).not.toContain('/')
      await writeFile(join(root, rows[0].path_key), 'changed')
      await expect(originalFile(pool, first, root)).rejects.toThrow(
        'hash mismatch',
      )
      const fail = vi
        .spyOn(boss, 'send')
        .mockRejectedValueOnce(new Error('queue failed'))
      try {
        await expect(
          createFileImport(pool, boss, 'another.pdf', bytes, root),
        ).rejects.toThrow('storage failed')
      } finally {
        fail.mockRestore()
      }
      expect(
        (
          await pool.query(
            "SELECT count(*)::int n FROM profile_imports WHERE status='failed'",
          )
        ).rows[0].n,
      ).toBe(1)
    })
    it('marks file import failed when parser queue returns no job', async () => {
      const bytes = await fixture('text.pdf'),
        fail = vi.spyOn(boss, 'send').mockResolvedValueOnce(null)
      try {
        await expect(
          createFileImport(pool, boss, 'cv.pdf', bytes, root),
        ).rejects.toThrow('storage failed')
      } finally {
        fail.mockRestore()
      }
      const row = (await pool.query('SELECT * FROM profile_imports')).rows[0]
      expect(row.status).toBe('failed')
      expect((await originalFile(pool, row.id, root))?.bytes).toEqual(bytes)
    })
    it.each(['text.pdf', 'text.docx'])(
      'extracts synthetic %s locally and retains original',
      async (name) => {
        const bytes = await fixture(name),
          id = await createFileImport(pool, boss, name, bytes, root)
        await extractImport(pool, id, root)
        const row = (
          await pool.query('SELECT * FROM profile_imports WHERE id=$1', [id])
        ).rows[0]
        expect(row.status).toBe('ready')
        expect(row.source_text).toMatch(/PHP/i)
        expect((await originalFile(pool, id, root))?.bytes).toEqual(bytes)
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
          id = await createFileImport(pool, boss, name, bytes, root)
        await extractImport(pool, id, root)
        expect(
          (
            await pool.query('SELECT status FROM profile_imports WHERE id=$1', [
              id,
            ])
          ).rows[0].status,
        ).toBe('needs_text')
        expect((await originalFile(pool, id, root))?.bytes).toEqual(bytes)
      },
      30000,
    )
    it('does not enqueue paid requests without configuration and keeps reviewed text revisions', async () => {
      vi.stubEnv('OPENAI_API_KEY', '')
      const id = await createTextImport(pool, 'PHP mail@example.com')
      expect(
        await prepareProposal(pool, boss, id, 'PHP mail@example.com', 0),
      ).toEqual({ state: 'needs_configuration' })
      expect((await pool.query('SELECT * FROM ai_attempts')).rowCount).toBe(0)
      const row = (
        await pool.query('SELECT * FROM profile_imports WHERE id=$1', [id])
      ).rows[0]
      expect(row.professional_text).not.toContain('mail@example.com')
      expect(row.source_text).toContain('mail@example.com')
      await expect(prepareProposal(pool, boss, id, 'PHP', 0)).rejects.toThrow(
        'text changed',
      )
    })
    it('reserves the monthly 100 PLN cap atomically for concurrent imports', async () => {
      vi.stubEnv(
        'AI_PROFILE_PRICING_JSON',
        JSON.stringify({
          ...pricing,
          inputUsdPerMillion: '60000',
          maxInputTokens: 1000,
          maxOutputTokens: 1,
        }),
      )
      const ids = await Promise.all([
        createTextImport(pool, 'PHP'),
        createTextImport(pool, 'PHP'),
      ])
      const result = await Promise.all(
        ids.map((id) => prepareProposal(pool, boss, id, 'PHP', 0)),
      )
      expect(result.map((v) => v.state).sort()).toEqual([
        'queued',
        'waiting_budget',
      ])
      const sum = (
        await pool.query(
          "SELECT sum(reserved_pln)::text total FROM ai_attempts WHERE state='queued'",
        )
      ).rows[0].total
      expect(Number(sum)).toBeLessThanOrEqual(100)
      await expect(
        prepareProposal(pool, boss, ids[0]!, 'PHP', 1),
      ).rejects.toThrow('already pending')
    })
    it('settles known usage, rejects unsupported evidence, and never activates profile automatically', async () => {
      const { id, attemptId } = await readyAttempt()
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        response({
          summary: null,
          skills: [{ name: 'PHP', description: '', evidence: 'PHP' }],
          experience: [],
        }),
      )
      await executeAi(pool, boss, attemptId, fetcher)
      expect(fetcher).toHaveBeenCalledTimes(1)
      const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body))
      expect(body.store).toBe(false)
      expect(body.tools).toEqual([])
      const row = (
        await pool.query('SELECT * FROM ai_attempts WHERE id=$1', [attemptId])
      ).rows[0]
      expect(row.state).toBe('settled')
      expect(Number(row.actual_pln)).toBe(0.00015)
      expect(
        (
          await pool.query('SELECT status FROM profile_imports WHERE id=$1', [
            id,
          ])
        ).rows[0].status,
      ).toBe('proposal')
      expect((await readProfile(pool)).active).toBeNull()
      await executeAi(pool, boss, attemptId, fetcher)
      expect(fetcher).toHaveBeenCalledTimes(1)
      const other = await readyAttempt()
      await executeAi(
        pool,
        boss,
        other.attemptId,
        vi.fn<typeof fetch>().mockResolvedValue(
          response({
            summary: null,
            skills: [{ name: 'Vue', description: '', evidence: 'invented' }],
            experience: [],
          }),
        ),
      )
      expect(
        (
          await pool.query(
            'SELECT status,proposal FROM profile_imports WHERE id=$1',
            [other.id],
          )
        ).rows[0],
      ).toMatchObject({ status: 'needs_attention', proposal: null })
    })
    it('accepts flattened PDF citations, settles usage, and saves selected facts with exact source provenance', async () => {
      const text = 'PHP\n\tbackend\r\nSenior Developer\u00a0  Acme',
        { id, attemptId } = await readyAttempt(text),
        fetcher = vi.fn<typeof fetch>().mockResolvedValue(
          response({
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
      await executeAi(pool, boss, attemptId, fetcher)
      expect(fetcher).toHaveBeenCalledTimes(1)
      const attempt = (
          await pool.query(
            'SELECT state,actual_pln FROM ai_attempts WHERE id=$1',
            [attemptId],
          )
        ).rows[0],
        imported = (
          await pool.query(
            'SELECT status,proposal,text_revision FROM profile_imports WHERE id=$1',
            [id],
          )
        ).rows[0]
      expect(attempt.state).toBe('settled')
      expect(Number(attempt.actual_pln)).toBe(0.00015)
      expect(imported.status).toBe('proposal')
      expect(imported.proposal.skills[0].evidence).toBe('PHP\n\tbackend')
      expect(imported.proposal.experience[0].evidence).toBe(
        'Senior Developer\u00a0  Acme',
      )
      const selected = applyProposal(
          emptyProfile(),
          imported.proposal,
          { skills: [0], experience: [0], summary: false },
          id,
          imported.text_revision,
        ),
        saved = await saveDraft(pool, selected, 0)
      expect(saved.data.skills[0]!.source!.evidence).toBe('PHP\n\tbackend')
      expect(saved.data.experience[0]!.source!.evidence).toBe(
        'Senior Developer\u00a0  Acme',
      )
      expect((await readProfile(pool)).active).toBeNull()
    })
    it.each([
      [{ status: 'incomplete', output: [] }, 'nie ukończyło'],
      [
        {
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'refusal', text: 'PRIVATE_SENTINEL' }],
            },
          ],
        },
        'odmówiło',
      ],
      [{ status: 'completed', output: [] }, 'jednej kompletnej'],
      [
        {
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'PRIVATE_SENTINEL' }],
            },
          ],
        },
        'format danych',
      ],
      [
        {
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    summary: null,
                    skills: [
                      {
                        name: 'PHP',
                        description: '',
                        evidence: 'PRIVATE_SENTINEL',
                      },
                    ],
                    experience: [],
                  }),
                },
              ],
            },
          ],
        },
        'potwierdzić cytatów',
      ],
    ])(
      'settles valid usage even when the proposal is rejected with a safe explanation',
      async (payload, message) => {
        const { id, attemptId } = await readyAttempt(),
          fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
              new Response(
                JSON.stringify({
                  ...payload,
                  usage: { input_tokens: 100, output_tokens: 50 },
                }),
                { status: 200 },
              ),
            )
        await executeAi(pool, boss, attemptId, fetcher)
        const attempt = (
            await pool.query(
              'SELECT state,actual_pln,error FROM ai_attempts WHERE id=$1',
              [attemptId],
            )
          ).rows[0],
          imported = (
            await pool.query(
              'SELECT status,proposal,error FROM profile_imports WHERE id=$1',
              [id],
            )
          ).rows[0]
        expect(attempt.state).toBe('settled')
        expect(Number(attempt.actual_pln)).toBe(0.00015)
        expect(attempt.error).toContain(message)
        expect(attempt.error).not.toContain('PRIVATE_SENTINEL')
        expect(imported).toMatchObject({
          status: 'needs_attention',
          proposal: null,
          error: attempt.error,
        })
        expect(fetcher).toHaveBeenCalledTimes(1)
      },
    )
    it('keeps an unknown charge reserved and caps transient retries at two attempts', async () => {
      const { attemptId } = await readyAttempt(),
        fetcher = vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('', { status: 503 }))
      await executeAi(pool, boss, attemptId, fetcher)
      let attempts = (
        await pool.query('SELECT * FROM ai_attempts ORDER BY attempt')
      ).rows
      expect(attempts).toHaveLength(2)
      expect(attempts[0].state).toBe('unknown')
      expect(attempts[0].actual_pln).toBeNull()
      expect(Number(attempts[0].reserved_pln)).toBeGreaterThan(0)
      await executeAi(pool, boss, attempts[1].id, fetcher)
      attempts = (
        await pool.query('SELECT * FROM ai_attempts ORDER BY attempt')
      ).rows
      expect(attempts).toHaveLength(2)
      expect(attempts.every((v) => v.state === 'unknown')).toBe(true)
      expect(fetcher).toHaveBeenCalledTimes(2)
    }, 10000)
    it('rolls back paid reservation and reviewed text when queue submission fails', async () => {
      const id = await createTextImport(pool, 'PHP')
      const fail = vi
        .spyOn(boss, 'send')
        .mockRejectedValueOnce(new Error('queue failure'))
      try {
        await expect(prepareProposal(pool, boss, id, 'PHP', 0)).rejects.toThrow(
          'queue failure',
        )
      } finally {
        fail.mockRestore()
      }
      expect((await pool.query('SELECT * FROM ai_attempts')).rowCount).toBe(0)
      expect(
        (await pool.query('SELECT * FROM ai_budget_months')).rowCount,
      ).toBe(0)
      expect(
        (await pool.query('SELECT * FROM profile_import_texts')).rowCount,
      ).toBe(0)
      expect(
        (
          await pool.query(
            'SELECT text_revision,status FROM profile_imports WHERE id=$1',
            [id],
          )
        ).rows[0],
      ).toEqual({ text_revision: 0, status: 'ready' })
    })
    it('does not reserve or accept a paid operation if queue submission returns null', async () => {
      const id = await createTextImport(pool, 'PHP'),
        fail = vi.spyOn(boss, 'send').mockResolvedValueOnce(null)
      try {
        await expect(
          prepareProposal(pool, boss, id, 'PHP', 0),
        ).rejects.toThrow()
      } finally {
        fail.mockRestore()
      }
      expect((await pool.query('SELECT * FROM ai_attempts')).rowCount).toBe(0)
      expect(
        (
          await pool.query(
            'SELECT text_revision FROM profile_imports WHERE id=$1',
            [id],
          )
        ).rows[0].text_revision,
      ).toBe(0)
    })
    it('prevents recovery and duplicate delivery from interrupting an active AI request', async () => {
      const { attemptId } = await readyAttempt()
      let release!: () => void, entered!: () => void
      const gate = new Promise<void>((resolve) => {
          release = resolve
        }),
        started = new Promise<void>((resolve) => {
          entered = resolve
        })
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
        entered()
        await gate
        return response({ summary: null, skills: [], experience: [] })
      })
      const execution = executeAi(pool, boss, attemptId, fetcher)
      await started
      try {
        await resumeAi(pool, boss)
        const duplicate = vi.fn<typeof fetch>()
        await executeAi(pool, boss, attemptId, duplicate)
        expect(duplicate).not.toHaveBeenCalled()
        expect(
          (
            await pool.query('SELECT state FROM ai_attempts WHERE id=$1', [
              attemptId,
            ])
          ).rows[0].state,
        ).toBe('running')
      } finally {
        release()
        await execution
      }
      expect(fetcher).toHaveBeenCalledTimes(1)
    })
    it.each([
      null,
      { input_tokens: -1, output_tokens: 3 },
      { input_tokens: 1001, output_tokens: 1 },
    ])('keeps missing or out-of-bounds usage reserved: %s', async (usage) => {
      const { attemptId } = await readyAttempt()
      await executeAi(
        pool,
        boss,
        attemptId,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            response({ summary: null, skills: [], experience: [] }, usage),
          ),
      )
      const row = (
        await pool.query(
          'SELECT state,actual_pln,reserved_pln FROM ai_attempts WHERE id=$1',
          [attemptId],
        )
      ).rows[0]
      expect(row.state).toBe('unknown')
      expect(row.actual_pln).toBeNull()
      expect(Number(row.reserved_pln)).toBeGreaterThan(0)
    })
    it('ignores stale proposal results and recovery retains interrupted cost reservations', async () => {
      const { id, attemptId } = await readyAttempt()
      await pool.query(
        'UPDATE profile_imports SET text_revision=2,status=$2 WHERE id=$1',
        [id, 'ready'],
      )
      await executeAi(
        pool,
        boss,
        attemptId,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            response({ summary: 'old', skills: [], experience: [] }),
          ),
      )
      expect(
        (
          await pool.query(
            'SELECT status,proposal FROM profile_imports WHERE id=$1',
            [id],
          )
        ).rows[0],
      ).toMatchObject({ status: 'ready', proposal: null })
      const other = await readyAttempt()
      await pool.query("UPDATE ai_attempts SET state='running' WHERE id=$1", [
        other.attemptId,
      ])
      await pool.query(
        "UPDATE profile_imports SET status='ai_running' WHERE id=$1",
        [other.id],
      )
      await resumeAi(pool, boss)
      const row = (
        await pool.query(
          'SELECT state,reserved_pln,actual_pln FROM ai_attempts WHERE id=$1',
          [other.attemptId],
        )
      ).rows[0]
      expect(row.state).toBe('unknown')
      expect(Number(row.reserved_pln)).toBeGreaterThan(0)
      expect(row.actual_pln).toBeNull()
    })
  },
)
