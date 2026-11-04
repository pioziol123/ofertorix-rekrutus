exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE source_scopes (
      id uuid PRIMARY KEY, source text NOT NULL, fingerprint text NOT NULL UNIQUE,
      parameters jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE source_sync_runs (
      id uuid PRIMARY KEY, scope_id uuid NOT NULL REFERENCES source_scopes,
      trigger text NOT NULL CHECK (trigger IN ('manual','scheduled')),
      schedule_day date NOT NULL, job_id uuid,
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','partial','failed')),
      created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz,
      pages integer NOT NULL DEFAULT 0, seen integer NOT NULL DEFAULT 0,
      revisions integer NOT NULL DEFAULT 0, error text
    );
    CREATE UNIQUE INDEX source_one_active_run ON source_sync_runs(scope_id) WHERE status IN ('queued','running');
    CREATE INDEX source_runs_history ON source_sync_runs(scope_id, created_at DESC);
    CREATE TABLE source_ads (
      id uuid PRIMARY KEY, source text NOT NULL, external_id text NOT NULL, url text,
      first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
      last_seen_scope_id uuid NOT NULL REFERENCES source_scopes,
      current_revision_id uuid, availability text NOT NULL DEFAULT 'available'
        CHECK (availability IN ('available','unavailable')),
      valid_to timestamptz, UNIQUE (source,external_id)
    );
    CREATE TABLE source_ad_revisions (
      id uuid PRIMARY KEY, source_ad_id uuid NOT NULL REFERENCES source_ads,
      content_hash text NOT NULL, payload jsonb NOT NULL, retrieved_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE source_ads ADD FOREIGN KEY (current_revision_id) REFERENCES source_ad_revisions;
    CREATE INDEX source_revision_history ON source_ad_revisions(source_ad_id, retrieved_at);
    CREATE TABLE source_run_seen (
      run_id uuid NOT NULL REFERENCES source_sync_runs,
      source_ad_id uuid NOT NULL REFERENCES source_ads,
      PRIMARY KEY (run_id,source_ad_id)
    );
  `)
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
