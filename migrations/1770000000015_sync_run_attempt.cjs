// The queue attempt that holds a running run. A retried attempt takes the run
// over with a higher number, and writes of an older attempt are refused (F2-13).
exports.up = (pgm) => {
  pgm.sql('ALTER TABLE source_sync_runs ADD COLUMN attempt integer')
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
