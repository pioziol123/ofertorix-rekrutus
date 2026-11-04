exports.up = (pgm) =>
  pgm.sql(`
CREATE TABLE company_research (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id),
 target jsonb NOT NULL, configuration jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('waiting_budget','queued','running','completed','failed','unknown')),
 attempt_id uuid UNIQUE REFERENCES ai_attempts(id), result jsonb, error text,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE UNIQUE INDEX company_research_pending ON company_research(company_id) WHERE state IN ('waiting_budget','queued','running');
CREATE INDEX company_research_versions ON company_research(company_id,created_at DESC);
CREATE TABLE company_research_commands(id uuid PRIMARY KEY, fingerprint text NOT NULL, result jsonb NOT NULL);
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
