-- Required human-entered deletion details and a read-only super-admin trash
-- list. Existing removed rounds remain legacy records; never invent history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE TABLE private.match_round_deletion_audit (
  round_id uuid PRIMARY KEY REFERENCES public.match_rounds(id) ON DELETE RESTRICT,
  round_name text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('matching','registration','announcement')),
  activity_start date NOT NULL,
  activity_end date NOT NULL,
  survey_end timestamptz NOT NULL,
  deleted_at timestamptz NOT NULL,
  admin_id_snapshot uuid NOT NULL,
  auth_user_id_snapshot uuid NOT NULL,
  account_email_snapshot text,
  admin_name_snapshot text NOT NULL,
  operator_name text NOT NULL CHECK (char_length(operator_name) BETWEEN 1 AND 80),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 2 AND 500)
);
ALTER TABLE private.match_round_deletion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.match_round_deletion_audit FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.guard_match_round_deletion_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ROUND_DELETE_AUDIT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF current_setting('app.match_round_delete_audit', true) IS DISTINCT FROM NEW.round_id::text
    OR (SELECT auth.uid()) IS NULL OR NOT private.member_master_is_super_admin()
    OR NEW.auth_user_id_snapshot IS DISTINCT FROM (SELECT auth.uid())
    OR NEW.admin_id_snapshot IS DISTINCT FROM private.member_master_current_admin_id()
    OR NOT EXISTS (
      SELECT 1 FROM public.match_rounds r WHERE r.id = NEW.round_id AND r.deleted_at = NEW.deleted_at
        AND r.deleted_by = NEW.admin_id_snapshot AND r.round_name = NEW.round_name AND r.purpose = NEW.purpose
        AND r.activity_start = NEW.activity_start AND r.activity_end = NEW.activity_end AND r.survey_end = NEW.survey_end
    ) THEN
    RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_match_round_deletion_audit() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_match_round_deletion_audit BEFORE INSERT OR UPDATE OR DELETE ON private.match_round_deletion_audit
  FOR EACH ROW EXECUTE FUNCTION private.guard_match_round_deletion_audit();

CREATE INDEX match_rounds_deleted_order_idx ON public.match_rounds(deleted_at DESC, id)
  WHERE deleted_at IS NOT NULL;

-- Keep the original atomic matching/feedback guards in one protected helper.
-- Only the new audited entry point may execute it; old pages cannot bypass the
-- required fields through the formerly exposed three-argument API.
ALTER FUNCTION private.admin_delete_match_round(uuid,text,integer) RENAME TO perform_match_round_deletion;
REVOKE ALL ON FUNCTION private.perform_match_round_deletion(uuid,text,integer) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.admin_delete_match_round(
  p_round_id uuid, p_confirm_name text, p_expected_revision integer
)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  RAISE EXCEPTION 'ROUND_DELETE_AUDIT_REQUIRED' USING ERRCODE = '22023';
END;
$function$;
REVOKE ALL ON FUNCTION private.admin_delete_match_round(uuid,text,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_delete_match_round(uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_match_round(
  p_round_id uuid, p_confirm_name text, p_expected_revision integer
)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  RAISE EXCEPTION 'ROUND_DELETE_AUDIT_REQUIRED' USING ERRCODE = '22023';
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_delete_match_round(uuid,text,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_match_round(uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION private.admin_delete_match_round(
  p_round_id uuid, p_confirm_name text, p_expected_revision integer, p_operator_name text, p_reason text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_admin uuid;
  v_user uuid := (SELECT auth.uid());
  v_email text;
  v_admin_name text;
  v_round public.match_rounds%ROWTYPE;
  -- Match JavaScript trim for the UI, including Unicode whitespace.
  v_trim_chars constant text := E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  v_operator_name text := btrim(COALESCE(p_operator_name,''), v_trim_chars);
  v_reason text := btrim(COALESCE(p_reason,''), v_trim_chars);
  v_previous_audit text := COALESCE(current_setting('app.match_round_delete_audit', true), '');
BEGIN
  IF v_user IS NULL OR NOT private.member_master_is_super_admin() THEN
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
  IF char_length(v_operator_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'ROUND_DELETE_OPERATOR_INVALID' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_reason) NOT BETWEEN 2 AND 500 THEN
    RAISE EXCEPTION 'ROUND_DELETE_REASON_INVALID' USING ERRCODE = '22023';
  END IF;
  v_admin := private.member_master_current_admin_id();
  SELECT email INTO v_email FROM auth.users WHERE id = v_user;
  IF v_admin IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(name,'') INTO v_admin_name FROM public.admin_users WHERE id = v_admin;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_round FROM public.match_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF p_confirm_name IS DISTINCT FROM v_round.round_name THEN
    RAISE EXCEPTION 'ROUND_DELETE_CONFIRMATION' USING ERRCODE = '22023';
  END IF;
  -- A retry returns success without editing the original audit, including a
  -- pre-upgrade legacy deletion for which no human details were recorded.
  IF v_round.deleted_at IS NOT NULL THEN RETURN true; END IF;
  PERFORM private.perform_match_round_deletion(p_round_id, p_confirm_name, p_expected_revision);
  SELECT * INTO v_round FROM public.match_rounds WHERE id = p_round_id;
  PERFORM set_config('app.match_round_delete_audit', p_round_id::text, true);
  INSERT INTO private.match_round_deletion_audit (
    round_id, round_name, purpose, activity_start, activity_end, survey_end, deleted_at,
    admin_id_snapshot, auth_user_id_snapshot, account_email_snapshot, admin_name_snapshot, operator_name, reason
  ) VALUES (
    v_round.id, v_round.round_name, v_round.purpose, v_round.activity_start, v_round.activity_end, v_round.survey_end, v_round.deleted_at,
    v_admin, v_user, v_email, v_admin_name, v_operator_name, v_reason
  );
  PERFORM set_config('app.match_round_delete_audit', v_previous_audit, true);
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION private.admin_delete_match_round(uuid,text,integer,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_delete_match_round(uuid,text,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_match_round(
  p_round_id uuid, p_confirm_name text, p_expected_revision integer, p_operator_name text, p_reason text
)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT private.admin_delete_match_round(p_round_id, p_confirm_name, p_expected_revision, p_operator_name, p_reason)
$function$;
REVOKE ALL ON FUNCTION public.admin_delete_match_round(uuid,text,integer,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_match_round(uuid,text,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.admin_list_deleted_match_rounds(p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  BEGIN
    PERFORM private.peer_current_admin();
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'ROUND_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'ROUND_TRASH_PAGINATION_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN (
    WITH removed AS MATERIALIZED (
      SELECT r.id, COALESCE(a.round_name,r.round_name) AS round_name, COALESCE(a.purpose,r.purpose) AS purpose,
        COALESCE(a.activity_start,r.activity_start) AS activity_start, COALESCE(a.activity_end,r.activity_end) AS activity_end,
        COALESCE(a.survey_end,r.survey_end) AS survey_end, COALESCE(a.deleted_at,r.deleted_at) AS deleted_at,
        a.account_email_snapshot AS deleted_admin_email, a.operator_name AS executor_name, a.reason,
        a.round_id IS NULL AS legacy
      FROM public.match_rounds r LEFT JOIN private.match_round_deletion_audit a ON a.round_id = r.id
      WHERE r.deleted_at IS NOT NULL
    )
    SELECT jsonb_build_object('total',(SELECT count(*) FROM removed),'items',
      COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.deleted_at DESC,page.id)
        FROM (SELECT * FROM removed ORDER BY deleted_at DESC,id LIMIT p_limit OFFSET p_offset) page),'[]'::jsonb))
  );
END;
$function$;
REVOKE ALL ON FUNCTION private.admin_list_deleted_match_rounds(integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_list_deleted_match_rounds(integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_deleted_match_rounds(p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT private.admin_list_deleted_match_rounds(p_limit,p_offset)
$function$;
REVOKE ALL ON FUNCTION public.admin_list_deleted_match_rounds(integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_deleted_match_rounds(integer,integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
