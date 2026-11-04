exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE owner_sessions (
    token_hash text PRIMARY KEY, expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  ); CREATE INDEX owner_session_expiry ON owner_sessions(expires_at);`)
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
