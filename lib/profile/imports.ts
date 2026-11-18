import { requireQueued } from '../queue.ts'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Pool } from 'pg'
import type { QueryExecutor } from '../db.ts'
import type { PgBoss } from 'pg-boss'
import { tx } from './store.ts'
export const parseQueue = 'profile-parse'
export const documentRoot = () => process.env.DOCUMENTS_DIR ?? '/data/documents'
export const digest = (data: Buffer | string) =>
  createHash('sha256').update(data).digest('hex')
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
export async function originalFile(
  pool: QueryExecutor,
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
