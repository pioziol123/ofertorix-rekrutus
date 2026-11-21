/**
 * Test executors of assignments for the tests of the worker: a paid one
 * with a price list and a local one without, each on its own queue with
 * exclusivity on a constant key, like the real executors (ZA-D01). An
 * operation's input is JSON with a tag, a delay and optionally `uncertain`;
 * the executor records when it was called and when it returned in
 * `operation_calls`, through its own connection, then answers with a
 * result, or ends uncertain when the input asks for it.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { Pool } from 'pg'
import { defineJob } from '../../../lib/queues/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type {
  Executor,
  OperationJobData,
  PriceList,
} from '../../../modules/ai/executors/declaration.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { registerExecutor } from '../../../modules/ai/executors/registry.ts'

export const operationCallsTable = `
CREATE TABLE operation_calls (
  tag text NOT NULL, executor text NOT NULL, pid int NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz
);`

const priceList: PriceList = {
  model: 'paid-model',
  version: 'prices-1',
  inputUsdPerMillion: '1',
  outputUsdPerMillion: '2',
  usdPln: '4',
  fxVersion: 'fx-1',
  maxInputTokens: 1000,
  maxOutputTokens: 500,
}

export const paidTestJob = defineJob<OperationJobData>({
  queue: 'test-ai-operation-paid',
  key: { mode: 'exclusivity', value: 'test-ai-operation-paid' },
})
export const localTestJob = defineJob<OperationJobData>({
  queue: 'test-ai-operation-local',
  key: { mode: 'exclusivity', value: 'test-ai-operation-local' },
})

let records: Pool | undefined

function testExecutor(
  name: string,
  job: typeof paidTestJob,
  prices: PriceList | null,
): Executor {
  return {
    name,
    job,
    services: {
      single: {
        offers: [{ parameters: { model: 'test' }, priceList: prices }],
        tools: [],
        maxRunSeconds: 60,
      },
    },
    configured: () => true,
    async carryOut(work) {
      const { tag, delayMs, uncertain } = JSON.parse(work.content.input) as {
        tag: string
        delayMs: number
        uncertain?: boolean
      }
      records ??= new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
      })
      await records.query(
        'INSERT INTO operation_calls(tag,executor,pid) VALUES($1,$2,$3)',
        [tag, name, process.pid],
      )
      await sleep(delayMs)
      await records.query(
        'UPDATE operation_calls SET ended_at=clock_timestamp() WHERE tag=$1',
        [tag],
      )
      if (uncertain)
        return {
          kind: 'uncertain',
          cause: 'network',
          usage: {
            sent: true,
            inputTokens: null,
            outputTokens: null,
            toolCalls: null,
          },
        }
      return {
        kind: 'result',
        content: { tag },
        usage: { sent: true, inputTokens: 10, outputTokens: 5, toolCalls: 0 },
      }
    },
    materials: () => null,
  }
}

export const paidTestExecutor = testExecutor(
  'test-paid',
  paidTestJob,
  priceList,
)
export const localTestExecutor = testExecutor('test-local', localTestJob, null)

/** Registers both test executors in the process. */
export function registerTestExecutors() {
  registerExecutor(paidTestExecutor)
  registerExecutor(localTestExecutor)
}
