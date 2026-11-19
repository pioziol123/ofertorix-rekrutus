// Interrupted paid AI work is detected (task oferty-pracy-0mq.15).
// - A running execution gets a lease: the token of the worker that claimed
//   it and the time, by the database clock, until which that worker is
//   known to be alive. The worker renews it while it runs a paid execution;
//   executions on the shared local slot keep their own lease and leave
//   these columns empty.
// - No data is changed: a paid execution running at the deploy carries no
//   lease, so the first recovery after the deploy ends it as interrupted.
//   Deploy the migration before the worker.
exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE ai_executions ADD COLUMN lease_owner uuid, ADD COLUMN lease_expires_at timestamptz;
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
