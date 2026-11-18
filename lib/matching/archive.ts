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
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-8): inputs of requests sent before
  // the archive kept them are rebuilt by AI from the immutable payloads
  // those requests saved, which only Matching reads; AI marks them as
  // reconstructed, never as the original upload.
  const archive = execution
    ? await readExecutionArchive(execution.id, async (archiveId) =>
        (await legacyPayloads(archiveId)).map((row) => ({
          itemId: row.id,
          body: row.request_payload,
        })),
      )
    : null
  return {
    operationId: archive?.archiveId ?? requestId,
    artifacts: archive?.artifacts ?? [],
    reconstructedInput: archive?.reconstructedInput ?? null,
  }
}
