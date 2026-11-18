import type {
  AgentMaterial,
  ExecutionCause,
  ReceiverDecision,
} from '../ai/index.ts'
import {
  NoResearchFindings,
  validateResearch,
} from '../../lib/companies/research-model.ts'
import {
  endMessage,
  rejectionMessage,
  type ResearchRejection,
} from './domain/research-outcome.ts'
import {
  lockResearch,
  saveResearchOutcome,
} from './infrastructure/persistence/research-records.ts'

/**
 * Takes over the report draft of a research: validates its sources,
 * quotes and coverage against the evidence the agent gathered, and
 * publishes it, or rejects it with the owner's message. Runs in AI's
 * delivery transaction, so the publication and the settlement commit
 * together, and may run again with the same draft: the research is locked,
 * and a report already published for it is not published again. The
 * previous report of the company stays available whatever happens.
 */
export async function recordResearchResult(
  researchId: string,
  draft: unknown,
  evidence: AgentMaterial[],
): Promise<ReceiverDecision> {
  const research = await lockResearch(researchId)
  if (!research) return { accepted: false, reason: 'unknown_research' }
  if (research.published) return { accepted: true }
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
 * Records that the AI work of a research ended without a report, with the
 * owner's message chosen from the state and cause alone.
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
