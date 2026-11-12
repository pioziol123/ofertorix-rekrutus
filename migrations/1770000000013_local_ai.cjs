exports.up = (pgm) =>
  pgm.sql(`
CREATE TABLE ai_executions (
 id uuid PRIMARY KEY, task_type text NOT NULL CHECK(task_type IN ('profile','matching','research')),
 operation_id uuid NOT NULL, supersedes uuid REFERENCES ai_executions(id), configuration jsonb NOT NULL,
 publication_token uuid NOT NULL UNIQUE, publication_allowed boolean NOT NULL DEFAULT true,
 disposition text NOT NULL DEFAULT 'active', revision bigint NOT NULL DEFAULT 0,
 runtime_state text NOT NULL DEFAULT 'not_started', result_status text, error_code text,
 runtime_observed_at timestamptz, stop_confirmed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE ai_local_queue (
 execution_id uuid PRIMARY KEY REFERENCES ai_executions(id), queue_sequence bigserial UNIQUE NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','claimed','finished')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_local_slots (
 id text PRIMARY KEY CHECK(id='local-ai'), execution_id uuid REFERENCES ai_executions(id),
 generation bigint NOT NULL DEFAULT 0, lease_owner uuid, lease_until timestamptz
);
INSERT INTO ai_local_slots(id) VALUES('local-ai');
CREATE TABLE ai_runtime_requests (
 id uuid PRIMARY KEY, execution_id uuid NOT NULL UNIQUE REFERENCES ai_executions(id),
 kind text NOT NULL DEFAULT 'generate', state text NOT NULL DEFAULT 'intent',
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE ai_execution_artifacts (
 id uuid PRIMARY KEY, execution_id uuid NOT NULL REFERENCES ai_executions(id),
 request_id uuid NOT NULL REFERENCES ai_runtime_requests(id), kind text NOT NULL,
 content text NOT NULL, sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_attempts ADD COLUMN execution_id uuid UNIQUE REFERENCES ai_executions(id);
ALTER TABLE profile_imports ADD COLUMN current_execution_id uuid REFERENCES ai_executions(id);
ALTER TABLE profile_imports ADD COLUMN current_publication_token uuid;
DROP INDEX profile_one_pending_ai;
CREATE UNIQUE INDEX profile_one_pending_ai ON ai_attempts(import_id)
 WHERE execution_id IS NULL AND state IN ('queued','running','waiting_budget');
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
