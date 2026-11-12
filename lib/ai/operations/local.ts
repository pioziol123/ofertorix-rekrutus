import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'

export type LocalClaim = {
  executionId: string
  requestId: string
  owner: string
  generation: string
}

// Caller owns the short SQL transaction. No model calls occur under these locks.
export async function claimLocal(
  client: PoolClient,
  executionId: string,
): Promise<LocalClaim | null> {
  const slot = (
    await client.query(
      "SELECT * FROM ai_local_slots WHERE id='local-ai' FOR UPDATE",
    )
  ).rows[0]
  if (!slot || slot.execution_id) return null // Lease expiry is never permission to generate again.
  const next = (
    await client.query(
      "SELECT q.execution_id FROM ai_local_queue q JOIN ai_executions e ON e.id=q.execution_id WHERE q.state='queued' AND e.disposition='active' AND e.publication_allowed ORDER BY q.queue_sequence LIMIT 1",
    )
  ).rows[0]
  if (next?.execution_id !== executionId) return null
  const eligible = await client.query(
    "UPDATE ai_executions SET runtime_state='running',runtime_observed_at=now(),revision=revision+1 WHERE id=$1 AND disposition='active' AND publication_allowed RETURNING id",
    [executionId],
  )
  if (!eligible.rowCount) return null
  const owner = randomUUID(),
    requestId = randomUUID()
  const updated = await client.query(
    "UPDATE ai_local_slots SET execution_id=$1,generation=generation+1,lease_owner=$2,lease_until=now()+interval '60 seconds' WHERE id='local-ai' RETURNING generation",
    [executionId, owner],
  )
  await client.query(
    "UPDATE ai_local_queue SET state='claimed' WHERE execution_id=$1",
    [executionId],
  )
  await client.query(
    'INSERT INTO ai_runtime_requests(id,execution_id) VALUES($1,$2)',
    [requestId, executionId],
  )
  return {
    executionId,
    requestId,
    owner,
    generation: updated.rows[0].generation,
  }
}
export async function authorizeLocalRequest(
  pool: Pool,
  claim: LocalClaim,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE ai_runtime_requests r SET state='sent' FROM ai_local_slots s,ai_executions e
     WHERE r.id=$1 AND r.state='intent' AND e.id=r.execution_id AND e.disposition='active' AND e.publication_allowed
       AND s.id='local-ai' AND s.execution_id=e.id AND s.generation=$2 AND s.lease_owner=$3 AND s.lease_until>now() RETURNING r.id`,
    [claim.requestId, claim.generation, claim.owner],
  )
  return result.rowCount === 1
}
export async function renewLocal(pool: Pool, claim: LocalClaim) {
  await pool.query(
    "UPDATE ai_local_slots SET lease_until=now()+interval '60 seconds' WHERE id='local-ai' AND execution_id=$1 AND generation=$2 AND lease_owner=$3 AND lease_until>now()",
    [claim.executionId, claim.generation, claim.owner],
  )
}
export async function archiveLocal(pool: Pool, claim: LocalClaim, raw: string) {
  await pool.query(
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
export async function finishLocal(
  client: PoolClient,
  claim: LocalClaim,
  runtimeEnded: boolean,
) {
  const slot = (
    await client.query(
      "SELECT *,lease_until>now() AS live FROM ai_local_slots WHERE id='local-ai' FOR UPDATE",
    )
  ).rows[0]
  const mayPublish =
    slot.execution_id === claim.executionId &&
    String(slot.generation) === String(claim.generation) &&
    slot.lease_owner === claim.owner &&
    slot.live === true
  await client.query(
    'UPDATE ai_runtime_requests SET state=$2,finished_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE id=$1',
    [claim.requestId, runtimeEnded ? 'finished' : 'unknown', runtimeEnded],
  )
  await client.query(
    'UPDATE ai_executions SET runtime_state=$2,runtime_observed_at=now(),stop_confirmed_at=CASE WHEN $3 THEN now() ELSE NULL END,revision=revision+1 WHERE id=$1',
    [claim.executionId, runtimeEnded ? 'finished' : 'unknown', runtimeEnded],
  )
  if (runtimeEnded) {
    await client.query(
      "UPDATE ai_local_queue SET state='finished' WHERE execution_id=$1",
      [claim.executionId],
    )
    await client.query(
      "UPDATE ai_local_slots SET execution_id=NULL,lease_owner=NULL,lease_until=NULL WHERE id='local-ai' AND execution_id=$1",
      [claim.executionId],
    )
  }
  return mayPublish
}
