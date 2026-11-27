import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readdirSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stageChangedMessage } from '../modules/recruitments/view.ts'

/**
 * The application in offer details (task oferty-pracy-lq3.1, T1 of epic
 * lq3) against the built web server on an isolated schema: the stage field
 * in the rendered details (T1-AC01, A-AC11), a sequence of choices through
 * the routes (T1-AC02), a choice from a stale page (T1-AC03, A-AC02) and the
 * codes of the other refusals (D13).
 */

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/** The database migrations in order, the queue migrations left out. */
const queueMigrations = new Set([
  '1770000000022_profile_cv_text_queue',
  '1770000000023_source_sync_run_queue',
  '1770000000025_ai_execution_queues',
  '1770000000028_ai_operation_queue_openai',
  '1770000000029_ai_operation_queue_ollama',
  '1770000000037_ai_execution_queues_removed',
])
const migrations = readdirSync(new URL('../migrations/', import.meta.url))
  .filter((name) => name.endsWith('.cjs'))
  .map((name) => name.slice(0, -'.cjs'.length))
  .filter((name) => !queueMigrations.has(name))
  .sort()

/** Text of the HTML without tags, with common entities decoded. */
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

const labels = {
  to_consider: 'Do rozważenia',
  cv_sent: 'CV wysłane',
  rejected: 'Odrzucone',
  removed: 'Zdjęta z listy',
} as const
type Stage = keyof typeof labels

integration('the application in offer details over HTTP (T1)', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const schema = `recruit_page_${suffix}`
  const queueSchema = `recruitp_q_${suffix}`
  let admin: Pool, pool: Pool, child: ChildProcess, base: string, scope: string

  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify(body),
    })
  /** The first move, from details showing "Bez aplikacji". */
  const start = (offerId: string, target: string) =>
    post(`/api/offers/${offerId}/application`, { target })
  /** A later move, from details showing the expected stage. */
  const move = (offerId: string, expected: string, target: string) =>
    post(`/api/applications/${offerId}/stage`, { expected, target })
  const shownStage = async (offerId: string) => {
    const response = await fetch(`${base}/api/applications/${offerId}`)
    return response.status === 404 ? null : (await response.json()).stage
  }
  /** The stage field of the rendered offer details. */
  async function stageField(offerId: string) {
    const response = await fetch(`${base}/offers?offer=${offerId}`)
    expect(response.status).toBe(200)
    const html = await response.text()
    const field = html.split('data-testid="application-stage"')[1]
    expect(field, 'the stage field').toBeDefined()
    const select = field!.split('</select>')[0]!
    const options = [...select.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)]
    return {
      html,
      select,
      shown: text(
        options.find(([, attributes]) =>
          /\bselected\b/.test(attributes!),
        )?.[2] ?? '',
      ).trim(),
      listed: options
        .filter(([, attributes]) => !/\bhidden\b/.test(attributes!))
        .map(([, , label]) => text(label!).trim()),
    }
  }

  async function offer(title = 'Recruited PHP'): Promise<string> {
    const id = randomUUID(),
      version = randomUUID()
    await pool.query(
      `INSERT INTO source_ads(id,source,external_id,url,last_seen_scope_id,availability)
      VALUES($1,'bayt',$4,$2,$3,'available')`,
      [id, `https://example.com/${id}`, scope, id],
    )
    await pool.query(
      `INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload,retrieved_at)
      VALUES($1,$2,$3,$4,now())`,
      [version, id, version, { title, company: 'TestCo', skills: [] }],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [id, version],
    )
    return id
  }

  beforeAll(async () => {
    await access('.output/server/index.mjs')
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    const connection = new URL(process.env.DATABASE_URL!)
    connection.searchParams.set('options', `-c search_path=${schema}`)
    pool = new Pool({ connectionString: connection.toString(), max: 2 })
    for (const name of migrations) {
      const sql: string[] = []
      createRequire(import.meta.url)(`../migrations/${name}.cjs`).up({
        sql: (s: string) => sql.push(s),
      })
      for (const statement of sql) await pool.query(statement)
    }
    scope = randomUUID()
    await pool.query(
      "INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,'bayt',$2,'{}')",
      [scope, randomUUID()],
    )

    const probe = createServer().listen(0, '127.0.0.1')
    await once(probe, 'listening')
    const address = probe.address()
    if (!address || typeof address === 'string') throw new Error('No test port')
    await new Promise((resolve) => probe.close(resolve))
    base = `http://127.0.0.1:${address.port}`
    child = spawn(process.execPath, ['.output/server/index.mjs'], {
      env: {
        ...process.env,
        DATABASE_URL: connection.toString(),
        PG_BOSS_SCHEMA: queueSchema,
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(address.port),
      },
      stdio: 'ignore',
    })
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null)
        throw new Error('Isolated Nitro exited before startup')
      try {
        if ((await fetch(`${base}/api/offers`)).ok) return
      } catch {
        // The server may still be starting.
      }
      await delay(100)
    }
    throw new Error('Isolated Nitro startup timed out')
  }, 60_000)

  afterAll(async () => {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await Promise.race([once(child, 'exit'), delay(2000)])
      if (child.exitCode === null) {
        child.kill('SIGKILL')
        await once(child, 'exit')
      }
    }
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  }, 15_000)

  it('shows "Bez aplikacji" or the stage label in the stage field, the allowed stages and no note (T1-AC01, A-AC11)', async () => {
    const none = await offer()
    const expected: [string, Stage | null, string[]][] = [
      [none, null, ['Do rozważenia', 'CV wysłane', 'Odrzucone']],
    ]
    const allowed: Record<Stage, string[]> = {
      to_consider: ['CV wysłane', 'Odrzucone', 'Zdjęta z listy'],
      cv_sent: ['Do rozważenia', 'Odrzucone'],
      rejected: ['Do rozważenia', 'CV wysłane', 'Zdjęta z listy'],
      removed: ['Do rozważenia', 'CV wysłane', 'Odrzucone'],
    }
    for (const stage of Object.keys(labels) as Stage[]) {
      const id = await offer()
      if (stage === 'removed') {
        expect((await start(id, 'to_consider')).status).toBe(200)
        expect((await move(id, 'to_consider', 'removed')).status).toBe(200)
      } else expect((await start(id, stage)).status).toBe(200)
      expected.push([id, stage, allowed[stage]])
    }
    for (const [id, stage, listed] of expected) {
      const field = await stageField(id)
      expect(field.shown, field.select).toBe(
        stage ? labels[stage] : 'Bez aplikacji',
      )
      expect(field.listed).toEqual(listed)
      const details = text(
        field.html.split('aria-label="Szczegóły oferty"')[1]!,
      )
      expect(details).toContain('Etap aplikacji')
      expect(details).not.toMatch(/Notatk/i)
    }
  })

  it('shows the chosen stage after each choice of the sequence (T1-AC02)', async () => {
    const id = await offer()
    expect(await shownStage(id)).toBeNull()
    const sequence: Stage[] = [
      'to_consider',
      'cv_sent',
      'to_consider',
      'rejected',
      'cv_sent',
      'rejected',
      'removed',
    ]
    let shown: Stage | null = null
    for (const target of sequence) {
      const response: Response = shown
        ? await move(id, shown, target)
        : await start(id, target)
      expect(response.status, `${shown} → ${target}`).toBe(200)
      expect((await response.json()).stage).toBe(target)
      expect(await shownStage(id)).toBe(target)
      expect((await stageField(id)).shown).toBe(labels[target])
      shown = target
    }
    const history = (
      await (await fetch(`${base}/api/applications/${id}`)).json()
    ).history as { stage: Stage }[]
    expect(history.map((record) => record.stage)).toEqual(
      [...sequence].reverse(),
    )
  })

  it('refuses a choice from a page showing an old stage with the message of A-R07 and keeps the stage (T1-AC03, A-AC02)', async () => {
    const id = await offer()
    await start(id, 'to_consider')
    // A second page moves the application; the first still shows "Do rozważenia".
    expect((await move(id, 'to_consider', 'cv_sent')).status).toBe(200)
    const refused = await move(id, 'to_consider', 'rejected')
    expect(refused.status).toBe(409)
    expect((await refused.json()).data).toEqual({
      code: 'application_stage_changed',
    })
    expect(await shownStage(id)).toBe('cv_sent')
    // A page that showed no application while one now exists.
    const stale = await start(id, 'rejected')
    expect(stale.status).toBe(409)
    expect((await stale.json()).data.code).toBe('application_stage_changed')
    expect(await shownStage(id)).toBe('cv_sent')
    expect(stageChangedMessage).toBe(
      'Etap tej aplikacji się zmienił — odśwież stronę',
    )
  })

  it('answers the same choice twice as done (A-AC08)', async () => {
    const id = await offer()
    await start(id, 'to_consider')
    expect((await start(id, 'to_consider')).status).toBe(200)
    await move(id, 'to_consider', 'cv_sent')
    const again = await move(id, 'to_consider', 'cv_sent')
    expect(again.status).toBe(200)
    expect((await again.json()).stage).toBe('cv_sent')
  })

  it('answers the other refusals with their codes (D13)', async () => {
    const id = await offer()
    const code = async (response: Response, status: number) => {
      expect(response.status).toBe(status)
      return (await response.json()).data?.code
    }
    expect(await code(await start(randomUUID(), 'to_consider'), 404)).toBe(
      'offer_not_found',
    )
    expect(await code(await start(id, 'removed'), 422)).toBe(
      'transition_not_allowed',
    )
    expect(await code(await start(id, 'hired'), 422)).toBe('invalid_input')
    expect(await code(await move(id, 'to_consider', 'cv_sent'), 404)).toBe(
      'application_not_found',
    )
    expect(await code(await fetch(`${base}/api/applications/${id}`), 404)).toBe(
      'application_not_found',
    )
    expect(
      await code(await fetch(`${base}/api/applications/not-an-id`), 404),
    ).toBe('application_not_found')
    await start(id, 'to_consider')
    expect(await code(await move(id, 'cv_sent', 'removed'), 422)).toBe(
      'transition_not_allowed',
    )
    expect(await code(await move(id, 'to_consider', 'hired'), 422)).toBe(
      'invalid_input',
    )
    expect(await shownStage(id)).toBe('to_consider')
  })

  it('answers a body that is not JSON, or is sent without the JSON content type, as invalid input (D13)', async () => {
    const id = await offer()
    await start(id, 'to_consider')
    const raw = (path: string, body: string, type?: string) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { Origin: base, ...(type ? { 'Content-Type': type } : {}) },
        body,
      })
    for (const path of [
      `/api/applications/${id}/stage`,
      `/api/offers/${id}/application`,
    ]) {
      const broken = await raw(path, '{bad', 'application/json')
      expect(broken.status, path).toBe(422)
      expect((await broken.json()).data, path).toEqual({
        code: 'invalid_input',
      })
      const untyped = await raw(
        path,
        JSON.stringify({ expected: 'to_consider', target: 'cv_sent' }),
      )
      expect(untyped.status, path).toBe(422)
      expect((await untyped.json()).data, path).toEqual({
        code: 'invalid_input',
      })
    }
    expect(await shownStage(id)).toBe('to_consider')
  })
})
