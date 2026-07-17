-- Correct the initial compatibility-note typo without creating member audit
-- entries. Only untouched, system-initialized rows are changed.
ALTER TABLE private.member_profile_metrics
  ALTER COLUMN internal_note SET DEFAULT '初始分';

UPDATE private.member_profile_metrics
SET internal_note = '初始分'
WHERE internal_note = '初试分'
  AND score_source = 'initial';

-- Member numbers are operational identifiers used by imports and admin search.
-- Keep the mutation narrow, super-admin-only, and auditable.
CREATE OR REPLACE FUNCTION public.admin_update_member_number(
  p_member_id uuid,
  p_member_number text,
  p_audit_reason text DEFAULT '后台成员详情页修改会员编号'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_before text;
  v_after text;
  v_reason text;
BEGIN
  SELECT administrator.id
  INTO v_admin_id
  FROM public.admin_users AS administrator
  WHERE administrator.user_id = (SELECT auth.uid())
    AND administrator.role = 'super_admin'
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED';
  END IF;

  v_after := NULLIF(btrim(p_member_number), '');
  IF v_after IS NULL OR char_length(v_after) > 64 THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_INVALID';
  END IF;

  v_reason := COALESCE(
    NULLIF(btrim(p_audit_reason), ''),
    '后台成员详情页修改会员编号'
  );

  SELECT member.member_number
  INTO v_before
  FROM public.members AS member
  WHERE member.id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND';
  END IF;

  IF v_before IS NOT DISTINCT FROM v_after THEN
    RETURN v_after;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.members AS member
    WHERE member.member_number = v_after
      AND member.id <> p_member_id
  ) THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_TAKEN';
  END IF;

  UPDATE public.members
  SET
    member_number = v_after,
    updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO private.member_profile_audit_log (
    member_id,
    action_type,
    changed_fields,
    before_values,
    after_values,
    reason,
    actor_user_id,
    actor_admin_id,
    actor_name
  )
  VALUES (
    p_member_id,
    'profile_update',
    ARRAY['member_number']::text[],
    jsonb_build_object('member_number', v_before),
    jsonb_build_object('member_number', v_after),
    v_reason,
    (SELECT auth.uid()),
    v_admin_id,
    (
      SELECT administrator.name
      FROM public.admin_users AS administrator
      WHERE administrator.id = v_admin_id
    )
  );

  RETURN v_after;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_TAKEN';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_member_number(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_member_number(uuid, text, text)
  TO authenticated;
