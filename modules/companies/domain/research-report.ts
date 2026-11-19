import { z } from 'zod'
import type { AgentMaterial, AgentSource } from '../../ai/index.ts'
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
