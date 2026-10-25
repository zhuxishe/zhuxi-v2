-- Read-only deployment check; never captures input or writes matching results.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH wrappers AS (
 SELECT p.oid,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN('admin_get_matching_board','admin_get_matching_board_operation','admin_save_matching_board')
), checks AS (
 SELECT
  (SELECT count(*)=3 AND bool_and(NOT prosecdef AND has_function_privilege('service_role',oid,'EXECUTE')
   AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')) FROM wrappers) wrappers_ok,
  NOT has_schema_privilege('anon','matching_board','USAGE') AND NOT has_schema_privilege('authenticated','matching_board','USAGE')
   AND has_schema_privilege('service_role','matching_board','USAGE') AND NOT has_schema_privilege('service_role','matching_board','CREATE') schema_ok,
  (SELECT count(*)=2 AND bool_and(c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='matching_board' AND c.relkind='r' AND c.relname IN('state','operations')) tables_ok,
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='matching_board_member_erasure' AND NOT tgisinternal AND tgenabled='O') erasure_ok,
  NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='matching_board'
   AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) internal_acl_ok,
  md5((SELECT prosrc FROM pg_proc WHERE oid='matching_run.source_v3(uuid)'::regprocedure))='dae09e810cccc0404a928b48b4665f42'
   AND md5((SELECT prosrc FROM pg_proc WHERE oid='matching_publication.guard_result()'::regprocedure))='3275033363096308568233572dc21bd5' original_functions_ok,
  NOT EXISTS(SELECT r.session_id FROM public.match_results r JOIN matching_board.state s ON s.session_id=r.session_id
   WHERE r.status<>'cancelled' AND r.member_b_id IS NULL GROUP BY r.session_id HAVING count(*)>1) one_pool_ok,
  NOT EXISTS(SELECT r.session_id,ids.member_id FROM public.match_results r JOIN matching_board.state s ON s.session_id=r.session_id
   CROSS JOIN LATERAL unnest(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)) ids(member_id)
   WHERE r.status<>'cancelled' GROUP BY r.session_id,ids.member_id HAVING count(*)>1) unique_member_ok
)
SELECT jsonb_build_object('status',CASE WHEN wrappers_ok AND schema_ok AND tables_ok AND erasure_ok AND internal_acl_ok AND original_functions_ok AND one_pool_ok AND unique_member_ok THEN 'PASS' ELSE 'FAIL' END,
 'checks',to_jsonb(checks),'board_count',(SELECT count(*) FROM matching_board.state),
 'operation_count',(SELECT count(*) FROM matching_board.operations),'notification_count',(SELECT count(*) FROM public.community_notifications)) verification FROM checks;
ROLLBACK;
