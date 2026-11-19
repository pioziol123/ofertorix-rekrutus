import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  companyLinkCommand,
  companyRoles,
  createCompanyCommand,
} from './domain/company.ts'
import { companyFilters } from './read-companies.ts'

const profile = () => ({
  commandId: randomUUID(),
  name: ' Firma ',
  kind: 'organization',
  website: null,
  description: ' Opis ',
})
describe('explicit company commands', () => {
  it('requires an explicit identity kind and trims owner text', () => {
    expect(createCompanyCommand.parse(profile())).toMatchObject({
      name: 'Firma',
      description: 'Opis',
    })
    for (const kind of ['organization', 'brand', 'unknown'])
      expect(
        createCompanyCommand.safeParse({ ...profile(), kind }).success,
      ).toBe(true)
    expect(
      createCompanyCommand.safeParse({ ...profile(), kind: undefined }).success,
    ).toBe(false)
    expect(
      createCompanyCommand.safeParse({ ...profile(), name: ' ' }).success,
    ).toBe(false)
    expect(
      createCompanyCommand.safeParse({ ...profile(), inferredEmployer: true })
        .success,
    ).toBe(false)
  })
  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    '//example.com',
    'https://user:secret@example.com',
    'not a url',
  ])('rejects unsafe website %s', (website) => {
    expect(
      createCompanyCommand.safeParse({ ...profile(), website }).success,
    ).toBe(false)
  })
  it.each(['https://example.com/about', 'http://example.com'])(
    'accepts a plain external website %s',
    (website) => {
      expect(
        createCompanyCommand.parse({ ...profile(), website }).website,
      ).toBe(website)
    },
  )
  it('requires concurrency intent, evidence and one of the three distinct roles', () => {
    const command = {
      commandId: randomUUID(),
      adId: randomUUID(),
      expectedCompanyId: null,
      action: 'link',
      evidence: ' Confirmed by owner ',
    }
    for (const role of companyRoles)
      expect(companyLinkCommand.parse({ ...command, role }).evidence).toBe(
        'Confirmed by owner',
      )
    for (const change of [
      { expectedCompanyId: undefined },
      { evidence: ' ' },
      { role: 'company' },
      { action: 'replace' },
      { extra: true },
    ]) {
      expect(
        companyLinkCommand.safeParse({ ...command, role: 'client', ...change })
          .success,
      ).toBe(false)
    }
  })
  it('validates bounded list filters without accepting hidden filters', () => {
    expect(companyFilters.parse({})).toEqual({ q: '', page: 1, sort: 'name' })
    expect(
      companyFilters.parse({ q: ' PHP ', page: '2', sort: 'offers' }),
    ).toEqual({ q: 'PHP', page: 2, sort: 'offers' })
    for (const query of [
      { page: 0 },
      { page: 1.5 },
      { page: 100001 },
      { sort: 'rating' },
      { autoMerge: true },
      { q: 'x'.repeat(301) },
    ])
      expect(companyFilters.safeParse(query).success).toBe(false)
  })
})
