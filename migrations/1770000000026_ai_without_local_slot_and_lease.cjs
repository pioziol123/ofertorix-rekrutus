// AI executions no longer take a lease or the shared local slot (task
// oferty-pracy-2ba.6): exclusivity in the two AI queues replaces both, and
// the state of an execution replaces the lease-holder guard. The local
// slot, its waiting line and its request records go, with the lease and
// runtime observation columns of executions. Nothing carries executions
// over through them: the migration step sends one job per unfinished
// execution (B6-R10). The raw local responses kept so far stay in their
// archive table, no longer tied to a request record.
exports.up = (pgm) =>
  pgm.sql(`
DROP TABLE ai_local_slots;
DROP TABLE ai_local_queue;
ALTER TABLE ai_execution_artifacts DROP CONSTRAINT ai_execution_artifacts_request_id_fkey;
DROP TABLE ai_runtime_requests;
ALTER TABLE ai_executions
 DROP COLUMN lease_owner, DROP COLUMN lease_expires_at,
 DROP COLUMN runtime_state, DROP COLUMN runtime_observed_at, DROP COLUMN stop_confirmed_at;
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
