exports.up = (pgm) =>
  pgm.sql(`
CREATE TABLE matching_batch_artifacts (
 operation_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('input','output','error','metadata')),
 artifact_key text NOT NULL,
 sha256 text NOT NULL CHECK(length(sha256)=64),
 content text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(operation_id,kind,artifact_key,sha256)
);
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
