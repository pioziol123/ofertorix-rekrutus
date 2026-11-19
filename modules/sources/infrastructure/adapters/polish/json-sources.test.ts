import { describe, expect, it } from 'vitest'
import { parsePolish } from './runner.ts'
import { projectSourceAd } from '../../../domain/ad-projection.ts'
import { nfjAliasRecord } from '../../../../../tests/fixtures/polish/json-record.ts'
import {
  query,
  record,
  result,
} from '../../../../../tests/fixtures/polish/result.ts'

describe('JSON Polish portal records', () => {
  it('maps JJ listing guid to detail id and retains only original-currency salaries', () => {
    const q = query('justjoinit'),
      raw = record('justjoinit')
    const job = parsePolish(result(q), q).jobs[0]!
    expect(job.jobOfferKey).toBe(raw.listing.guid)
    expect(job.salaries).toEqual([
      expect.objectContaining({
        from: 4000,
        to: 5000,
        currency: 'EUR',
        period: 'Month',
        employmentType: 'B2B',
        basis: 'netto',
      }),
    ])
    expect(job.sourceRecord).toEqual({
      listing: raw.listing,
      detail: raw.detail,
    })
    expect(projectSourceAd({ source: q.source, payload: job })).toMatchObject({
      source: 'Just Join IT',
      mode: 'remote',
      skills: [
        { name: 'PHP', optional: false },
        { name: 'Go', optional: true },
      ],
    })
  })
  it('does not treat converted JJ pay as original employer amounts', () => {
    const q = query('justjoinit'),
      raw = record('justjoinit')
    raw.detail.employmentTypes = [
      {
        from: 20000,
        to: 25000,
        currency: 'PLN',
        currencySource: 'conversion',
        type: 'b2b',
        unit: 'month',
      },
    ]
    expect(parsePolish(result(q, [raw]), q).jobs[0]!.salaries).toEqual([])
  })
  it('canonicalizes NFJ id case while preserving listing public URL and original raw fields', () => {
    const q = query('nofluffjobs'),
      raw = record('nofluffjobs')
    const job = parsePolish(result(q), q).jobs[0]!
    expect(job).toMatchObject({
      jobOfferKey: 'fixture-php-one-remote',
      url: raw.url,
      validFrom: new Date(1793614363214).toISOString(),
      validTo: null,
      sourceActive: true,
    })
    expect(job.salaries).toEqual([
      expect.objectContaining({
        from: 100,
        to: 135,
        currency: 'PLN',
        period: 'Hour',
        employmentType: 'B2B',
      }),
      expect.objectContaining({
        from: 15000,
        to: 18000,
        currency: 'PLN',
        period: 'Month',
        employmentType: 'UoP',
      }),
    ])
    expect(job.sourceRecord).toEqual({
      listing: raw.listing,
      detail: raw.detail,
    })
    expect(projectSourceAd({ source: q.source, payload: job })).toMatchObject({
      source: 'No Fluff Jobs',
      mode: 'remote',
      skills: [
        { name: 'PHP', optional: false },
        { name: 'Go', optional: true },
      ],
    })
  })
  it('deduplicates NFJ differently cased ids without discarding valid records', () => {
    const q = query('nofluffjobs'),
      raw = record('nofluffjobs'),
      variant = record('nofluffjobs')
    variant.listing.id = String(variant.listing.id).toUpperCase()
    variant.detail.id = String(variant.detail.id).toUpperCase()
    expect(parsePolish(result(q, [raw, variant]), q)).toMatchObject({
      status: 'partial',
      jobs: [expect.any(Object)],
      diagnostics: { duplicates: 1 },
    })
  })
  it.each(['justjoinit', 'nofluffjobs'] as const)(
    'keeps valid %s records when detail id or public host is invalid',
    (source) => {
      const q = query(source),
        mismatch = record(source),
        foreign = record(source)
      mismatch.detail.id = 'foreign-record'
      foreign.url = foreign.url.replace(
        source === 'justjoinit' ? 'justjoin.it' : 'nofluffjobs.com',
        'evil.test',
      )
      expect(
        parsePolish(result(q, [record(source), mismatch, foreign]), q),
      ).toMatchObject({
        status: 'partial',
        jobs: [expect.any(Object)],
        diagnostics: { rejected: 2 },
      })
    },
  )
  it.each(['justjoinit', 'nofluffjobs'] as const)(
    'preserves unknown %s qualifications without guessing',
    (source) => {
      const q = query(source),
        raw = record(source)
      if (source === 'justjoinit') {
        delete raw.detail.experienceLevel
        delete raw.detail.category
        raw.detail.requiredSkills = []
        raw.detail.niceToHaveSkills = []
      } else {
        raw.detail.basics = {}
        delete raw.listing.seniority
        raw.detail.requirements = {}
      }
      const job = parsePolish(result(q, [raw]), q).jobs[0]!
      expect(job.experienceLevel).toBeNull()
      expect(job.qualificationUnknown).toEqual(['senior', 'PHP'])
      expect(job.skills).toEqual([])
      expect(job.sourceRecord).toEqual({
        listing: raw.listing,
        detail: raw.detail,
      })
    },
  )
  it.each(['city', 'region'] as const)(
    'matches NFJ %s aliases by reference and emits canonical defaultUrl identity',
    (region) => {
      const q = query('nofluffjobs'),
        raw = nfjAliasRecord(region)
      const parsed = parsePolish(result(q, [raw]), q)
      expect(parsed.status).toBe('complete')
      expect(parsed.jobs[0]).toMatchObject({
        jobOfferKey: 'fixture-php-remote',
        url: 'https://nofluffjobs.com/pl/job/fixture-php-remote',
      })
      expect(parsed.jobs[0]!.sourceRecord).toEqual({
        listing: raw.listing,
        detail: raw.detail,
      })
    },
  )
  it('rejects mismatched NFJ references even if case-insensitive IDs agree', () => {
    const q = query('nofluffjobs'),
      raw = record('nofluffjobs')
    raw.listing.reference = 'FIRST'
    raw.detail.reference = 'SECOND'
    expect(
      parsePolish(result(q, [record('nofluffjobs'), raw]), q),
    ).toMatchObject({
      status: 'partial',
      diagnostics: { rejected: 1 },
      jobs: [expect.any(Object)],
    })
  })
  it('preserves grouped-alias diagnostics without marking a complete NFJ result partial', () => {
    const q = query('nofluffjobs'),
      envelope = result(q, [nfjAliasRecord()])
    expect(
      parsePolish(
        {
          ...envelope,
          diagnostics: { ...envelope.diagnostics, totalCount: 2, aliases: 1 },
        },
        q,
      ),
    ).toMatchObject({
      status: 'complete',
      diagnostics: { aliases: 1, duplicates: 0 },
      jobs: [expect.any(Object)],
    })
  })
  it.each([
    ['', ''],
    ['ONLY-LISTING', ''],
    ['', 'ONLY-DETAIL'],
  ])(
    'falls back to case-insensitive IDs when either reference is empty: %j',
    (listingReference, detailReference) => {
      const q = query('nofluffjobs'),
        raw = record('nofluffjobs')
      raw.listing.reference = listingReference
      raw.detail.reference = detailReference
      expect(parsePolish(result(q, [raw]), q).status).toBe('complete')
    },
  )
  it('falls back to detail id for canonical URL when both detail URL fields are missing', () => {
    const q = query('nofluffjobs'),
      raw = record('nofluffjobs')
    delete raw.detail.defaultUrl
    delete raw.detail.postingUrl
    raw.url = `https://nofluffjobs.com/pl/job/${String(raw.detail.id)}`
    expect(parsePolish(result(q, [raw]), q)).toMatchObject({
      status: 'complete',
      jobs: [
        expect.objectContaining({ jobOfferKey: raw.detail.id, url: raw.url }),
      ],
    })
  })
  it('respects NFJ hidden salary flags without losing raw values', () => {
    const q = query('nofluffjobs'),
      raw = record('nofluffjobs')
    const essentials = raw.detail.essentials as Record<string, unknown>
    const original = essentials.originalSalary as Record<string, unknown>
    original.disclosedAt = 'HIDDEN'
    const job = parsePolish(result(q, [raw]), q).jobs[0]!
    expect(job.salaries).toEqual([])
    expect(job.sourceRecord).toEqual({
      listing: raw.listing,
      detail: raw.detail,
    })
  })
  it.each([
    'incomplete_count',
    'invalid_cursor',
    'cursor_loop',
    'source_limit',
    'changing_pagination',
  ])('keeps valid jobs from %s partial result', (stopReason) => {
    const q = query('justjoinit'),
      envelope = result(q)
    expect(
      parsePolish(
        {
          ...envelope,
          status: 'partial',
          diagnostics: { ...envelope.diagnostics, stopReason },
        },
        q,
      ),
    ).toMatchObject({ status: 'partial', jobs: [expect.any(Object)] })
  })
})
