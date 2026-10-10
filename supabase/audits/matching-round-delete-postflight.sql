-- Read-only structural verification after the one additive migration.
BEGIN TRANSACTION READ ONLY;
DO $audit$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='match_rounds'
      AND policyname='match_rounds_live_read' AND permissive='RESTRICTIVE'
      AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND qual='(deleted_at IS NULL)'
  ) THEN RAISE EXCEPTION 'ROUND_DELETE_READ_POLICY_INVALID'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='match_rounds' AND column_name='deleted_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='match_rounds' AND column_name='deleted_by'
  ) THEN RAISE EXCEPTION 'ROUND_DELETE_COLUMNS_MISSING'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.match_rounds'::regclass AND conname='match_rounds_deleted_state_check'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.match_rounds'::regclass
      AND tgname='guard_match_round_deletion' AND tgenabled='O'
  ) THEN RAISE EXCEPTION 'ROUND_DELETE_WRITE_GUARD_MISSING'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid='public.admin_delete_match_round(uuid,text,integer)'::regprocedure
      AND NOT prosecdef AND proconfig @> ARRAY['search_path=""']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid='private.admin_delete_match_round(uuid,text,integer)'::regprocedure
      AND prosecdef AND proconfig @> ARRAY['search_path=""']::text[]
  ) THEN RAISE EXCEPTION 'ROUND_DELETE_RPC_SECURITY_INVALID'; END IF;
  IF NOT has_function_privilege('authenticated','public.admin_delete_match_round(uuid,text,integer)','EXECUTE')
    OR NOT has_function_privilege('authenticated','private.admin_delete_match_round(uuid,text,integer)','EXECUTE')
    OR has_function_privilege('anon','public.admin_delete_match_round(uuid,text,integer)','EXECUTE')
    OR has_function_privilege('service_role','public.admin_delete_match_round(uuid,text,integer)','EXECUTE')
    OR has_function_privilege('anon','private.admin_delete_match_round(uuid,text,integer)','EXECUTE')
    OR has_function_privilege('service_role','private.admin_delete_match_round(uuid,text,integer)','EXECUTE')
    OR has_function_privilege('authenticated','private.guard_match_round_deletion()','EXECUTE')
    OR has_table_privilege('authenticated','public.match_rounds','DELETE')
    OR has_table_privilege('anon','public.match_rounds','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'ROUND_DELETE_API_PRIVILEGES_INVALID';
  END IF;
  IF position('deleted_at IS NULL' IN pg_get_functiondef('private.peer_member_eligible(uuid,uuid)'::regprocedure))=0
    OR position('v_round.deleted_at IS NOT NULL' IN pg_get_functiondef('private.member_master_guard_round_submission_write()'::regprocedure))=0
    OR position('deleted_at IS NULL' IN pg_get_functiondef('private.guard_match_session_round_purpose()'::regprocedure))=0
    OR position('r.deleted_at IS NULL' IN pg_get_functiondef('public.player_list_round_peer_review_events()'::regprocedure))=0
    OR position('r.deleted_at IS NULL' IN pg_get_functiondef('public.admin_list_round_peer_review_events()'::regprocedure))=0 THEN
    RAISE EXCEPTION 'ROUND_DELETE_DEPENDENT_GUARDS_MISSING';
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_rounds r WHERE r.deleted_at IS NOT NULL AND (
    r.status<>'closed' OR EXISTS(SELECT 1 FROM public.match_sessions s WHERE s.round_id=r.id)
    OR EXISTS(SELECT 1 FROM private.round_peer_reviews rv WHERE rv.round_id=r.id)
    OR EXISTS(SELECT 1 FROM private.round_peer_reports rp WHERE rp.round_id=r.id)
    OR EXISTS(SELECT 1 FROM private.round_peer_review_settings s WHERE s.round_id=r.id AND s.enabled)
  )) THEN RAISE EXCEPTION 'ROUND_DELETE_DATA_STATE_INVALID'; END IF;
END;
$audit$;
SELECT count(*) FILTER(WHERE deleted_at IS NULL) AS live_rounds,
  count(*) FILTER(WHERE deleted_at IS NOT NULL) AS removed_rounds FROM public.match_rounds;
COMMIT;
