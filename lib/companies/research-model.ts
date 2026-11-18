import { z } from 'zod'
import type { AgentMaterial, AgentSource } from '../../modules/ai/index.ts'
export const researchCommand = z
  .object({
    commandId: z.uuid().transform((v) => v.toLowerCase()),
    refresh: z.boolean(),
  })
  .strict()
export const researchTopics = [
  'activity',
  'projects',
  'work',
  'technologies',
  'risks',
] as const
export const researchTopicLabels = {
  activity: 'Działalność',
  projects: 'Produkty i projekty',
  work: 'Metody i warunki pracy',
  technologies: 'Technologie',
  risks: 'Sygnały ryzyka',
}
export const researchKindLabels = {
  fact: 'Fakt źródłowy',
  opinion: 'Opinia',
  hypothesis: 'Hipoteza',
  unknown: 'Niewiadoma',
  recommendation: 'Zalecenie',
}
export const researchScopeLabels = {
  company: 'Firma',
  project: 'Projekt',
  offer: 'Oferta',
}
export const researchDraft = z
  .object({
    identity: z.string().min(1).max(1500),
    claims: z
      .array(
        z
          .object({
            topic: z.enum(researchTopics),
            kind: z.enum([
              'fact',
              'opinion',
              'hypothesis',
              'unknown',
              'recommendation',
            ]),
            scope: z.enum(['company', 'project', 'offer']),
            text: z.string().min(1).max(1500),
            evidence: z
              .array(
                z
                  .object({
                    id: z.number().int().nonnegative(),
                    quote: z.string().min(1).max(6000),
                  })
                  .strict(),
              )
              .max(6),
          })
          .strict(),
      )
      .min(5)
      .max(30),
  })
  .strict()
export type ResearchDraft = z.infer<typeof researchDraft>
/** The company or brand a research is about, fixed when it is requested. */
export type ResearchTarget = {
  name: string
  kind: string
  website: string | null
  description: string
}
// ASSUMPTION(oferty-pracy-0mq.22/ASM-3): the evidence is the agent's materials.
/** A source of a finding, as the AI agent found it. */
export type ResearchSource = AgentSource
/** A unit of evidence the AI agent gathered; the draft cites it by id. */
export type ResearchEvidence = AgentMaterial
export type ResearchReport = {
  identity: string
  claims: (Omit<ResearchDraft['claims'][number], 'evidence'> & {
    sources: ResearchSource[]
  })[]
}
export class NoResearchFindings extends Error {}
export const hasSourcedFindings = (report: ResearchReport) =>
  report.claims.some(
    (claim) =>
      ['fact', 'opinion'].includes(claim.kind) && claim.sources.length > 0,
  )
export const safeResearchUrl = (value: string) => {
  try {
    const url = new URL(value)
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      value.length <= 3000
    )
  } catch {
    return false
  }
}
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
          unit.sources.some((s) => !safeResearchUrl(s.url))
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
