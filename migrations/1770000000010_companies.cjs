exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE companies (
      id uuid PRIMARY KEY, name text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('organization','brand','unknown')),
      website text, description text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE company_ad_links (
      ad_id uuid NOT NULL REFERENCES source_ads,
      role text NOT NULL CHECK (role IN ('publisher','employer','client')),
      company_id uuid NOT NULL REFERENCES companies,
      evidence text NOT NULL,
      revision_id uuid NOT NULL REFERENCES source_ad_revisions,
      PRIMARY KEY (ad_id,role)
    );
    CREATE INDEX company_links_profile ON company_ad_links(company_id);
    CREATE TABLE company_link_history (
      id uuid PRIMARY KEY, ad_id uuid NOT NULL REFERENCES source_ads,
      role text NOT NULL CHECK (role IN ('publisher','employer','client')),
      company_id uuid NOT NULL REFERENCES companies,
      action text NOT NULL CHECK (action IN ('link','unlink')),
      evidence text NOT NULL, revision_id uuid NOT NULL REFERENCES source_ad_revisions,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX company_history_profile ON company_link_history(company_id,created_at);
    CREATE TABLE company_commands (
      id uuid PRIMARY KEY, fingerprint text NOT NULL, result jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
