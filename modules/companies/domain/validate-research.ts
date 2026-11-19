import { safeSourceUrl } from '../../ai/index.ts'
import {
  hasSourcedFindings,
  NoResearchFindings,
  researchDraft,
  researchTopics,
  type ResearchEvidence,
  type ResearchReport,
} from './research-report.ts'

// The agent supplies the evidence units with their URLs; the draft may only reference those units.
export function validateResearch(
  value: unknown,
  evidence: ResearchEvidence[],
): ResearchReport {
  const draft = researchDraft.parse(value)
  if (
    researchTopics.some((topic) => !draft.claims.some((c) => c.topic === topic))
  )
    throw new Error('Missing topic')
  const report: ResearchReport = {
    identity: draft.identity,
    claims: draft.claims.map((claim) => {
      if (['fact', 'opinion'].includes(claim.kind) && !claim.evidence.length)
        throw new Error('Missing evidence')
      const sources = claim.evidence.flatMap((ref) => {
        const unit = evidence.find((e) => e.id === ref.id)
        if (
          !unit ||
          !unit.text.includes(ref.quote) ||
          !unit.sources.length ||
          // The safe source rule of AI's materials, read from its owner.
          // ASSUMPTION(oferty-pracy-0mq.22/ASM-5)
          unit.sources.some((s) => !safeSourceUrl(s.url))
        )
          throw new Error('Invalid evidence')
        return unit.sources
      })
      return {
        topic: claim.topic,
        kind: claim.kind,
        scope: claim.scope,
        text: claim.text,
        sources: [...new Map(sources.map((s) => [s.url, s])).values()],
      }
    }),
  }
  if (!hasSourcedFindings(report))
    throw new NoResearchFindings('No sourced findings')
  return report
}
