exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE ai_attempts ALTER COLUMN import_id DROP NOT NULL;
ALTER TABLE ai_attempts ADD CONSTRAINT ai_attempt_subject CHECK(operation_type <> 'profile' OR import_id IS NOT NULL);
CREATE TABLE matching_requests (
 id uuid PRIMARY KEY, ad_id uuid NOT NULL REFERENCES source_ads(id),
 ad_revision_id uuid NOT NULL REFERENCES source_ad_revisions(id), profile_version_id uuid NOT NULL REFERENCES profile_versions(id),
 input jsonb NOT NULL, configuration jsonb NOT NULL, attempt_id uuid UNIQUE REFERENCES ai_attempts(id),
 state text NOT NULL CHECK(state IN ('waiting_budget','queued','uploading','submitting','submitted','completed','failed','unknown','excluded')),
 result jsonb, calculation jsonb, error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX matching_one_pending ON matching_requests(ad_id) WHERE state IN ('waiting_budget','queued','uploading','submitting','submitted');
CREATE TABLE matching_batches (
 request_id uuid PRIMARY KEY REFERENCES matching_requests(id), input_file_id text,
 batch_id text UNIQUE, output_file_id text, error_file_id text,
 status text, cleaned boolean NOT NULL DEFAULT false, polled_at timestamptz
);
CREATE INDEX matching_ad_history ON matching_requests(ad_id,created_at DESC);
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
