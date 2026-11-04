import { requireQueued } from '../queue.ts'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile, rename, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import { tx } from './store.ts'
export const parseQueue = 'profile-parse'
export const aiQueue = 'profile-ai'
export const documentRoot = () => process.env.DOCUMENTS_DIR ?? '/data/documents'
export const digest = (data: Buffer | string) =>
  createHash('sha256').update(data).digest('hex')
function scrubPhones(text: string): string {
  // Dates are common in CVs. Keep them separate so a phone match cannot
  // consume a date range or join it to a number in the preceding company name.
  const dates =
    /(?<![\p{L}\p{N}])((?:\d{4}[-/]\d{2}[-/]\d{2}|(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-]\d{4}|(?:0?[1-9]|1[0-2])[./-]\d{4}))(?![\p{L}\p{N}])/gu
  return text
    .split(dates)
    .map((part, index) =>
      index % 2
        ? part
        : part.replace(
            /(?<![\p{L}\p{N}])\+?\d(?:[\t ().-]*\d){8,14}(?![\p{L}\p{N}])/gu,
            '[numer usunięty]',
          ),
    )
    .join('')
}
export function scrubContacts(text: string): string {
  return scrubPhones(text)
    .replace(
      /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      '[e-mail usunięty]',
    )
    .replace(
      /^.*(?:adres zamieszkania|address:|data urodzenia|date of birth|pesel).*$/gim,
      '[dane osobowe usunięte]',
    )
}
export function validateDocument(name: string, bytes: Buffer): 'pdf' | 'docx' {
  if (bytes.length > 10 * 1024 * 1024 || !bytes.length)
    throw new Error('Invalid document size')
  if (/\.pdf$/i.test(name) && bytes.subarray(0, 5).toString() === '%PDF-')
    return 'pdf'
  if (
    /\.docx$/i.test(name) &&
    bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
  )
    return 'docx'
  throw new Error('Only PDF and DOCX are supported')
}
export async function createTextImport(pool: Pool, text: string) {
  if (!text.trim() || text.length > 120000)
    throw new Error('Text must contain 1–120000 characters')
  const id = randomUUID()
  await pool.query(
    `INSERT INTO profile_imports(id,kind,status,source_text,sha256) VALUES($1,'text','ready',$2,$3)`,
    [id, text, digest(text)],
  )
  return id
}
export async function createFileImport(
  pool: Pool,
  boss: PgBoss,
  name: string,
  bytes: Buffer,
  root = documentRoot(),
) {
  const kind = validateDocument(name, bytes),
    id = randomUUID(),
    key = `${id}.${kind}`,
    hash = digest(bytes)
  // Strip control characters and separators from the download filename.
  // eslint-disable-next-line no-control-regex
  const safeName = name.replace(/[\r\n\x00-\x1f/\\]/g, '_').slice(0, 200)
  await pool.query(
    `INSERT INTO profile_imports(id,kind,original_name,byte_size,sha256,path_key,status) VALUES($1,$2,$3,$4,$5,$6,'receiving')`,
    [id, kind, safeName, bytes.length, hash, key],
  )
  try {
    await mkdir(root, { recursive: true, mode: 0o700 })
    await writeFile(join(root, `${key}.tmp`), bytes, {
      flag: 'wx',
      mode: 0o600,
    })
    await rename(join(root, `${key}.tmp`), join(root, key))
    const client = await pool.connect()
    try {
      await tx(client, async () => {
        await client.query(
          "UPDATE profile_imports SET status='queued',updated_at=now() WHERE id=$1",
          [id],
        )
        await requireQueued(
          boss.send(
            parseQueue,
            { importId: id },
            {
              db: { executeSql: (sql, values) => client.query(sql, values) },
              retryLimit: 0,
              expireInSeconds: 120,
            },
          ),
        )
      })
    } finally {
      client.release()
    }
  } catch {
    await pool.query(
      "UPDATE profile_imports SET status='failed',error='Nie udało się przyjąć pliku. Sprawdź lokalny zapis dokumentów.' WHERE id=$1",
      [id],
    )
    throw new Error('Document storage failed')
  }
  return id
}
export async function originalFile(
  pool: Pool,
  id: string,
  root = documentRoot(),
) {
  const row = (
    await pool.query('SELECT * FROM profile_imports WHERE id=$1', [id])
  ).rows[0]
  if (!row?.path_key) return null
  if (!/^[a-f0-9-]{36}\.(pdf|docx)$/.test(row.path_key))
    throw new Error('Invalid document reference')
  let bytes: Buffer
  try {
    bytes = await readFile(join(root, row.path_key))
  } catch {
    throw new Error('Source document missing')
  }
  if (digest(bytes) !== row.sha256)
    throw new Error('Source document hash mismatch')
  return { bytes, name: String(row.original_name), kind: String(row.kind) }
}
export async function extractImport(
  pool: Pool,
  id: string,
  root = documentRoot(),
) {
  const client = await pool.connect()
  try {
    const lock = await client.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [`profile-parse-${id}`],
    )
    if (!lock.rows[0].locked) return
    try {
      const row = (
        await client.query(
          "UPDATE profile_imports SET status='extracting',updated_at=now() WHERE id=$1 AND status='queued' RETURNING *",
          [id],
        )
      ).rows[0]
      if (!row) return
      try {
        await originalFile(pool, id, root)
        const { stdout } = await promisify(execFile)(
          process.execPath,
          [
            '--max-old-space-size=256',
            '--import',
            'tsx',
            fileURLToPath(
              new URL('../../scripts/extract-cv.ts', import.meta.url),
            ),
            row.kind,
            join(root, row.path_key),
          ],
          { timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
        )
        const { text } = JSON.parse(stdout) as { text: string }
        if (!text.trim()) throw new Error('No text')
        if (text.length > 120000) throw new Error('Too long')
        await client.query(
          "UPDATE profile_imports SET status='ready',source_text=$2,error=NULL,updated_at=now() WHERE id=$1",
          [id, text],
        )
      } catch {
        await client.query(
          "UPDATE profile_imports SET status='needs_text',error='Nie udało się odczytać tekstu (plik bez tekstu, uszkodzony, zablokowany lub przekroczony limit). Wklej tekst CV; oryginał jest zachowany.',updated_at=now() WHERE id=$1",
          [id],
        )
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
        `profile-parse-${id}`,
      ])
    }
  } finally {
    client.release()
  }
}
export async function recoverImports(pool: Pool, boss: PgBoss) {
  const candidates = await pool.query(
    "SELECT id,status,path_key,sha256 FROM profile_imports WHERE status IN ('receiving','queued','extracting') AND updated_at<now()-interval '3 minutes'",
  )
  for (const row of candidates.rows) {
    const client = await pool.connect()
    try {
      const lock = await client.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [`profile-parse-${row.id}`],
      )
      if (!lock.rows[0].locked) continue
      try {
        try {
          await originalFile(pool, row.id)
        } catch {
          await client.query(
            "UPDATE profile_imports SET status='source_missing',error='Brak poprawnego pliku źródłowego',updated_at=now() WHERE id=$1",
            [row.id],
          )
          continue
        }
        await tx(client, async () => {
          await client.query(
            "UPDATE profile_imports SET status='queued',updated_at=now() WHERE id=$1",
            [row.id],
          )
          await requireQueued(
            boss.send(
              parseQueue,
              { importId: row.id },
              {
                db: { executeSql: (sql, values) => client.query(sql, values) },
                retryLimit: 0,
                expireInSeconds: 120,
              },
            ),
          )
        })
      } finally {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
          `profile-parse-${row.id}`,
        ])
      }
    } finally {
      client.release()
    }
  }
}
