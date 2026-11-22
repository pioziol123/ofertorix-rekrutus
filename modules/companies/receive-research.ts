import type {
  AgentMaterial,
  ExecutionCause,
  ReceiverDecision,
} from '../ai/index.ts'
import { NoResearchFindings } from './domain/research-report.ts'
import { validateResearch } from './domain/validate-research.ts'
import {
  endMessage,
  failedAssignmentMessage,
  rejectionMessage,
  type ResearchRejection,
} from './domain/research-outcome.ts'
import {
  lockAssignmentResearch,
  lockResearch,
  saveResearchOutcome,
} from './infrastructure/persistence/research-records.ts'

/**
 * Validates a report draft's sources, quotes and coverage against the
 * evidence the agent gathered, and publishes it, or saves the owner's
 * message of the rule it broke. The caller holds the lock on the research.
 * The previous report of the company stays available whatever happens.
 */
async function validateAndPublish(
  researchId: string,
  draft: unknown,
  evidence: AgentMaterial[],
): Promise<ReceiverDecision> {
  let report
  try {
    report = validateResearch(draft, evidence)
  } catch (error) {
    const reason: ResearchRejection =
      error instanceof NoResearchFindings
        ? 'no_sourced_findings'
        : 'invalid_report'
    await saveResearchOutcome(researchId, {
      report: null,
      error: rejectionMessage(reason),
    })
    return { accepted: false, reason }
  }
  await saveResearchOutcome(researchId, { report, error: null })
  return { accepted: true }
}

/**
 * Takes the result of a research's assignment (T9-R02): validates the
 * report and its sources by Companies' own rules and publishes it, or ends
 * the research as failed with the message of the rule it broke; either way
 * the assignment succeeds. A research whose outcome is already saved, or
 * no research of the assignment, changes nothing, so a repeated call has
 * no further effect (T6-R09). Runs in the caller's transaction.
 */
export async function takeResearchResult(
  assignmentId: string,
  draft: unknown,
  evidence: AgentMaterial[],
): Promise<void> {
  const research = await lockAssignmentResearch(assignmentId)
  if (!research || research.ended) return
  await validateAndPublish(research.id, draft, evidence)
}

/**
 * Ends the research of a failed assignment as failed (T9-R02), with the
 * message for a failed assignment, so a new research of the company can be
 * requested; the previous report stays available. Like the result, it
 * changes only a research whose outcome is not saved yet. Runs in the
 * caller's transaction.
 */
export async function endFailedResearch(assignmentId: string): Promise<void> {
  const research = await lockAssignmentResearch(assignmentId)
  if (!research || research.ended) return
  await saveResearchOutcome(research.id, {
    report: null,
    error: failedAssignmentMessage,
  })
}

/**
 * Takes over the report draft of a research of the old way, validated and
 * published as a result of an assignment is. Runs in AI's delivery
 * transaction, so the publication and the settlement commit together, and
 * may run again with the same draft: the research is locked, and a report
 * already published for it is not published again.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-3): the evidence is the materials AI
 * delivers with the result of agent work.
 */
export async function recordResearchResult(
  researchId: string,
  draft: unknown,
  evidence: AgentMaterial[],
): Promise<ReceiverDecision> {
  const research = await lockResearch(researchId)
  if (!research) return { accepted: false, reason: 'unknown_research' }
  if (research.published) return { accepted: true }
  return validateAndPublish(researchId, draft, evidence)
}

/**
 * Records that the AI work of a research of the old way ended without a
 * report, with the owner's message chosen from the state and cause alone.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-2)
 */
export async function recordResearchEnd(
  researchId: string,
  end: { state: 'failed' | 'uncertain'; cause: ExecutionCause },
): Promise<void> {
  if (!(await lockResearch(researchId))) return
  await saveResearchOutcome(researchId, {
    report: null,
    error: endMessage(end),
  })
}
