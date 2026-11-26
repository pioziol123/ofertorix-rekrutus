// The Recruitments module's stored data (task oferty-pracy-lq3.1, epic lq3):
// the application of an offer with its current stage and stage moment, and
// the history of its stage changes, whose rows are only inserted. The offer
// ID is today the ad ID and has no foreign key: the module trusts its
// caller for the offer's existence (D7). The note is used from task T2.
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE recruitment_applications (
      id uuid PRIMARY KEY,
      offer_id uuid NOT NULL UNIQUE,
      stage text NOT NULL CHECK (stage IN ('to_consider','cv_sent','rejected','removed')),
      stage_changed_at timestamptz NOT NULL,
      note text NOT NULL DEFAULT ''
    );
    CREATE INDEX recruitment_applications_page
      ON recruitment_applications(stage, stage_changed_at DESC, id DESC);
    CREATE TABLE recruitment_stage_changes (
      id uuid PRIMARY KEY,
      application_id uuid NOT NULL REFERENCES recruitment_applications,
      stage text NOT NULL CHECK (stage IN ('to_consider','cv_sent','rejected','removed')),
      changed_at timestamptz NOT NULL
    );
    CREATE INDEX recruitment_stage_changes_history
      ON recruitment_stage_changes(application_id, changed_at);
  `)
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
