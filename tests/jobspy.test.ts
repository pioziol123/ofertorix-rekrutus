import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  jobspyEnabled,
  jobspyParameters,
  parametersFor,
  parseJobspy,
  runJobspy,
} from '../lib/sources/jobspy.ts'
import { closePool, setPool } from '../lib/db.ts'
import { enqueueJobspy, jobspyStatus } from '../lib/sources/jobspy-sync.ts'
import { parseFilters } from '../modules/offers/index.ts'
import { projectSourceAd } from '../modules/sources/domain/ad-projection.ts'
import { salaryMatch } from '../modules/offers/domain/salary-match.ts'
import { job, result } from './fixtures/jobspy/result.ts'
import { jobspySources } from '../lib/sources/jobspy-catalog.ts'

afterEach(() => vi.unstubAllEnvs())

describe('JobSpy contract and projection', () => {
  it('versions the Indeed adapter independently from other sources', () => {
    expect(parametersFor('indeed').adapterVersion).toBe(5)
    for (const source of jobspySources.filter(
      (source) => source !== 'indeed',
    )) {
      expect(parametersFor(source).adapterVersion).toBe(3)
    }
  })
  it.each([
    { schema_version: 2 },
    { source: 'solid-jobs' },
    { fork_revision: 'unverified' },
    { upstream_revision: 'unverified' },
    { query: { ...jobspyParameters.query, location: 'Berlin' } },
    { market_complete: true },
    { stop_reason: 'invented' },
    { request_count: -1 },
    { finished_at: '2020-01-01T00:00:00Z' },
    { started_at: 'yesterday' },
  ])('rejects incompatible metadata without leaking values: %j', (change) => {
    expect(() => parseJobspy(result(change))).toThrow('Invalid JobSpy result')
  })
  it('keeps valid jobs while counting invalid records and duplicate identities', () => {
    const parsed = parseJobspy(
      result({
        jobs: [
          job(),
          job(),
          job({ id: 'bad' }),
          job({ id: 'in-other', job_url: 'https://indeed.com.evil.test/x' }),
          null,
        ],
      }),
    )
    expect(parsed.jobs).toHaveLength(1)
    expect(parsed.status).toBe('partial')
    expect(parsed.diagnostics).toMatchObject({ rejected: 3, duplicates: 1 })
    expect(parsed.diagnostics).not.toHaveProperty('jobs')
  })
  it.each([
    'javascript:alert(1)',
    'https://user:secret@indeed.com/x',
    'https://evil.test/x',
  ])('rejects unsafe source URL %s', (job_url) => {
    expect(parseJobspy(result({ jobs: [job({ job_url })] })).jobs).toEqual([])
  })
  it('preserves provenance and unknown qualifications without guessing contracts or office mode', () => {
    const raw = job({ future_field: { retained: true } })
    const normalized = parseJobspy(result({ jobs: [raw] })).jobs[0]!
    expect(normalized).toMatchObject({
      jobOfferKey: 'ab123',
      isRemote: null,
      experienceLevel: null,
      qualificationUnknown: ['PHP', 'senior'],
      sourceRecord: raw,
      salary: {
        origin: 'portal_estimate',
        employmentType: null,
        period: 'Month',
      },
    })
    const view = projectSourceAd({
      id: 'one',
      source: 'indeed',
      payload: normalized,
    })
    expect(view).toMatchObject({
      source: 'Indeed',
      mode: null,
      seniority: null,
      skills: [{ name: 'PHP', optional: null }],
    })
  })
  it.each(['portal_estimate', 'unknown'])(
    'treats %s salary as unknown rather than confirmed minimum',
    (salary_origin) => {
      const payload = parseJobspy(result({ jobs: [job({ salary_origin })] }))
        .jobs[0]
      const view = projectSourceAd({ payload })
      const filters = parseFilters({
        minSalary: '15000',
        currency: 'PLN',
        period: 'Month',
        includeUnknownSalary: 'false',
      })
      expect(salaryMatch(view, filters)).toEqual({
        matches: false,
        partial: false,
        unknown: true,
      })
      expect(
        salaryMatch(view, { ...filters, includeUnknownSalary: true }).matches,
      ).toBe(true)
    },
  )
  it('retains legacy SOLID salary behavior and employer supplied JobSpy amounts', () => {
    const filters = parseFilters({
      minSalary: '15000',
      currency: 'PLN',
      period: 'Month',
      includeUnknownSalary: 'false',
    })
    for (const origin of [undefined, 'employer']) {
      const view = projectSourceAd({
        payload: {
          salary: {
            from: 20000,
            to: 25000,
            currency: 'PLN',
            period: 'Month',
            origin,
          },
        },
      })
      expect(salaryMatch(view, filters)).toEqual({
        matches: true,
        partial: false,
        unknown: false,
      })
    }
  })
  it.each([
    [{}, 'complete'],
    [{ status: 'limited', stop_reason: 'result_limit' }, 'partial'],
    [{ status: 'completed', stop_reason: 'result_limit' }, 'partial'],
    [{ status: 'partial', stop_reason: 'page_error' }, 'partial'],
    [{ missing_descriptions: 1 }, 'partial'],
    [{ skipped_jobs: 1 }, 'partial'],
    [{ jobs: [job({ description: null })] }, 'partial'],
    [{ status: 'failed', stop_reason: 'transport_error', jobs: [] }, 'failed'],
    [{ status: 'failed', stop_reason: 'transport_error' }, 'partial'],
  ])('maps outcome %j to %s', (change, status) => {
    expect(parseJobspy(result(change as Record<string, unknown>)).status).toBe(
      status,
    )
  })
  it('does not include collection timestamps in normalized content', () => {
    expect(parseJobspy(result()).jobs).toEqual(
      parseJobspy(
        result({
          started_at: '2026-11-03T10:00:00Z',
          finished_at: '2026-11-03T10:01:00Z',
        }),
      ).jobs,
    )
  })
  it('rejects disabled enqueue before connecting to SQL', async () => {
    vi.stubEnv('JOBSPY_ENABLED', 'false')
    const connect = vi.fn(),
      query = vi.fn()
    setPool({ connect, query, end: vi.fn() } as unknown as Pool)
    try {
      await expect(enqueueJobspy({} as PgBoss)).rejects.toThrow('disabled')
    } finally {
      await closePool()
    }
    expect(connect).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
    vi.stubEnv('JOBSPY_ENABLED', 'TRUE')
    expect(jobspyEnabled()).toBe(false)
  })
  it('validates status UUID before querying', async () => {
    const query = vi.fn()
    await expect(
      jobspyStatus({ query } as unknown as Pool, 'bad'),
    ).rejects.toThrow('Invalid run UUID')
    expect(query).not.toHaveBeenCalled()
  })
})

describe('isolated JobSpy subprocess', () => {
  const directories: string[] = []
  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    )
  })
  async function runner(
    code: string,
    options: { timeoutMs?: number; maxBytes?: number } = {},
  ) {
    const dir = await mkdtemp(join(tmpdir(), 'jobspy-test-'))
    directories.push(dir)
    const path = join(dir, 'runner with spaces.cjs')
    await writeFile(path, code)
    return runJobspy({ python: process.execPath, runner: path, ...options })
  }
  it('passes exact query via stdin and excludes application secrets from environment', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'secret-openai')
    vi.stubEnv('DATABASE_URL', 'secret-database')
    vi.stubEnv('PRIVATE_TEST_TOKEN', 'secret-private')
    const output = await runner(
      `let data=''; process.stdin.on('data', c=>data+=c); process.stdin.on('end',()=>process.stdout.write(JSON.stringify({query: JSON.parse(data), env:process.env, args:process.argv.slice(2)})));`,
    )
    expect(output).toMatchObject({ query: jobspyParameters.query, args: [] })
    expect(JSON.stringify(output)).not.toContain('secret-')
  })
  it('rejects malformed output with a fixed error', async () => {
    await expect(
      runner(`console.log('private malformed output')`),
    ).rejects.toThrow(/^Invalid JobSpy process output$/)
  })
  it('redacts stderr and exception content from failures', async () => {
    await expect(
      runner(`process.stderr.write('PRIVATE SECRET'); process.exitCode=1`),
    ).rejects.toThrow(/^JobSpy process failed$/)
  })
  it('limits the combined stdout and stderr size', async () => {
    await expect(
      runner(`process.stderr.write('x'.repeat(1000)); console.log('{}')`, {
        maxBytes: 500,
      }),
    ).rejects.toThrow(/^JobSpy output limit exceeded$/)
  })
  it('terminates a hanging process and its child that retains inherited pipes', async () => {
    const started = Date.now()
    await expect(
      runner(
        `require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'}); setInterval(()=>{},1000)`,
        { timeoutMs: 150 },
      ),
    ).rejects.toThrow(/^JobSpy process timed out$/)
    expect(Date.now() - started).toBeLessThan(3000)
  })
  it('reports an unavailable interpreter with a fixed error', async () => {
    await expect(
      runJobspy({ python: '/not-an-interpreter', runner: '/not-a-runner' }),
    ).rejects.toThrow(/^JobSpy process could not start$/)
  })
})
