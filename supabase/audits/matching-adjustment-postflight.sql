-- Read-only production proof. Does not create a capture, result or notification.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH wrappers AS (
 SELECT p.oid,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN(
 'admin_preview_matching_adjustment','admin_begin_matching_adjustment','admin_stage_matching_adjustment',
 'admin_complete_matching_adjustment','admin_fail_matching_adjustment','admin_get_matching_adjustment','admin_list_matching_adjustments')
), checks AS (
 SELECT
  (SELECT count(*)=7 AND bool_and(NOT prosecdef AND has_function_privilege('service_role',oid,'EXECUTE')
   AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')) FROM wrappers) wrappers_ok,
  NOT has_schema_privilege('anon','matching_adjustment','USAGE')
   AND NOT has_schema_privilege('authenticated','matching_adjustment','USAGE')
   AND has_schema_privilege('service_role','matching_adjustment','USAGE')
   AND NOT has_schema_privilege('service_role','matching_adjustment','CREATE') schema_ok,
  (SELECT count(*)=2 AND bool_and(c.relrowsecurity
   AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='matching_adjustment' AND c.relkind='r') tables_ok,
  (SELECT count(*)=3 AND bool_and(t.tgenabled='O') FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname IN(
   'matching_adjustment_result_write','matching_adjustment_diagnostic_write','matching_adjustment_member_erasure')) triggers_ok,
  md5((SELECT prosrc FROM pg_proc WHERE oid='matching_run.source_v3(uuid)'::regprocedure))='644b678b15db5217fc8bb58bdd329906'
   AND md5((SELECT prosrc FROM pg_proc WHERE oid='matching_publication.guard_result()'::regprocedure))='3275033363096308568233572dc21bd5'
   AND md5((SELECT prosrc FROM pg_proc WHERE oid='matching_run.erase_anonymized()'::regprocedure))='28a724d6309423925e9908de1c3f7436' original_functions_ok,
  NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='matching_adjustment'
   AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) internal_acl_ok
)
SELECT jsonb_build_object('status',CASE WHEN wrappers_ok AND schema_ok AND tables_ok AND triggers_ok AND original_functions_ok AND internal_acl_ok THEN 'PASS' ELSE 'FAIL' END,
 'checks',to_jsonb(checks),
 'adjustment_count',(SELECT count(*) FROM matching_adjustment.operations),
 'job_count',(SELECT count(*) FROM matching_run.jobs),'snapshot_count',(SELECT count(*) FROM matching_run.snapshots),
 'result_count',(SELECT count(*) FROM public.match_results),'notification_count',(SELECT count(*) FROM public.community_notifications)) AS verification
FROM checks;
ROLLBACK;
