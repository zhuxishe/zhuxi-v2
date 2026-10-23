-- Permit the new single-pool engine version without changing any source,
-- cohort, actor, privacy, config or publication validation. Existing v1 inputs
-- remain valid and immutable. This migration does not update business rows.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));

DO $migration$
DECLARE
 v_function regprocedure := to_regprocedure('matching_run.seal(uuid,uuid,uuid,jsonb)');
 v_definition text;
 v_source text;
 v_old text := $old$p_engine_input->>'algorithm_version' IS DISTINCT FROM 'max_coverage_split:1'$old$;
 v_new text := $new$(p_engine_input->>'algorithm_version' IS DISTINCT FROM 'max_coverage_split:1' AND p_engine_input->>'algorithm_version' IS DISTINCT FROM 'max_coverage_split:2')$new$;
BEGIN
 IF v_function IS NULL THEN
  RAISE EXCEPTION 'MATCH_RUN_SEAL_BASELINE_MISSING';
 END IF;
 SELECT pg_get_functiondef(p.oid),p.prosrc INTO v_definition,v_source
 FROM pg_proc p WHERE p.oid=v_function;
 IF md5(v_source)<>'2408ffa8d712fc75ca09466210f693d2'
  OR (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
  RAISE EXCEPTION 'MATCH_RUN_SEAL_BASELINE_CHANGED';
 END IF;
 EXECUTE replace(v_definition,v_old,v_new);
END;
$migration$;

COMMIT;
