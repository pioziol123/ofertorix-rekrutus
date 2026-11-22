import { createRequire } from 'node:module'
import type { Pool } from 'pg'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type { MatchingInput } from '../modules/matching/domain/assessment.ts'

/**
 * Shared setup of the Matching tests: the migrations of a test schema, the
 * test price list and the answers of a simulated OpenAI. No external call
 * is made.
 */

/** The migrations a Matching test schema needs, in order. */
export const matchingMigrations = [
  '1770000000000_setup',
  '1770000000001_sources',
  '1770000000004_profiles',
  '1770000000006_matching',
  '1770000000007_matching_payload',
  '1770000000008_matching_groups',
  '1770000000009_rating_revisions',
  '1770000000012_matching_batch_archives',
  '1770000000013_local_ai',
  '1770000000016_ai_execution_requests',
  '1770000000017_profile_ai_executions',
  '1770000000018_matching_ai_executions',
]

/** The lease of running paid AI work (task oferty-pracy-0mq.15). */
export const aiLeaseMigration = '1770000000020_ai_execution_lease'

/**
 * AI work without the lease and the shared local slot (task
 * oferty-pracy-2ba.6); it follows the lease migration.
 */
export const aiWithoutLeaseMigration =
  '1770000000026_ai_without_local_slot_and_lease'

/**
 * The assignments of the AI module (epic sq2), the assignment column of
 * Matching's requests (task oferty-pracy-sq2.9) and the carried amounts of
 * the budget (task oferty-pracy-sq2.11); they follow the migration without
 * the lease.
 */
export const assignmentMigrations = [
  '1770000000027_ai_assignments',
  '1770000000030_ai_operation_exchange',
  '1770000000031_ai_budget_default_limit',
  '1770000000033_matching_assignment',
  '1770000000035_ai_budget_carried_amounts',
]

export async function migrate(
  pool: Pool,
  names = [
    ...matchingMigrations,
    aiLeaseMigration,
    aiWithoutLeaseMigration,
    ...assignmentMigrations,
  ],
) {
  const statements: string[] = []
  for (const name of names)
    createRequire(import.meta.url)(`../migrations/${name}.cjs`).up({
      sql: (s: string) => statements.push(s),
    })
  await pool.query(statements.join('\n'))
}

/** The test price list, for the model of Matching's settings of assignments. */
export const pricing = {
  model: 'gpt-6-luna',
  version: 'test',
  inputUsdPerMillion: '1',
  outputUsdPerMillion: '1',
  usdPln: '1',
  fxVersion: 'test',
  maxInputTokens: 20000,
  maxOutputTokens: 500,
}

/** An answer with every criterion of the input unknown. */
export function unknownAssessment(input: MatchingInput) {
  return {
    summary: 'Brak danych',
    strengths: [],
    gaps: [],
    criteria: input.criteria.map((c) => ({
      id: c.id,
      state: 'unknown',
      score: null,
      profileEvidence: null,
      offerEvidence: null,
      reason: 'Brak potwierdzenia',
    })),
  }
}

/** A Responses API body with one content of the given type. */
export function responseBody(
  text: string,
  options: { type?: string; inputTokens?: number; id?: string } = {},
) {
  return {
    id: options.id ?? 'resp_test',
    status: 'completed',
    usage: { input_tokens: options.inputTokens ?? 100, output_tokens: 20 },
    output: [
      {
        type: 'message',
        content: [{ type: options.type ?? 'output_text', text }],
      },
    ],
  }
}
