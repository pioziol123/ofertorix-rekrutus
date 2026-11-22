import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import { emptyProfile } from '../modules/profile/view.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { digest } from '../modules/profile/domain/cv-document.ts'
import { readCvText } from '../modules/profile/index.ts'
import { prepareCvTextQueue } from './profile.fixtures.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration('profile HTTP and SSR against isolated Nitro server', () => {
  const suffix = randomUUID().replaceAll('-', ''),
    schema = `profile_http_${suffix}`,
    queueSchema = `phttp_q_${suffix}`
  let admin: Pool, pool: Pool, child: ChildProcess, root: string, base: string
  beforeAll(async () => {
    await access('.output/server/index.mjs')
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    const connection = new URL(process.env.DATABASE_URL!)
    connection.searchParams.set('options', `-c search_path=${schema}`)
    pool = new Pool({ connectionString: connection.toString() })
    setPool(pool)
    const sql: string[] = []
    for (const migration of [
      '1770000000004_profiles',
      '1770000000027_ai_assignments',
      '1770000000032_profile_assignment',
      '1770000000035_ai_budget_carried_amounts',
    ])
      createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
        sql: (s: string) => sql.push(s),
      })
    await pool.query(sql.join('\n'))
    await prepareCvTextQueue(queueSchema)
    root = await mkdtemp(join(tmpdir(), 'profile-http-'))
    const probe = createServer()
    probe.listen(0, '127.0.0.1')
    await once(probe, 'listening')
    const address = probe.address()
    if (!address || typeof address === 'string') throw new Error('No test port')
    const port = address.port
    await new Promise<void>((resolve, reject) =>
      probe.close((e) => (e ? reject(e) : resolve())),
    )
    base = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, ['.output/server/index.mjs'], {
      env: {
        ...process.env,
        DATABASE_URL: connection.toString(),
        DOCUMENTS_DIR: root,
        PG_BOSS_SCHEMA: queueSchema,
        OPENAI_API_KEY: '',
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(port),
      },
      stdio: 'ignore',
    })
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null)
        throw new Error('Isolated Nitro exited before startup')
      try {
        if ((await fetch(`${base}/api/profile`)).ok) return
      } catch {
        // The server may still be starting.
      }
      await delay(100)
    }
    throw new Error('Isolated Nitro startup timed out')
  }, 30000)
  afterAll(async () => {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await Promise.race([once(child, 'exit'), delay(2000)])
      if (child.exitCode === null) {
        child.kill('SIGKILL')
        await once(child, 'exit')
      }
    }
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
    if (root) await rm(root, { recursive: true, force: true })
  }, 15000)
  const json = (method: string, body: unknown, origin?: string) => ({
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin ?? base },
    body: JSON.stringify(body),
  })
  it('renders the profile page and reads an empty profile without authentication', async () => {
    const api = await fetch(`${base}/api/profile`)
    expect(api.status).toBe(200)
    expect(api.headers.get('cache-control')).toContain('no-store')
    const state = await api.json()
    expect(state.active).toBeNull()
    expect(state.draft.revision).toBe(0)
    expect(state.aiConfigured).toBe(false)
    const page = await fetch(`${base}/profile`)
    expect(page.status).toBe(200)
    expect(await page.text()).toMatch(/Profil/)
  })
  it('rejects foreign origins, malformed values and oversized JSON', async () => {
    const data = emptyProfile()
    expect(
      (
        await fetch(
          `${base}/api/profile/draft`,
          json('PUT', { data, expectedRevision: 0 }, 'https://foreign.example'),
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await fetch(`${base}/api/profile/draft`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, expectedRevision: 0 }),
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await fetch(
          `${base}/api/profile/draft`,
          json('PUT', { data: { invalid: true }, expectedRevision: 0 }),
        )
      ).status,
    ).toBe(422)
    expect(
      (
        await fetch(`${base}/api/profile/draft`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Origin: base },
          body: 'invalid json',
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await fetch(
          `${base}/api/profile/draft`,
          json('PUT', {
            data: 'x'.repeat(2 * 1024 * 1024),
            expectedRevision: 0,
          }),
        )
      ).status,
    ).toBe(413)
  })
  it('persists draft separately, confirms idempotently, and reports stale conflicts', async () => {
    const data = emptyProfile()
    data.summary = 'Synthetic professional summary'
    const save = await fetch(
      `${base}/api/profile/draft`,
      json('PUT', { data, expectedRevision: 0 }),
    )
    expect(save.status).toBe(200)
    const draft = await save.json()
    expect(
      (await (await fetch(`${base}/api/profile`)).json()).active,
    ).toBeNull()
    const stale = await fetch(
      `${base}/api/profile/draft`,
      json('PUT', { data, expectedRevision: 0 }),
    )
    expect(stale.status).toBe(409)
    const command = {
      expectedRevision: draft.revision,
      expectedActiveVersionId: null,
      commandId: randomUUID(),
    }
    const confirm = await fetch(
      `${base}/api/profile/confirm`,
      json('POST', command),
    )
    expect(confirm.status).toBe(200)
    const version = await confirm.json()
    const repeated = await fetch(
      `${base}/api/profile/confirm`,
      json('POST', command),
    )
    expect(repeated.status).toBe(200)
    expect((await repeated.json()).id).toBe(version.id)
    expect(
      (
        await fetch(
          `${base}/api/profile/confirm`,
          json('POST', { ...command, commandId: randomUUID() }),
        )
      ).status,
    ).toBe(409)
    expect(
      (await fetch(`${base}/api/profile/versions/${version.id}`)).status,
    ).toBe(200)
  })
  it('imports and reviews text with no AI configuration and keeps the active profile', async () => {
    const before = await (await fetch(`${base}/api/profile`)).json()
    const imported = await fetch(
      `${base}/api/profile/imports`,
      json('POST', { text: 'PHP expert synthetic CV' }),
    )
    expect(imported.status).toBe(202)
    const { id } = await imported.json()
    const detail = await fetch(`${base}/api/profile/imports/${id}`)
    expect(detail.status).toBe(200)
    const prepare = await fetch(
      `${base}/api/profile/imports/${id}/prepare`,
      json('POST', { text: 'PHP expert synthetic CV', expectedRevision: 0 }),
    )
    expect(prepare.status).toBe(200)
    expect((await prepare.json()).state).toBe('needs_configuration')
    const after = await (await fetch(`${base}/api/profile`)).json()
    expect(after.active.id).toBe(before.active.id)
    expect((await pool.query('SELECT * FROM ai_assignments')).rowCount).toBe(0)
  })
  it('uploads a binary original, preserves bytes on download and exposes local extraction', async () => {
    const bytes = await readFile(
      new URL('./fixtures/profile/text.pdf', import.meta.url),
    )
    const upload = await fetch(
      `${base}/api/profile/imports?name=synthetic.pdf`,
      {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/pdf' },
        body: new Uint8Array(bytes),
      },
    )
    expect(upload.status).toBe(202)
    const { id } = await upload.json()
    const file = await fetch(`${base}/api/profile/imports/${id}/file`)
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toContain('application/pdf')
    expect(file.headers.get('content-disposition')).toContain('attachment')
    expect(digest(Buffer.from(await file.arrayBuffer()))).toBe(digest(bytes))
    await readCvText({ importId: id }, root)
    const detail = await fetch(`${base}/api/profile/imports/${id}`)
    expect(detail.status).toBe(200)
    const record = await detail.json()
    expect(record.status).toBe('ready')
    expect(record.source_text).toMatch(/PHP/)
    expect((await fetch(`${base}/api/profile/imports/not-a-uuid`)).status).toBe(
      422,
    )
    expect(
      (
        await fetch(`${base}/api/profile/imports?name=bad.exe`, {
          method: 'POST',
          headers: { Origin: base },
          body: 'bad',
        })
      ).status,
    ).toBe(415)
  }, 30000)
  it('A11-AC01: applies a proposal through the route with the existing responses and conflicts', async () => {
    const id = randomUUID(),
      text = 'Go services and Kubernetes'
    await pool.query(
      `INSERT INTO profile_imports(id,kind,status,source_text,professional_text,text_revision,proposal)
       VALUES($1,'text','proposal',$2,$2,1,$3)`,
      [
        id,
        text,
        {
          summary: null,
          skills: [{ name: 'Go', description: '', evidence: 'Go services' }],
          experience: [],
        },
      ],
    )
    await pool.query(
      'INSERT INTO profile_import_texts(import_id,revision,text) VALUES($1,1,$2)',
      [id, text],
    )
    const current = (await (await fetch(`${base}/api/profile`)).json()).draft
      .revision as number
    const choice = (expectedRevision: number) =>
      json('POST', {
        expectedRevision,
        skills: [0],
        experience: [],
        summary: false,
      })
    const stale = await fetch(
      `${base}/api/profile/imports/${id}/apply`,
      choice(current + 1),
    )
    expect(stale.status).toBe(409)
    const missing = await fetch(
      `${base}/api/profile/imports/${randomUUID()}/apply`,
      choice(current),
    )
    expect(missing.status).toBe(404)
    const applied = await fetch(
      `${base}/api/profile/imports/${id}/apply`,
      choice(current),
    )
    expect(applied.status).toBe(200)
    const draft = await applied.json()
    expect(draft.revision).toBe(current + 1)
    expect(draft.data.sources).toContain(id)
    expect(
      draft.data.skills.find((s: { name: string }) => s.name === 'Go').source,
    ).toEqual({ importId: id, textRevision: 1, evidence: 'Go services' })
    const invalid = await fetch(
      `${base}/api/profile/imports/${id}/apply`,
      json('POST', {
        expectedRevision: current + 1,
        skills: [5],
        experience: [],
        summary: false,
      }),
    )
    expect(invalid.status).toBe(422)
  })
  it('A11-AC01, T10-R06: shows every budget month with its limit, settled and reserved amounts from the budget read of the AI module', async () => {
    await pool.query(
      "INSERT INTO ai_budget_months(month,limit_pln,carried_settled,carried_held) VALUES('2026-10','100','1.5','0.25') ON CONFLICT DO NOTHING",
    )
    const state = await (await fetch(`${base}/api/profile`)).json()
    expect(state.budget).toContainEqual({
      month: '2026-10',
      limit_pln: '100.000000',
      spent: '1.500000',
      reserved: '0.250000',
    })
  })
})
