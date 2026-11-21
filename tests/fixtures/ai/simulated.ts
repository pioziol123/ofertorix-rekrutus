/**
 * Simulated providers and receivers for the AI tests that run the worker:
 * the same code is registered in the test process (which requests the
 * work) and in the pool processes of the worker (which carry it out).
 *
 * What the provider does is read from the request's input, a JSON object:
 * - `tag`: names the execution in the test's records;
 * - `delayMs`: how long the call takes;
 * - `transient`: the call fails once with a transient error asking for a
 *   wait of `transient` ms, the first time it is made for the tag;
 * - `exit`: the first call for the tag ends the pool process, as when the
 *   process is lost (ASSUMPTION(oferty-pracy-2ba.1/ASM-4));
 * - `hang`: the call never ends.
 *
 * Calls and deliveries are written to the test's tables through a pool of
 * their own, so that a delivery rolled back still leaves its record.
 */
import { Pool } from 'pg'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { ModelError } from '../../../modules/ai/provider-adapter.ts'
import type { ProviderAdapter } from '../../../modules/ai/provider-adapter.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { registerProviderAdapter } from '../../../modules/ai/provider-registry.ts'
import { registerResultReceiver } from '../../../modules/ai/index.ts'

export const paidKey = 'paid-summaries'
export const localKey = 'local-summaries'

/** The tables the simulated providers and receivers write to. */
export const recordTables = `
CREATE TABLE provider_calls (
  tag text NOT NULL, pid int NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz
);
CREATE TABLE deliveries (
  operation_id uuid NOT NULL, kind text NOT NULL, state text, cause text,
  accepted boolean NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE receiver_failures (
  operation_id uuid PRIMARY KEY, remaining int NOT NULL
);
CREATE TABLE handler_failures (
  execution_id uuid PRIMARY KEY, remaining int NOT NULL
);
`

type Behaviour = {
  tag: string
  delayMs?: number
  transient?: number
  exit?: boolean
  hang?: boolean
}

let records: Pool | undefined
const pool = () =>
  (records ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  }))

function simulated(provider: string, local: boolean): ProviderAdapter {
  return {
    provider,
    ...(local ? { sharedSlot: true } : {}),
    modes: {
      single: () => ({
        async generate(request) {
          const behaviour = JSON.parse(request.input) as Behaviour
          const calls = (
            await pool().query(
              'INSERT INTO provider_calls(tag,pid) VALUES($1,$2) RETURNING (SELECT count(*)::int FROM provider_calls WHERE tag=$1) AS earlier',
              [behaviour.tag, process.pid],
            )
          ).rows[0].earlier as number
          // ASSUMPTION(oferty-pracy-2ba.1/ASM-4): the worker fails the
          // attempt of a pool process that exits by itself at once.
          if (behaviour.exit && calls === 0) process.exit(3)
          if (behaviour.hang) await new Promise(() => {})
          await new Promise((done) => setTimeout(done, behaviour.delayMs ?? 0))
          await pool().query(
            'UPDATE provider_calls SET ended_at=clock_timestamp() WHERE tag=$1 AND pid=$2 AND ended_at IS NULL',
            [behaviour.tag, process.pid],
          )
          if (behaviour.transient !== undefined && calls === 0)
            throw new ModelError('http', {
              requestSent: true,
              transient: true,
              retryAfterMs: behaviour.transient,
              usage: { inputTokens: 10, outputTokens: 0 },
            })
          return {
            outcome: 'completed',
            text: JSON.stringify({ text: behaviour.tag }),
            usage: { inputTokens: 100, outputTokens: 50 },
            responseId: `response-${behaviour.tag}`,
          }
        },
      }),
    },
    endOf(observation) {
      if (observation.kind === 'outcome')
        return { state: 'failed', cause: observation.outcome }
      const error = observation.error
      return error instanceof ModelError
        ? { state: 'failed', cause: error.code }
        : { state: 'uncertain', cause: 'unknown' }
    },
  }
}

/** Registers the simulated paid and local providers. */
export function registerSimulatedProviders() {
  registerProviderAdapter(simulated('simulated', false))
  registerProviderAdapter(simulated('simulated-local', true))
}

/**
 * Registers the receivers of both settings keys: they record each delivery
 * and fail while the operation has failures left.
 */
export function registerTestReceivers() {
  for (const key of [paidKey, localKey])
    registerResultReceiver(key, {
      async receiveResult(delivery) {
        const failing = await pool().query(
          'UPDATE receiver_failures SET remaining=remaining-1 WHERE operation_id=$1 AND remaining>0 RETURNING remaining',
          [delivery.operationId],
        )
        await pool().query(
          'INSERT INTO deliveries(operation_id,kind,accepted) VALUES($1,$2,$3)',
          [delivery.operationId, 'result', !failing.rowCount],
        )
        if (failing.rowCount) throw new Error('Receiver refused the result')
        return { accepted: true }
      },
      async receiveFailure(delivery) {
        await pool().query(
          'INSERT INTO deliveries(operation_id,kind,state,cause,accepted) VALUES($1,$2,$3,$4,true)',
          [delivery.operationId, 'failure', delivery.state, delivery.cause],
        )
      },
    })
}
