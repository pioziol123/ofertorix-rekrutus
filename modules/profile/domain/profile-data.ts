import { z } from 'zod'
const short = z.string().trim().max(300)
const description = z.string().max(12000)
export const uuid = z.string().uuid()
const nullableDate = z
  .string()
  .regex(/^\d{4}(-(?:0[1-9]|1[0-2]))?$/)
  .nullable()
const amount = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/)
const sourceSchema = z
  .object({
    importId: uuid,
    textRevision: z.number().int().positive(),
    evidence: z.string().trim().min(1).max(4000),
  })
  .strict()
  .nullable()
export const skillSchema = z
  .object({
    id: uuid,
    name: short.min(1),
    proficiency: z
      .enum(['basic', 'intermediate', 'advanced', 'expert'])
      .nullable(),
    experience: z
      .object({ amount, unit: z.enum(['months', 'years']) })
      .nullable(),
    lastUsed: z
      .object({
        state: z.enum(['unknown', 'current', 'date']),
        date: nullableDate,
      })
      .refine((v) => (v.state === 'date' ? v.date !== null : v.date === null)),
    description,
    source: sourceSchema,
  })
  .strict()
export const experienceSchema = z
  .object({
    id: uuid,
    role: short.min(1),
    company: short,
    start: nullableDate,
    end: nullableDate,
    ongoing: z.boolean(),
    description,
    technologies: z.array(short).max(100),
    source: sourceSchema,
  })
  .strict()
  .refine((v) => !v.start || !v.end || v.start <= v.end, {
    message: 'End precedes start',
  })
export const expectationSchema = z
  .object({
    state: z.enum(['unknown', 'no_preference', 'specified']),
    importance: z.enum(['required', 'preferred']),
    value: description,
  })
  .strict()
  .refine((v) => v.state !== 'specified' || v.value.trim().length > 0)
export const expectationKeys = [
  'location',
  'workMode',
  'officeDays',
  'hours',
  'languages',
  'timeZone',
  'onCall',
  'companyType',
  'projectType',
  'polandEligibility',
] as const
const expectationFields = Object.fromEntries(
  expectationKeys.map((key) => [key, expectationSchema]),
) as Record<(typeof expectationKeys)[number], typeof expectationSchema>
export const salarySchema = z
  .object({
    state: z.enum(['unknown', 'no_preference', 'specified']),
    importance: z.enum(['required', 'preferred']),
    minimum: amount.nullable(),
    contract: short,
    currency: z.string().regex(/^$|^[A-Z]{3}$/),
    period: z.enum(['', 'Month', 'Year', 'Day', 'Hour', 'Fixed']),
    basis: z.enum(['', 'gross', 'net', 'net_plus_vat']),
  })
  .strict()
  .refine(
    (v) =>
      v.state !== 'specified' ||
      (v.minimum !== null &&
        !!v.contract &&
        !!v.currency &&
        !!v.period &&
        !!v.basis),
    { message: 'Salary needs amount, contract, currency, period and basis' },
  )
export const profileSchema = z
  .object({
    schemaVersion: z.literal(1),
    summary: description,
    skills: z.array(skillSchema).max(150),
    experience: z.array(experienceSchema).max(100),
    goals: z
      .object({
        roles: description,
        seniority: short,
        technologies: description,
        description,
      })
      .strict(),
    expectations: z.object(expectationFields).strict(),
    salary: salarySchema,
    exclusions: description,
    sources: z.array(uuid).max(100),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.skills.map((s) => s.id)).size === v.skills.length &&
      new Set(v.experience.map((e) => e.id)).size === v.experience.length,
    { message: 'Duplicate item identifiers' },
  )
export type ProfileData = z.infer<typeof profileSchema>
export function emptyProfile(): ProfileData {
  return {
    schemaVersion: 1,
    summary: '',
    skills: [],
    experience: [],
    goals: { roles: '', seniority: '', technologies: '', description: '' },
    expectations: Object.fromEntries(
      expectationKeys.map((key) => [
        key,
        { state: 'unknown', importance: 'preferred', value: '' },
      ]),
    ) as ProfileData['expectations'],
    salary: {
      state: 'unknown',
      importance: 'preferred',
      minimum: null,
      contract: '',
      currency: '',
      period: '',
      basis: '',
    },
    exclusions: '',
    sources: [],
  }
}
export function emptySkill(): ProfileData['skills'][number] {
  return {
    id: crypto.randomUUID(),
    name: '',
    proficiency: null,
    experience: null,
    lastUsed: { state: 'unknown', date: null },
    description: '',
    source: null,
  }
}
export function emptyExperience(): ProfileData['experience'][number] {
  return {
    id: crypto.randomUUID(),
    role: '',
    company: '',
    start: null,
    end: null,
    ongoing: false,
    description: '',
    technologies: [],
    source: null,
  }
}
// A proposal contains facts, never preferences, salary or an active profile.
export const factSchema = z
  .object({
    summary: z.string().max(12000).nullable(),
    skills: z
      .array(
        z
          .object({
            name: short.min(1),
            description,
            evidence: z.string().min(1).max(4000),
          })
          .strict(),
      )
      .max(150),
    experience: z
      .array(
        z
          .object({
            role: short.min(1),
            company: short,
            start: nullableDate,
            end: nullableDate,
            ongoing: z.boolean(),
            description,
            technologies: z.array(short).max(100),
            evidence: z.string().min(1).max(4000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
export type Proposal = z.infer<typeof factSchema>
export class ProposalEvidenceError extends Error {
  constructor() {
    super('Proposal evidence missing from input')
  }
}
export function checkProposal(value: unknown, text: string): Proposal {
  const proposal = factSchema.parse(value)
  // PDF extraction and model citations can differ only in whitespace. Keep
  // provenance exact by mapping the match back onto the unchanged source.
  let normalized: string | undefined
  const starts: number[] = [],
    ends: number[] = []
  for (const fact of [...proposal.skills, ...proposal.experience]) {
    if (!fact.evidence.trim()) throw new ProposalEvidenceError()
    if (text.includes(fact.evidence)) continue
    if (normalized === undefined) {
      const characters: string[] = []
      for (let i = 0; i < text.length;) {
        const start = i
        if (/\s/u.test(text[i]!)) {
          while (i < text.length && /\s/u.test(text[i]!)) i++
          characters.push(' ')
        } else characters.push(text[i++]!)
        starts.push(start)
        ends.push(i)
      }
      normalized = characters.join('')
    }
    const needle = fact.evidence.replace(/\s+/gu, ' ').trim()
    const at = needle ? normalized.indexOf(needle) : -1
    if (at < 0) throw new ProposalEvidenceError()
    fact.evidence = text.slice(starts[at], ends[at + needle.length - 1])
  }
  return factSchema.parse(proposal)
}
export function applyProposal(
  data: ProfileData,
  proposal: Proposal,
  selected: {
    skills: number[]
    experience: number[]
    summary: boolean
    skillTargets?: Record<number, string>
    experienceTargets?: Record<number, string>
  },
  importId: string,
  textRevision = 1,
): ProfileData {
  const copy = structuredClone(data)
  for (const i of selected.skills) {
    const s = proposal.skills[i]
    if (!s) throw new Error('Invalid selected skill')
    const value = {
      ...emptySkill(),
      name: s.name,
      description: s.description,
      source: { importId, textRevision, evidence: s.evidence },
    }
    const target = selected.skillTargets?.[i]
    if (target) {
      const index = copy.skills.findIndex((v) => v.id === target)
      if (index < 0) throw new Error('Missing target skill')
      copy.skills[index] = { ...value, id: target }
    } else copy.skills.push(value)
  }
  for (const i of selected.experience) {
    const e = proposal.experience[i]
    if (!e) throw new Error('Invalid selected experience')
    const { evidence: _evidence, ...fields } = e
    const value = {
      ...fields,
      id: crypto.randomUUID(),
      source: { importId, textRevision, evidence: _evidence },
    }
    const target = selected.experienceTargets?.[i]
    if (target) {
      const index = copy.experience.findIndex((v) => v.id === target)
      if (index < 0) throw new Error('Missing target experience')
      copy.experience[index] = { ...value, id: target }
    } else copy.experience.push(value)
  }
  if (selected.summary && proposal.summary !== null)
    copy.summary = proposal.summary
  copy.sources = [...new Set([...copy.sources, importId])]
  return profileSchema.parse(copy)
}
