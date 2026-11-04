exports.up = (pgm) =>
  pgm.sql(`
CREATE TABLE matching_groups (
 id uuid PRIMARY KEY, command_id uuid NOT NULL UNIQUE, ad_ids uuid[] NOT NULL,
 state text NOT NULL CHECK(state IN ('waiting_budget','queued','uploading','submitting','submitted','completed','failed','unknown')),
 configuration jsonb NOT NULL, items jsonb NOT NULL DEFAULT '[]', input_file_id text, batch_id text UNIQUE, output_file_id text, error_file_id text,
 status text, error text, cleaned boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE matching_requests ADD COLUMN group_id uuid REFERENCES matching_groups(id);
CREATE INDEX matching_group_members ON matching_requests(group_id);
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
