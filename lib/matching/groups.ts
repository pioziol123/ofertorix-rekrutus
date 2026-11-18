import { z } from 'zod'
import { transaction } from '../db.ts'
import {
  AiRequestError,
  readExecutionGroup,
  readLatestExecution,
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
  latestRequestOfAd,
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
 * Whether an offer of a repeated command can have been part of it without
 * getting AI work in its group: its latest request is excluded, or its
 * latest AI work is still in progress (the command reused it).
 * FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): Matching does not record the full
 * selection of a command, so this stands in for comparing with it.
 */
async function outsideGroup(offerId: string) {
  const latest = await latestRequestOfAd(offerId)
  if (!latest) return false
  if (latest.state === 'excluded') return true
  const state = assessmentState(
    'requested',
    await readLatestExecution(latest.id),
  )
  return matchingPending.some((pending) => pending === state)
}

/**
 * The view of a group command already accepted: the requests its AI group
 * holds. A selection is a conflict when the group holds an offer it does
 * not name, or when it names an offer the group would have requested.
 * FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): the interim check of a changed
 * selection.
 */
async function acceptedGroup(
  groupId: string,
  executions: AiExecution[],
  offerIds: string[],
) {
  const latest = new Map<string, AiExecution>()
  for (const execution of executions)
    latest.set(execution.operationId, execution)
  const requests = await adsOfRequests([...latest.keys()])
  if (requests.some((request) => !offerIds.includes(request.ad_id)))
    throw new MatchingError(otherOffers)
  const inGroup = new Set(requests.map((request) => request.ad_id))
  for (const offerId of offerIds)
    if (!inGroup.has(offerId) && !(await outsideGroup(offerId)))
      throw new MatchingError(otherOffers)
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
      await lockCommand(command.commandId)
      // FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): the AI group of the command
      // is the only record that it was accepted; a command that requested
      // no AI work leaves none. ASSUMPTION(oferty-pracy-0mq.21/ASM-4): the
      // group read.
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
