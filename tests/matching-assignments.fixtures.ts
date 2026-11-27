import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { emptyProfile } from '../modules/profile/view.ts'
import { createQueue } from '../lib/queues/index.ts'
import { runOperation } from '../modules/ai/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  openAiExecutor,
  openAiOperationJob,
} from '../modules/ai/infrastructure/adapters/openai/openai.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { registerExecutor } from '../modules/ai/infrastructure/adapters/registry.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type { MatchingInput } from '../modules/matching/domain/assessment.ts'
import { responseBody, unknownAssessment } from './matching-ai.fixtures.ts'

/**
 * Shared setup of the Matching tests that assess offers through
 * assignments of the AI module (task oferty-pracy-sq2.9), with the paid
 * executor on a simulated OpenAI: no external call is made.
 */

/** The body of a single answer the paid executor sends. */
export type SingleBody = {
  instructions: string
  input: { content: { text: string }[] }[]
  text: { format: { name: string; schema: unknown } }
  model: string
  max_output_tokens: number
  reasoning?: { effort: string }
}

/**
 * The simulated provider of the paid executor. It answers each single call
 * from the request's input with `answer`, and keeps every body it got and
 * every raw response it gave.
 */
export class SimulatedProvider {
  bodies: SingleBody[] = []
  responses: string[] = []
  answer: (input: MatchingInput, body: SingleBody) => unknown = (input) =>
    responseBody(JSON.stringify(unknownAssessment(input)))
  readonly fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as SingleBody
    this.bodies.push(body)
    const input = JSON.parse(body.input[0]!.content[0]!.text) as MatchingInput
    const raw = JSON.stringify(this.answer(input, body))
    this.responses.push(raw)
    return new Response(raw)
  }
  /** Registers the paid executor on this provider. */
  register() {
    registerExecutor(openAiExecutor(this.fetcher))
    return this
  }
}

/** Creates the paid executor's queue in the test's queue schema. */
export async function prepareExecutorQueue() {
  await createQueue(openAiOperationJob.queue, 'exclusivity')
}

/**
 * Carries out every operation waiting for its executor, oldest first, as
 * the worker would, until none is left; an operation the budget has no
 * room for waits for the budget.
 */
export async function carryOut(pool: Pool) {
  for (;;) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM ai_operations WHERE state='pending' AND waits_for='executor'
       ORDER BY pending_since,id`,
    )
    if (!rows.length) return
    for (const { id } of rows) await runOperation({ operationId: id })
  }
}

/** The assignment of a request, as the AI module keeps it. */
export async function assignmentOfRequest(pool: Pool, requestId: string) {
  return (
    await pool.query(
      `SELECT a.id,a.label,a.settings_name,a.type,a.input,a.response_format,
        a.status,a.failure_reason
       FROM matching_requests r JOIN ai_assignments a ON a.id=r.assignment_id
       WHERE r.id=$1`,
      [requestId],
    )
  ).rows[0]
}

/** Moves an assignment's deadline into the past. */
export async function pastDeadline(pool: Pool, assignmentId: string) {
  await pool.query(
    `UPDATE ai_assignments SET placed_at=now()-interval '8 days',
      deadline=now()-interval '1 day' WHERE id=$1`,
    [assignmentId],
  )
}

/**
 * Saves an ad with one content version and makes it current. Returns the
 * ad's and the version's identifiers.
 */
export async function insertAd(
  pool: Pool,
  payload: Record<string, unknown> = {
    title: 'PHP developer',
    description: 'PHP backend',
    skills: [{ name: 'PHP' }],
    seniority: 'senior',
  },
) {
  const ad = randomUUID(),
    revision = randomUUID()
  let scope = (await pool.query('SELECT id FROM source_scopes LIMIT 1')).rows[0]
    ?.id as string | undefined
  if (!scope) {
    scope = randomUUID()
    await pool.query(
      "INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,'solid',$2,'{}')",
      [scope, randomUUID()],
    )
  }
  await pool.query(
    "INSERT INTO source_ads(id,source,external_id,last_seen_scope_id) VALUES($1,'solid',$2,$3)",
    [ad, randomUUID(), scope],
  )
  await pool.query(
    "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'test',$3)",
    [revision, ad, payload],
  )
  await pool.query('UPDATE source_ads SET current_revision_id=$2 WHERE id=$1', [
    ad,
    revision,
  ])
  return { ad, revision }
}

/** Saves a confirmed profile version and makes it active. */
export async function insertActiveProfile(pool: Pool, number = 1) {
  const id = randomUUID()
  await pool.query(
    'INSERT INTO profile_versions(id,number,data,command_id,draft_revision) VALUES($1,$2,$3,$4,$2)',
    [id, number, emptyProfile(), randomUUID()],
  )
  await pool.query(
    `INSERT INTO profile_head(singleton,active_version_id) VALUES(true,$1)
     ON CONFLICT (singleton) DO UPDATE SET active_version_id=$1`,
    [id],
  )
  return id
}

/** The tables a test of assessments through assignments empties. */
export const assessmentTables =
  'matching_requests,matching_rating_heads,matching_rating_revisions,ai_operation_exchange,ai_operations,ai_assignments,ai_executions,ai_attempts,ai_budget_months,profile_imports,profile_head,profile_versions,source_ads,source_scopes'
