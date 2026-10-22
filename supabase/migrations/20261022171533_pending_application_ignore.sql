-- Administrative queue triage is independent of membership and onboarding.
-- No member row, notification, or applicant-facing status is changed here.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE TABLE public.member_application_ignores (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  ignored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_admin_id uuid NOT NULL,
  actor_name text NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 4 AND 500)
);
CREATE INDEX member_application_ignores_order_idx
  ON public.member_application_ignores(ignored_at DESC, member_id);
ALTER TABLE public.member_application_ignores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_application_ignores FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.member_application_ignores TO authenticated, service_role;
CREATE POLICY member_application_ignores_admin_read ON public.member_application_ignores
  FOR SELECT TO authenticated USING (
    (SELECT private.member_master_is_admin())
    AND EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.anonymized_at IS NULL)
  );

-- Lock the canonical row before checking either queue state. Both the approval
-- wrapper and triage writer use this lock, so stale queue approvals cannot race
-- with an ignore without touching members.updated_at or its lifecycle triggers.
CREATE FUNCTION private.pending_application_lock_candidate(p_member_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_member public.members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM public.members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR v_member.record_scope IS DISTINCT FROM 'current'
    OR v_member.account_status IS DISTINCT FROM 'active'
    OR v_member.status IS DISTINCT FROM 'pending'
    OR v_member.profile_stage NOT IN ('submitted', 'complete')
    OR v_member.onboarding_step IS DISTINCT FROM 4
    OR v_member.anonymized_at IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM public.member_identity WHERE member_id = p_member_id) THEN
    RAISE EXCEPTION 'PENDING_APPLICATION_NOT_ELIGIBLE' USING ERRCODE = 'PT409';
  END IF;
  RETURN v_member.updated_at;
END;
$function$;
REVOKE ALL ON FUNCTION private.pending_application_lock_candidate(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.admin_set_pending_application_ignored(
  p_member_id uuid, p_ignored boolean, p_reason text,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_expected_ignored_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_admin_id uuid;
  v_admin_name text;
  v_updated_at timestamptz;
  v_current public.member_application_ignores%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_event_id bigint;
  v_trim_chars constant text := E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  v_reason text := btrim(COALESCE(p_reason, ''), v_trim_chars);
BEGIN
  PERFORM private.peer_lock_admin();
  v_admin_id := private.member_master_current_admin_id();
  IF v_admin_id IS NULL OR (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'MEMBER_MASTER_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_ignored IS NULL OR char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION 'PENDING_APPLICATION_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  v_updated_at := private.pending_application_lock_candidate(p_member_id);
  SELECT * INTO v_current FROM public.member_application_ignores WHERE member_id = p_member_id FOR UPDATE;
  v_before := CASE WHEN FOUND THEN to_jsonb(v_current) ELSE jsonb_build_object('ignored', false) END;
  IF p_ignored THEN
    IF v_current.member_id IS NOT NULL THEN
      RAISE EXCEPTION 'PENDING_APPLICATION_ALREADY_IGNORED' USING ERRCODE = 'PT409';
    END IF;
    IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_updated_at THEN
      RAISE EXCEPTION 'PENDING_APPLICATION_VERSION_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
    SELECT COALESCE(NULLIF(btrim(name), ''), email, '管理员') INTO v_admin_name
      FROM public.admin_users WHERE id = v_admin_id;
    INSERT INTO public.member_application_ignores(member_id, actor_admin_id, actor_name, reason)
      VALUES(p_member_id, v_admin_id, v_admin_name, v_reason) RETURNING * INTO v_current;
    v_after := to_jsonb(v_current) || jsonb_build_object('ignored', true);
  ELSE
    IF v_current.member_id IS NULL OR p_expected_ignored_at IS NULL
      OR p_expected_ignored_at IS DISTINCT FROM v_current.ignored_at THEN
      RAISE EXCEPTION 'PENDING_APPLICATION_VERSION_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
    SELECT COALESCE(NULLIF(btrim(name), ''), email, '管理员') INTO v_admin_name
      FROM public.admin_users WHERE id = v_admin_id;
    DELETE FROM public.member_application_ignores WHERE member_id = p_member_id;
    v_after := jsonb_build_object('ignored', false);
  END IF;
  INSERT INTO private.member_profile_audit_log(
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source, actor_user_id, actor_admin_id, actor_name
  ) VALUES (
    p_member_id, p_member_id, 'related_record_change', 'application_queue', ARRAY['ignored'],
    v_before, v_after, v_reason, 'admin', (SELECT auth.uid()), v_admin_id, v_admin_name
  ) RETURNING id INTO v_event_id;
  RETURN jsonb_build_object('member_id', p_member_id, 'ignored', p_ignored,
    'ignored_at', CASE WHEN p_ignored THEN v_current.ignored_at ELSE NULL END, 'event_id', v_event_id);
END;
$function$;
REVOKE ALL ON FUNCTION private.admin_set_pending_application_ignored(uuid,boolean,text,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_set_pending_application_ignored(uuid,boolean,text,timestamptz,timestamptz) TO authenticated;

CREATE FUNCTION public.admin_set_pending_application_ignored(
  p_member_id uuid, p_ignored boolean, p_reason text,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_expected_ignored_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT private.admin_set_pending_application_ignored(p_member_id,p_ignored,p_reason,p_expected_updated_at,p_expected_ignored_at)
$function$;
REVOKE ALL ON FUNCTION public.admin_set_pending_application_ignored(uuid,boolean,text,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_pending_application_ignored(uuid,boolean,text,timestamptz,timestamptz) TO authenticated;

CREATE FUNCTION private.admin_approve_pending_application(
  p_member_id uuid, p_reason text, p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_updated_at timestamptz;
BEGIN
  PERFORM private.peer_lock_admin();
  v_updated_at := private.pending_application_lock_candidate(p_member_id);
  IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_updated_at THEN
    RAISE EXCEPTION 'PENDING_APPLICATION_VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.member_application_ignores WHERE member_id = p_member_id) THEN
    RAISE EXCEPTION 'PENDING_APPLICATION_ALREADY_IGNORED' USING ERRCODE = 'PT409';
  END IF;
  -- Preserve the existing completeness, lifecycle, reason and audit checks.
  RETURN public.admin_update_member_section(p_member_id, 'application', '{"status":"approved"}'::jsonb, p_reason, p_expected_updated_at);
END;
$function$;
REVOKE ALL ON FUNCTION private.admin_approve_pending_application(uuid,text,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_approve_pending_application(uuid,text,timestamptz) TO authenticated;

CREATE FUNCTION public.admin_approve_pending_application(
  p_member_id uuid, p_reason text, p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT private.admin_approve_pending_application(p_member_id,p_reason,p_expected_updated_at)
$function$;
REVOKE ALL ON FUNCTION public.admin_approve_pending_application(uuid,text,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_approve_pending_application(uuid,text,timestamptz) TO authenticated;

-- Respect the existing privacy scrub: only the current marker is removed;
-- immutable historical events retain the established audit privacy rules.
CREATE FUNCTION private.pending_application_erase_anonymized()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW.anonymized_at IS NOT NULL THEN
    DELETE FROM public.member_application_ignores WHERE member_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.pending_application_erase_anonymized() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER pending_application_erase_anonymized AFTER UPDATE OF anonymized_at ON public.members
  FOR EACH ROW EXECUTE FUNCTION private.pending_application_erase_anonymized();

NOTIFY pgrst, 'reload schema';
COMMIT;
