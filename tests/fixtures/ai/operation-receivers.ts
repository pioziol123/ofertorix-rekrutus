/**
 * The test receiver of assignments for the tests of the worker, registered
 * under the settings `paid` and `local` in the pool processes. It records
 * each call in `receiver_calls` through its own connection, so the record
 * stays when the delivery is rolled back or its process is killed, and
 * saves its row in `receiver_saves` in the AI module's transaction, once
 * per assignment and entry (T6-R09). On the first call of a result with
 * `holdDelivery` it does not return while the test runs, so the test can
 * kill the worker during the delivery.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { Pool } from 'pg'
import { db } from '../../../lib/db.ts'
import {
  registerAssignmentReceiver,
  type AssignmentReceiver,
} from '../../../modules/ai/index.ts'

export const receiverTables = `
CREATE TABLE receiver_calls (
  assignment_id uuid NOT NULL, entry text NOT NULL,
  called_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE receiver_saves (
  assignment_id uuid NOT NULL, entry text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(assignment_id, entry)
);`

let records: Pool | undefined

async function recordCall(
  assignmentId: string,
  entry: 'result' | 'failure',
): Promise<number> {
  records ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  await records.query(
    'INSERT INTO receiver_calls(assignment_id,entry) VALUES($1,$2)',
    [assignmentId, entry],
  )
  const { rows } = await records.query<{ calls: number }>(
    `SELECT count(*)::int AS calls FROM receiver_calls
     WHERE assignment_id=$1 AND entry=$2`,
    [assignmentId, entry],
  )
  return rows[0]!.calls
}

const save = (assignmentId: string, entry: 'result' | 'failure') =>
  db().query(
    `INSERT INTO receiver_saves(assignment_id,entry) VALUES($1,$2)
     ON CONFLICT DO NOTHING`,
    [assignmentId, entry],
  )

const testReceiver: AssignmentReceiver = {
  async receiveResult({ assignmentId, result }) {
    const calls = await recordCall(assignmentId, 'result')
    if ((result as { holdDelivery?: boolean }).holdDelivery && calls === 1)
      await sleep(600_000)
    await save(assignmentId, 'result')
  },
  async receiveFailure({ assignmentId }) {
    await recordCall(assignmentId, 'failure')
    await save(assignmentId, 'failure')
  },
}

/** Registers the test receiver under both settings of the tests. */
export function registerTestReceivers() {
  registerAssignmentReceiver('paid', testReceiver)
  registerAssignmentReceiver('local', testReceiver)
}
