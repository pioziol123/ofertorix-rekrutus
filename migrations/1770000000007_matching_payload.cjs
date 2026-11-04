exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE matching_requests ADD COLUMN request_payload jsonb;
ALTER TABLE matching_requests ADD COLUMN prompt_version text NOT NULL DEFAULT 'matching-v1';
ALTER TABLE matching_requests ADD COLUMN schema_version integer NOT NULL DEFAULT 1;
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
