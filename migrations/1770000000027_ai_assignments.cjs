// Assignments of the AI module and their operations (task oferty-pracy-sq2.2,
// solution design of epic sq2, section "Data"). Both tables get every column
// the epic needs now; later tasks of the epic add no column to them. The old
// way of requesting AI work keeps its own tables until it is removed.
// Status, state, reason and cause columns carry a check on their closed list.
// Amounts are kept in millionths of a złoty, as the month's limit is.
exports.up = (pgm) =>
  pgm.sql(`
CREATE TABLE ai_assignments (
 id uuid PRIMARY KEY,
 settings_name text NOT NULL CHECK(settings_name <> ''),
 type text NOT NULL CHECK(type IN ('single','agent')),
 label text NOT NULL CHECK(btrim(label) <> ''),
 instruction text NOT NULL CHECK(btrim(instruction) <> ''),
 input text NOT NULL CHECK(btrim(input) <> ''),
 response_format jsonb,
 agent_options jsonb,
 executor text NOT NULL CHECK(executor <> ''),
 executor_parameters jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('in_progress','needs_attention','succeeded','failed')),
 failure_reason text CHECK(failure_reason IN ('rejected','time_limit','delivery_failed')),
 automatic_operation_limit integer NOT NULL CHECK(automatic_operation_limit > 0),
 placed_at timestamptz NOT NULL,
 deadline timestamptz NOT NULL,
 finished_at timestamptz,
 CHECK((agent_options IS NULL) = (type = 'single')),
 CHECK((failure_reason IS NOT NULL) = (status = 'failed')),
 CHECK(deadline > placed_at)
);
CREATE TABLE ai_operations (
 id uuid PRIMARY KEY,
 assignment_id uuid NOT NULL REFERENCES ai_assignments(id),
 ordinal integer NOT NULL CHECK(ordinal > 0),
 origin text NOT NULL CHECK(origin IN ('automatic','manual')),
 state text NOT NULL CHECK(state IN ('pending','running','succeeded','failed','uncertain')),
 waits_for text CHECK(waits_for IN ('budget','executor')),
 pending_since timestamptz NOT NULL,
 cause text CHECK(cause IN ('refused','incomplete','no_content','format','configuration','network','http','aborted','model_unavailable','context_overflow','unknown','not_started','time_limit_run')),
 retryable boolean,
 potential_cost numeric(16,6) CHECK(potential_cost >= 0),
 actual_cost numeric(16,6) CHECK(actual_cost >= 0),
 budget_month text REFERENCES ai_budget_months(month),
 price_list jsonb,
 usage jsonb,
 result jsonb,
 executor_state jsonb,
 started_at timestamptz,
 finished_at timestamptz,
 UNIQUE(assignment_id, ordinal),
 CHECK((waits_for IS NOT NULL) = (state = 'pending')),
 CHECK(state = 'failed' OR retryable IS NULL),
 CHECK(state IN ('failed','uncertain') OR cause IS NULL)
);
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
