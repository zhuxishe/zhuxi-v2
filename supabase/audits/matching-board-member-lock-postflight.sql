-- Read-only catalog/invariant check. No member names, profile data or audit reasons.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH wrappers AS (
 SELECT p.oid,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN('admin_set_matching_board_member_lock','admin_get_matching_board_member_lock_operation')
),checks AS (
 SELECT
 (SELECT count(*)=2 AND bool_and(NOT prosecdef AND has_function_privilege('service_role',oid,'EXECUTE')
  AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')) FROM wrappers) wrappers_ok,
 (SELECT count(*)=2 AND bool_and(c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='matching_board' AND c.relname IN('member_locks','member_lock_operations')) private_tables_ok,
 (SELECT count(*)=4 AND bool_and(tgenabled='O') FROM pg_trigger WHERE NOT tgisinternal AND tgname IN(
  'matching_board_member_lock_result','matching_board_member_lock_result_final','matching_board_member_lock_layout_final','matching_board_member_lock_erasure')) triggers_ok,
 (SELECT count(*)=2 AND bool_and(tgdeferrable AND tginitdeferred) FROM pg_trigger WHERE NOT tgisinternal
  AND tgname IN('matching_board_member_lock_result_final','matching_board_member_lock_layout_final')) deferred_guards_ok,
 NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='matching_board'
  AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) internal_acl_ok,
 position('member_lock_revision' in pg_get_functiondef('matching_adjustment.revision(uuid)'::regprocedure))>0
  AND position('locked_member_ids' in pg_get_functiondef('matching_board.capture(uuid,uuid)'::regprocedure))>0
  AND position('matching_board.assert_member_locks' in pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure))>0 version_and_save_ok,
 NOT EXISTS(SELECT 1 FROM matching_board.member_locks l WHERE NOT EXISTS(SELECT 1 FROM public.match_results r
  WHERE r.session_id=l.session_id AND r.status<>'cancelled' AND r.member_b_id IS NOT NULL AND l.member_id IN(r.member_a_id,r.member_b_id))
  AND NOT (matching_board.current_layout(l.session_id)->'waitingDuoIds' @> to_jsonb(ARRAY[l.member_id]))) pins_in_duo_ok
)
SELECT jsonb_build_object('status',CASE WHEN wrappers_ok AND private_tables_ok AND triggers_ok AND deferred_guards_ok AND internal_acl_ok AND version_and_save_ok AND pins_in_duo_ok THEN 'PASS' ELSE 'FAIL' END,
 'checks',to_jsonb(checks),'member_lock_count',(SELECT count(*) FROM matching_board.member_locks),
 'member_lock_operation_count',(SELECT count(*) FROM matching_board.member_lock_operations)) verification FROM checks;
ROLLBACK;
