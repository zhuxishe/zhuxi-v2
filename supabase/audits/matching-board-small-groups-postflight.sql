-- Read-only verification. Returns schema and invariant booleans, no member data.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH checks AS (
 SELECT
  (SELECT count(*)=2 AND bool_and(NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='matching_board' AND p.proname IN('validate_small_groups','active_small_groups')) private_helpers_ok,
  position('matching_board.validate_small_groups(p_layout,v_keep_rows||p_rows' in pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure))>0
   AND position('matching_board.assert_member_locks' in pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure))>0 save_and_lock_guards_ok,
  position('matching_board.active_small_groups' in pg_get_functiondef('matching_board.current_layout(uuid)'::regprocedure))>0
   AND position('board_layout' in pg_get_functiondef('matching_adjustment.revision(uuid)'::regprocedure))>0 capture_and_revision_ok,
  position('p_previous_layout' in pg_get_functiondef('matching_board.validate_small_groups(jsonb,jsonb,jsonb,jsonb)'::regprocedure))>0
   AND position('MATCH_BOARD_SMALL_GROUP_REQUIRED' in pg_get_functiondef('matching_board.validate_small_groups(jsonb,jsonb,jsonb,jsonb)'::regprocedure))>0 cached_client_guard_ok,
  position('matching_board.validate_small_groups' in pg_get_functiondef('matching_board.assert_groups_ready(uuid)'::regprocedure))>0
   AND position('matching_board.assert_groups_ready' in pg_get_functiondef('matching_publication_preflight.capture(uuid,integer)'::regprocedure))>0
   AND position('matching_board.assert_groups_ready' in pg_get_functiondef('matching_publication.publish_session(uuid,integer,text)'::regprocedure))>0 publication_guard_ok,
  position('smallGroupMemberIds' in pg_get_functiondef('matching_board.erase_anonymized()'::regprocedure))>0 privacy_guard_ok,
  NOT EXISTS(SELECT 1 FROM matching_board.state s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.layout->'smallGroupMemberIds','[]'::jsonb)) g
   WHERE jsonb_typeof(g)<>'array' OR jsonb_array_length(g) NOT BETWEEN 4 AND 6
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(g) member JOIN public.members m ON m.id=member::uuid WHERE m.anonymized_at IS NOT NULL)) stored_marker_invariants_ok
)
SELECT jsonb_build_object('status',CASE WHEN private_helpers_ok AND save_and_lock_guards_ok AND capture_and_revision_ok AND cached_client_guard_ok AND publication_guard_ok AND privacy_guard_ok AND stored_marker_invariants_ok THEN 'PASS' ELSE 'FAIL' END,
 'checks',to_jsonb(checks)) verification FROM checks;
ROLLBACK;
