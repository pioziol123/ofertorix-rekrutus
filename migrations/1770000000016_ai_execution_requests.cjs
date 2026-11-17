// General AI executions requested through the AI module's public contract.
// `state` and `cause` are the only record of an execution's stage and of the
// cause of its end. Rows of the existing local Profile path keep state NULL
// and record their stage in result_status, error_code, disposition and
// publication_allowed until task 0mq.9 migrates them; runtime_state stays
// the observation of the local process. The task type becomes the settings
// key a client defines, so it is no longer a closed list.
exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE ai_executions RENAME COLUMN task_type TO settings_key;
ALTER TABLE ai_executions DROP CONSTRAINT ai_executions_task_type_check;
ALTER TABLE ai_executions ADD CONSTRAINT ai_executions_settings_key_check CHECK(settings_key <> '');
ALTER TABLE ai_executions
 ADD COLUMN state text CHECK(state IN ('waiting_budget','queued','running','delivering','completed','rejected','failed','retried')),
 ADD COLUMN mode text CHECK(mode IN ('single','batch','agent')),
 ADD COLUMN group_id uuid,
 ADD COLUMN input_version text,
 ADD COLUMN result jsonb,
 ADD COLUMN cause text,
 ADD COLUMN delivery_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN delivery_error text;
CREATE UNIQUE INDEX ai_one_active_execution ON ai_executions(operation_id)
 WHERE state IN ('waiting_budget','queued','running','delivering');
CREATE INDEX ai_execution_history ON ai_executions(operation_id,created_at);
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
