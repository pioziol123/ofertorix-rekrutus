// Company research moves to the AI coordination as agent work
// (task oferty-pracy-0mq.22), following the migration of Matching (18).
// - Research records link to their AI execution by identifier.
// - History back-fill: every research made before this migration gets an
//   execution of the operation (the research) in agent mode, with its
//   report as the result and an attempt carrying its cost. A funded research
//   keeps its attempt, which becomes the execution's settlement record (the
//   execution takes the attempt's identifier); a research that never got
//   funding gets an attempt with nothing reserved. The usage of an adopted
//   attempt names its paid search calls as AI names the calls of a paid
//   tool (`tool_calls`, formerly `search_calls`), so the execution read
//   returns them. ASSUMPTION(oferty-pracy-0mq.22/ASM-4)
// ASSUMPTION(oferty-pracy-0mq.22/ASM-1): the mapping of every old research
// state, and of the message it saved, to the stage and cause of the AI work.
// - A published report is completed. A report Companies did not accept (no
//   finding backed by a source, or a report that did not pass validation) is
//   rejected, with the reason Companies gives today. A search without cited
//   material failed with `no_content`; another failure with a settled cost
//   failed with an unknown cause. An unknown outcome is uncertain and keeps
//   its reservation; an HTTP error keeps the cause `http`.
// - Work in progress (waiting for budget, queued, running) is not carried
//   over (owner's decision 3 of 0mq.17): it ends as `retried` with the cause
//   `interrupted`, and its reservation is released.
// - The state column of a research keeps only Companies' own meaning,
//   `requested`: the stage of the AI work is read from the execution, so the
//   index of one research in progress per company gives way to the
//   transaction lock per company that requests research.
// - The research queue `company-research` has no worker any more.
exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE company_research ADD COLUMN execution_id uuid REFERENCES ai_executions(id);

WITH legacy AS (
 SELECT r.id AS research_id, coalesce(r.attempt_id,r.id) AS execution_id, r.state, r.result,
  r.configuration, r.created_at, r.finished_at,
  CASE
   WHEN r.state<>'failed' THEN NULL
   WHEN r.error LIKE 'Raport nie zawiera żadnych ustaleń%' THEN 'no_sourced_findings'
   WHEN r.error LIKE '%(validation)%' THEN 'invalid_report'
  END AS rejection
 FROM company_research r WHERE r.execution_id IS NULL
), mapped AS (
 SELECT l.*,
  CASE
   WHEN l.state IN ('waiting_budget','queued','running') THEN 'retried'
   WHEN l.state='completed' THEN 'completed'
   WHEN l.state='unknown' THEN 'uncertain'
   WHEN l.rejection IS NOT NULL THEN 'rejected'
   ELSE 'failed'
  END AS new_state
 FROM legacy l
)
INSERT INTO ai_executions(id,settings_key,operation_id,configuration,publication_token,mode,state,cause,rejection_reason,result,created_at,finished_at)
SELECT m.execution_id,'research',m.research_id,m.configuration,gen_random_uuid(),'agent',m.new_state,
 CASE
  WHEN m.new_state IN ('completed','rejected') THEN NULL
  WHEN m.new_state='retried' THEN 'interrupted'
  WHEN r.error LIKE 'Wyszukiwanie nie dostarczyło materiałów%' THEN 'no_content'
  WHEN r.error LIKE '%zwróciła HTTP%' THEN 'http'
  ELSE 'unknown'
 END,
 m.rejection,
 CASE WHEN m.new_state='completed' THEN m.result END,
 m.created_at,coalesce(m.finished_at,now())
FROM mapped m JOIN company_research r ON r.id=m.research_id;

UPDATE ai_attempts a SET state='settled',actual_pln=0,finished_at=coalesce(a.finished_at,now())
 FROM company_research r
 WHERE r.attempt_id=a.id AND r.state IN ('waiting_budget','queued','running');
UPDATE ai_attempts a SET execution_id=a.id
 FROM company_research r WHERE r.attempt_id=a.id AND a.execution_id IS NULL;
UPDATE ai_attempts a
 SET usage=(a.usage-'search_calls')||jsonb_build_object('tool_calls',a.usage->'search_calls')
 FROM company_research r WHERE r.attempt_id=a.id AND a.usage ? 'search_calls';
INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,actual_pln,configuration,execution_id,created_at,finished_at)
SELECT r.id,NULL,0,NULL,1,r.id,'research','settled',0,0,r.configuration,r.id,r.created_at,coalesce(r.finished_at,now())
 FROM company_research r
 WHERE r.attempt_id IS NULL AND r.execution_id IS NULL;

UPDATE company_research SET execution_id=coalesce(attempt_id,id) WHERE execution_id IS NULL;
DROP INDEX company_research_pending;
ALTER TABLE company_research DROP CONSTRAINT company_research_state_check;
UPDATE company_research SET state='requested';
ALTER TABLE company_research ADD CONSTRAINT company_research_state_check CHECK(state IN ('requested'));
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
