// The system check job is removed (task oferty-pracy-2ba.1, B1-R16), and
// with it the table of its stored confirmations. The readiness check now
// asks for the newest applied migration instead.
exports.up = (pgm) => pgm.sql('DROP TABLE IF EXISTS system_checks')
exports.down = (pgm) =>
  pgm.sql(`
CREATE TABLE system_checks (
  id uuid PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT now()
);
`)
