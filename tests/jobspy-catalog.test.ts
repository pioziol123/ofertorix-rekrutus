import type { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  configuredSources,
  jobspyCatalog,
  jobspySources,
  parseJobspySource,
  remoteMarkets,
  sourceEnabled,
} from '../lib/sources/jobspy-catalog.ts'
import {
  enqueueJobspy,
  jobspyCatalogStatus,
} from '../lib/sources/jobspy-sync.ts'
import {
  fingerprintFor,
  parametersFor,
  parseJobspy,
  queueFor,
} from '../lib/sources/jobspy.ts'
import { projectSourceAd } from '../modules/sources/domain/ad-projection.ts'
import { job, result, sourceResult } from './fixtures/jobspy/result.ts'

afterEach(() => vi.unstubAllEnvs())

describe('additional JobSpy sources', () => {
  it.each(Object.entries(remoteMarkets))(
    'uses the native market and remote query for %s without treating foreign country as exclusion',
    (sourceName, country) => {
      const source = parseJobspySource(sourceName)
      const query = parametersFor(source).query
      expect(query).toMatchObject({
        source,
        location: null,
        country_indeed: country,
        is_remote: true,
        search_term: 'Senior PHP',
        fetch_description: true,
      })
      const meta = jobspyCatalog[source]
      const raw = job({
        id: `${meta.prefix}foreign1`,
        site: source,
        job_url: `https://${meta.hosts[0]}/jobs/foreign1`,
        location: { city: 'Foreign city', state: null, country },
        is_remote: true,
        description: 'PHP services; remote position.',
      })
      const batch = parseJobspy(
        result({
          schema_version: 2,
          source,
          fork_revision: 'oferty-contract-2',
          query,
          jobs: [raw],
        }),
        source,
      )
      expect(batch.jobs).toHaveLength(1)
      expect(batch.diagnostics).toMatchObject({ outsideScope: 0 })
      expect(projectSourceAd({ source, payload: batch.jobs[0] })).toMatchObject(
        {
          remoteEligibility: { status: 'unknown' },
        },
      )
    },
  )
  it.each(['linkedin', 'bayt'] as const)(
    'normalizes %s with its own identity and preserves uncertain qualification',
    (source) => {
      const batch = parseJobspy(sourceResult(source), source)
      expect(batch.status).toBe('partial')
      expect(batch.jobs).toHaveLength(1)
      expect(batch.jobs[0]).toMatchObject({
        jobOfferKey: 'ab123',
        qualificationUnknown: ['PHP', 'senior'],
        salary: { origin: 'unknown' },
      })
      expect(projectSourceAd({ source, payload: batch.jobs[0] }).source).toBe(
        source === 'linkedin' ? 'LinkedIn' : 'Bayt',
      )
      expect(batch.diagnostics).not.toHaveProperty('jobs')
    },
  )
  it('excludes explicitly foreign locations without rejecting unknown geography or hiding the incomplete scope', () => {
    const own = sourceResult('bayt').jobs[0]!
    const countries = [
      'India',
      'United States',
      'France',
      ' Poland ',
      'polska',
      'pl',
      'unknown',
      'worldwide',
      'remote',
      null,
    ]
    const jobs: Record<string, unknown>[] = countries.map((country, index) => ({
      ...own,
      id: `bayt-country${index}`,
      location: { city: null, state: null, country },
    }))
    jobs.push({ ...own, id: 'bayt-no-location', location: null })
    const batch = parseJobspy(
      sourceResult('bayt', {
        status: 'completed',
        stop_reason: 'exhausted',
        jobs,
      }),
      'bayt',
    )
    expect(batch.jobs.map((j) => j.jobOfferKey)).toEqual([
      'country3',
      'country4',
      'country5',
      'country6',
      'country7',
      'country8',
      'country9',
      'no-location',
    ])
    expect(batch).toMatchObject({
      status: 'partial',
      diagnostics: { outsideScope: 3, rejected: 0 },
    })
    expect(batch.jobs.at(-1)).toMatchObject({
      locations: [],
      qualificationUnknown: ['PHP', 'senior'],
    })
  })
  it('retains foreign Bayt remote offers with uncertain eligibility but excludes onsite and unknown-mode foreign offers', () => {
    const own = sourceResult('bayt').jobs[0]!
    const jobs = [true, false, null].map((is_remote, index) => ({
      ...own,
      id: `bayt-foreign${index}`,
      location: { city: 'Berlin', state: null, country: 'Germany' },
      description: 'Develop PHP services',
      is_remote,
    }))
    const batch = parseJobspy(sourceResult('bayt', { jobs }), 'bayt')
    expect(batch.jobs.map((j) => j.jobOfferKey)).toEqual(['foreign0'])
    expect(batch.diagnostics).toMatchObject({ outsideScope: 2, rejected: 0 })
    expect(
      projectSourceAd({ source: 'bayt', payload: batch.jobs[0] }),
    ).toMatchObject({
      mode: 'remote',
      remoteEligibility: { status: 'unknown', evidence: [] },
    })
  })
  it.each([
    { schema_version: 1 },
    { source: 'bayt' },
    { fork_revision: 'oferty-contract-1' },
    { query: parametersFor('bayt').query },
    {
      query: { ...parametersFor('linkedin').query, location: 'International' },
    },
  ])('rejects a mismatched adapter contract: %j', (change) => {
    expect(() =>
      parseJobspy(sourceResult('linkedin', change), 'linkedin'),
    ).toThrow('Invalid JobSpy result')
  })
  it.each(['linkedin', 'bayt'] as const)(
    'rejects cross-source identities and deceptive URLs for %s',
    (source) => {
      const own = sourceResult(source).jobs[0]!
      const foreign = sourceResult(source === 'linkedin' ? 'bayt' : 'linkedin')
        .jobs[0]!
      const host = source === 'linkedin' ? 'linkedin.com' : 'bayt.com'
      const records = [
        { ...own, id: foreign.id },
        { ...own, site: foreign.site },
        { ...own, job_url: foreign.job_url },
        { ...own, job_url: `https://${host}.evil.test/jobs/1` },
        { ...own, job_url: `https://secret:token@${host}/jobs/1` },
        { ...own, job_url: 'javascript:alert(1)' },
        { ...own, id: `${source === 'linkedin' ? 'li-' : 'bayt-'}../invalid` },
      ]
      const batch = parseJobspy(
        sourceResult(source, { jobs: [own, ...records, own] }),
        source,
      )
      expect(batch.jobs).toHaveLength(1)
      expect(batch.diagnostics).toMatchObject({
        rejected: records.length,
        duplicates: 1,
      })
    },
  )
  it.each([
    'unsupported_scope',
    'unsupported_source',
    'blocked',
    'adapter_error',
    'unverified',
  ])(
    'retains a safe diagnostic reason %s without inventing success',
    (stop_reason) => {
      const batch = parseJobspy(
        sourceResult('bayt', { status: 'failed', stop_reason, jobs: [] }),
        'bayt',
      )
      expect(batch).toMatchObject({
        jobs: [],
        status: 'failed',
        diagnostics: { stop_reason },
      })
    },
  )
  it('assigns independent queue names and parameter fingerprints to all adapters', () => {
    expect(new Set(jobspySources.map(queueFor)).size).toBe(jobspySources.length)
    expect(new Set(jobspySources.map(fingerprintFor)).size).toBe(
      jobspySources.length,
    )
    expect(queueFor('indeed')).toBe('source-indeed-jobspy')
  })
})

describe('explicit source activation', () => {
  it('deduplicates configured sources and rejects unknown or inherited object keys', () => {
    vi.stubEnv('JOBSPY_SOURCES', ' bayt,linkedin,bayt, ')
    expect(configuredSources()).toEqual(['bayt', 'linkedin'])
    for (const value of [
      'indeed;secret',
      '__proto__',
      'constructor',
      'LinkedIn',
    ]) {
      expect(() => parseJobspySource(value)).toThrow('Unknown JobSpy source')
    }
    vi.stubEnv('JOBSPY_SOURCES', 'bayt,unknown')
    expect(() => configuredSources()).toThrow('Unknown JobSpy source')
  })
  it('enables selected remote markets without implicitly enabling Indeed or LinkedIn', () => {
    vi.stubEnv('JOBSPY_ENABLED', 'false')
    vi.stubEnv('JOBSPY_SOURCES', jobspySources.join(','))
    vi.stubEnv('JOBSPY_LINKEDIN_ACCESS_CONFIRMED', 'false')
    expect(jobspySources.filter(sourceEnabled)).toEqual([
      'bayt',
      ...Object.keys(remoteMarkets),
    ])
    vi.stubEnv('JOBSPY_LINKEDIN_ACCESS_CONFIRMED', 'true')
    expect(jobspySources.filter(sourceEnabled)).toEqual([
      'linkedin',
      'bayt',
      ...Object.keys(remoteMarkets),
    ])
    vi.stubEnv('JOBSPY_ENABLED', 'true')
    expect(sourceEnabled('indeed')).toBe(true)
    vi.stubEnv('JOBSPY_SOURCES', '')
    expect(sourceEnabled('bayt')).toBe(false)
    expect(sourceEnabled('linkedin')).toBe(false)
  })
  it.each([
    'linkedin',
    'glassdoor',
    'zip_recruiter',
    'naukri',
    'bdjobs',
    'hellowork',
    'google',
  ] as const)(
    'refuses disabled %s before SQL or queue access',
    async (source) => {
      vi.stubEnv('JOBSPY_SOURCES', 'bayt')
      vi.stubEnv('JOBSPY_LINKEDIN_ACCESS_CONFIRMED', 'false')
      const connect = vi.fn()
      await expect(
        enqueueJobspy(
          { connect } as unknown as Pool,
          {} as PgBoss,
          new Date(),
          source,
        ),
      ).rejects.toThrow('JobSpy source is disabled')
      expect(connect).not.toHaveBeenCalled()
    },
  )
  it('lists every adapter, disabled reasons and source-specific latest results without scheduling', async () => {
    vi.stubEnv('JOBSPY_ENABLED', 'false')
    vi.stubEnv('JOBSPY_SOURCES', 'bayt')
    vi.stubEnv('JOBSPY_LINKEDIN_ACCESS_CONFIRMED', 'false')
    const query = vi.fn(async (_sql: string, values: string[]) => ({
      rows:
        values[0] === 'bayt'
          ? [{ id: 'bayt-last', status: 'failed', seen: 0 }]
          : [],
    }))
    const catalog = await jobspyCatalogStatus({ query } as unknown as Pool)
    expect(catalog).toMatchObject({
      enabled: false,
      scheduled: false,
      run: null,
    })
    expect(catalog.sources.map((s) => s.source)).toEqual(jobspySources)
    expect(query.mock.calls.map(([, values]) => values)).toEqual(
      jobspySources.map((s) => [s]),
    )
    expect(catalog.sources.find((s) => s.source === 'bayt')).toMatchObject({
      enabled: true,
      scheduled: false,
      run: { id: 'bayt-last', status: 'failed' },
    })
    expect(catalog.sources.find((s) => s.source === 'google')).toMatchObject({
      enabled: false,
      connected: false,
      restriction: 'unavailable',
    })
    expect(catalog.sources.find((s) => s.source === 'linkedin')).toMatchObject({
      enabled: false,
      restriction: 'requires_access',
      run: null,
    })
  })
})
