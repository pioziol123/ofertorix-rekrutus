import type { Pool } from 'pg'
import {
  readExecutionArchive,
  readLatestExecution,
} from '../../modules/ai/index.ts'

/**
 * The diagnostic archive of a request's assessment, read through AI: the
 * provider batch its latest AI work was sent in. The artefacts contain
 * professional profile data and complete provider output, so they stay
 * outside the normal history and logs, as requested by the owner.
 */
export async function readBatchArchive(pool: Pool, requestId: string) {
  const request = (
    await pool.query<{ id: string }>(
      'SELECT id FROM matching_requests WHERE id=$1',
      [requestId],
    )
  ).rows[0]
  if (!request) return null
  const execution = await readLatestExecution(request.id)
  const archive = execution ? await readExecutionArchive(execution.id) : null
  const operationId = archive?.archiveId ?? request.id
  const artifacts = archive?.artifacts ?? []
  // Inputs of requests sent before the archive kept them can be
  // reconstructed from the immutable payloads those requests saved.
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
