// The Profile's proposal preparation moves to the AI coordination
// (task oferty-pracy-0mq.9).
// - Executions get the public state `uncertain`, and `end_state` keeps the
//   end an adapter decided for an outcome without a result while it waits
//   for delivery.
// - Rows of the existing local Profile path get the general fields and
//   their stage and cause in `state` and `cause`, from result_status,
//   error_code, disposition and runtime_state. After this migration no code
//   writes or reads result_status, error_code, disposition or
//   publication_allowed; runtime_state stays the observation of the local
//   process.
// - Attempts of the existing paid Profile path get an execution each, with
//   the operation (the import), the input version (the text revision) and
//   the result (the proposal).
// - Work in progress of the old paths cannot continue, because their queue
//   has no worker any more: work not yet started ends as failed and
//   releases what it reserved; work that was running ends as uncertain and
//   keeps its reservation. The import read shows these ends to the owner.
// - The index of one attempt in progress per import gives way to the index
//   of one execution in progress per operation.
exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE ai_executions DROP CONSTRAINT ai_executions_state_check;
ALTER TABLE ai_executions ADD CONSTRAINT ai_executions_state_check
 CHECK(state IN ('waiting_budget','queued','running','delivering','uncertain','completed','rejected','failed','retried'));
ALTER TABLE ai_executions ADD COLUMN end_state text CHECK(end_state IN ('failed','uncertain'));

WITH legacy AS (
 SELECT e.id, a.text_revision, a.proposal, e.error_code, e.result_status,
  CASE
   WHEN e.disposition='superseded' THEN 'retried'
   WHEN e.result_status='completed' THEN 'completed'
   WHEN e.result_status='failed' AND e.error_code='invalid_proposal' THEN 'rejected'
   WHEN e.runtime_state IN ('running','unknown') THEN 'uncertain'
   ELSE 'failed'
  END AS new_state
 FROM ai_executions e JOIN ai_attempts a ON a.execution_id=e.id
 WHERE e.state IS NULL
)
UPDATE ai_executions e SET
 mode='single',
 input_version=l.text_revision::text,
 result=l.proposal,
 state=l.new_state,
 cause=CASE
  WHEN l.new_state IN ('completed','rejected','retried') THEN NULL
  WHEN l.result_status IS NULL THEN 'interrupted'
  WHEN l.error_code IN ('configuration','network','http','format','aborted','model_unavailable','context_overflow') THEN l.error_code
  ELSE 'unknown'
 END,
 finished_at=coalesce(e.finished_at,now())
FROM legacy l WHERE l.id=e.id;

UPDATE ai_attempts a SET state='settled',actual_pln=0,finished_at=coalesce(a.finished_at,now())
 FROM ai_executions e
 WHERE e.id=a.execution_id AND a.operation_type='profile' AND a.state IN ('queued','running');

UPDATE ai_local_queue q SET state='finished'
 FROM ai_executions e WHERE e.id=q.execution_id AND q.state<>'finished' AND e.state<>'queued';

INSERT INTO ai_executions(id,settings_key,operation_id,configuration,publication_token,mode,input_version,result,state,cause,created_at,finished_at)
SELECT a.id,'profile',a.import_id,a.configuration,gen_random_uuid(),'single',a.text_revision::text,a.proposal,
 CASE
  WHEN EXISTS(SELECT 1 FROM ai_attempts n WHERE n.generation=a.generation AND n.attempt>a.attempt) THEN 'retried'
  WHEN a.state IN ('queued','waiting_budget') THEN 'failed'
  WHEN a.state='running' THEN 'uncertain'
  WHEN a.proposal IS NOT NULL THEN 'completed'
  WHEN a.state='unknown' THEN 'uncertain'
  ELSE 'failed'
 END,
 CASE
  WHEN EXISTS(SELECT 1 FROM ai_attempts n WHERE n.generation=a.generation AND n.attempt>a.attempt) THEN NULL
  WHEN a.state IN ('queued','waiting_budget','running') THEN 'interrupted'
  WHEN a.proposal IS NOT NULL THEN NULL
  ELSE 'unknown'
 END,
 a.created_at,coalesce(a.finished_at,now())
FROM ai_attempts a
WHERE a.execution_id IS NULL AND a.operation_type='profile';

UPDATE ai_attempts SET state='settled',actual_pln=0,finished_at=now()
 WHERE execution_id IS NULL AND operation_type='profile' AND state IN ('queued','waiting_budget');
UPDATE ai_attempts SET state='unknown',finished_at=now()
 WHERE execution_id IS NULL AND operation_type='profile' AND state='running';
UPDATE ai_attempts SET execution_id=id
 WHERE execution_id IS NULL AND operation_type='profile';

DROP INDEX profile_one_pending_ai;
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
