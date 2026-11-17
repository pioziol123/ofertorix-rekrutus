import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  applyProposal,
  checkProposal,
  emptyProfile,
  emptySkill,
  profileSchema,
  ProposalEvidenceError,
} from '../lib/profile/model.ts'
import { budgetMonth, chargeCeiling } from '../modules/ai/index.ts'
import type { AiConfiguration, ModelResult } from '../modules/ai/index.ts'
import { readAiProposal } from '../lib/profile/ai-result.ts'
import { scrubContacts, validateDocument } from '../lib/profile/imports.ts'

const config: AiConfiguration = {
  model: 'test',
  version: 'v1',
  inputUsdPerMillion: '1',
  outputUsdPerMillion: '4',
  usdPln: '4.1',
  fxVersion: 'test',
  maxInputTokens: 1000,
  maxOutputTokens: 500,
}
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
describe('safe AI response diagnostics', () => {
  const marker = 'PRIVATE_CV_SENTINEL'
  const valid = { summary: null, skills: [], experience: [] }
  const result = (
    outcome: ModelResult['outcome'],
    text: string | null,
  ): ModelResult => ({
    outcome,
    text,
    usage: { inputTokens: null, outputTokens: null },
    responseId: null,
  })
  it.each([
    [result('incomplete', marker), 'nie ukończyło'],
    [result('refused', marker), 'odmówiło'],
    [result('completed', null), 'jednej kompletnej'],
    [result('completed', marker), 'format danych'],
    [
      result('completed', JSON.stringify({ ...valid, unexpected: marker })),
      'format danych',
    ],
    [
      result(
        'completed',
        JSON.stringify({
          ...valid,
          skills: [{ name: marker, description: marker, evidence: marker }],
        }),
      ),
      'potwierdzić cytatów',
    ],
  ] as const)(
    'reports the failure category without leaking model or CV content',
    (value, message) => {
      let caught: unknown
      try {
        readAiProposal(value, 'Different reviewed professional text')
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(Error)
      expect((caught as Error).message).toContain(message)
      expect((caught as Error).message).not.toContain(marker)
    },
  )
})
describe('bounded document and AI inputs', () => {
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
  it('removes obvious contact data before AI input', () => {
    const text = scrubContacts(
      'PHP developer\nmail@example.com\n+48 123 456 789\nAddress: home\nVue',
    )
    expect(text).not.toContain('mail@example.com')
    expect(text).not.toContain('123 456')
    expect(text).not.toContain('home')
    expect(text).toContain('PHP developer')
    expect(text).toContain('Vue')
  })
  it('preserves numbered companies and employment dates in a multiline CV', () => {
    const career = [
      'Software 24',
      '06.2015-07.2016',
      'Junior PHP Developer',
      'Studio 360 08.2016 – 12.2020',
      'Backend Developer',
      'Żółw123456789',
      '01.2021 — obecnie',
      'Senior PHP Developer',
    ].join('\n')
    const text = [
      'E-mail: person@example.com',
      'Telefon: +48 123 456 789',
      'Adres zamieszkania: Testowa 1',
      career,
    ].join('\n')
    const cleaned = scrubContacts(text)
    expect(cleaned).toBe(
      [
        'E-mail: [e-mail usunięty]',
        'Telefon: [numer usunięty]',
        '[dane osobowe usunięte]',
        career,
      ].join('\n'),
    )
    expect(scrubContacts(cleaned)).toBe(cleaned)
  })
  it.each([
    '06.2015-07.2016',
    '06.2015 – 07.2016',
    '06/2015 — 07/2016',
    '06-2015 - 07-2016',
    '01.06.2015-31.07.2016',
    '1/6/2015 – 31/7/2016',
    '01-06-2015 — 31-07-2016',
    '2015-06-01 - 2016-07-31',
    '2015/06/01 – 2016/07/31',
  ])('preserves employment date range %j next to a company number', (dates) => {
    const text = `Studio 360 ${dates}\nPHP 8.4, PostgreSQL 16`
    expect(scrubContacts(text)).toBe(text)
  })
  it.each([
    '123456789',
    '123 456 789',
    '123.456.789',
    '123-456-789',
    '+48 123 456 789',
    '+48 (123) 456-789',
    '0048 123 456 789',
    '+1 212 555 0123',
    '+48\t123\t456\t789',
  ])(
    'removes a phone number %j without changing neighboring dates',
    (phone) => {
      expect(scrubContacts(`06.2015\nTel: ${phone}\n07.2016`)).toBe(
        '06.2015\nTel: [numer usunięty]\n07.2016',
      )
    },
  )
  it.each(['\n', '\r\n'])(
    'does not join numbers across %j line breaks',
    (newline) => {
      const text = ['Studio 24', '12345678', '9', '123 456 789', '42'].join(
        newline,
      )
      expect(scrubContacts(text)).toBe(
        ['Studio 24', '12345678', '9', '[numer usunięty]', '42'].join(newline),
      )
    },
  )
  it('uses Warsaw calendar boundaries and integer ceilings for costs', () => {
    expect(budgetMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11')
    expect(budgetMonth(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07')
    expect(chargeCeiling(config, 1000, 500)).toBe('0.012300')
    expect(() => chargeCeiling(config, -1, 1)).toThrow()
    expect(() => chargeCeiling(config, 0.5, 1)).toThrow()
  })
})

describe('contact redaction with long uninterrupted source text', () => {
  it('preserves a long non-contact token and still removes ordinary emails', () => {
    const token = 'x'.repeat(200000)
    const result = scrubContacts(
      `${token}\nContact first.last+jobs@example.com and recruiter@example.org`,
    )
    expect(result).toBe(
      `${token}\nContact [e-mail usunięty] and [e-mail usunięty]`,
    )
    expect(scrubContacts(result)).toBe(result)
  })
})
