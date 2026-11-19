// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  jobspyParameters,
  parametersFor,
} from '../../../modules/sources/infrastructure/adapters/jobspy/runner.ts'

export const job = (overrides: Record<string, unknown> = {}) => ({
  id: 'in-ab123',
  site: 'indeed',
  job_url: 'https://pl.indeed.com/viewjob?jk=ab123',
  title: 'PHP engineer',
  company: 'Example',
  description: 'Develop services',
  location: { city: 'Warszawa', state: null, country: 'Poland' },
  date_posted: '2026-11-01',
  job_level: null,
  skills: ['PHP'],
  job_type: ['contract'],
  is_remote: false,
  min_amount: 20000,
  max_amount: 25000,
  currency: 'PLN',
  interval: 'monthly',
  salary_origin: 'portal_estimate',
  salary_evidence: { source: 'portal' },
  ...overrides,
})
export const result = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  source: 'indeed',
  upstream_revision: '68b88d6909a2342ad75fbb945c4204a3a7ed6665',
  fork_revision: 'oferty-contract-1',
  started_at: '2026-11-02T10:00:00Z',
  finished_at: '2026-11-02T10:01:00Z',
  query: structuredClone(jobspyParameters.query),
  status: 'completed',
  stop_reason: 'exhausted',
  market_complete: false,
  skipped_jobs: 0,
  request_count: 1,
  missing_descriptions: 0,
  warnings: [],
  jobs: [job()],
  ...overrides,
})

export function sourceResult(
  source: 'linkedin' | 'bayt',
  overrides: Record<string, unknown> = {},
) {
  return result({
    schema_version: 2,
    source,
    fork_revision: 'oferty-contract-2',
    query: structuredClone(parametersFor(source).query),
    status: 'limited',
    stop_reason: 'unverified',
    jobs: [
      job({
        id: source === 'linkedin' ? 'li-ab123' : 'bayt-ab123',
        site: source,
        job_url:
          source === 'linkedin'
            ? 'https://www.linkedin.com/jobs/view/ab123'
            : 'https://www.bayt.com/en/poland/jobs/ab123/',
        salary_origin: 'unknown',
      }),
    ],
    ...overrides,
  })
}
