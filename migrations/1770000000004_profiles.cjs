exports.up = (pgm) =>
  pgm.sql(`
CREATE TABLE profile_imports (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('pdf','docx','text')),
 original_name text, byte_size integer, sha256 text, path_key text,
 status text NOT NULL, error text, source_text text, professional_text text,
 text_revision integer NOT NULL DEFAULT 0, proposal jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profile_import_texts (
 import_id uuid NOT NULL REFERENCES profile_imports(id), revision integer NOT NULL,
 text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(import_id,revision)
);
CREATE TABLE profile_versions (
 id uuid PRIMARY KEY, number integer NOT NULL UNIQUE, data jsonb NOT NULL,
 command_id uuid NOT NULL UNIQUE, draft_revision integer NOT NULL, previous_version_id uuid REFERENCES profile_versions(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profile_head (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), active_version_id uuid REFERENCES profile_versions(id)
);
INSERT INTO profile_head(singleton) VALUES(true);
CREATE TABLE profile_drafts (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), revision integer NOT NULL,
 base_version_id uuid REFERENCES profile_versions(id), data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_budget_months (
 month text PRIMARY KEY, limit_pln numeric(16,6) NOT NULL CHECK(limit_pln>=0)
);
CREATE TABLE ai_attempts (
 id uuid PRIMARY KEY, import_id uuid NOT NULL REFERENCES profile_imports(id), text_revision integer NOT NULL,
 month text REFERENCES ai_budget_months(month), attempt integer NOT NULL CHECK(attempt BETWEEN 1 AND 2),
 generation uuid NOT NULL, operation_type text NOT NULL DEFAULT 'profile', state text NOT NULL, reserved_pln numeric(16,6) NOT NULL,
 actual_pln numeric(16,6), configuration jsonb NOT NULL, usage jsonb, response_id text,
 proposal jsonb, error text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(generation,attempt)
);
CREATE UNIQUE INDEX profile_one_pending_ai ON ai_attempts(import_id) WHERE state IN ('queued','running','waiting_budget');
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
