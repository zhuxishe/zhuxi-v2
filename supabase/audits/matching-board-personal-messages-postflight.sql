-- Read-only personal-message schema and invariant checks; no names or message
-- bodies are returned. Existing records are not modified by this verification.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH checks AS (
 SELECT
  (SELECT count(*)=4 AND bool_and(NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname='matching_board' AND p.proname IN('normalize_unmatched_member_messages','resolve_unmatched_member_message','validate_layout_extras'))
    OR (n.nspname='matching_publication' AND p.proname='guard_roster_unmatched_message')) private_helpers_ok,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='matching_publication' AND table_name='roster'
   AND column_name='unmatched_message' AND data_type='jsonb' AND is_nullable='YES' AND column_default IS NULL)
   AND (SELECT relrowsecurity FROM pg_class WHERE oid='matching_publication.roster'::regclass)
   AND NOT has_table_privilege('anon','matching_publication.roster','SELECT')
   AND NOT has_table_privilege('authenticated','matching_publication.roster','SELECT')
   AND NOT has_table_privilege('service_role','matching_publication.roster','SELECT') roster_message_private_and_legacy_null,
  position('matching_board.normalize_unmatched_member_messages(p_layout->''unmatchedMemberMessages'',v_ids)' in pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure))>0
   AND position('MATCH_BOARD_MEMBER_MESSAGES_REQUIRED' in pg_get_functiondef('matching_board.validate_layout_extras(jsonb,jsonb)'::regprocedure))>0
   AND position('unmatchedMemberMessages' in pg_get_functiondef('matching_board.current_layout(uuid)'::regprocedure))>0 save_and_cached_client_guards_ok,
  position('normalize_unmatched_member_messages(layout->''unmatchedMemberMessages'',matching_board.cohort_ids(p_session_id))' in pg_get_functiondef('matching_board.assert_groups_ready(uuid)'::regprocedure))>0
   AND position('unmatched_member_messages' in pg_get_functiondef('matching_publication_preflight.capture(uuid,integer)'::regprocedure))>0
   AND position('board_layout' in pg_get_functiondef('matching_adjustment.revision(uuid)'::regprocedure))>0 revision_and_publication_bind_personal_map,
  position('UPDATE matching_publication.roster recipient SET unmatched_message=CASE' in pg_get_functiondef('matching_publication.publish_session(uuid,integer,text)'::regprocedure))>0
   AND position('recipient.member_id=ANY(matching_board.unmatched_message_recipient_ids(p_session_id))' in pg_get_functiondef('matching_publication.publish_session(uuid,integer,text)'::regprocedure))>0
   AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='matching_publication.roster'::regclass AND tgname='matching_publication_roster_message_immutable' AND tgenabled='O') frozen_per_recipient_ok,
  position('CASE WHEN roster.unmatched_message IS NULL THEN publication.unmatched_message ELSE roster.unmatched_message#>>''{}'' END AS unmatched_message' in pg_get_functiondef('matching_publication.my_outcomes()'::regprocedure))>0
   AND position('roster.member_id=v_member' in pg_get_functiondef('matching_publication.my_outcomes()'::regprocedure))>0
   AND position('unmatchedMemberMessages' in pg_get_functiondef('matching_publication.my_outcomes()'::regprocedure))=0 player_receives_only_own_scalar,
  NOT EXISTS(SELECT 1 FROM matching_board.state s WHERE s.layout ? 'unmatchedMemberMessages'
   AND matching_board.normalize_unmatched_member_messages(s.layout->'unmatchedMemberMessages',matching_board.cohort_ids(s.session_id)) IS DISTINCT FROM s.layout->'unmatchedMemberMessages') canonical_member_maps_valid,
  NOT EXISTS(SELECT 1 FROM matching_publication.roster WHERE unmatched_message IS NOT NULL
   AND (jsonb_typeof(unmatched_message) NOT IN('string','null') OR char_length(unmatched_message#>>'{}')>300)) frozen_storage_valid,
  position('(s.layout->''unmatchedMemberMessages'')-NEW.id::text' in pg_get_functiondef('matching_board.erase_anonymized()'::regprocedure))>0
   AND position('UPDATE matching_publication.roster SET unmatched_message=''null''::jsonb' in pg_get_functiondef('matching_board.erase_anonymized()'::regprocedure))>0
   AND position('m.anonymized_at IS NOT NULL' in pg_get_functiondef('matching_publication.guard_roster_unmatched_message()'::regprocedure))>0 privacy_redaction_ok
)
SELECT jsonb_build_object('status',CASE WHEN private_helpers_ok AND roster_message_private_and_legacy_null AND save_and_cached_client_guards_ok AND revision_and_publication_bind_personal_map AND frozen_per_recipient_ok AND player_receives_only_own_scalar AND canonical_member_maps_valid AND frozen_storage_valid AND privacy_redaction_ok THEN 'PASS' ELSE 'FAIL' END,'checks',to_jsonb(checks)) verification FROM checks;
ROLLBACK;
