BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- Resolve the owner through the canonical Auth binding. Profile/contact emails,
-- JWT metadata and the actor's admin role must never grant this exemption.
CREATE OR REPLACE FUNCTION private.profile_member_can_use_reserved_nickname(p_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members AS member
    JOIN auth.users AS account ON account.id = member.user_id
    WHERE member.id = p_member_id
      AND account.email_confirmed_at IS NOT NULL
      AND lower(btrim(account.email)) IN (
        'zhuxishe@gmail.com', 'tsyronjp@gmail.com', 'tokyojht4@gmail.com'
      )
  )
$$;
REVOKE ALL ON FUNCTION private.profile_member_can_use_reserved_nickname(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the existing functions, including avatar checks, synchronization,
-- membership checks and locks. Abort on an unexpected baseline instead of
-- overwriting unrelated changes to these long-standing functions.
DO $migration$
DECLARE
  definition text;
  original text;
BEGIN
  definition := pg_get_functiondef('private.profile_validate_identity_fields()'::regprocedure);
  original := $fragment$       ) THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_RESERVED';$fragment$;
  IF length(definition) - length(replace(definition, original, '')) <> length(original) THEN
    RAISE EXCEPTION 'OFFICIAL_NICKNAME_IDENTITY_BASELINE_MISMATCH';
  END IF;
  EXECUTE replace(definition, original, $fragment$       )
     AND NOT private.profile_member_can_use_reserved_nickname(NEW.member_id) THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_RESERVED';$fragment$);

  definition := pg_get_functiondef('public.community_upsert_profile(text,text,text,text)'::regprocedure);
  original := $fragment$  ) THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_RESERVED';$fragment$;
  IF length(definition) - length(replace(definition, original, '')) <> length(original) THEN
    RAISE EXCEPTION 'OFFICIAL_NICKNAME_COMMUNITY_BASELINE_MISMATCH';
  END IF;
  EXECUTE replace(definition, original, $fragment$  ) AND NOT private.profile_member_can_use_reserved_nickname(v_member_id) THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_RESERVED';$fragment$);

  definition := pg_get_functiondef('public.update_my_profile(text,text,text,text,text,text)'::regprocedure);
  IF length(definition) - length(replace(definition, original, '')) <> length(original) THEN
    RAISE EXCEPTION 'OFFICIAL_NICKNAME_PROFILE_BASELINE_MISMATCH';
  END IF;
  EXECUTE replace(definition, original, $fragment$  ) AND NOT private.profile_member_can_use_reserved_nickname(v_member_id) THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_RESERVED';$fragment$);
END;
$migration$;

-- Row shape and uniqueness remain constraints. Account-dependent reserved-name
-- checks belong in triggers/RPCs, not a CHECK that rejects every official user.
ALTER TABLE public.member_identity DROP CONSTRAINT member_identity_nickname_shape;
ALTER TABLE public.member_identity ADD CONSTRAINT member_identity_nickname_shape CHECK (
  nickname IS NULL OR (
    nickname = private.profile_normalize_nickname(nickname)
    AND char_length(nickname) BETWEEN 2 AND 20
  )
);

CREATE OR REPLACE FUNCTION private.profile_validate_community_reserved_nickname()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
BEGIN
  IF lower(private.profile_normalize_nickname(NEW.nickname)) IN (
    'admin', 'administrator', 'staff',
    '官方', '管理员', '竹溪社官方',
    '管理者', '運営', '公式'
  ) THEN
    SELECT mapping.member_id INTO v_member_id
    FROM private.community_profile_members AS mapping
    WHERE mapping.profile_id = NEW.id;

    -- The upsert creates the profile before its private owner mapping. Only
    -- that first insert can use the current approved member as the owner.
    IF v_member_id IS NULL AND TG_OP = 'INSERT' THEN
      v_member_id := private.community_approved_member_id();
    END IF;
    IF NOT private.profile_member_can_use_reserved_nickname(v_member_id) THEN
      RAISE EXCEPTION 'PROFILE_NICKNAME_RESERVED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.profile_validate_community_reserved_nickname()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER community_profiles_validate_reserved_nickname
  BEFORE INSERT OR UPDATE OF nickname ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION private.profile_validate_community_reserved_nickname();
ALTER TABLE public.community_profiles DROP CONSTRAINT community_profiles_reserved_nickname;

COMMIT;
