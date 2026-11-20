// A sync run no longer records its queue job and attempt (task
// oferty-pracy-2ba.5): exclusivity by source and the run's state replace
// the attempt fencing, and nothing asks the queue about a run's job.
exports.up = (pgm) => {
  pgm.sql(
    'ALTER TABLE source_sync_runs DROP COLUMN job_id, DROP COLUMN attempt',
  )
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
