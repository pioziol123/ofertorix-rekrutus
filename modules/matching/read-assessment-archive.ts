import {
  readAssignmentExchange,
  readExecutionArchive,
  readLatestExecution,
} from '../ai/index.ts'
import {
  legacyPayloads,
  requestAssignment,
} from './infrastructure/persistence/assessment-requests.ts'

/**
 * The diagnostic record of what a request's assessment sent to the
 * provider and what came back. For an assessment with an assignment it is
 * the exchange kept with each of the assignment's operations, read through
 * the AI module's exchange read (T8-R07); for one of the old way, the
 * archive of the provider batch or single call its latest AI work was sent
 * in. Both contain professional profile data and complete provider output,
 * so they stay outside the normal history and logs, as requested by the
 * owner. Null for an unknown request.
 */
export async function readBatchArchive(requestId: string) {
  const request = await requestAssignment(requestId)
  if (!request) return null
  if (request.assignmentId) {
    const exchange = await readAssignmentExchange(request.assignmentId)
    return {
      kind: 'exchange' as const,
      assignmentId: request.assignmentId,
      operations: exchange?.operations ?? [],
    }
  }
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
    kind: 'batch' as const,
    operationId: archive?.archiveId ?? requestId,
    artifacts: archive?.artifacts ?? [],
    reconstructedInput: archive?.reconstructedInput ?? null,
  }
}
