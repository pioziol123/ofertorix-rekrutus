import { jsonRecord } from './json-record.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  polishQuery,
  type PolishQuery,
  type PolishSource,
} from '../../../modules/sources/infrastructure/adapters/polish/runner.ts'

// Synthetic records retaining the public portals' Next.js field structure.
export const query = (source: PolishSource = 'bulldogjob') =>
  polishQuery.parse({ source })
export function record(
  source: PolishSource = 'bulldogjob',
  suffix = 'one',
): {
  url: string
  listing: Record<string, unknown>
  detail: Record<string, unknown>
} {
  if (source === 'justjoinit' || source === 'nofluffjobs')
    return jsonRecord(source, suffix)
  if (source === 'bulldogjob')
    return {
      url: `https://bulldogjob.pl/companies/jobs/123-${suffix}`,
      listing: {
        id: `123-${suffix}`,
        position: 'Senior PHP',
        experienceLevel: 'senior',
        company: { name: 'Fixture' },
      },
      detail: {
        id: `123-${suffix}`,
        position: 'Senior PHP',
        company: { name: 'Fixture' },
        details: '<p>Build APIs</p>',
        experienceLevel: 'senior',
        mainTechnology: 'PHP',
        technologyTags: ['PHP', 'SQL'],
        workModes: ['full-remote'],
        locations: [{ city: 'Warszawa' }],
        state: 'published',
        b2bSalary: {
          money: '18 000 – 24 000',
          currency: 'PLN',
          timeframe: 'month',
        },
        employmentSalary: {
          from: 15000,
          to: 19000,
          currency: 'PLN',
          timeframe: 'month',
        },
        futureField: { retained: true },
      },
    }
  return {
    url: `https://theprotocol.it/praca/senior-php,oferta,${suffix}`,
    listing: {
      id: suffix,
      title: 'Senior PHP',
      offerUrlName: `senior-php,oferta,${suffix}`,
      positionLevels: [{ value: 'senior' }],
    },
    detail: {
      id: suffix,
      attributes: {
        title: { value: 'Senior PHP' },
        employer: { name: 'Fixture' },
        workplaces: [{ location: 'Kraków' }],
        employment: {
          positionLevelIds: ['senior'],
          detailedWorkModes: [{ code: 'hybrid' }],
          typesOfContracts: [
            {
              name: 'B2B',
              salary: {
                minValue: 100,
                maxValue: 150,
                currencySymbol: 'zł',
                timeUnit: { longForm: 'godzina' },
                kindName: 'netto (+ VAT)',
              },
            },
          ],
        },
      },
      technologies: { expected: [{ name: 'PHP' }], optional: [{ name: 'Go' }] },
      textSections: [{ plainText: 'Build APIs' }],
      publicationDetails: {
        isActive: true,
        dateOfInitialPublicationUtc: '2026-11-01T12:00:00Z',
      },
      futureField: { retained: true },
    },
  }
}
// Field names observed in the public detail response during the live pilot.
// Synthetic content; no live request is needed to exercise this variant.
export function theprotocolDetailVariant() {
  const raw = record('theprotocol')
  const attributes = raw.detail.attributes as Record<string, unknown>
  const employment = attributes.employment as Record<string, unknown>
  employment.detailedWorkModes = [{ code: 'home-office' }]
  employment.typesOfContracts = [
    {
      name: 'B2B',
      salary: {
        minValue: 100,
        maxValue: 150,
        currencyCode: 'zł',
        timeUnit: { longForm: 'godzina' },
        kindCode: 'netto (+ VAT)',
      },
    },
  ]
  return raw
}

export function result(
  q: PolishQuery = query(),
  records: unknown[] = [record(q.source)],
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    source: q.source,
    query: q,
    records,
    status: 'complete',
    diagnostics: {
      pages: 1,
      totalCount: records.length,
      requests: 2,
      rejected: 0,
      duplicates: 0,
      filtered: 0,
      missingDescriptions: 0,
      stopReason: 'exhausted',
    },
    ...overrides,
  }
}
