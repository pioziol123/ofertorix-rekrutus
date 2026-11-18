import { createHash, randomUUID } from 'node:crypto'
import { db } from '../../../../lib/db.ts'

/**
 * The installation's one shared local slot. Executions on a local runtime
 * take it in request order and hold it while their process runs, and
 * while the process is in an unknown state. Only a confirmed end of the
 * process releases it; an expired lease never does.
 */

/** A worker's hold of the slot for one execution. */
export type LocalClaim = {
  executionId: string
  requestId: string
  owner: string
  generation: string
}

/** Places an execution in the local queue, in the current transaction. */
export async function enqueueLocal(executionId: string) {
  await db().query('INSERT INTO ai_local_queue(execution_id) VALUES($1)', [
    executionId,
  ])
}

/**
 * Takes the slot for the execution when the slot is free and the
 * execution is the first queued one. Runs in the caller's transaction,
 * which also claims the execution; no model call happens under the lock.
 */
export async function claimLocalSlot(
  executionId: string,
): Promise<LocalClaim | null> {
  const slot = (
    await db().query(
      "SELECT execution_id FROM ai_local_slots WHERE id='local-ai' FOR UPDATE",
    )
  ).rows[0]
  if (!slot || slot.execution_id) return null
  const next = (
    await db().query(
      "SELECT q.execution_id FROM ai_local_queue q JOIN ai_executions e ON e.id=q.execution_id WHERE q.state='queued' AND e.state='queued' ORDER BY q.queue_sequence LIMIT 1",
    )
  ).rows[0]
  if (next?.execution_id !== executionId) return null
  await db().query(
    "UPDATE ai_executions SET runtime_state='running',runtime_observed_at=now(),revision=revision+1 WHERE id=$1",
    [executionId],
  )
  const owner = randomUUID(),
    requestId = randomUUID()
  const updated = await db().query(
    "UPDATE ai_local_slots SET execution_id=$1,generation=generation+1,lease_owner=$2,lease_until=now()+interval '60 seconds' WHERE id='local-ai' RETURNING generation",
    [executionId, owner],
  )
  await db().query(
    "UPDATE ai_local_queue SET state='claimed' WHERE execution_id=$1",
    [executionId],
  )
  await db().query(
    'INSERT INTO ai_runtime_requests(id,execution_id) VALUES($1,$2)',
    [requestId, executionId],
  )
  return {
    executionId,
    requestId,
    owner,
    generation: String(updated.rows[0].generation),
  }
}

/**
 * Records the intent to send the request as sent, only while the worker
 * still holds a live lease; false means the request may not be sent.
 */
export async function authorizeLocalRequest(claim: LocalClaim) {
  const result = await db().query(
    `UPDATE ai_runtime_requests r SET state='sent' FROM ai_local_slots s
     WHERE r.id=$1 AND r.state='intent' AND s.id='local-ai' AND s.execution_id=r.execution_id
       AND s.generation=$2 AND s.lease_owner=$3 AND s.lease_until>now() RETURNING r.id`,
    [claim.requestId, claim.generation, claim.owner],
  )
  return result.rowCount === 1
}

/** Extends a live lease; a lapsed one stays lapsed. */
export async function renewLocal(claim: LocalClaim) {
  await db().query(
    "UPDATE ai_local_slots SET lease_until=now()+interval '60 seconds' WHERE id='local-ai' AND execution_id=$1 AND generation=$2 AND lease_owner=$3 AND lease_until>now()",
    [claim.executionId, claim.generation, claim.owner],
  )
}

/** Keeps the raw response of the local runtime with the execution. */
export async function archiveLocal(claim: LocalClaim, raw: string) {
  await db().query(
    'INSERT INTO ai_execution_artifacts(id,execution_id,request_id,kind,content,sha256) VALUES($1,$2,$3,$4,$5,$6)',
    [
      randomUUID(),
      claim.executionId,
      claim.requestId,
      'response',
      raw,
      createHash('sha256').update(raw).digest('hex'),
    ],
  )
}

/**
 * Records what is observed about the process after the request: ended, or
 * unknown. A confirmed end releases the slot, also when the lease lapsed
 * and recovery already ended the execution as uncertain: the slot was
 * kept only for the process, and the process has ended. Returns whether
 * the worker still held a live lease (the condition for using the outcome)
 * and whether the slot was released. Runs in the caller's transaction.
 */
export async function finishLocal(claim: LocalClaim, ended: boolean) {
  const slot = (
    await db().query(
      "SELECT execution_id,generation,lease_owner,lease_until>now() AS live FROM ai_local_slots WHERE id='local-ai' FOR UPDATE",
    )
  ).rows[0]
  const held =
    slot?.execution_id === claim.executionId &&
    String(slot.generation) === claim.generation &&
    slot.lease_owner === claim.owner &&
    slot.live === true
  const released = ended
  await db().query(
    'UPDATE ai_runtime_requests SET state=$2,finished_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE id=$1',
    [claim.requestId, ended ? 'finished' : 'unknown', ended],
  )
  await db().query(
    'UPDATE ai_executions SET runtime_state=$2,runtime_observed_at=now(),stop_confirmed_at=CASE WHEN $3 THEN now() ELSE NULL END,revision=revision+1 WHERE id=$1',
    [claim.executionId, ended ? 'finished' : 'unknown', ended],
  )
  if (released) {
    await db().query(
      "UPDATE ai_local_queue SET state='finished' WHERE execution_id=$1",
      [claim.executionId],
    )
    await db().query(
      "UPDATE ai_local_slots SET execution_id=NULL,lease_owner=NULL,lease_until=NULL WHERE id='local-ai' AND execution_id=$1",
      [claim.executionId],
    )
  }
  return { held, released }
}

/**
 * Marks as unknown the process of an execution whose lease lapsed while
 * it ran. Observation only: the slot stays occupied and nothing is sent
 * again. Returns the executions still running whose process is unknown,
 * including those observed earlier.
 */
export async function observeLapsedLeases(): Promise<string[]> {
  await db().query(
    "UPDATE ai_executions e SET runtime_state='unknown',runtime_observed_at=now(),revision=revision+1 FROM ai_local_slots s WHERE s.execution_id=e.id AND s.lease_until<now() AND e.runtime_state='running'",
  )
  const unknown = await db().query(
    "SELECT id FROM ai_executions WHERE state='running' AND runtime_state='unknown' ORDER BY created_at",
  )
  return unknown.rows.map((row) => row.id as string)
}

/** The queued executions waiting for the slot, in request order. */
export async function queuedLocalExecutions(): Promise<string[]> {
  const queued = await db().query(
    "SELECT q.execution_id FROM ai_local_queue q JOIN ai_executions e ON e.id=q.execution_id WHERE q.state='queued' AND e.state='queued' ORDER BY q.queue_sequence",
  )
  return queued.rows.map((row) => row.execution_id as string)
}
