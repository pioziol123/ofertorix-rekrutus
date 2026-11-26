// A sync run records how many ads its marking step changed from available
// to unavailable at the source (task oferty-pracy-nq3.2, T2 of epic nq3).
// Only a complete run of a source that marks unavailable ads stores it;
// every other run, and every run finished before this migration, keeps
// null, and nothing is recomputed (T2-R04).
exports.up = (pgm) => {
  pgm.sql('ALTER TABLE source_sync_runs ADD COLUMN marked_unavailable integer')
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
