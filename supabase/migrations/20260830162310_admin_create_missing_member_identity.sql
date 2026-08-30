-- Allow audited administrator edits to create the first identity row for a
-- canonical account shell. The canonical member may legitimately exist before
-- onboarding has created public.member_identity, but administrators must still
-- provide the same five required identity fields as onboarding step 1.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration', 0));

CREATE OR REPLACE FUNCTION public.admin_update_member_section(
  p_member_id uuid,
  p_section text,
  p_payload jsonb,
  p_reason text,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_is_super boolean := private.member_master_is_super_admin();
  v_admin_name text;
  v_member_updated_at timestamptz;
  v_member_anonymized_at timestamptz;
  v_before jsonb;
  v_after jsonb;
  v_changed text[];
  v_event_id bigint;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_section IN ('account', 'roles', 'quiz', 'workflow') AND NOT v_is_super THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_MASTER_SUPER_ADMIN_REQUIRED';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_REASON_REQUIRED';
  END IF;

  SELECT member.updated_at, member.anonymized_at
  INTO v_member_updated_at, v_member_anonymized_at
  FROM public.members AS member
  WHERE member.id = p_member_id
  FOR UPDATE;
  IF v_member_updated_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MEMBER_MASTER_NOT_FOUND';
  END IF;
  IF v_member_anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBER_MASTER_ANONYMIZED_RECORD_LOCKED';
  END IF;
  IF p_expected_updated_at IS NOT NULL
     AND v_member_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'MEMBER_MASTER_VERSION_CONFLICT';
  END IF;

  v_before := private.member_master_section_snapshot(p_member_id, p_section, v_admin_id);
  SELECT administrator.name INTO v_admin_name
  FROM public.admin_users AS administrator WHERE administrator.id = v_admin_id;

  PERFORM set_config('app.member_master_explicit_audit', 'on', true);
  PERFORM set_config('app.member_master_skip_member_audit', 'on', true);

  IF p_section = 'identity'
     AND NOT EXISTS (
       SELECT 1
       FROM public.member_identity AS identity
       WHERE identity.member_id = p_member_id
     ) THEN
    IF p_payload IS NULL
       OR jsonb_typeof(p_payload) <> 'object'
       OR jsonb_typeof(p_payload->'full_name') IS DISTINCT FROM 'string'
       OR NULLIF(btrim(p_payload->>'full_name'), '') IS NULL
       OR jsonb_typeof(p_payload->'gender') IS DISTINCT FROM 'string'
       OR COALESCE(p_payload->>'gender', '') NOT IN ('male', 'female', 'other')
       OR jsonb_typeof(p_payload->'age_range') IS DISTINCT FROM 'string'
       OR NULLIF(btrim(p_payload->>'age_range'), '') IS NULL
       OR jsonb_typeof(p_payload->'nationality') IS DISTINCT FROM 'string'
       OR NULLIF(btrim(p_payload->>'nationality'), '') IS NULL
       OR jsonb_typeof(p_payload->'current_city') IS DISTINCT FROM 'string'
       OR NULLIF(btrim(p_payload->>'current_city'), '') IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_IDENTITY_REQUIRED_FIELDS_MISSING';
    END IF;

    INSERT INTO public.member_identity (
      member_id, full_name, gender, age_range, nationality, current_city
    ) VALUES (
      p_member_id,
      p_payload->>'full_name',
      p_payload->>'gender',
      p_payload->>'age_range',
      p_payload->>'nationality',
      p_payload->>'current_city'
    )
    ON CONFLICT (member_id) DO NOTHING;
  END IF;

  PERFORM private.member_master_apply_admin_section(
    p_member_id, p_section, p_payload, v_admin_id, false
  );
  UPDATE public.members SET updated_at = now() WHERE id = p_member_id
  RETURNING updated_at INTO v_member_updated_at;
  v_after := private.member_master_section_snapshot(p_member_id, p_section, v_admin_id);
  v_changed := private.member_master_changed_fields(v_before, v_after);

  IF cardinality(v_changed) > 0 THEN
    INSERT INTO private.member_profile_audit_log (
      member_id, member_id_snapshot, action_type, section, changed_fields,
      before_values, after_values, reason, source,
      actor_user_id, actor_admin_id, actor_name
    ) VALUES (
      p_member_id, p_member_id, 'admin_section_update', p_section, v_changed,
      v_before, v_after, btrim(p_reason), 'admin',
      (SELECT auth.uid()), v_admin_id, v_admin_name
    ) RETURNING id INTO v_event_id;
  END IF;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'section', p_section,
    'updated_at', v_member_updated_at,
    'changed_fields', v_changed,
    'event_id', v_event_id,
    'data', v_after
  );
END
$function$;

COMMIT;
