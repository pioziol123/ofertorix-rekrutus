import { requireQueued } from '../queue.ts'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { db, queueDatabase, transaction, type QueryExecutor } from '../db.ts'
import type { PgBoss } from 'pg-boss'
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
/**
 * Reads the text of a queued file import. Only the run that moves the
 * import from queued to extracting reads it, and its result is saved only
 * while the import is still being extracted.
 */
export async function extractImport(id: string, root = documentRoot()) {
  const row = (
    await db().query(
      "UPDATE profile_imports SET status='extracting',updated_at=now() WHERE id=$1 AND status='queued' RETURNING *",
      [id],
    )
  ).rows[0]
  if (!row) return
  try {
    await originalFile(db(), id, root)
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--max-old-space-size=256',
        '--import',
        'tsx',
        fileURLToPath(new URL('../../scripts/extract-cv.ts', import.meta.url)),
        row.kind,
        join(root, row.path_key),
      ],
      { timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
    )
    const { text } = JSON.parse(stdout) as { text: string }
    if (!text.trim()) throw new Error('No text')
    if (text.length > 120000) throw new Error('Too long')
    await db().query(
      "UPDATE profile_imports SET status='ready',source_text=$2,error=NULL,updated_at=now() WHERE id=$1 AND status='extracting'",
      [id, text],
    )
  } catch {
    await db().query(
      "UPDATE profile_imports SET status='needs_text',error='Nie udało się odczytać tekstu (plik bez tekstu, uszkodzony, zablokowany lub przekroczony limit). Wklej tekst CV; oryginał jest zachowany.',updated_at=now() WHERE id=$1 AND status='extracting'",
      [id],
    )
  }
}
/**
 * Queues again the file imports that have not moved for 3 minutes. Each
 * one changes only from the state and moment recovery read, so two
 * recoveries queue it once.
 */
export async function recoverImports(boss: PgBoss) {
  const candidates = await db().query(
    "SELECT id,status,updated_at::text AS seen FROM profile_imports WHERE status IN ('receiving','queued','extracting') AND updated_at<now()-interval '3 minutes'",
  )
  for (const row of candidates.rows) {
    const unchanged = 'id=$1 AND status=$2 AND updated_at=$3::timestamptz'
    try {
      await originalFile(db(), row.id)
    } catch {
      await db().query(
        `UPDATE profile_imports SET status='source_missing',error='Brak poprawnego pliku źródłowego',updated_at=now() WHERE ${unchanged}`,
        [row.id, row.status, row.seen],
      )
      continue
    }
    await transaction(async () => {
      const taken = await db().query(
        `UPDATE profile_imports SET status='queued',updated_at=now() WHERE ${unchanged}`,
        [row.id, row.status, row.seen],
      )
      if (!taken.rowCount) return
      await requireQueued(
        boss.send(
          parseQueue,
          { importId: row.id },
          { db: queueDatabase, retryLimit: 0, expireInSeconds: 120 },
        ),
      )
    })
  }
}
