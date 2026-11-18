import { z } from 'zod'
import { db, transaction } from '../db.ts'
import {
  AiRequestError,
  readExecutionGroup,
  type AiExecution,
} from '../../modules/ai/index.ts'
import {
  assessmentReservation,
  requestAssessmentGroup,
} from '../../modules/matching/infrastructure/adapters/assessment-ai.ts'
import { assessmentState } from '../../modules/matching/domain/assessment-state.ts'
import { activeProfileVersion, adsForAssessment } from './ratings.ts'
import {
  linkExecution,
  MatchingError,
  notConfiguredMessage,
  prepareMatching,
} from './store.ts'
import type { MatchingInput } from './model.ts'
import { matchingPending, type MatchingState } from './view.ts'
export const groupCommandSchema = z
  .object({
    commandId: z
      .string()
      .uuid()
      .transform((id) => id.toLowerCase()),
    offerIds: z
      .array(
        z
          .string()
          .uuid()
          .transform((id) => id.toLowerCase()),
      )
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate offers'),
  })
  .strict()
type Item = {
  id: string
  offerId: string
  state: MatchingState
  reused: boolean
}

/**
 * The state of a group: waiting for budget while its AI work waits for it,
 * the stage of the work still in progress, otherwise completed (its
 * results were collected; each item has its own outcome).
 */
function groupState(items: { state: MatchingState }[]): MatchingState {
  const pending = items.find((item) =>
    matchingPending.some((state) => state === item.state),
  )
  return pending?.state ?? 'completed'
}

/**
 * The view of a group command already accepted: the requests its AI group
 * holds. A command that names other offers than those is a conflict.
 */
async function acceptedGroup(
  groupId: string,
  executions: AiExecution[],
  offerIds: string[],
) {
  const latest = new Map<string, AiExecution>()
  for (const execution of executions)
    latest.set(execution.operationId, execution)
  const requests = (
    await db().query<{ id: string; ad_id: string }>(
      'SELECT id,ad_id FROM matching_requests WHERE id=ANY($1::uuid[]) ORDER BY id',
      [[...latest.keys()]],
    )
  ).rows
  if (requests.some((request) => !offerIds.includes(request.ad_id)))
    throw new MatchingError(
      'Ten identyfikator zlecenia dotyczy innych ofert. Odśwież zaznaczenie.',
    )
  const items: Item[] = requests.map((request) => ({
    id: request.id,
    offerId: request.ad_id,
    state: assessmentState('requested', latest.get(request.id) ?? null),
    reused: false,
  }))
  return { groupId, state: groupState(items), reused: true, items }
}

/**
 * Requests the assessments of several offers as one group: the new ones
 * become the items of one provider batch, whose budget is reserved for the
 * whole group or not at all. An offer whose assessment is still in progress
 * keeps it, and an offer whose required conditions conflict is excluded.
 * The command identifier names the group, so the same command is accepted
 * once.
 */
export async function enqueueMatchingGroup(value: unknown) {
  const command = groupCommandSchema.parse(value)
  const ids = [...command.offerIds].sort()
  // One read of the active version for the whole group, before the
  // transaction: every offer gets the same version. The ads are read in bulk
  // the same way, without a lock.
  const profile = await activeProfileVersion()
  const ads = await adsForAssessment(ids)
  try {
    return await transaction(async () => {
      await db().query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `matching-command-${command.commandId}`,
      ])
      // ASSUMPTION(oferty-pracy-0mq.21/ASM-2): the AI group of the command
      // records that it was accepted.
      const accepted = await readExecutionGroup(command.commandId)
      if (accepted.length)
        return acceptedGroup(command.commandId, accepted, ids)
      if (assessmentReservation('group') === null)
        throw new MatchingError(notConfiguredMessage)
      if (!profile)
        throw new MatchingError('Najpierw zatwierdź profil zawodowy.')
      const items: Item[] = []
      const toRequest: { requestId: string; input: MatchingInput }[] = []
      for (const offerId of ids) {
        const prepared = await prepareMatching(
          offerId,
          profile,
          ads.get(offerId),
        )
        items.push({
          id: prepared.id,
          offerId,
          state: prepared.state,
          reused: prepared.reused,
        })
        if (prepared.toRequest)
          toRequest.push({ requestId: prepared.id, input: prepared.toRequest })
      }
      if (toRequest.length) {
        const requested = await requestAssessmentGroup(
          command.commandId,
          toRequest,
        )
        for (const [index, execution] of requested.entries()) {
          const requestId = toRequest[index]!.requestId
          await linkExecution(requestId, execution.executionId)
          const item = items.find((i) => i.id === requestId)!
          item.state = execution.state
        }
      }
      return {
        groupId: command.commandId,
        state: groupState(items),
        reused: false,
        items,
      }
    })
  } catch (error) {
    if (error instanceof AiRequestError) {
      if (error.code === 'input_too_large')
        throw new MatchingError(
          'Zaznaczone oferty przekraczają limit danych partii ocen. Zaznacz mniej ofert lub zmień limit wejścia.',
        )
      throw new MatchingError(notConfiguredMessage)
    }
    throw error
  }
}
