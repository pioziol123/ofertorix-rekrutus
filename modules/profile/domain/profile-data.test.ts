import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  applyProposal,
  checkProposal,
  emptyProfile,
  emptySkill,
  profileSchema,
  ProposalEvidenceError,
} from './profile-data.ts'
import { validateDocument } from './cv-document.ts'

describe('professional profile validation and selective proposals', () => {
  const citedSkill = (evidence: string) => ({
    summary: null,
    skills: [{ name: 'PHP', description: 'Backend', evidence }],
    experience: [],
  })
  it.each(['\n', '\r\n', '\t', '\u00a0', '   '])(
    'restores exact source evidence when PDF whitespace is %j',
    (separator) => {
      const evidence = `PHP${separator}backend`,
        text = `Before: ${evidence}; after`,
        value = citedSkill('PHP backend'),
        original = structuredClone(value)
      expect(text.includes(value.skills[0]!.evidence)).toBe(false)
      const checked = checkProposal(value, text)
      expect(checked.skills[0]!.evidence).toBe(evidence)
      expect(text.includes(checked.skills[0]!.evidence)).toBe(true)
      expect(value).toEqual(original)
    },
  )
  it.each([
    'php backend',
    'PHP, backend',
    'PHP frontend',
    'No PHP backend',
    ' ',
    '\t\n',
  ])('rejects altered or empty citations %j', (evidence) => {
    expect(() => checkProposal(citedSkill(evidence), 'PHP\nbackend ')).toThrow(
      ProposalEvidenceError,
    )
  })
  it('retains exact citations and revalidates the length after whitespace restoration', () => {
    expect(
      checkProposal(citedSkill('PHP\nbackend'), 'PHP\nbackend').skills[0]!
        .evidence,
    ).toBe('PHP\nbackend')
    expect(() =>
      checkProposal(citedSkill('PHP backend'), `PHP${' '.repeat(4000)}backend`),
    ).toThrow()
  })
  it('preserves unknown skill details without inferring proficiency or duration', () => {
    const data = emptyProfile()
    data.skills.push({ ...emptySkill(), name: 'PHP' })
    expect(profileSchema.parse(data).skills[0]).toMatchObject({
      proficiency: null,
      experience: null,
      lastUsed: { state: 'unknown', date: null },
    })
  })
  it('rejects duplicate entity identities and contradictory last-used values', () => {
    const data = emptyProfile(),
      skill = { ...emptySkill(), name: 'PHP' }
    data.skills = [skill, { ...skill, name: 'Vue' }]
    expect(profileSchema.safeParse(data).success).toBe(false)
    data.skills = [{ ...skill, lastUsed: { state: 'unknown', date: '2024' } }]
    expect(profileSchema.safeParse(data).success).toBe(false)
    data.skills[0]!.lastUsed = { state: 'date', date: null }
    expect(profileSchema.safeParse(data).success).toBe(false)
  })
  it('rejects empty provenance evidence on a manually submitted draft', () => {
    const data = emptyProfile()
    data.skills = [
      {
        ...emptySkill(),
        name: 'PHP',
        source: { importId: randomUUID(), textRevision: 1, evidence: '' },
      },
    ]
    expect(profileSchema.safeParse(data).success).toBe(false)
  })
  it('requires complete comparable metadata only for a specified salary', () => {
    const data = emptyProfile()
    expect(profileSchema.safeParse(data).success).toBe(true)
    data.salary.state = 'specified'
    data.salary.minimum = '25000'
    expect(profileSchema.safeParse(data).success).toBe(false)
    Object.assign(data.salary, {
      contract: 'B2B',
      currency: 'PLN',
      period: 'Month',
      basis: 'net_plus_vat',
    })
    expect(profileSchema.safeParse(data).success).toBe(true)
    data.salary.minimum = '-1'
    expect(profileSchema.safeParse(data).success).toBe(false)
  })
  it('rejects malformed identities, extra fields, inverted dates and missing specified preferences', () => {
    const data = emptyProfile()
    data.skills.push({ ...emptySkill(), id: 'invalid', name: 'PHP' })
    expect(profileSchema.safeParse(data).success).toBe(false)
    expect(
      profileSchema.safeParse({ ...emptyProfile(), admin: true }).success,
    ).toBe(false)
    const prefs = emptyProfile()
    prefs.expectations.workMode.state = 'specified'
    expect(profileSchema.safeParse(prefs).success).toBe(false)
  })
  it('applies selected facts, keeps salary/preferences, and supports explicit replacement', () => {
    const data = emptyProfile(),
      original = {
        ...emptySkill(),
        name: 'PHP',
        proficiency: 'advanced' as const,
      }
    data.skills.push(original)
    data.summary = 'Manual'
    data.salary = {
      state: 'specified',
      importance: 'required',
      minimum: '25000',
      contract: 'B2B',
      currency: 'PLN',
      period: 'Month',
      basis: 'net_plus_vat',
    }
    data.expectations.workMode = {
      state: 'specified',
      importance: 'required',
      value: 'remote',
    }
    const proposal = checkProposal(
      {
        summary: 'Imported',
        skills: [
          { name: 'PHP 8', description: 'Backend', evidence: 'PHP 8' },
          { name: 'Vue', description: 'Frontend', evidence: 'Vue' },
        ],
        experience: [],
      },
      'PHP 8 and Vue',
    )
    const id = randomUUID(),
      result = applyProposal(
        data,
        proposal,
        {
          skills: [0],
          experience: [],
          summary: false,
          skillTargets: { 0: original.id },
        },
        id,
        2,
      )
    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]).toMatchObject({
      id: original.id,
      name: 'PHP 8',
      source: { importId: id, textRevision: 2, evidence: 'PHP 8' },
    })
    expect(result.salary).toEqual(data.salary)
    expect(result.expectations).toEqual(data.expectations)
    expect(result.summary).toBe('Manual')
    expect(data.skills[0]).toEqual(original)
    const appended = applyProposal(
      result,
      proposal,
      { skills: [1], experience: [], summary: true },
      id,
    )
    expect(appended.skills).toHaveLength(2)
    expect(appended.sources).toEqual([id])
    expect(appended.summary).toBe('Imported')
    expect(() =>
      applyProposal(
        data,
        proposal,
        { skills: [8], experience: [], summary: false },
        id,
      ),
    ).toThrow()
    expect(() =>
      applyProposal(
        data,
        proposal,
        {
          skills: [0],
          experience: [],
          summary: false,
          skillTargets: { 0: randomUUID() },
        },
        id,
      ),
    ).toThrow()
  })
  it('rejects fabricated evidence and preference fields in AI proposals', () => {
    expect(() =>
      checkProposal(
        {
          summary: null,
          skills: [{ name: 'PHP', description: '', evidence: 'not in input' }],
          experience: [],
        },
        'PHP',
      ),
    ).toThrow()
    expect(() =>
      checkProposal(
        { summary: null, skills: [], experience: [], salary: 25000 },
        'PHP',
      ),
    ).toThrow()
  })
})
describe('bounded document input', () => {
  it('accepts matching magic bytes and rejects spoofed, blank and oversized documents', () => {
    expect(validateDocument('cv.PDF', Buffer.from('%PDF-1.7'))).toBe('pdf')
    expect(validateDocument('cv.docx', Buffer.from([80, 75, 3, 4, 0]))).toBe(
      'docx',
    )
    for (const [name, bytes] of [
      ['cv.pdf', Buffer.from('text')],
      ['cv.exe', Buffer.from('%PDF-')],
      ['cv.pdf', Buffer.alloc(0)],
      ['cv.pdf', Buffer.alloc(10 * 1024 * 1024 + 1)],
    ] as const)
      expect(() => validateDocument(name, bytes)).toThrow()
  })
})
