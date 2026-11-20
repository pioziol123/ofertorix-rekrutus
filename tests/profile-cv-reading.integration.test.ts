import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { Pool } from 'pg'
import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import { sendJob, stopQueues } from '../lib/queues/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { digest } from '../modules/profile/domain/cv-document.ts'
import {
  cvTextReadingJob,
  importCvDocument,
  importCvText,
  readOriginalFile,
} from '../modules/profile/index.ts'
import { prepareCvTextQueue } from './profile.fixtures.ts'
import { waitFor } from './worker.fixtures.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

const textNeeded =
  'Nie udało się odczytać tekstu (plik bez tekstu, uszkodzony, zablokowany lub przekroczony limit). Wklej tekst CV; oryginał jest zachowany.'
const notAccepted =
  'Nie udało się przyjąć pliku. Sprawdź lokalny zapis dokumentów.'
const sourceMissing = 'Brak poprawnego pliku źródłowego'
const queue = cvTextReadingJob.queue
const failureQueue = `${queue}.failed`

const workerEntry = fileURLToPath(
  new URL('./fixtures/profile/worker.ts', import.meta.url),
)
const slowReading = new URL(
  './fixtures/profile/slow-reading.mjs',
  import.meta.url,
)

const fixture = (name: string) =>
  readFile(new URL(`./fixtures/profile/${name}`, import.meta.url))

/**
 * A PDF whose text is `text` in lines of 100 characters, 150 lines a page,
 * with a correct cross-reference.
 */
function pdfWithText(text: string): Buffer {
  const lines = text.match(/.{1,100}/g) ?? []
  const pages: string[] = []
  for (let i = 0; i < lines.length; i += 150)
    pages.push(
      `BT /F1 4 Tf 5 TL 10 780 Td ${lines
        .slice(i, i + 150)
        .map((line) => `(${line}) Tj T*`)
        .join(' ')} ET`,
    )
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, p) => `${4 + 2 * p} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...pages.flatMap((stream, p) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * p} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ]),
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets)
    body += `${String(offset).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

type ImportRow = {
  id: string
  status: string
  error: string | null
  source_text: string | null
  updated_at: Date
}

type JobRow = {
  id: string
  name: string
  state: string
  retry_count: number
  singleton_key: string | null
  started_on: Date | null
  completed_on: Date | null
}

integration('reading a CV text through the queue and worker libraries', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16),
    schema = `cvread_${suffix}`,
    queueSchema = `cvread_q_${suffix}`
  const previousQueueSchema = process.env.PG_BOSS_SCHEMA
  let admin: Pool, pool: Pool, boss: PgBoss, root: string, url: string
  const workers: { child: ChildProcess; output: () => string }[] = []

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    const connection = new URL(process.env.DATABASE_URL!)
    connection.searchParams.set('options', `-c search_path=${schema}`)
    url = connection.toString()
    pool = new Pool({ connectionString: url, max: 5 })
    const sql: string[] = []
    createRequire(import.meta.url)(
      '../migrations/1770000000004_profiles.cjs',
    ).up({
      sql: (s: string) => sql.push(s),
    })
    await pool.query(sql.join('\n'))
    await pool.query(`CREATE TABLE service_heartbeats (
      service text PRIMARY KEY,
      last_seen timestamptz NOT NULL DEFAULT now()
    )`)
    setPool(pool)
    await prepareCvTextQueue(queueSchema)
    process.env.PG_BOSS_SCHEMA = queueSchema
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: queueSchema,
      supervise: false,
      schedule: false,
    })
    boss.on('error', () => {})
    await boss.start()
    root = await mkdtemp(join(tmpdir(), 'cv-reading-'))
  }, 60_000)

  afterAll(async () => {
    for (const worker of workers) await kill(worker.child)
    await boss?.stop({ graceful: false })
    await stopQueues()
    if (previousQueueSchema === undefined) delete process.env.PG_BOSS_SCHEMA
    else process.env.PG_BOSS_SCHEMA = previousQueueSchema
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
    if (root) await rm(root, { recursive: true, force: true })
  }, 60_000)

  async function kill(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGKILL')
    await once(child, 'exit')
  }

  /** Starts a worker of the repository's plugins on the test schemas. */
  async function startWorker() {
    let output = ''
    const child = spawn(process.execPath, ['--import', 'tsx', workerEntry], {
      env: {
        ...process.env,
        DATABASE_URL: url,
        PG_BOSS_SCHEMA: queueSchema,
        DOCUMENTS_DIR: root,
        WORKER_POOL_SIZE: undefined,
        NODE_OPTIONS:
          `${process.env.NODE_OPTIONS ?? ''} --import=${slowReading.href}`.trim(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout!.on('data', (chunk) => (output += chunk))
    child.stderr!.on('data', (chunk) => (output += chunk))
    const worker = { child, output: () => output }
    workers.push(worker)
    await waitFor(
      async () => {
        if (child.exitCode !== null) throw new Error(`Worker exited: ${output}`)
        return output.includes('Worker ready')
      },
      30_000,
      'the worker to be ready',
    )
    return worker
  }

  const importOf = async (id: string): Promise<ImportRow> =>
    (
      await pool.query(
        'SELECT id,status,error,source_text,updated_at FROM profile_imports WHERE id=$1',
        [id],
      )
    ).rows[0]

  const jobsOf = async (id: string, name = queue): Promise<JobRow[]> =>
    (
      await admin.query(
        `SELECT id,name,state,retry_count,singleton_key,started_on,completed_on
         FROM ${queueSchema}.job WHERE name=$1 AND data->>'importId'=$2
         ORDER BY created_on`,
        [name, id],
      )
    ).rows

  const statusBecomes = (id: string, status: string, timeoutMs = 60_000) =>
    waitFor(
      async () => {
        const row = await importOf(id)
        return row.status === status && row
      },
      timeoutMs,
      `import ${id} to become ${status}`,
    )

  const jobCompleted = (id: string, name = queue) =>
    waitFor(
      async () =>
        (await jobsOf(id, name)).find((job) => job.state === 'completed'),
      60_000,
      `the ${name} job of import ${id} to complete`,
    )

  /** An import row in a given state, with its original stored. */
  async function storedImport(status: string, sourceText: string | null) {
    const id = randomUUID(),
      bytes = await fixture('text.pdf'),
      pathKey = `${id}.pdf`
    await writeFile(join(root, pathKey), bytes)
    await pool.query(
      `INSERT INTO profile_imports(id,kind,original_name,byte_size,sha256,path_key,status,source_text)
       VALUES($1,'pdf','cv.pdf',$2,$3,$4,$5,$6)`,
      [id, bytes.length, digest(bytes), pathKey, status, sourceText],
    )
    return id
  }

  it('stores a valid PDF and leaves the CV queued with a reading job in the queue (B4-AC01)', async () => {
    const bytes = await fixture('text.pdf'),
      id = await importCvDocument('cv.pdf', bytes, root)
    expect((await importOf(id)).status).toBe('queued')
    expect((await readOriginalFile(id, root))?.bytes).toEqual(bytes)
    expect(await jobsOf(id)).toMatchObject([
      { state: 'created', singleton_key: queue },
    ])
  })

  it('marks the CV failed with the message and returns an error when the original cannot be stored or the job cannot be requested (B4-AC01)', async () => {
    const bytes = await fixture('text.pdf')
    const blocked = join(root, 'not-a-directory')
    await writeFile(blocked, 'a file where the storage directory should be')
    await expect(importCvDocument('cv.pdf', bytes, blocked)).rejects.toThrow(
      'Document storage failed',
    )
    const failedRows = async () =>
      (
        await pool.query(
          "SELECT id,error FROM profile_imports WHERE status='failed' ORDER BY created_at",
        )
      ).rows
    expect(await failedRows()).toMatchObject([{ error: notAccepted }])

    // Without its queue the request is refused (B1-R05), and marking the
    // import queued is rolled back with it. A new connection sees the
    // queue's removal.
    await stopQueues()
    await boss.deleteQueue(queue)
    try {
      await expect(importCvDocument('cv.pdf', bytes, root)).rejects.toThrow(
        'Document storage failed',
      )
    } finally {
      await stopQueues()
      await prepareCvTextQueue(queueSchema)
    }
    const failed = await failedRows()
    expect(failed).toMatchObject([
      { error: notAccepted },
      { error: notAccepted },
    ])
    expect(await jobsOf(failed[1].id)).toEqual([])
    expect((await readOriginalFile(failed[1].id, root))?.bytes).toEqual(bytes)
  }, 60_000)

  describe('with the worker', () => {
    // Prepared before the worker starts, so it finds them as they are.
    let removed: string,
      changed: string,
      leftExtracting: string,
      readyWithJob: ImportRow
    let worker: Awaited<ReturnType<typeof startWorker>>

    beforeAll(async () => {
      const bytes = await fixture('text.pdf')
      removed = await importCvDocument('removed.pdf', bytes, root)
      changed = await importCvDocument('changed.pdf', bytes, root)
      await rm(join(root, `${removed}.pdf`))
      await writeFile(join(root, `${changed}.pdf`), 'changed')
      // A reading whose attempt was lost left the CV extracting; its job
      // is taken again.
      leftExtracting = await importCvDocument('left.pdf', bytes, root)
      await pool.query(
        "UPDATE profile_imports SET status='extracting' WHERE id=$1",
        [leftExtracting],
      )
      const ready = await importCvText('Senior PHP developer')
      await sendJob(cvTextReadingJob, { importId: ready })
      readyWithJob = await importOf(ready)
      worker = await startWorker()
    }, 60_000)

    it('reads a valid PDF and DOCX and the CV becomes ready with its text (B4-AC02)', async () => {
      for (const name of ['text.pdf', 'text.docx']) {
        const id = await importCvDocument(name, await fixture(name), root)
        const row = await statusBecomes(id, 'ready')
        expect(row.source_text).toMatch(/PHP/)
        expect(row.error).toBeNull()
      }
    }, 120_000)

    it('gives text needed with the message for a file without text and for a text over 120 000 characters (B4-AC02)', async () => {
      const scan = await importCvDocument(
        'scan.pdf',
        await fixture('scan.pdf'),
        root,
      )
      const long = await importCvDocument(
        'long.pdf',
        pdfWithText('a'.repeat(120_001)),
        root,
      )
      // The same document under the limit is read.
      const fits = await importCvDocument(
        'fits.pdf',
        pdfWithText('a'.repeat(110_000)),
        root,
      )
      for (const id of [scan, long])
        expect(await statusBecomes(id, 'needs_text')).toMatchObject({
          error: textNeeded,
          source_text: null,
        })
      expect(
        (await statusBecomes(fits, 'ready')).source_text!.replace(/\s/g, ''),
      ).toHaveLength(110_000)
    }, 120_000)

    it('gives text needed with the message for a reading over 30 s (B4-AC02)', async () => {
      const bytes = Buffer.concat([
        await fixture('text.pdf'),
        Buffer.from('%SLOW-READING\n'),
      ])
      const id = await importCvDocument('slow.pdf', bytes, root)
      await statusBecomes(id, 'extracting', 30_000)
      const started = Date.now()
      expect(await statusBecomes(id, 'needs_text', 60_000)).toMatchObject({
        error: textNeeded,
      })
      expect(Date.now() - started).toBeGreaterThanOrEqual(25_000)
      // The reading ended within its attempt, which completed.
      expect(await jobsOf(id)).toMatchObject([
        { state: 'completed', retry_count: 0 },
      ])
    }, 120_000)

    it('gives source file missing with the message when the stored original was removed or changed (B4-AC03)', async () => {
      for (const id of [removed, changed])
        expect(await statusBecomes(id, 'source_missing')).toMatchObject({
          error: sourceMissing,
        })
    }, 120_000)

    it('reads a CV left as being read by a lost attempt to ready, and a job for a ready CV changes nothing (B4-AC04)', async () => {
      expect(
        (await statusBecomes(leftExtracting, 'ready')).source_text,
      ).toMatch(/PHP/)
      await jobCompleted(readyWithJob.id)
      expect(await importOf(readyWithJob.id)).toEqual(readyWithJob)
    }, 120_000)

    it('reads two CVs requested at once one after the other (B4-AC04)', async () => {
      const bytes = await fixture('text.pdf')
      const ids = await Promise.all([
        importCvDocument('first.pdf', bytes, root),
        importCvDocument('second.pdf', bytes, root),
      ])
      for (const id of ids) await statusBecomes(id, 'ready')
      const [first, second] = (
        await Promise.all(ids.map((id) => jobCompleted(id)))
      ).sort((a, b) => a.started_on!.getTime() - b.started_on!.getTime())
      // The worker runs two jobs at once, yet the second reading started
      // only after the first one ended.
      expect(second!.started_on!.getTime()).toBeGreaterThanOrEqual(
        first!.completed_on!.getTime(),
      )
    }, 120_000)

    it('the failure handler leaves a CV that became ready in between unchanged (B4-AC05)', async () => {
      const id = await importCvText('Senior PHP developer')
      const before = await importOf(id)
      await boss.send(failureQueue, { importId: id })
      await jobCompleted(id, failureQueue)
      expect(await importOf(id)).toEqual(before)
    }, 120_000)

    it('carries the CVs queued or being read over to the new queue at the migration step and reads them, leaving CVs in other states and a second run unchanged (B4-AC08)', async () => {
      const queued = await storedImport('queued', null),
        extracting = await storedImport('extracting', null)
      const others = await Promise.all(
        [
          ['receiving', null],
          ['ready', 'Senior PHP developer'],
          ['needs_text', null],
          ['source_missing', null],
          ['failed', null],
        ].map(([status, text]) => storedImport(status!, text!)),
      )
      const before = await Promise.all(others.map(importOf))
      // The queue of the former path, with a job waiting in it.
      await boss.createQueue('profile-parse', {
        retryLimit: 0,
        expireInSeconds: 120,
      })
      await boss.send('profile-parse', { importId: queued })

      const carryOver = () =>
        promisify(execFile)(
          process.execPath,
          ['--import', 'tsx', 'scripts/carry-over-jobs.ts'],
          {
            env: {
              ...process.env,
              DATABASE_URL: url,
              PG_BOSS_SCHEMA: queueSchema,
            },
          },
        )
      // Every CV queued or being read, also one left by an earlier test whose
      // job was removed with its queue.
      const unfinished = (
        await pool.query(
          "SELECT id FROM profile_imports WHERE status IN ('queued','extracting')",
        )
      ).rows.map((row) => row.id as string)
      expect(unfinished).toEqual(expect.arrayContaining([queued, extracting]))
      expect((await carryOver()).stdout).toContain(
        `Carried ${unfinished.length} jobs over from queue "profile-parse"`,
      )
      expect(await boss.getQueue('profile-parse')).toBeFalsy()
      for (const id of unfinished) {
        expect((await statusBecomes(id, 'ready')).source_text).toMatch(/PHP/)
        expect(await jobsOf(id)).toHaveLength(1)
      }
      for (const id of others) expect(await jobsOf(id)).toEqual([])
      expect(await Promise.all(others.map(importOf))).toEqual(before)

      // The former queue is gone, so a second run carries nothing over.
      expect((await carryOver()).stdout).not.toContain('Carried')
    }, 120_000)

    it('gives text needed with the message when both attempts fail, the last one by a killed worker (B4-AC05)', async () => {
      const bytes = Buffer.concat([
        await fixture('text.pdf'),
        Buffer.from('%SLOW-READING\n'),
      ])
      const id = await importCvDocument('killed.pdf', bytes, root)
      const attempt = (retryCount: number) =>
        waitFor(
          async () =>
            (await jobsOf(id)).find(
              (job) => job.state === 'active' && job.retry_count === retryCount,
            ),
          120_000,
          `attempt ${retryCount + 1} of import ${id} to run`,
        )

      // The first attempt is lost with its worker; the queue gives the job
      // to the next worker, whose attempt takes the reading over.
      await attempt(0)
      await kill(worker.child)
      worker = await startWorker()
      await attempt(1)
      expect((await importOf(id)).status).toBe('extracting')
      // The last attempt is lost too: the failure handler ends the reading.
      await kill(worker.child)
      worker = await startWorker()
      expect(await statusBecomes(id, 'needs_text', 150_000)).toMatchObject({
        error: textNeeded,
      })
      expect(await jobsOf(id)).toMatchObject([
        { state: 'failed', retry_count: 1 },
      ])
      await jobCompleted(id, failureQueue)
    }, 360_000)
  })
})
