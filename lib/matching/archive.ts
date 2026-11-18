import { createHash } from 'node:crypto'
import type { Pool } from 'pg'
import type { QueryExecutor } from '../db.ts'
import type { BatchArchive } from './batch.ts'

// Kept outside normal API history/logs: these artifacts contain professional
// profile data and complete provider output, as requested by the owner.
export function batchArchive(
  pool: QueryExecutor,
  operationId: string,
): BatchArchive {
  return async (kind, key, content) => {
    const digest = createHash('sha256').update(content).digest('hex')
    await pool.query(
      `INSERT INTO matching_batch_artifacts(operation_id,kind,artifact_key,sha256,content)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [operationId, kind, key, digest, content],
    )
  }
}

export async function readBatchArchive(pool: Pool, requestId: string) {
  const request = (
    await pool.query('SELECT id,group_id FROM matching_requests WHERE id=$1', [
      requestId,
    ])
  ).rows[0]
  if (!request) return null
  const operationId = request.group_id ?? request.id
  const artifacts = (
    await pool.query(
      'SELECT kind,artifact_key,sha256,content,created_at FROM matching_batch_artifacts WHERE operation_id=$1 ORDER BY created_at,kind,artifact_key,sha256',
      [operationId],
    )
  ).rows
  // Older input files can be reconstructed from the immutable saved payloads.
  // Explicitly distinguish this from a byte-for-byte archived upload.
  let reconstructedInput: string | null = null
  if (!artifacts.some((a) => a.kind === 'input')) {
    const rows = (
      await pool.query(
        'SELECT id,request_payload FROM matching_requests WHERE (id=$1 OR group_id=$1) AND request_payload IS NOT NULL ORDER BY id',
        [operationId],
      )
    ).rows
    if (rows.length)
      reconstructedInput =
        rows
          .map((row) =>
            JSON.stringify({
              custom_id: row.id,
              method: 'POST',
              url: '/v1/responses',
              body: row.request_payload,
            }),
          )
          .join('\n') + '\n'
  }
  return { operationId, artifacts, reconstructedInput }
}
