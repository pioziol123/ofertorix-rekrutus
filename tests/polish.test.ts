import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parsePolish, polishQuery, runPolish } from '../lib/sources/polish.ts'
import { projectOffer } from '../lib/offers.ts'
import {
  query,
  record,
  result,
  theprotocolDetailVariant,
} from './fixtures/polish/result.ts'

afterEach(() => vi.unstubAllEnvs())
describe('Polish source contract', () => {
  it('validates configurable filters and strict collection limits', () => {
    expect(
      polishQuery.parse({
        source: 'theprotocol',
        technology: null,
        seniority: null,
        maxOffers: 1,
      }),
    ).toMatchObject({ technology: null, seniority: null, maxOffers: 1 })
    for (const change of [
      { maxOffers: 0 },
      { maxOffers: 201 },
      { maxPages: '2' },
      { maxSeconds: 151 },
      { source: 'evil' },
      { cookies: 'private' },
    ])
      expect(
        polishQuery.safeParse({ source: 'bulldogjob', ...change }).success,
      ).toBe(false)
  })
  it('preserves Bulldogjob raw fields, separate contracts and salary strings', () => {
    const raw = record()
    const job = parsePolish(result(query(), [raw]), query()).jobs[0]!
    expect(job.sourceRecord).toEqual({
      listing: raw.listing,
      detail: raw.detail,
    })
    expect(job.salaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 18000,
          to: 24000,
          currency: 'PLN',
          period: 'Month',
          employmentType: 'B2B',
        }),
        expect.objectContaining({
          from: 15000,
          to: 19000,
          employmentType: 'UoP',
        }),
      ]),
    )
    expect(projectOffer({ source: 'bulldogjob', payload: job })).toMatchObject({
      source: 'Bulldogjob',
      mode: 'remote',
      skills: [
        { name: 'PHP', optional: null },
        { name: 'SQL', optional: null },
      ],
    })
  })
  it('preserves hourly salary basis and required versus optional technologies', () => {
    const q = query('theprotocol')
    const job = parsePolish(result(q), q).jobs[0]!
    expect(job.salaries).toEqual([
      expect.objectContaining({
        from: 100,
        to: 150,
        currency: 'PLN',
        period: 'Hour',
        employmentType: 'B2B',
        basis: 'netto (+ VAT)',
      }),
    ])
    expect(projectOffer({ source: 'theprotocol', payload: job })).toMatchObject(
      {
        source: 'theprotocol.it',
        skills: [
          { name: 'PHP', optional: false },
          { name: 'Go', optional: true },
        ],
      },
    )
  })
  it('projects actual theprotocol detail currencyCode, kindCode and home-office fields', () => {
    const q = query('theprotocol'),
      raw = theprotocolDetailVariant()
    const job = parsePolish(result(q, [raw]), q).jobs[0]!
    expect(job.salaries).toEqual([
      expect.objectContaining({
        from: 100,
        to: 150,
        currency: 'PLN',
        period: 'Hour',
        employmentType: 'B2B',
        basis: 'netto (+ VAT)',
      }),
    ])
    expect(projectOffer({ source: 'theprotocol', payload: job })).toMatchObject(
      {
        mode: 'remote',
        salaries: [
          expect.objectContaining({
            from: 100,
            to: 150,
            currency: 'PLN',
            period: 'Hour',
            contract: 'B2B',
          }),
        ],
      },
    )
    expect(job.sourceRecord).toEqual({
      listing: raw.listing,
      detail: raw.detail,
    })
  })
  it('retains raw contract names while projecting recognized contract values', () => {
    const q = query('theprotocol'),
      raw = record('theprotocol')
    const attributes = raw.detail.attributes as Record<string, unknown>
    const employment = attributes.employment as Record<string, unknown>
    employment.typesOfContracts = [
      {
        name: 'umowa o pracę',
        salary: {
          minValue: 10000,
          maxValue: 14000,
          currencySymbol: 'zł',
          timeUnit: { longForm: 'miesięcznie' },
        },
      },
      {
        name: 'future contract',
        salary: {
          minValue: 15000,
          maxValue: 18000,
          currencySymbol: 'zł',
          timeUnit: { longForm: 'miesięcznie' },
        },
      },
    ]
    const job = parsePolish(result(q, [raw]), q).jobs[0]!
    expect(job.salaries).toEqual([
      expect.objectContaining({ employmentType: 'UoP', period: 'Month' }),
      expect.objectContaining({ employmentType: 'future contract' }),
    ])
    expect(job.sourceRecord).toEqual({
      listing: raw.listing,
      detail: raw.detail,
    })
  })
  it('does not expose hidden or inverted salaries as employer offers', () => {
    const raw = record()
    raw.detail.b2bSalary = { hidden: true, from: 1, to: 2 }
    raw.detail.employmentSalary = { from: 100, to: 50 }
    expect(
      parsePolish(result(query(), [raw]), query()).jobs[0]!.salaries,
    ).toEqual([])
  })
  it.each(['bulldogjob', 'theprotocol'] as const)(
    'does not guess missing qualifications for %s',
    (source) => {
      const q = query(source),
        raw = record(source)
      raw.detail = {
        id: raw.listing.id,
        position: 'Unknown',
        attributes: { title: { value: 'Unknown' } },
      } as typeof raw.detail
      raw.listing = { id: raw.listing.id } as typeof raw.listing
      const parsed = parsePolish(result(q, [raw]), q)
      expect(parsed.status).toBe('partial')
      expect(parsed.jobs[0]).toMatchObject({
        description: null,
        isRemote: null,
        isHybrid: null,
        experienceLevel: null,
        qualificationUnknown: ['senior', 'PHP'],
        salaries: [],
        skills: [],
      })
    },
  )
  it.each([
    'https://bulldogjob.pl.evil.test/companies/jobs/123-one',
    'https://user:secret@bulldogjob.pl/companies/jobs/123-one',
    'https://bulldogjob.pl/companies/jobs/999-other',
    'https://bulldogjob.pl/companies/jobs/123-one?token=secret',
  ])(
    'rejects mismatched or unsafe URL %s while keeping good records',
    (url) => {
      const bad = { ...record(), url }
      const parsed = parsePolish(result(query(), [record(), bad]), query())
      expect(parsed).toMatchObject({
        status: 'partial',
        diagnostics: { rejected: 1 },
      })
      expect(parsed.jobs).toHaveLength(1)
    },
  )
  it('rejects detail/list identity mismatch and counts duplicates', () => {
    const bad = record()
    bad.detail.id = '999-other'
    expect(
      parsePolish(result(query(), [record(), record(), bad]), query()),
    ).toMatchObject({
      status: 'partial',
      diagnostics: { rejected: 1, duplicates: 1 },
    })
  })
  it.each([
    { schemaVersion: 2 },
    { source: 'theprotocol' },
    { query: { ...query(), technology: 'Go' } },
  ])('rejects incompatible metadata %j', (change) => {
    expect(() =>
      parsePolish(result(query(), undefined, change), query()),
    ).toThrow('Invalid Polish source result')
  })
  it('retains candidates from interrupted collection', () => {
    const base = result()
    expect(
      parsePolish(
        {
          ...base,
          status: 'partial',
          diagnostics: { ...base.diagnostics, stopReason: 'challenge' },
        },
        query(),
      ),
    ).toMatchObject({
      status: 'partial',
      jobs: [expect.any(Object)],
      diagnostics: { marketComplete: false, stopReason: 'challenge' },
    })
  })
})

describe('isolated Polish subprocess', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    )
  })
  async function runner(
    code: string,
    options: { timeoutMs?: number; maxBytes?: number } = {},
  ) {
    const dir = await mkdtemp(join(tmpdir(), 'polish-test-'))
    dirs.push(dir)
    const path = join(dir, 'runner with spaces.cjs')
    await writeFile(path, code)
    return runPolish(query(), {
      python: process.execPath,
      runner: path,
      ...options,
    })
  }
  it('passes exact query via stdin and isolates credentials and proxies', async () => {
    vi.stubEnv('DATABASE_URL', 'SECRET')
    vi.stubEnv('HTTP_PROXY', 'SECRET')
    vi.stubEnv('OPENAI_API_KEY', 'SECRET')
    const output = await runner(
      `let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>console.log(JSON.stringify({query:JSON.parse(data),env:process.env,args:process.argv.slice(2)})))`,
    )
    expect(output).toMatchObject({ query: query(), args: [] })
    expect(JSON.stringify(output)).not.toContain('SECRET')
  })
  it('redacts invalid stdout and private stderr', async () => {
    await expect(runner(`console.log('PRIVATE')`)).rejects.toThrow(
      /^Invalid Polish source process output$/,
    )
    await expect(
      runner(`console.error('PRIVATE');process.exitCode=1`),
    ).rejects.toThrow(/^Polish source process failed$/)
  })
  it('bounds combined stdout and stderr', async () => {
    await expect(
      runner(`console.error('x'.repeat(1000));console.log('{}')`, {
        maxBytes: 500,
      }),
    ).rejects.toThrow(/^Polish source output limit exceeded$/)
  })
  it('kills a hung process and children retaining output pipes', async () => {
    await expect(
      runner(
        `require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});setInterval(()=>{},1000)`,
        { timeoutMs: 150 },
      ),
    ).rejects.toThrow(/^Polish source process timed out$/)
  })
})
