-- Read-only migration/permission/invariant verification. No personal data output.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH checks AS (
 SELECT
 (SELECT count(*)=3 AND bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='matching_board'
  AND p.proname IN('validate_group_rows','validate_waiting_multi','assert_groups_ready')) private_helpers_ok,
 position('v_pools>1' in pg_get_functiondef('matching_adjustment.validate_rows(jsonb,jsonb,boolean)'::regprocedure))>0 legacy_policy_preserved,
 position('matching_board.validate_group_rows' in pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure))>0
  AND position('matching_board.assert_member_locks' in pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure))>0 grouped_save_and_pins_ok,
 position('matching_board.assert_groups_ready' in pg_get_functiondef('matching_publication_preflight.capture(uuid,integer)'::regprocedure))>0
  AND position('matching_board.assert_groups_ready' in pg_get_functiondef('matching_publication.publish_session(uuid,integer,text)'::regprocedure))>0 publication_guard_ok,
 position('board_layout' in pg_get_functiondef('matching_adjustment.revision(uuid)'::regprocedure))>0
  AND position('waitingMultiIds' in pg_get_functiondef('matching_board.current_layout(uuid)'::regprocedure))>0 revision_layout_ok,
 position('waitingMultiIds' in pg_get_functiondef('matching_board.erase_anonymized()'::regprocedure))>0 privacy_ok,
 position('MATCH_ADJUSTMENT_BOARD_GROUPED' in pg_get_functiondef('matching_adjustment.preview(uuid,uuid,text,uuid[],uuid)'::regprocedure))>0 legacy_adjustment_guard_ok,
 NOT EXISTS(SELECT 1 FROM matching_board.state s CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.layout->'waitingMultiIds','[]'::jsonb)) id
  WHERE s.layout->>'multiMode'='grouped' AND (s.layout->'waitingDuoIds' @> jsonb_build_array(id)
   OR EXISTS(SELECT 1 FROM public.match_results r WHERE r.session_id=s.session_id AND r.status<>'cancelled' AND id::uuid=ANY(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members))))) pending_partition_ok
)
SELECT jsonb_build_object('status',CASE WHEN private_helpers_ok AND legacy_policy_preserved AND grouped_save_and_pins_ok AND publication_guard_ok AND revision_layout_ok AND privacy_ok AND legacy_adjustment_guard_ok AND pending_partition_ok THEN 'PASS' ELSE 'FAIL' END,
 'checks',to_jsonb(checks),'grouped_board_count',(SELECT count(*) FROM matching_board.state WHERE layout->>'multiMode'='grouped')) verification FROM checks;
ROLLBACK;
