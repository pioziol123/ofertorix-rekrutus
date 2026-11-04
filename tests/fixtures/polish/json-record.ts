// Synthetic values using the field structure observed in public API responses.
// JJ listing.guid maps to detail.id. NFJ listing ids may differ in case from
// details. listing.url selects the API detail path; detail.defaultUrl or
// detail.postingUrl supplies the canonical public path when present.
export function jsonRecord(
  source: 'justjoinit' | 'nofluffjobs',
  suffix = 'one',
): {
  url: string
  listing: Record<string, unknown>
  detail: Record<string, unknown>
} {
  if (source === 'justjoinit')
    return {
      url: `https://justjoin.it/job-offer/fixture-senior-php-${suffix}`,
      listing: {
        guid: `fixture-guid-${suffix}`,
        slug: `fixture-senior-php-${suffix}`,
        title: 'Senior PHP',
        experienceLevel: 'senior',
        companyName: 'Fixture',
        lastPublishedAt: '2026-11-03T10:00:00Z',
      },
      detail: {
        id: `fixture-guid-${suffix}`,
        slug: `fixture-senior-php-${suffix}`,
        title: 'Senior PHP',
        companyName: 'Fixture',
        body: '<p>Build APIs</p>',
        experienceLevel: 'senior',
        category: { key: 'php' },
        workplaceType: 'remote',
        city: 'Kraków',
        locations: [{ city: 'Kraków' }],
        employmentTypes: [
          {
            from: 4000,
            to: 5000,
            fromPerUnit: 4000,
            toPerUnit: 5000,
            currency: 'EUR',
            currencySource: 'original',
            type: 'b2b',
            unit: 'month',
            gross: false,
          },
          {
            from: 18000,
            to: 22000,
            currency: 'PLN',
            currencySource: 'conversion',
            type: 'b2b',
            unit: 'month',
            gross: false,
          },
        ],
        requiredSkills: [
          { skillId: 'php', name: 'PHP', level: 4, group: null },
        ],
        niceToHaveSkills: [
          { skillId: 'go', name: 'Go', level: 2, group: null },
        ],
        publishedAt: '2026-11-02T12:00:00Z',
        expiredAt: '2026-12-02T23:59:59Z',
        isActive: true,
        futureField: { retained: true },
      },
    }
  return {
    url: `https://nofluffjobs.com/pl/job/fixture-public-php-${suffix}-remote`,
    listing: {
      id: `fixture-php-${suffix}-Remote`,
      url: `fixture-public-php-${suffix}-remote`,
      title: 'Senior PHP',
      name: 'Fixture',
      seniority: ['Senior'],
      location: { type: 'remote', places: [{ city: 'Remote' }] },
      posted: 1793614363214,
    },
    detail: {
      id: `fixture-php-${suffix}-remote`,
      postingUrl: `fixture-public-php-${suffix}-remote`,
      title: 'Senior PHP',
      basics: { seniority: ['Senior'], technology: 'PHP', category: 'backend' },
      company: { name: 'Fixture' },
      details: { description: '<p>Build APIs</p>' },
      requirements: {
        musts: [{ value: 'PHP', type: 'main' }],
        nices: [{ value: 'Go', type: 'main' }],
        description: 'Know PHP',
      },
      essentials: {
        originalSalary: {
          currency: 'PLN',
          types: {
            b2b: { period: 'Hour', range: [100, 135], paidHoliday: false },
            permanent: { period: 'Month', range: [15000, 18000] },
          },
          disclosedAt: 'VISIBLE',
          containsSalary: 'VISIBLE',
        },
      },
      location: {
        places: [
          { city: 'Remote' },
          { city: 'Wrocław', country: { code: 'POL', name: 'Poland' } },
        ],
      },
      specs: { dailyTasks: ['Develop REST APIs'] },
      recruitment: { processSteps: ['Interview'] },
      posted: 1793614363214,
      expiresAt: '2026-12-02T23:59:59',
      status: 'PUBLISHED',
      futureField: { retained: true },
    },
  }
}

export function nfjAliasRecord(region: 'city' | 'region' = 'city') {
  const raw = jsonRecord('nofluffjobs')
  raw.listing.id =
    region === 'city' ? 'fixture-php-Wrocław' : 'fixture-php-mazowieckie'
  raw.listing.url =
    region === 'city' ? 'fixture-php-wroclaw' : 'fixture-php-mazowieckie'
  raw.listing.reference = 'FIXTURE-REFERENCE'
  raw.detail.id =
    region === 'city' ? 'fixture-php-wroclaw' : 'fixture-php-remote'
  raw.detail.defaultUrl = 'fixture-php-remote'
  raw.detail.postingUrl = String(raw.listing.url)
  raw.detail.reference = 'FIXTURE-REFERENCE'
  raw.url = 'https://nofluffjobs.com/pl/job/fixture-php-remote'
  return raw
}
