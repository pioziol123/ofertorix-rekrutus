import { createHash } from 'node:crypto'
import { z } from 'zod'
import { transaction } from '../../lib/db.ts'
import { AssignmentError, readExecutionHistory } from '../ai/index.ts'
import { assessmentsConfigured } from './infrastructure/adapters/assessment-ai.ts'
import {
  assessmentState,
  assignedAssessmentState,
  assignmentRefusalMessage,
  notConfiguredMessage,
} from './domain/assessment-state.ts'
import {
  requestedWith,
  requestedWithIds,
  requestsOfAd,
  lockCommand,
  type CommandRequest,
} from './infrastructure/persistence/assessment-requests.ts'
import {
  activeProfileVersion,
  adsForAssessment,
} from './read-assessment-inputs.ts'
import {
  MatchingError,
  placePrepared,
  prepareMatching,
} from './request-assessment.ts'
import {
  matchingPending,
  type MatchingState,
} from './domain/assessment-view.ts'
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
 * The identifier a group command gives the request it saves for an offer
 * that needs AI work: derived from the command and the offer (a name-based
 * UUID, version 5 layout), so a repeat of the command finds its requests
 * in Matching's own data.
 * ASSUMPTION(oferty-pracy-sq2.9/ASM-1): with no AI group any more, these
 * identifiers stand in for the group that recognised a repeated command.
 * FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): Matching does not record a
 * command, so its requests stand in for that record.
 */
export function commandRequestId(commandId: string, offerId: string): string {
  const hash = createHash('sha1')
    .update(`matching-command:${commandId}:${offerId}`)
    .digest()
  hash[6] = (hash[6]! & 0x0f) | 0x50
  hash[8] = (hash[8]! & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** The state of a request a command saved with its assignment. */
const commandRequestState = (
  request: Pick<CommandRequest, 'assessed' | 'ended'>,
) =>
  assignedAssessmentState({
    assessment: request.assessed,
    message: request.ended && !request.assessed,
  })

/**
 * The state of a group: the stage of the work still in progress, otherwise
 * completed (its results were collected; each item has its own outcome).
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
 * The item a repeated command had for an offer outside the requests it
 * saved with AI work, when the command's transaction can be told from the
 * data: an excluded request saved at the moment of the command (a
 * transaction saves every row with its start time), or a request whose AI
 * work was in progress at that moment (the command reused it). Null when
 * there is none.
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
    if (request.assignment_id) {
      // In progress until its outcome was saved (T8-R04).
      if (!request.ended || request.updated_at.getTime() >= acceptedAt)
        return {
          id: request.id,
          offerId,
          state: commandRequestState(request),
          reused: true,
        }
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
 * The requests with AI work a command saved, found from Matching's own
 * requests: a request of a selected offer with the identifier the command
 * gives it, and every request saved in the same transaction with the
 * identifier the command gives its offer. Null when no selected offer has
 * one.
 * FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): Matching does not record a
 * command, so its requests stand in for that record.
 * ASSUMPTION(oferty-pracy-sq2.9/ASM-1)
 */
async function commandGroup(commandId: string, offerIds: string[]) {
  const [anchor] = await requestedWithIds(
    offerIds.map((offerId) => commandRequestId(commandId, offerId)),
  )
  if (!anchor) return null
  const saved = await requestedWith(anchor.id)
  return {
    acceptedAt: anchor.created_at.getTime(),
    requests: saved.filter(
      (request) => request.id === commandRequestId(commandId, request.ad_id),
    ),
  }
}

/**
 * The view of a group command already accepted: the requests it saved
 * with AI work, and the offers it reused or excluded. A selection is a
 * conflict when the command saved a request for an offer it does not
 * name, or when it names an offer the command did not reuse or exclude.
 * FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): the interim check of a selection
 * and the interim items of a repeat. A changed selection is accepted as a
 * repeat when it differs only in offers outside those requests: it may
 * drop an offer the command reused or excluded, or add an offer whose
 * assessment was in progress when the command was accepted (shown as
 * reused). Neither requests AI work.
 */
async function acceptedGroup(
  groupId: string,
  group: NonNullable<Awaited<ReturnType<typeof commandGroup>>>,
  offerIds: string[],
) {
  const { acceptedAt, requests } = group
  if (requests.some((request) => !offerIds.includes(request.ad_id)))
    throw new MatchingError(otherOffers)
  const items: Item[] = requests.map((request) => ({
    id: request.id,
    offerId: request.ad_id,
    state: commandRequestState(request),
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
 * Requests the assessments of several offers (up to 100) in one save: one
 * single-answer assignment per offer that needs AI work, each funded on
 * its own by the AI module; all are placed or none (T8-R01, T8-R02). An
 * offer whose assessment is still in progress keeps it, and an offer whose
 * required conditions conflict is excluded. A repeat of the command is
 * recognised from the requests it saved, so the same command is accepted
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
      // FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): the requests the command saved
      // with AI work are the only record that it was accepted. A command
      // that requested no AI work leaves none, and its repeat is handled as
      // a new command.
      const accepted = await commandGroup(command.commandId, ids)
      if (accepted) return acceptedGroup(command.commandId, accepted, ids)
      if (!assessmentsConfigured())
        throw new MatchingError(notConfiguredMessage)
      if (!profile)
        throw new MatchingError('Najpierw zatwierdź profil zawodowy.')
      const items: Item[] = []
      for (const offerId of ids) {
        const prepared = await prepareMatching(
          offerId,
          profile,
          ads.get(offerId),
          'group',
          // ASSUMPTION(oferty-pracy-sq2.9/ASM-1)
          () => commandRequestId(command.commandId, offerId),
        )
        if (prepared.toRequest)
          await placePrepared(prepared.id, prepared.toRequest)
        items.push({
          id: prepared.id,
          offerId,
          state: prepared.state,
          reused: prepared.reused,
        })
      }
      return {
        groupId: command.commandId,
        state: groupState(items),
        reused: false,
        items,
      }
    })
  } catch (error) {
    if (error instanceof AssignmentError)
      throw new MatchingError(assignmentRefusalMessage(error.code, 'group'))
    throw error
  }
}
