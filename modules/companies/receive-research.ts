import type { AgentMaterial } from '../ai/index.ts'
import { NoResearchFindings } from './domain/research-report.ts'
import { validateResearch } from './domain/validate-research.ts'
import {
  failedAssignmentMessage,
  rejectionMessage,
  type ResearchRejection,
} from './domain/research-outcome.ts'
import {
  lockAssignmentResearch,
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
): Promise<void> {
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
    return
  }
  await saveResearchOutcome(researchId, { report, error: null })
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
