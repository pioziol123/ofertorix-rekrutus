import {
  readExecutionArchive,
  readLatestExecution,
} from '../../modules/ai/index.ts'
import {
  legacyPayloads,
  requestExists,
} from '../../modules/matching/infrastructure/persistence/assessment-requests.ts'

/**
 * The diagnostic archive of a request's assessment, read through AI: the
 * provider batch its latest AI work was sent in. The artefacts contain
 * professional profile data and complete provider output, so they stay
 * outside the normal history and logs, as requested by the owner.
 */
export async function readBatchArchive(requestId: string) {
  if (!(await requestExists(requestId))) return null
  const execution = await readLatestExecution(requestId)
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-4): the public archive read.
  const archive = execution ? await readExecutionArchive(execution.id) : null
  const operationId = archive?.archiveId ?? requestId
  const artifacts = archive?.artifacts ?? []
  // Inputs of requests sent before the archive kept them can be
  // reconstructed from the immutable payloads those requests saved.
  // Explicitly distinguish this from a byte-for-byte archived upload.
  let reconstructedInput: string | null = null
  if (!artifacts.some((a) => a.kind === 'input')) {
    const rows = await legacyPayloads(operationId)
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
