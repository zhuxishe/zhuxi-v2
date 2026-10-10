-- Remove an unused round from public/admin entry points while retaining its
-- answers, receipts and roster. Matched rounds and actual feedback stay intact.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE public.match_rounds
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD CONSTRAINT match_rounds_deleted_state_check CHECK (
    (deleted_at IS NOT NULL OR deleted_by IS NULL)
    AND (deleted_at IS NULL OR status = 'closed')
  );

-- Restrictive policies also constrain the existing permissive admin policy.
-- Privileged lifecycle/audit RPCs still retain access to the historical rows.
CREATE POLICY match_rounds_live_read ON public.match_rounds
  AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE OR REPLACE FUNCTION private.guard_match_round_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN
      RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.deleted_at IS NOT NULL THEN
    -- The FK may remove a departed administrator's identity, but it cannot
    -- reopen or otherwise edit a removed round.
    IF NOT (NEW.deleted_by IS NULL AND OLD.deleted_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = OLD.deleted_by)
      AND (to_jsonb(NEW) - 'deleted_by') = (to_jsonb(OLD) - 'deleted_by')) THEN
      RAISE EXCEPTION 'ROUND_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  ELSIF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
    IF current_setting('app.match_round_delete', true) IS DISTINCT FROM OLD.id::text
      OR NOT private.member_master_is_super_admin()
      OR NEW.deleted_at IS NULL
      OR NEW.deleted_by IS DISTINCT FROM private.member_master_current_admin_id()
      OR NEW.status IS DISTINCT FROM 'closed'
      OR (to_jsonb(NEW) - ARRAY['deleted_at','deleted_by','status'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['deleted_at','deleted_by','status']) THEN
      RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_match_round_deletion() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_match_round_deletion BEFORE INSERT OR UPDATE ON public.match_rounds
  FOR EACH ROW EXECUTE FUNCTION private.guard_match_round_deletion();

CREATE OR REPLACE FUNCTION private.admin_delete_match_round(
  p_round_id uuid, p_confirm_name text, p_expected_revision integer
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_admin uuid;
  v_round public.match_rounds%ROWTYPE;
  v_previous_delete text := COALESCE(current_setting('app.match_round_delete', true), '');
BEGIN
  -- Re-read the live administrator/member rows after acquiring their locks;
  -- JWT metadata alone never authorizes this destructive operation.
  IF (SELECT auth.uid()) IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  BEGIN
    PERFORM private.peer_lock_admin();
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END;
  IF NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  v_admin := private.member_master_current_admin_id();
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_round FROM public.match_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF p_confirm_name IS DISTINCT FROM v_round.round_name THEN
    RAISE EXCEPTION 'ROUND_DELETE_CONFIRMATION' USING ERRCODE = '22023';
  END IF;
  -- Retrying a successful deletion does not duplicate any mutation.
  IF v_round.deleted_at IS NOT NULL THEN RETURN true; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision IS DISTINCT FROM v_round.config_revision THEN
    RAISE EXCEPTION 'ROUND_DELETE_CHANGED' USING ERRCODE = '40001';
  END IF;
  IF v_round.status = 'matched' OR EXISTS (SELECT 1 FROM public.match_sessions WHERE round_id = p_round_id) THEN
    RAISE EXCEPTION 'ROUND_DELETE_HAS_MATCHES' USING ERRCODE = '55000';
  END IF;
  -- All peer submissions take this lock. Check their existence only after
  -- waiting, so feedback finishing concurrently cannot be hidden by deletion.
  PERFORM 1 FROM private.round_peer_review_settings WHERE round_id = p_round_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM private.round_peer_reviews WHERE round_id = p_round_id)
    OR EXISTS (SELECT 1 FROM private.round_peer_reports WHERE round_id = p_round_id) THEN
    RAISE EXCEPTION 'ROUND_DELETE_HAS_FEEDBACK' USING ERRCODE = '55000';
  END IF;
  PERFORM set_config('app.match_round_delete', p_round_id::text, true);
  UPDATE public.match_rounds SET deleted_at = clock_timestamp(), deleted_by = v_admin, status = 'closed'
    WHERE id = p_round_id;
  PERFORM set_config('app.match_round_delete', v_previous_delete, true);
  UPDATE private.round_peer_review_settings SET enabled = false, version = version + 1, updated_at = clock_timestamp()
    WHERE round_id = p_round_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION private.admin_delete_match_round(uuid,text,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_delete_match_round(uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_match_round(
  p_round_id uuid, p_confirm_name text, p_expected_revision integer
)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT private.admin_delete_match_round(p_round_id, p_confirm_name, p_expected_revision)
$function$;
REVOKE ALL ON FUNCTION public.admin_delete_match_round(uuid,text,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_match_round(uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION private.peer_member_eligible(p_round_id uuid, p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (SELECT 1 FROM public.match_rounds r WHERE r.id = p_round_id AND r.deleted_at IS NULL)
  AND EXISTS (SELECT 1 FROM public.members m WHERE m.id = p_member_id
    AND m.account_status = 'active' AND m.status = 'approved'
    AND m.membership_type = 'player' AND m.anonymized_at IS NULL AND m.user_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.match_round_submissions s
    WHERE s.round_id = p_round_id AND s.member_id = p_member_id AND s.cancelled_at IS NOT NULL)
$function$;

-- Add narrow guards to the deployed function definitions. Exact baseline
-- checks prevent silently replacing an incompatible implementation.
DO $migration$
DECLARE definition text; original text; replacement text; function_name text;
BEGIN
  definition := pg_get_functiondef('private.member_master_guard_round_submission_write()'::regprocedure);
  original := $fragment$  IF NOT v_is_privileged AND NEW.config_revision IS DISTINCT FROM v_round.config_revision THEN$fragment$;
  replacement := $fragment$  IF v_round.deleted_at IS NOT NULL AND NOT (
    TG_OP = 'UPDATE' AND v_is_privileged
    AND current_setting('app.round_anonymize_member', true) IS NOT DISTINCT FROM NEW.member_id::text
  ) THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_is_privileged AND NEW.config_revision IS DISTINCT FROM v_round.config_revision THEN$fragment$;
  IF position(original IN definition) = 0 THEN RAISE EXCEPTION 'ROUND_DELETE_SUBMISSION_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition, original, replacement);

  definition := pg_get_functiondef('private.guard_match_session_round_purpose()'::regprocedure);
  original := $fragment$WHERE id = NEW.round_id FOR SHARE;$fragment$;
  IF position(original IN definition) = 0 THEN RAISE EXCEPTION 'ROUND_DELETE_SESSION_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition, original, 'WHERE id = NEW.round_id AND deleted_at IS NULL FOR SHARE;');

  definition := pg_get_functiondef('public.player_list_round_peer_review_events()'::regprocedure);
  original := $fragment$JOIN private.round_peer_review_participants p ON p.round_id=r.id AND p.member_id=v_player;$fragment$;
  IF position(original IN definition) = 0 THEN RAISE EXCEPTION 'ROUND_DELETE_PLAYER_LIST_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition, original, 'JOIN private.round_peer_review_participants p ON p.round_id=r.id AND p.member_id=v_player WHERE r.deleted_at IS NULL;');

  definition := pg_get_functiondef('public.admin_list_round_peer_review_events()'::regprocedure);
  original := $fragment$WHERE r.purpose<>'announcement';$fragment$;
  IF position(original IN definition) = 0 THEN RAISE EXCEPTION 'ROUND_DELETE_ADMIN_LIST_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition, original, 'WHERE r.purpose<>''announcement'' AND r.deleted_at IS NULL;');

  definition := pg_get_functiondef('public.player_get_round_peer_reviews(uuid,text,integer,integer)'::regprocedure);
  original := $fragment$SELECT round_name INTO v_name FROM public.match_rounds WHERE id=p_round_id;$fragment$;
  replacement := $fragment$SELECT round_name INTO v_name FROM public.match_rounds WHERE id=p_round_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;$fragment$;
  IF position(original IN definition) = 0 THEN RAISE EXCEPTION 'ROUND_DELETE_PLAYER_GET_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition, original, replacement);

  FOREACH function_name IN ARRAY ARRAY['public.admin_get_round_peer_reviews(uuid)',
    'public.admin_save_round_peer_review_settings(uuid,boolean,timestamp with time zone,timestamp with time zone,integer,text)'] LOOP
    definition := pg_get_functiondef(function_name::regprocedure);
    original := $fragment$WHERE id=p_round_id AND purpose<>'announcement'$fragment$;
    IF position(original IN definition) = 0 THEN RAISE EXCEPTION 'ROUND_DELETE_ADMIN_PEER_BASELINE_MISMATCH'; END IF;
    EXECUTE replace(definition, original, 'WHERE id=p_round_id AND purpose<>''announcement'' AND deleted_at IS NULL');
  END LOOP;

  -- These two admin operations already lock settings after member/answer
  -- rows. Recheck the round after that lock instead of introducing the reverse
  -- round/settings lock order, which could deadlock with deletion.
  FOREACH function_name IN ARRAY ARRAY['public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text)',
    'public.admin_set_round_peer_review_participant(uuid,uuid,boolean,text)'] LOOP
    definition := pg_get_functiondef(function_name::regprocedure);
    original := $fragment$IF NOT FOUND THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;$fragment$;
    replacement := $fragment$IF NOT FOUND THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.match_rounds WHERE id=p_round_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002';
  END IF;$fragment$;
    IF position(original IN definition) = 0 THEN RAISE EXCEPTION 'ROUND_DELETE_ROSTER_BASELINE_MISMATCH'; END IF;
    EXECUTE replace(definition, original, replacement);
  END LOOP;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
