import { assessRemoteEligibility } from './remote-eligibility.ts'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { z } from 'zod'
import { hash, type Offer } from './solid.ts'
import {
  ConnectorAbortedError,
  ConnectorError,
} from '../../modules/sources/infrastructure/adapters/connector.ts'
import {
  jobspyCatalog,
  remoteMarket,
  sourceEnabled,
  type JobspySource,
} from './jobspy-catalog.ts'

export const jobspySource = 'indeed'
export const jobspyQueue = 'source-indeed-jobspy'
export const jobspyParameters = {
  source: jobspySource,
  adapterVersion: 5,
  query: {
    search_term: 'Senior PHP',
    location: 'Poland',
    country_indeed: 'poland',
    results_wanted: 50,
    hours_old: null,
    is_remote: false,
    job_type: null,
    http: {
      max_requests: 10,
      max_seconds: 90,
      timeout_seconds: 15,
      min_interval_seconds: 2,
      max_attempts: 2,
    },
  },
} as const
export const jobspyFingerprint = hash(jobspyParameters)
export const jobspyEnabled = (source: JobspySource = 'indeed') =>
  sourceEnabled(source)
export function parametersFor(source: JobspySource = 'indeed') {
  if (source === 'indeed') return jobspyParameters
  return {
    source,
    adapterVersion: 3,
    query: {
      ...jobspyParameters.query,
      source,
      fetch_description: true,
      ...(remoteMarket(source)
        ? {
            is_remote: true,
            location: null,
            country_indeed: remoteMarket(source)!,
          }
        : {}),
    },
  }
}
export const queueFor = (source: JobspySource) =>
  `source-${source === 'indeed' ? 'indeed' : source}-jobspy`
export const fingerprintFor = (source: JobspySource) =>
  hash(parametersFor(source))
const count = z.number().int().nonnegative().max(1_000_000)
const nullableText = z.string().nullable()
const amount = z.number().finite().nonnegative().nullable()
const job = z
  .object({
    id: z.string().min(1).max(250),
    site: z.string(),
    job_url: z.string().url(),
    title: z.string().trim().min(1),
    company: nullableText,
    description: nullableText,
    location: z
      .object({
        city: nullableText,
        state: nullableText,
        country: nullableText,
      })
      .nullable(),
    date_posted: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    job_level: nullableText,
    skills: z.array(z.string()).nullable(),
    job_type: z.array(z.string()).nullable(),
    is_remote: z.boolean().nullable(),
    min_amount: amount,
    max_amount: amount,
    currency: nullableText,
    interval: z
      .enum(['yearly', 'monthly', 'weekly', 'daily', 'hourly'])
      .nullable(),
    salary_origin: z.enum(['employer', 'portal_estimate', 'unknown']),
    salary_evidence: z.record(z.string(), z.unknown()).nullable(),
  })
  .passthrough()
const envelope = z
  .object({
    schema_version: z.union([z.literal(1), z.literal(2)]),
    source: z.string(),
    upstream_revision: z.literal('68b88d6909a2342ad75fbb945c4204a3a7ed6665'),
    fork_revision: z.enum(['oferty-contract-1', 'oferty-contract-2']),
    started_at: z.string().datetime({ offset: true }),
    finished_at: z.string().datetime({ offset: true }),
    query: z.record(z.string(), z.unknown()),
    status: z.enum(['completed', 'limited', 'partial', 'failed']),
    stop_reason: z.enum([
      'exhausted',
      'result_limit',
      'no_progress',
      'page_error',
      'unexpected_error',
      'request_limit',
      'deadline',
      'rate_limited',
      'transport_error',
      'unsupported_scope',
      'unsupported_source',
      'blocked',
      'adapter_error',
      'unverified',
    ]),
    market_complete: z.literal(false),
    skipped_jobs: count,
    request_count: count,
    missing_descriptions: count,
    warnings: z.array(z.string().regex(/^[a-z0-9_]{1,80}$/)).max(10_000),
    jobs: z.array(z.unknown()).max(100),
  })
  .strict()

export function parseJobspy(value: unknown, source: JobspySource = 'indeed') {
  const meta = jobspyCatalog[source]
  const expected = parametersFor(source)

  const parsed = envelope.safeParse(value)
  if (!parsed.success) throw new ConnectorError('Invalid JobSpy result')
  const data = parsed.data
  if (
    data.source !== source ||
    data.schema_version !== (source === 'indeed' ? 1 : 2) ||
    data.fork_revision !==
      (source === 'indeed' ? 'oferty-contract-1' : 'oferty-contract-2') ||
    hash(data.query) !== hash(expected.query) ||
    data.jobs.length > expected.query.results_wanted ||
    Date.parse(data.finished_at) < Date.parse(data.started_at)
  )
    throw new ConnectorError('Invalid JobSpy result')
  let rejected = 0,
    duplicates = 0,
    outsideScope = 0
  const ids = new Set<string>()
  const jobs: Offer[] = []
  for (const raw of data.jobs) {
    const result = job.safeParse(raw)
    if (!result.success) {
      rejected++
      continue
    }
    const record = result.data
    const url = new URL(record.job_url)
    if (
      record.site !== source ||
      !record.id.startsWith(meta.prefix) ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(record.id.slice(meta.prefix.length)) ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !meta.hosts.some(
        (host) => url.hostname === host || url.hostname.endsWith('.' + host),
      )
    ) {
      rejected++
      continue
    }
    const country = record.location?.country?.trim().toLowerCase()
    if (
      !remoteMarket(source) &&
      record.is_remote !== true &&
      country &&
      !['poland', 'polska', 'pl', 'unknown', 'worldwide', 'remote'].includes(
        country,
      )
    ) {
      outsideScope++
      continue
    }
    if (ids.has(record.id)) {
      duplicates++
      continue
    }
    ids.add(record.id)
    const period =
      record.interval === null
        ? null
        : {
            yearly: 'Year',
            monthly: 'Month',
            weekly: 'Week',
            daily: 'Day',
            hourly: 'Hour',
          }[record.interval]
    jobs.push({
      jobOfferKey: record.id.slice(meta.prefix.length),
      url: record.job_url,
      title: record.title,
      company: record.company,
      description: record.description,
      locations: record.location
        ? [Object.values(record.location).filter(Boolean).join(', ')]
        : [],
      validFrom: record.date_posted,
      experienceLevel: record.job_level,
      // Source skill presence does not establish that it is mandatory.
      skills: (record.skills ?? []).map((name) => ({ name })),
      isRemote: record.is_remote === true ? true : null,
      salary:
        record.min_amount !== null || record.max_amount !== null
          ? {
              from: record.min_amount,
              to: record.max_amount,
              currency: record.currency,
              period,
              employmentType: null,
              origin: record.salary_origin,
            }
          : null,
      qualificationUnknown: ['PHP', 'senior'],
      remoteEligibility: assessRemoteEligibility(record),
      sourceRecord: record,
    })
  }
  const { jobs: _jobs, ...metadata } = data
  const incomplete =
    outsideScope > 0 ||
    rejected > 0 ||
    duplicates > 0 ||
    data.skipped_jobs > 0 ||
    jobs.some((j) => !j.description) ||
    data.missing_descriptions > 0
  const status =
    data.status === 'failed'
      ? jobs.length
        ? 'partial'
        : 'failed'
      : data.status === 'completed' &&
          !incomplete &&
          data.stop_reason === 'exhausted'
        ? 'complete'
        : 'partial'
  return {
    jobs,
    status,
    diagnostics: { ...metadata, rejected, duplicates, outsideScope },
    error:
      status === 'complete'
        ? null
        : 'JobSpy query incomplete; inspect source diagnostics',
  }
}
export type JobspyBatch = ReturnType<typeof parseJobspy>

export type ProcessOptions = {
  python?: string
  runner?: string
  timeoutMs?: number
  maxBytes?: number
  /** Aborting kills the process and rejects with `ConnectorAbortedError`. */
  signal?: AbortSignal
  source?: JobspySource
}
export function runJobspy(options: ProcessOptions = {}): Promise<unknown> {
  return new Promise((resolveResult, reject) => {
    const python =
      options.python ?? process.env.JOBSPY_PYTHON ?? '/opt/jobspy/bin/python'
    const runner =
      options.runner ??
      process.env.JOBSPY_RUNNER_PATH ??
      resolve('scripts/jobspy-runner.py')
    const child = spawn(python, [runner], {
      shell: false,
      detached: process.platform !== 'win32',
      env: {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        LANG: 'C.UTF-8',
        PYTHONUNBUFFERED: '1',
        DOCUMENTS_DIR: process.env.DOCUMENTS_DIR ?? '/data/documents',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let bytes = 0,
      issue: string | null = null
    const chunks: Buffer[] = []
    const stop = (message: string) => {
      issue ??= message
      try {
        if (child.pid && process.platform !== 'win32')
          process.kill(-child.pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch {
        /* It may already have exited. */
      }
    }
    const timer = setTimeout(
      () => stop('JobSpy process timed out'),
      options.timeoutMs ?? 120_000,
    )
    const abort = () => stop('JobSpy process aborted')
    if (options.signal?.aborted) abort()
    else options.signal?.addEventListener('abort', abort, { once: true })
    const read = (chunk: Buffer, stdout: boolean) => {
      bytes += chunk.length
      if (bytes > (options.maxBytes ?? 8 * 1024 * 1024))
        stop('JobSpy output limit exceeded')
      else if (stdout) chunks.push(chunk)
    }
    child.stdout.on('data', (chunk: Buffer) => read(chunk, true))
    child.stderr.on('data', (chunk: Buffer) => read(chunk, false))
    child.stdin.on('error', () => {})
    child.on('error', () => {
      issue ??= 'JobSpy process could not start'
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      if (issue || code !== 0) {
        reject(
          options.signal?.aborted
            ? new ConnectorAbortedError()
            : new ConnectorError(issue ?? 'JobSpy process failed'),
        )
        return
      }
      try {
        resolveResult(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new ConnectorError('Invalid JobSpy process output'))
      }
    })
    child.stdin.end(
      JSON.stringify(parametersFor(options.source ?? 'indeed').query),
    )
  })
}
