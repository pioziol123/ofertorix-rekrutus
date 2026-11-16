// A scope may hold one queued and one running run at the same time (F2-07),
// never two queued or two running ones.
exports.up = (pgm) => {
  pgm.sql(`
    DROP INDEX source_one_active_run;
    CREATE UNIQUE INDEX source_one_queued_run ON source_sync_runs(scope_id) WHERE status = 'queued';
    CREATE UNIQUE INDEX source_one_running_run ON source_sync_runs(scope_id) WHERE status = 'running';
  `)
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
