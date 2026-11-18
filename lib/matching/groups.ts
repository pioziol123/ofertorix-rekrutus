import { z } from 'zod'
import { transaction } from '../db.ts'
import {
  AiRequestError,
  readExecutionGroup,
  readExecutionHistory,
  type AiExecution,
} from '../../modules/ai/index.ts'
import {
  assessmentReservation,
  requestAssessmentGroup,
} from '../../modules/matching/infrastructure/adapters/assessment-ai.ts'
import {
  assessmentState,
  notConfiguredMessage,
  refusalMessage,
} from '../../modules/matching/domain/assessment-state.ts'
import {
  adsOfRequests,
  requestsOfAd,
  linkExecution,
  lockCommand,
} from '../../modules/matching/infrastructure/persistence/assessment-requests.ts'
import { activeProfileVersion, adsForAssessment } from './ratings.ts'
import { MatchingError, prepareMatching } from './store.ts'
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

const otherOffers =
  'Ten identyfikator zlecenia dotyczy innych ofert. Odśwież zaznaczenie.'

/**
 * The item a repeated command had for an offer outside its AI group, when
 * the command's transaction can be told from the data: an excluded request
 * saved at the moment of the command (a transaction saves every row with
 * its start time), or a request whose AI work was in progress at that
 * moment (the command reused it). Null when there is none.
 * FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): Matching does not record the full
 * selection of a command, so this stands in for comparing with it.
 */
async function itemOutsideGroup(
  offerId: string,
  acceptedAt: number,
): Promise<Item | null> {
  for (const request of await requestsOfAd(offerId)) {
    const created = request.created_at.getTime()
    if (created > acceptedAt) continue
    if (request.state === 'excluded') {
      if (created === acceptedAt)
        return { id: request.id, offerId, state: 'excluded', reused: false }
      continue
    }
    const history = await readExecutionHistory(request.id)
    const spanning = history.some(
      (execution) =>
        execution.createdAt.getTime() <= acceptedAt &&
        (execution.finishedAt === null ||
          execution.finishedAt.getTime() >= acceptedAt),
    )
    if (spanning)
      return {
        id: request.id,
        offerId,
        state: assessmentState('requested', history.at(-1) ?? null),
        reused: true,
      }
  }
  return null
}

/**
 * The view of a group command already accepted: the requests its AI group
 * holds, and the offers it reused or excluded. A selection is a conflict
 * when the group holds an offer it does not name, or when it names an
 * offer the command did not reuse or exclude.
 * FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): the interim check of a selection
 * and the interim items of a repeat.
 */
async function acceptedGroup(
  groupId: string,
  executions: AiExecution[],
  offerIds: string[],
) {
  const latest = new Map<string, AiExecution>()
  for (const execution of executions)
    latest.set(execution.operationId, execution)
  const acceptedAt = Math.min(
    ...executions.map((execution) => execution.createdAt.getTime()),
  )
  const requests = await adsOfRequests([...latest.keys()])
  if (requests.some((request) => !offerIds.includes(request.ad_id)))
    throw new MatchingError(otherOffers)
  const items: Item[] = requests.map((request) => ({
    id: request.id,
    offerId: request.ad_id,
    state: assessmentState('requested', latest.get(request.id) ?? null),
    reused: false,
  }))
  const inGroup = new Set(requests.map((request) => request.ad_id))
  for (const offerId of offerIds) {
    if (inGroup.has(offerId)) continue
    const item = await itemOutsideGroup(offerId, acceptedAt)
    if (!item) throw new MatchingError(otherOffers)
    items.push(item)
  }
  items.sort((a, b) => a.offerId.localeCompare(b.offerId))
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
      await lockCommand(command.commandId)
      // FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): the AI group of the command
      // is the only record that it was accepted; a command that requested
      // no AI work leaves none. The group read is interim code of the
      // deviation, not part of ASM-4.
      const accepted = await readExecutionGroup(command.commandId)
      if (accepted.length)
        return acceptedGroup(command.commandId, accepted, ids)
      // ASSUMPTION(oferty-pracy-0mq.21/ASM-4): the reservation read.
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
          'group',
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
    if (error instanceof AiRequestError)
      throw new MatchingError(refusalMessage(error.code, 'group'))
    throw error
  }
}
