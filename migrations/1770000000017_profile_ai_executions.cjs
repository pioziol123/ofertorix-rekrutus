// The Profile's proposal preparation moves to the AI coordination
// (task oferty-pracy-0mq.9).
// - Executions keep the client's reason for rejecting a result in
//   `rejection_reason`, apart from `cause`, which names only why an
//   execution ended without a result.
// - Executions get the public state `uncertain`. `end_state` keeps the end
//   an adapter decided for an outcome without a result only while it waits
//   for delivery (state `delivering`); once the execution ends, `state` and
//   `cause` are its only record.
// - Rows of the existing local Profile path get the general fields and
//   their stage and cause in `state` and `cause`, from result_status,
//   error_code, disposition and runtime_state. After this migration no code
//   writes or reads result_status, error_code, disposition or
//   publication_allowed; runtime_state stays the observation of the local
//   process.
// - Attempts of the existing paid Profile path get an execution each, with
//   the operation (the import), the input version (the text revision) and
//   the result (the proposal). Their stage and cause come from the saved
//   message, as for the local rows: a quote the Profile could not confirm
//   is a rejection, the model's own failures keep their cause.
// - Work in progress of the old paths cannot continue in their queue, which
//   has no worker any more. Work not yet started (queued, or waiting for
//   budget) ends as `retried` with the cause `interrupted` and releases
//   what it reserved; the Profile requests its next attempt through the AI
//   contract, which reserves again or waits for budget. Work that was
//   running ends as uncertain and keeps its reservation, so nothing that may
//   have been sent is sent again.
// - The index of one attempt in progress per import gives way to the index
//   of one execution in progress per operation.
exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE ai_executions DROP CONSTRAINT ai_executions_state_check;
ALTER TABLE ai_executions ADD CONSTRAINT ai_executions_state_check
 CHECK(state IN ('waiting_budget','queued','running','delivering','uncertain','completed','rejected','failed','retried'));
ALTER TABLE ai_executions ADD COLUMN rejection_reason text;
ALTER TABLE ai_executions ADD COLUMN end_state text
 CONSTRAINT ai_executions_end_state_check CHECK(end_state IS NULL OR (end_state IN ('failed','uncertain') AND state='delivering'));

WITH legacy AS (
 SELECT e.id, a.text_revision, a.proposal, e.error_code, e.result_status,
  -- The former local path recorded every result the Profile could not use
  -- as invalid_proposal; its message, saved once with the attempt, tells
  -- the model's own failures apart from the Profile's rejection.
  CASE
   WHEN e.error_code<>'invalid_proposal' THEN NULL
   WHEN a.error LIKE '%cytatów%' THEN 'unconfirmed_quote'
   WHEN a.error LIKE '%odmówiło%' THEN 'refused'
   WHEN a.error LIKE '%nie ukończyło%' THEN 'incomplete'
   WHEN a.error LIKE '%jednej kompletnej%' THEN 'no_content'
   WHEN a.error LIKE '%format danych%' THEN 'format'
   ELSE 'unknown'
  END AS proposal_failure,
  e.disposition='superseded' AS superseded,
  CASE
   WHEN e.disposition='superseded' THEN 'retried'
   WHEN e.result_status='completed' THEN 'completed'
   WHEN e.result_status='failed' AND e.error_code='invalid_proposal' AND a.error LIKE '%cytatów%' THEN 'rejected'
   WHEN e.runtime_state IN ('running','unknown') THEN 'uncertain'
   WHEN e.result_status IS NULL THEN 'retried'
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
  WHEN l.new_state IN ('completed','rejected') OR l.superseded THEN NULL
  WHEN l.result_status IS NULL THEN 'interrupted'
  WHEN l.proposal_failure IS NOT NULL THEN l.proposal_failure
  WHEN l.error_code IN ('configuration','network','http','format','aborted','model_unavailable','context_overflow') THEN l.error_code
  ELSE 'unknown'
 END,
 rejection_reason=CASE WHEN l.new_state='rejected' THEN l.proposal_failure END,
 finished_at=coalesce(e.finished_at,now())
FROM legacy l WHERE l.id=e.id;

UPDATE ai_attempts a SET state='settled',actual_pln=0,finished_at=coalesce(a.finished_at,now())
 FROM ai_executions e
 WHERE e.id=a.execution_id AND a.operation_type='profile' AND a.state IN ('queued','running');

UPDATE ai_local_queue q SET state='finished'
 FROM ai_executions e WHERE e.id=q.execution_id AND q.state<>'finished' AND e.state<>'queued';

INSERT INTO ai_executions(id,settings_key,operation_id,configuration,publication_token,mode,input_version,result,state,cause,rejection_reason,created_at,finished_at)
SELECT p.id,'profile',p.import_id,p.configuration,gen_random_uuid(),'single',p.text_revision::text,p.proposal,
 p.new_state,
 CASE
  WHEN p.new_state IN ('completed','rejected') OR p.superseded THEN NULL
  WHEN p.state IN ('queued','waiting_budget','running') THEN 'interrupted'
  ELSE p.failure
 END,
 CASE WHEN p.new_state='rejected' THEN 'unconfirmed_quote' END,
 p.created_at,coalesce(p.finished_at,now())
FROM (
 SELECT a.*, s.superseded, f.failure,
  CASE
   WHEN s.superseded THEN 'retried'
   WHEN a.state IN ('queued','waiting_budget') THEN 'retried'
   WHEN a.state='running' THEN 'uncertain'
   WHEN a.proposal IS NOT NULL THEN 'completed'
   WHEN f.failure='unconfirmed_quote' THEN 'rejected'
   WHEN a.state='unknown' THEN 'uncertain'
   ELSE 'failed'
  END AS new_state
 FROM ai_attempts a
 CROSS JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM ai_attempts n WHERE n.generation=a.generation AND n.attempt>a.attempt) AS superseded) s
 -- The former paid path saved the same messages as the local one; they
 -- tell the model's own failures apart from the Profile's rejection, as
 -- for the local rows above.
 CROSS JOIN LATERAL (SELECT CASE
   WHEN a.error LIKE '%cytatów%' THEN 'unconfirmed_quote'
   WHEN a.error LIKE '%odmówiło%' THEN 'refused'
   WHEN a.error LIKE '%nie ukończyło%' THEN 'incomplete'
   WHEN a.error LIKE '%jednej kompletnej%' THEN 'no_content'
   WHEN a.error LIKE '%format danych%' THEN 'format'
   WHEN a.error LIKE 'Worker interrupted%' THEN 'interrupted'
   ELSE 'unknown'
  END AS failure) f
 WHERE a.execution_id IS NULL AND a.operation_type='profile'
) p;

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
