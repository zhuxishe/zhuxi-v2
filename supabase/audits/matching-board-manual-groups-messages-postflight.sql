-- Read-only schema/invariant verification, without returning names or messages.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH checks AS (
 SELECT
  (SELECT count(*)=5 AND bool_and(NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname='matching_board' AND p.proname IN('normalize_unmatched_message','validate_layout_extras','active_manual_small_groups','unmatched_message_recipient_ids'))
    OR (n.nspname='matching_publication' AND p.proname='guard_unmatched_message')) private_helpers_ok,
  position('matching_board.validate_small_groups(p_layout,v_keep_rows||p_rows' in pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure))>0
   AND position('matching_board.validate_layout_extras(p_layout' in pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure))>0
   AND position('matching_board.assert_member_locks' in pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure))>0
   AND position('matching_board.validate_group_rows' in pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure))>0 save_guards_ok,
  position('matching_board.active_manual_small_groups' in pg_get_functiondef('matching_board.current_layout(uuid)'::regprocedure))>0
   AND position('unmatchedMessage' in pg_get_functiondef('matching_board.current_layout(uuid)'::regprocedure))>0
   AND position('board_layout' in pg_get_functiondef('matching_adjustment.revision(uuid)'::regprocedure))>0
   AND position('unmatched_message_recipient_ids' in pg_get_functiondef('matching_adjustment.revision(uuid)'::regprocedure))>0
   AND position('unmatched_message_recipient_ids' in pg_get_functiondef('matching_board.capture(uuid,uuid)'::regprocedure))>0 revision_binds_new_fields,
  position('MATCH_BOARD_MANUAL_GROUP_REQUIRED' in pg_get_functiondef('matching_board.validate_small_groups(jsonb,jsonb,jsonb,jsonb)'::regprocedure))>0
   AND position('MATCH_BOARD_UNMATCHED_MESSAGE_REQUIRED' in pg_get_functiondef('matching_board.validate_layout_extras(jsonb,jsonb)'::regprocedure))>0 cached_client_guards_ok,
  position('matching_board.validate_layout_extras' in pg_get_functiondef('matching_board.assert_groups_ready(uuid)'::regprocedure))>0
   AND position('matching_board.validate_small_groups' in pg_get_functiondef('matching_board.assert_groups_ready(uuid)'::regprocedure))>0
   AND position('matching_board.assert_groups_ready' in pg_get_functiondef('matching_publication.publish_session(uuid,integer,text)'::regprocedure))>0
   AND position('unmatched_message' in pg_get_functiondef('matching_publication_preflight.capture(uuid,integer)'::regprocedure))>0
   AND position('unmatched_message' in pg_get_functiondef('matching_publication.publish_session(uuid,integer,text)'::regprocedure))>0 publication_guards_ok,
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='matching_publication.publications'::regclass
   AND tgname='matching_publication_unmatched_message_immutable' AND tgenabled='O')
   AND NOT has_table_privilege('anon','matching_publication.publications','SELECT')
   AND NOT has_table_privilege('authenticated','matching_publication.publications','SELECT') publication_message_private_and_frozen,
  position('CASE WHEN chosen.outcome=''unmatched'' THEN chosen.unmatched_message ELSE NULL END' in pg_get_functiondef('matching_publication.my_outcomes()'::regprocedure))>0 player_projection_scoped,
  NOT EXISTS(SELECT 1 FROM matching_board.state s WHERE s.layout ? 'unmatchedMessage'
   AND (jsonb_typeof(s.layout->'unmatchedMessage') IS DISTINCT FROM 'string'
    OR char_length(s.layout->>'unmatchedMessage')>300
    OR COALESCE(matching_board.normalize_unmatched_message(s.layout->>'unmatchedMessage'),'') IS DISTINCT FROM s.layout->>'unmatchedMessage'))
   AND NOT EXISTS(SELECT 1 FROM matching_publication.publications WHERE char_length(unmatched_message)>300) message_storage_valid,
  NOT EXISTS(SELECT 1 FROM matching_board.state s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.layout->'manualSmallGroupMemberIds','[]'::jsonb)) manual_group
   WHERE jsonb_typeof(manual_group)<>'array' OR jsonb_array_length(manual_group)<3
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(s.layout->'smallGroupMemberIds','[]'::jsonb)) small_group
     WHERE manual_group @> small_group AND small_group @> manual_group)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(manual_group) member JOIN public.members m ON m.id=member::uuid WHERE m.anonymized_at IS NOT NULL)) manual_markers_valid,
  position('manualSmallGroupMemberIds' in pg_get_functiondef('matching_board.erase_anonymized()'::regprocedure))>0 privacy_guard_ok
)
SELECT jsonb_build_object('status',CASE WHEN private_helpers_ok AND save_guards_ok AND revision_binds_new_fields AND cached_client_guards_ok AND publication_guards_ok AND publication_message_private_and_frozen AND player_projection_scoped AND message_storage_valid AND manual_markers_valid AND privacy_guard_ok THEN 'PASS' ELSE 'FAIL' END,'checks',to_jsonb(checks)) verification FROM checks;
ROLLBACK;
