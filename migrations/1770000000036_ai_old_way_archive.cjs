// The deployment of the AI assignments (task oferty-pracy-sq2.11, solution
// design of epic sq2, T10 and "Which task changes the database"): the
// budget is carried into the new model and the records of the old way of
// requesting AI work become an archive that no code reads.
//
// Each month with a budget keeps its limit, and its two carried amounts,
// added by the previous migration, are computed from the old settlement
// records by the state of each record and
// of its AI work at this moment (T10-R01, T10-R02):
// - a settled record carries its actual cost as settled;
// - any other record carries its reserved amount as held: an unknown cost,
//   work waiting for delivery and running work (a provider was called);
// - a record of work still queued or waiting for the budget carries
//   nothing: nothing was sent, so its reservation is released.
// The default limit needs nothing: its table holds 100 PLN since task
// oferty-pracy-sq2.4.
//
// The old tables are renamed with the prefix `archive_`; the executions
// lose the four columns of the former Profile path, and the requesting
// modules lose their references to the old executions. Matching's earlier
// batch and group tables are not touched. The migration writes every name
// it needs itself and imports no module.
exports.up = (pgm) =>
  pgm.sql(`
UPDATE ai_budget_months b SET carried_settled=c.settled,carried_held=c.held
FROM (
 SELECT a.month,
  coalesce(sum(a.actual_pln) FILTER (WHERE a.state='settled'),0) AS settled,
  coalesce(sum(a.reserved_pln) FILTER (WHERE a.state<>'settled'
   AND (e.state IS NULL OR e.state NOT IN ('queued','waiting_budget'))),0) AS held
 FROM ai_attempts a LEFT JOIN ai_executions e ON e.id=a.execution_id
 WHERE a.month IS NOT NULL
 GROUP BY a.month
) c
WHERE c.month=b.month;

ALTER TABLE matching_requests DROP COLUMN execution_id;
ALTER TABLE company_research DROP COLUMN execution_id;
ALTER TABLE profile_imports DROP COLUMN current_execution_id;

ALTER TABLE ai_executions RENAME TO archive_ai_executions;
ALTER TABLE ai_attempts RENAME TO archive_ai_attempts;
ALTER TABLE ai_execution_artifacts RENAME TO archive_ai_execution_artifacts;
ALTER TABLE matching_batch_artifacts RENAME TO archive_matching_batch_artifacts;

ALTER TABLE archive_ai_executions
 DROP COLUMN result_status,
 DROP COLUMN error_code,
 DROP COLUMN disposition,
 DROP COLUMN publication_allowed;
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
