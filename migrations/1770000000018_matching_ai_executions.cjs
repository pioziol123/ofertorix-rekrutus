// Matching's assessments move to the AI coordination
// (task oferty-pracy-0mq.21).
// - Executions get an adapter-state column: structured data only the
//   adapter that wrote it reads (the batch adapter keeps the provider batch,
//   its files, the provider status and whether it was cleaned up there).
// - Assessment requests link to their AI execution by identifier.
// - History back-fill: every request made before this migration, except an
//   excluded one, which never reached AI, gets an execution of the operation
//   (the request) with its result, and an attempt carrying its cost. A
//   funded request keeps its attempt, which becomes the execution's
//   settlement record (the execution takes the attempt's identifier); a
//   request that never got funding gets an attempt with nothing reserved.
//   Requests were sent as provider batches, a single one as a batch of its
//   own, so the execution's group is the request's group or the request
//   itself, the key under which the batch archive was saved.
// ASSUMPTION(oferty-pracy-0mq.21/ASM-1): the mapping of every old request
// state to Matching's own state or to the stage of the AI work, below.
// - Stage and cause come from the old request state: a published
//   assessment is completed; a failure the model caused keeps its cause
//   (from the saved diagnostic); a result Matching could not confirm is
//   rejected, with its diagnostic as the reason; a failure of the batch
//   keeps the cause of the batch error; an unknown outcome is uncertain and
//   keeps its reservation.
// - Work in progress (waiting for budget, queued, being sent, submitted) is
//   not carried over (owner's decision 3 of 0mq.17): it ends as `retried`
//   with the cause `interrupted`, and its reservation is released.
// - The state column of a request keeps only Matching's own meaning:
//   `excluded` (a required condition conflicts, nothing is requested), or
//   `requested` (the stage of the AI work is read from the execution).
// - The batch and group tables and the attempt identifier column stay as
//   read-only history; no code writes them any more.
// ASSUMPTION(oferty-pracy-0mq.21/ASM-9): the moved executions get no adapter
// state, so AI recovery does not remove the provider files the former batches
// left: those of a batch or group that ended while its cleanup had failed
// (cleaned = false), and those of a batch submitted at the deploy, which ends
// as `retried` above. The system does not yet run in production (decision 3
// of 0mq.17); a person can remove such files in the provider's panel.
exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE ai_executions ADD COLUMN adapter_state jsonb;
ALTER TABLE matching_requests ADD COLUMN execution_id uuid REFERENCES ai_executions(id);

WITH legacy AS (
 SELECT r.id AS request_id, coalesce(r.attempt_id,r.id) AS execution_id, r.state, r.result,
  coalesce(r.group_id,r.id) AS group_id, r.configuration, r.created_at, r.updated_at,
  substring(r.error from '\\[Ocena: ([a-z_]+)\\]') AS assessment_code,
  substring(r.error from '\\[Batch: ([a-z]+)') AS batch_code
 FROM matching_requests r WHERE r.state<>'excluded' AND r.execution_id IS NULL
), mapped AS (
 SELECT l.*,
  CASE l.assessment_code
   WHEN 'response_refusal' THEN 'refused'
   WHEN 'response_incomplete' THEN 'incomplete'
   WHEN 'response_text_count' THEN 'no_content'
   WHEN 'response_json' THEN 'format'
   WHEN 'response_format' THEN 'format'
  END AS model_cause,
  CASE
   WHEN l.state IN ('waiting_budget','queued','uploading','submitting','submitted') THEN 'retried'
   WHEN l.state='completed' THEN 'completed'
   WHEN l.state='unknown' THEN 'uncertain'
   WHEN l.assessment_code IS NOT NULL AND l.assessment_code NOT IN
    ('response_refusal','response_incomplete','response_text_count','response_json','response_format') THEN 'rejected'
   ELSE 'failed'
  END AS new_state
 FROM legacy l
)
INSERT INTO ai_executions(id,settings_key,operation_id,configuration,publication_token,mode,group_id,state,cause,rejection_reason,result,created_at,finished_at)
SELECT m.execution_id,'matching',m.request_id,m.configuration,gen_random_uuid(),'batch',m.group_id,m.new_state,
 CASE
  WHEN m.new_state IN ('completed','rejected') THEN NULL
  WHEN m.new_state='retried' THEN 'interrupted'
  WHEN m.model_cause IS NOT NULL THEN m.model_cause
  WHEN m.batch_code IN ('network','http','format') THEN m.batch_code
  ELSE 'unknown'
 END,
 CASE WHEN m.new_state='rejected' THEN m.assessment_code END,
 CASE WHEN m.new_state='completed' THEN m.result END,
 m.created_at,m.updated_at
FROM mapped m;

UPDATE ai_attempts a SET state='settled',actual_pln=0,finished_at=coalesce(a.finished_at,now())
 FROM matching_requests r
 WHERE r.attempt_id=a.id AND r.state IN ('waiting_budget','queued','uploading','submitting','submitted');
UPDATE ai_attempts a SET execution_id=a.id
 FROM matching_requests r WHERE r.attempt_id=a.id AND a.execution_id IS NULL;
INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,actual_pln,configuration,execution_id,created_at,finished_at)
SELECT r.id,NULL,0,NULL,1,r.id,'matching','settled',0,0,r.configuration,r.id,r.created_at,r.updated_at
 FROM matching_requests r
 WHERE r.state<>'excluded' AND r.attempt_id IS NULL AND r.execution_id IS NULL;

UPDATE matching_requests SET execution_id=coalesce(attempt_id,id)
 WHERE state<>'excluded' AND execution_id IS NULL;
-- The stage now lives in AI, so the index of one pending request per ad
-- cannot be kept; the transaction lock per ad that prepares requests
-- holds the rule.
DROP INDEX matching_one_pending;
ALTER TABLE matching_requests DROP CONSTRAINT matching_requests_state_check;
UPDATE matching_requests SET state='requested' WHERE state<>'excluded';
ALTER TABLE matching_requests ADD CONSTRAINT matching_requests_state_check CHECK(state IN ('requested','excluded'));
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
