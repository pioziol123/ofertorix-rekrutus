import { createHash } from 'node:crypto'
import { db } from '../../../../lib/db.ts'

/**
 * The diagnostic archive of provider batches: the exact files and replies
 * of each batch, kept under the key of its group. The table took its name
 * when Matching kept it; it passed to AI without a schema change.
 * The artefacts hold the input content and the complete provider output,
 * so they stay out of logs and of the execution read.
 */

export type ArchiveKind = 'input' | 'output' | 'error' | 'metadata'

export async function archiveArtifact(
  archiveId: string,
  kind: ArchiveKind,
  key: string,
  content: string,
) {
  const digest = createHash('sha256').update(content).digest('hex')
  await db().query(
    `INSERT INTO matching_batch_artifacts(operation_id,kind,artifact_key,sha256,content)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [archiveId, kind, key, digest, content],
  )
}

export type ArchivedArtifact = {
  kind: ArchiveKind
  artifact_key: string
  sha256: string
  content: string
  created_at: Date
}

export async function readArchiveArtifacts(
  archiveId: string,
): Promise<ArchivedArtifact[]> {
  return (
    await db().query<ArchivedArtifact>(
      'SELECT kind,artifact_key,sha256,content,created_at FROM matching_batch_artifacts WHERE operation_id=$1 ORDER BY created_at,kind,artifact_key,sha256',
      [archiveId],
    )
  ).rows
}
