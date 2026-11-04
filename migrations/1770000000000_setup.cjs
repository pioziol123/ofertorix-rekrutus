exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE system_checks (
      id uuid PRIMARY KEY,
      completed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE service_heartbeats (
      service text PRIMARY KEY,
      last_seen timestamptz NOT NULL DEFAULT now()
    );
  `)
}
exports.down = () => {
  throw new Error(
    'Setup migration is forward-only; do not delete persistent data',
  )
}
