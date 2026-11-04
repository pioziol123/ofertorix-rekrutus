exports.up = (pgm) => {
  pgm.sql('ALTER TABLE source_sync_runs ADD COLUMN diagnostics jsonb')
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
