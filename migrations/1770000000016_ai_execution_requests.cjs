// General AI executions requested through the AI module's public contract.
// Rows of the existing local profile path keep state NULL and stay outside
// the one-active-execution rule until task 0mq.9 migrates them.
exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE ai_executions
 ADD COLUMN state text CHECK(state IN ('waiting_budget','queued','running','completed','rejected','failed','retried')),
 ADD COLUMN mode text CHECK(mode IN ('single','batch','agent')),
 ADD COLUMN group_id uuid,
 ADD COLUMN input_version text,
 ADD COLUMN result jsonb,
 ADD COLUMN cause text;
CREATE UNIQUE INDEX ai_one_active_execution ON ai_executions(operation_id)
 WHERE state IN ('waiting_budget','queued','running');
CREATE INDEX ai_execution_history ON ai_executions(operation_id,created_at);
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
