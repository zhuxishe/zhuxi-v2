-- Player profile V1 data model.
--
-- Manual migration-file fallback: `npx --yes supabase@latest migration new
-- player_profile_v1` was attempted first, but package retrieval remained
-- blocked without output in this environment. This timestamp was generated in
-- Asia/Tokyo and is later than 20260716215812.

-- ---------------------------------------------------------------------------
-- Canonical player nickname and personal avatar
-- ---------------------------------------------------------------------------

-- PostgreSQL exposes Unicode compatibility normalization natively. Keeping
-- this in the database prevents direct RPC callers from disguising reserved
-- names with full-width or other compatibility characters.
CREATE OR REPLACE FUNCTION private.profile_normalize_nickname(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = ''
AS $$
  SELECT normalize(btrim(p_value), NFKC)
$$;

ALTER TABLE public.member_identity
  ADD COLUMN IF NOT EXISTS personal_avatar_path text;

-- Canonicalize legacy community nicknames before they become the identity
-- source of truth. Compatibility-equivalent duplicates and newly revealed
-- reserved names receive a privacy-safe, non-name placeholder so existing
-- posts keep their author relationship without exposing a reserved identity.
DO $$
DECLARE
  v_highest_placeholder bigint;
  v_profile_count bigint;
BEGIN
  SELECT COALESCE(
    max(substring(private.profile_normalize_nickname(profile.nickname) FROM '^迁移-([0-9]{15,17})$')::bigint),
    0
  )
  INTO v_highest_placeholder
  FROM public.community_profiles AS profile
  WHERE private.profile_normalize_nickname(profile.nickname) ~ '^迁移-[0-9]{15,17}$';

  SELECT count(*) INTO v_profile_count FROM public.community_profiles;
  IF v_highest_placeholder + v_profile_count > 99999999999999999 THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_MIGRATION_PLACEHOLDER_EXHAUSTED';
  END IF;
END;
$$;

WITH normalized_profiles AS (
  SELECT
    profile.id,
    private.profile_normalize_nickname(profile.nickname) AS normalized_nickname,
    lower(private.profile_normalize_nickname(profile.nickname)) AS comparison_key
  FROM public.community_profiles AS profile
),
nickname_counts AS (
  SELECT normalized.comparison_key, count(*) AS nickname_count
  FROM normalized_profiles AS normalized
  GROUP BY normalized.comparison_key
),
placeholder_sequence AS (
  SELECT COALESCE(
    max(substring(normalized.normalized_nickname FROM '^迁移-([0-9]{15,17})$')::bigint),
    0
  ) AS highest_existing
  FROM normalized_profiles AS normalized
  WHERE normalized.normalized_nickname ~ '^迁移-[0-9]{15,17}$'
),
resolved_profiles AS (
  SELECT
    normalized.id,
    CASE
      WHEN char_length(normalized.normalized_nickname) BETWEEN 2 AND 20
        AND normalized.comparison_key NOT IN (
          'admin', 'administrator', 'staff',
          '官方', '管理员', '竹溪社官方',
          '管理者', '運営', '公式'
        )
        AND counts.nickname_count = 1
      THEN normalized.normalized_nickname
      ELSE '迁移-' || lpad(
        (placeholder.highest_existing + row_number() OVER (ORDER BY normalized.id))::text,
        greatest(
          15,
          char_length((placeholder.highest_existing + row_number() OVER (ORDER BY normalized.id))::text)
        ),
        '0'
      )
    END AS canonical_nickname
  FROM normalized_profiles AS normalized
  JOIN nickname_counts AS counts
    ON counts.comparison_key = normalized.comparison_key
  CROSS JOIN placeholder_sequence AS placeholder
)
UPDATE public.community_profiles AS profile
SET nickname = resolved.canonical_nickname
FROM resolved_profiles AS resolved
WHERE profile.id = resolved.id
  AND profile.nickname IS DISTINCT FROM resolved.canonical_nickname;

-- Community nickname is authoritative during the one-time merge. Otherwise a
-- personal nickname is retained only when it is valid and globally unique.
-- A real name is deliberately never used as a fallback.
WITH community_choice AS (
  SELECT
    mapping.member_id,
    private.profile_normalize_nickname(profile.nickname) AS nickname,
    lower(private.profile_normalize_nickname(profile.nickname)) AS normalized
  FROM private.community_profile_members AS mapping
  JOIN public.community_profiles AS profile
    ON profile.id = mapping.profile_id
  WHERE mapping.member_id IS NOT NULL
    AND char_length(private.profile_normalize_nickname(profile.nickname)) BETWEEN 2 AND 20
    AND lower(private.profile_normalize_nickname(profile.nickname)) NOT IN (
      'admin', 'administrator', 'staff',
      '官方', '管理员', '竹溪社官方',
      '管理者', '運営', '公式'
    )
),
community_counts AS (
  SELECT choice.normalized, count(*) AS candidate_count
  FROM community_choice AS choice
  GROUP BY choice.normalized
),
personal_candidate AS (
  SELECT
    identity.member_id,
    private.profile_normalize_nickname(identity.nickname) AS nickname,
    lower(private.profile_normalize_nickname(identity.nickname)) AS normalized
  FROM public.member_identity AS identity
  WHERE identity.nickname IS NOT NULL
    AND char_length(private.profile_normalize_nickname(identity.nickname)) BETWEEN 2 AND 20
    AND lower(private.profile_normalize_nickname(identity.nickname)) NOT IN (
      'admin', 'administrator', 'staff',
      '官方', '管理员', '竹溪社官方',
      '管理者', '運営', '公式'
    )
),
personal_counts AS (
  SELECT candidate.normalized, count(*) AS candidate_count
  FROM personal_candidate AS candidate
  GROUP BY candidate.normalized
),
resolved AS (
  SELECT
    identity.member_id,
    COALESCE(
      CASE WHEN community_count.candidate_count = 1 THEN community.nickname END,
      CASE
        WHEN counts.candidate_count = 1
          AND NOT EXISTS (
            SELECT 1
            FROM public.community_profiles AS taken
            WHERE lower(private.profile_normalize_nickname(taken.nickname)) = personal.normalized
          )
        THEN personal.nickname
        ELSE NULL
      END
    ) AS nickname
  FROM public.member_identity AS identity
  LEFT JOIN community_choice AS community
    ON community.member_id = identity.member_id
  LEFT JOIN community_counts AS community_count
    ON community_count.normalized = community.normalized
  LEFT JOIN personal_candidate AS personal
    ON personal.member_id = identity.member_id
  LEFT JOIN personal_counts AS counts
    ON counts.normalized = personal.normalized
)
UPDATE public.member_identity AS identity
SET nickname = resolved.nickname
FROM resolved
WHERE identity.member_id = resolved.member_id
  AND identity.nickname IS DISTINCT FROM resolved.nickname;

ALTER TABLE public.member_identity
  DROP CONSTRAINT IF EXISTS member_identity_nickname_shape;

ALTER TABLE public.member_identity
  ADD CONSTRAINT member_identity_nickname_shape
  CHECK (
    nickname IS NULL
    OR (
      nickname = private.profile_normalize_nickname(nickname)
      AND char_length(nickname) BETWEEN 2 AND 20
      AND lower(nickname) NOT IN (
        'admin', 'administrator', 'staff',
        '官方', '管理员', '竹溪社官方',
        '管理者', '運営', '公式'
      )
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS member_identity_nickname_normalized_uidx
  ON public.member_identity (lower(private.profile_normalize_nickname(nickname)))
  WHERE nickname IS NOT NULL;

-- Add the dynamic personal-avatar mode while retaining upload temporarily for
-- compatibility with older clients. All existing upload rows are migrated to
-- personal mode below.
ALTER TABLE public.community_profiles
  DROP CONSTRAINT IF EXISTS community_profiles_avatar_kind_check;

ALTER TABLE public.community_profiles
  DROP CONSTRAINT IF EXISTS community_profiles_avatar_shape;

ALTER TABLE public.community_profiles
  ADD CONSTRAINT community_profiles_avatar_shape
  CHECK (
    (avatar_kind = 'default' AND avatar_path IS NULL AND preset_avatar IS NULL)
    OR (
      avatar_kind = 'preset'
      AND avatar_path IS NULL
      AND preset_avatar IN ('bamboo', 'stream', 'leaf')
    )
    OR (avatar_kind = 'upload' AND avatar_path IS NOT NULL AND preset_avatar IS NULL)
    OR (avatar_kind = 'personal' AND preset_avatar IS NULL)
  );

UPDATE public.member_identity AS identity
SET personal_avatar_path = profile.avatar_path
FROM private.community_profile_members AS mapping
JOIN public.community_profiles AS profile
  ON profile.id = mapping.profile_id
WHERE mapping.member_id = identity.member_id
  AND profile.avatar_kind = 'upload'
  AND profile.avatar_path IS NOT NULL
  AND identity.personal_avatar_path IS NULL;

UPDATE public.community_profiles AS profile
SET avatar_kind = 'personal'
FROM private.community_profile_members AS mapping
WHERE mapping.profile_id = profile.id
  AND mapping.member_id IS NOT NULL
  AND profile.avatar_kind = 'upload';

DELETE FROM private.community_media_cleanup_queue AS cleanup
USING public.member_identity AS identity
WHERE cleanup.bucket_id = 'community-avatars'
  AND cleanup.object_path = identity.personal_avatar_path;

-- ---------------------------------------------------------------------------
-- Private administrator-controlled metrics and audit history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS private.member_profile_metrics (
  member_id uuid PRIMARY KEY
    REFERENCES public.members(id) ON DELETE CASCADE,
  member_level smallint NOT NULL DEFAULT 1
    CHECK (member_level BETWEEN 1 AND 3),
  compatibility_score numeric(2,1) NOT NULL DEFAULT 5.0
    CHECK (compatibility_score BETWEEN 1.0 AND 5.0),
  compatibility_status text NOT NULL DEFAULT 'published'
    CHECK (compatibility_status IN ('pending', 'published')),
  internal_note text NOT NULL DEFAULT '初试分',
  score_source text NOT NULL DEFAULT 'initial'
    CHECK (score_source IN ('initial', 'manual')),
  published_at timestamptz DEFAULT now(),
  published_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  CHECK (
    (compatibility_status = 'pending' AND published_at IS NULL AND published_by IS NULL)
    OR (compatibility_status = 'published' AND published_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS member_profile_metrics_published_by_idx
  ON private.member_profile_metrics (published_by)
  WHERE published_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS member_profile_metrics_updated_by_idx
  ON private.member_profile_metrics (updated_by)
  WHERE updated_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS private.member_profile_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id uuid NOT NULL
    REFERENCES public.members(id) ON DELETE CASCADE,
  action_type text NOT NULL
    CHECK (action_type IN ('profile_update', 'metrics_update', 'activity_recalculate')),
  changed_fields text[] NOT NULL DEFAULT '{}',
  before_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_profile_audit_member_created_idx
  ON private.member_profile_audit_log (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS member_profile_audit_admin_created_idx
  ON private.member_profile_audit_log (actor_admin_id, created_at DESC)
  WHERE actor_admin_id IS NOT NULL;

INSERT INTO private.member_profile_metrics (member_id)
SELECT member.id
FROM public.members AS member
ON CONFLICT (member_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.profile_seed_member_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO private.member_profile_metrics (member_id)
  VALUES (NEW.id)
  ON CONFLICT (member_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_seed_profile_metrics ON public.members;
CREATE TRIGGER members_seed_profile_metrics
  AFTER INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION private.profile_seed_member_metrics();

-- ---------------------------------------------------------------------------
-- Shared authorization and profile validation helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.profile_current_approved_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT member.id
  FROM public.members AS member
  WHERE member.user_id = (SELECT auth.uid())
    AND member.status = 'approved'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.profile_current_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT administrator.id
  FROM public.admin_users AS administrator
  WHERE administrator.user_id = (SELECT auth.uid())
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.profile_validate_identity_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_avatar_upload_id uuid;
  v_role text := COALESCE((SELECT auth.jwt()->>'role'), '');
BEGIN
  NEW.nickname := NULLIF(private.profile_normalize_nickname(NEW.nickname), '');

  IF NEW.nickname IS NOT NULL
     AND char_length(NEW.nickname) NOT BETWEEN 2 AND 20 THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_INVALID';
  END IF;

  IF NEW.nickname IS NOT NULL
     AND lower(NEW.nickname) IN (
         'admin', 'administrator', 'staff',
         '官方', '管理员', '竹溪社官方',
         '管理者', '運営', '公式'
       ) THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_RESERVED';
  END IF;

  IF NEW.nickname IS NULL AND EXISTS (
    SELECT 1
    FROM private.community_profile_members AS mapping
    WHERE mapping.member_id = NEW.member_id
  ) THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_REQUIRED_FOR_COMMUNITY';
  END IF;

  IF NEW.nickname IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.community_profiles AS profile
    LEFT JOIN private.community_profile_members AS mapping
      ON mapping.profile_id = profile.id
    WHERE profile.nickname_normalized = lower(NEW.nickname)
      AND mapping.member_id IS DISTINCT FROM NEW.member_id
  ) THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_TAKEN';
  END IF;

  IF (TG_OP = 'INSERT' OR NEW.personal_avatar_path IS DISTINCT FROM OLD.personal_avatar_path)
     AND NEW.personal_avatar_path IS NOT NULL THEN
    v_admin_id := private.profile_current_admin_id();
    IF v_role <> 'service_role'
       AND v_admin_id IS NULL
       AND (
         (SELECT auth.uid()) IS NULL
         OR split_part(NEW.personal_avatar_path, '/', 1) <> (SELECT auth.uid())::text
       ) THEN
      RAISE EXCEPTION 'Personal avatar must belong to the current user';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id = 'community-avatars'
        AND object.name = NEW.personal_avatar_path
    ) THEN
      RAISE EXCEPTION 'Personal avatar object is missing';
    END IF;

    -- Match the cleanup worker's queue->proof lock order. Either the cleanup
    -- wins before this transaction (and proof validation fails safely), or the
    -- new reference cancels cleanup and holds the proof through commit.
    DELETE FROM private.community_media_cleanup_queue
    WHERE bucket_id = 'community-avatars'
      AND object_path = NEW.personal_avatar_path;

    SELECT upload.id
    INTO v_avatar_upload_id
    FROM private.community_processed_uploads AS upload
    WHERE upload.member_id = NEW.member_id
      AND upload.bucket_id = 'community-avatars'
      AND upload.storage_path = NEW.personal_avatar_path
      AND upload.thumbnail_path = NEW.personal_avatar_path
      AND upload.cleanup_claimed_at IS NULL
    FOR UPDATE;

    IF v_avatar_upload_id IS NULL THEN
      RAISE EXCEPTION 'Personal avatar processing proof is missing';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_identity_validate_profile_fields
  ON public.member_identity;
CREATE TRIGGER member_identity_validate_profile_fields
  BEFORE INSERT OR UPDATE OF nickname, personal_avatar_path
  ON public.member_identity
  FOR EACH ROW EXECUTE FUNCTION private.profile_validate_identity_fields();

CREATE OR REPLACE FUNCTION private.profile_log_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fields text[] := ARRAY[]::text[];
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN v_fields := array_append(v_fields, 'full_name'); END IF;
  IF OLD.gender IS DISTINCT FROM NEW.gender THEN v_fields := array_append(v_fields, 'gender'); END IF;
  IF OLD.nickname IS DISTINCT FROM NEW.nickname THEN v_fields := array_append(v_fields, 'nickname'); END IF;
  IF OLD.school_name IS DISTINCT FROM NEW.school_name THEN v_fields := array_append(v_fields, 'school_name'); END IF;
  IF OLD.department IS DISTINCT FROM NEW.department THEN v_fields := array_append(v_fields, 'department'); END IF;
  IF OLD.personal_avatar_path IS DISTINCT FROM NEW.personal_avatar_path THEN v_fields := array_append(v_fields, 'personal_avatar_path'); END IF;

  IF cardinality(v_fields) = 0 THEN
    RETURN NEW;
  END IF;

  v_before := jsonb_build_object(
    'full_name', OLD.full_name,
    'gender', OLD.gender,
    'nickname', OLD.nickname,
    'school_name', OLD.school_name,
    'department', OLD.department,
    'personal_avatar_path', OLD.personal_avatar_path
  );
  v_after := jsonb_build_object(
    'full_name', NEW.full_name,
    'gender', NEW.gender,
    'nickname', NEW.nickname,
    'school_name', NEW.school_name,
    'department', NEW.department,
    'personal_avatar_path', NEW.personal_avatar_path
  );

  INSERT INTO private.member_profile_audit_log (
    member_id,
    action_type,
    changed_fields,
    before_values,
    after_values,
    actor_user_id,
    actor_admin_id,
    actor_name
  )
  VALUES (
    NEW.member_id,
    'profile_update',
    v_fields,
    v_before,
    v_after,
    (SELECT auth.uid()),
    private.profile_current_admin_id(),
    (
      SELECT administrator.name
      FROM public.admin_users AS administrator
      WHERE administrator.id = private.profile_current_admin_id()
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_identity_log_profile_change
  ON public.member_identity;
CREATE TRIGGER member_identity_log_profile_change
  AFTER UPDATE OF full_name, gender, nickname, school_name, department, personal_avatar_path
  ON public.member_identity
  FOR EACH ROW EXECUTE FUNCTION private.profile_log_identity_change();

-- Keep the canonical identity nickname/avatar and the community compatibility
-- mirror synchronized for both the new profile form and older community code.
CREATE OR REPLACE FUNCTION private.profile_sync_identity_to_community()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  SELECT mapping.profile_id
  INTO v_profile_id
  FROM private.community_profile_members AS mapping
  WHERE mapping.member_id = NEW.member_id;

  IF v_profile_id IS NOT NULL THEN
    IF NEW.nickname IS NULL THEN
      RAISE EXCEPTION 'A community profile requires a nickname';
    END IF;

    UPDATE public.community_profiles AS profile
    SET
      nickname = NEW.nickname,
      avatar_path = CASE
        WHEN profile.avatar_kind = 'personal' THEN NEW.personal_avatar_path
        ELSE profile.avatar_path
      END
    WHERE profile.id = v_profile_id
      AND (
        profile.nickname IS DISTINCT FROM NEW.nickname
        OR (
          profile.avatar_kind = 'personal'
          AND profile.avatar_path IS DISTINCT FROM NEW.personal_avatar_path
        )
      );
  END IF;

  IF OLD.personal_avatar_path IS DISTINCT FROM NEW.personal_avatar_path THEN
    IF OLD.personal_avatar_path IS NOT NULL
       AND NOT private.community_storage_object_referenced(
         'community-avatars',
         OLD.personal_avatar_path
       ) THEN
      INSERT INTO private.community_media_cleanup_queue (
        bucket_id,
        object_path,
        reason
      )
      VALUES ('community-avatars', OLD.personal_avatar_path, 'personal_avatar_replaced')
      ON CONFLICT (bucket_id, object_path) DO UPDATE SET
        processed_at = NULL,
        last_error = NULL,
        queued_at = now();
    END IF;

    IF NEW.personal_avatar_path IS NOT NULL THEN
      DELETE FROM private.community_media_cleanup_queue
      WHERE bucket_id = 'community-avatars'
        AND object_path = NEW.personal_avatar_path;

      UPDATE private.community_processed_uploads
      SET last_used_at = now()
      WHERE member_id = NEW.member_id
        AND bucket_id = 'community-avatars'
        AND storage_path = NEW.personal_avatar_path;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_identity_sync_community_profile
  ON public.member_identity;
CREATE TRIGGER member_identity_sync_community_profile
  AFTER UPDATE OF nickname, personal_avatar_path
  ON public.member_identity
  FOR EACH ROW EXECUTE FUNCTION private.profile_sync_identity_to_community();

CREATE OR REPLACE FUNCTION private.profile_sync_community_to_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_personal_avatar_path text;
BEGIN
  SELECT mapping.member_id
  INTO v_member_id
  FROM private.community_profile_members AS mapping
  WHERE mapping.profile_id = NEW.id;

  IF v_member_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.member_identity AS identity
  SET nickname = NEW.nickname
  WHERE identity.member_id = v_member_id
    AND identity.nickname IS DISTINCT FROM NEW.nickname;

  IF NEW.avatar_kind = 'upload' AND NEW.avatar_path IS NOT NULL THEN
    UPDATE public.member_identity AS identity
    SET personal_avatar_path = NEW.avatar_path
    WHERE identity.member_id = v_member_id
      AND identity.personal_avatar_path IS DISTINCT FROM NEW.avatar_path;

    UPDATE public.community_profiles
    SET avatar_kind = 'personal'
    WHERE id = NEW.id
      AND avatar_kind = 'upload';
  ELSIF NEW.avatar_kind = 'personal' THEN
    SELECT identity.personal_avatar_path
    INTO v_personal_avatar_path
    FROM public.member_identity AS identity
    WHERE identity.member_id = v_member_id;

    UPDATE public.community_profiles
    SET avatar_path = v_personal_avatar_path
    WHERE id = NEW.id
      AND avatar_path IS DISTINCT FROM v_personal_avatar_path;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_profiles_sync_member_identity
  ON public.community_profiles;
CREATE TRIGGER community_profiles_sync_member_identity
  AFTER UPDATE OF nickname, avatar_kind, avatar_path
  ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION private.profile_sync_community_to_identity();

CREATE OR REPLACE FUNCTION private.profile_sync_new_community_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.community_profiles%ROWTYPE;
  v_orphaned_avatar_path text;
BEGIN
  IF NEW.member_id IS NULL THEN
    SELECT profile.avatar_path
    INTO v_orphaned_avatar_path
    FROM public.community_profiles AS profile
    WHERE profile.id = NEW.profile_id
      AND profile.avatar_kind = 'personal';

    -- A member deletion keeps the historical community profile/post author,
    -- but must not leave the deleted account's personal image visible.
    UPDATE public.community_profiles
    SET
      avatar_kind = 'default',
      avatar_path = NULL,
      preset_avatar = NULL
    WHERE id = NEW.profile_id
      AND avatar_kind = 'personal';

    IF v_orphaned_avatar_path IS NOT NULL THEN
      -- Queueing is harmless while another live reference exists: the cleanup
      -- worker rechecks community_storage_object_protected before deletion.
      INSERT INTO private.community_media_cleanup_queue (
        bucket_id,
        object_path,
        reason
      )
      VALUES ('community-avatars', v_orphaned_avatar_path, 'member_deleted')
      ON CONFLICT (bucket_id, object_path) DO UPDATE SET
        processed_at = NULL,
        last_error = NULL,
        queued_at = now();
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_profile
  FROM public.community_profiles
  WHERE id = NEW.profile_id;

  UPDATE public.member_identity AS identity
  SET
    nickname = v_profile.nickname,
    personal_avatar_path = CASE
      WHEN v_profile.avatar_kind = 'upload' THEN v_profile.avatar_path
      ELSE identity.personal_avatar_path
    END
  WHERE identity.member_id = NEW.member_id
    AND (
      identity.nickname IS DISTINCT FROM v_profile.nickname
      OR (
        v_profile.avatar_kind = 'upload'
        AND identity.personal_avatar_path IS DISTINCT FROM v_profile.avatar_path
      )
    );

  IF v_profile.avatar_kind = 'upload' THEN
    UPDATE public.community_profiles
    SET avatar_kind = 'personal'
    WHERE id = NEW.profile_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_profile_mapping_sync_identity
  ON private.community_profile_members;
CREATE TRIGGER community_profile_mapping_sync_identity
  AFTER INSERT OR UPDATE OF member_id
  ON private.community_profile_members
  FOR EACH ROW EXECUTE FUNCTION private.profile_sync_new_community_mapping();

-- Preserve the existing community-profile RPC while replacing the legacy
-- standalone upload choice with the canonical personal profile avatar.
CREATE OR REPLACE FUNCTION public.community_upsert_profile(
  p_nickname text,
  p_avatar_kind text DEFAULT 'default',
  p_avatar_path text DEFAULT NULL,
  p_preset_avatar text DEFAULT NULL
)
RETURNS public.community_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_profile_id uuid;
  v_personal_avatar_path text;
  v_avatar_upload_id uuid;
  v_effective_avatar_kind text := p_avatar_kind;
  v_nickname text := NULLIF(private.profile_normalize_nickname(p_nickname), '');
  v_profile public.community_profiles;
BEGIN
  v_member_id := private.community_approved_member_id();
  IF v_member_id IS NULL OR NOT private.community_can_read() THEN
    RAISE EXCEPTION 'Approved community membership is required';
  END IF;

  IF v_nickname IS NULL
     OR char_length(v_nickname) NOT BETWEEN 2 AND 20 THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_INVALID';
  END IF;
  IF lower(v_nickname) IN (
    'admin', 'administrator', 'staff',
    '官方', '管理员', '竹溪社官方',
    '管理者', '運営', '公式'
  ) THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_RESERVED';
  END IF;

  IF p_avatar_kind IS NULL
     OR p_avatar_kind NOT IN ('default', 'preset', 'personal', 'upload') THEN
    RAISE EXCEPTION 'Invalid avatar kind';
  END IF;
  IF p_avatar_kind = 'preset'
     AND (
       p_preset_avatar IS NULL
       OR p_preset_avatar NOT IN ('bamboo', 'stream', 'leaf')
     ) THEN
    RAISE EXCEPTION 'Invalid preset avatar';
  END IF;

  SELECT identity.personal_avatar_path
  INTO v_personal_avatar_path
  FROM public.member_identity AS identity
  WHERE identity.member_id = v_member_id;

  IF p_avatar_kind = 'personal' AND v_personal_avatar_path IS NULL THEN
    RAISE EXCEPTION 'PROFILE_PERSONAL_AVATAR_REQUIRED';
  END IF;

  -- Backward compatibility for a client that still submits upload: validate
  -- the processed object, promote it to the canonical personal avatar, and
  -- persist only the new personal mode in the community profile.
  IF p_avatar_kind = 'upload' THEN
    IF p_avatar_path IS NULL
       OR split_part(p_avatar_path, '/', 1) <> (SELECT auth.uid())::text
       OR NOT EXISTS (
         SELECT 1
         FROM storage.objects AS object
         WHERE object.bucket_id = 'community-avatars'
           AND object.name = p_avatar_path
       ) THEN
      RAISE EXCEPTION 'Avatar must be uploaded to the current user path first';
    END IF;

    SELECT upload.id
    INTO v_avatar_upload_id
    FROM private.community_processed_uploads AS upload
    WHERE upload.member_id = v_member_id
      AND upload.bucket_id = 'community-avatars'
      AND upload.storage_path = p_avatar_path
      AND upload.thumbnail_path = p_avatar_path
      AND upload.cleanup_claimed_at IS NULL
    FOR UPDATE;

    IF v_avatar_upload_id IS NULL THEN
      RAISE EXCEPTION 'Avatar processing proof is missing';
    END IF;

    UPDATE public.member_identity
    SET personal_avatar_path = p_avatar_path
    WHERE member_id = v_member_id;
    v_personal_avatar_path := p_avatar_path;
    v_effective_avatar_kind := 'personal';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_member_id::text));

  SELECT mapping.profile_id
  INTO v_profile_id
  FROM private.community_profile_members AS mapping
  WHERE mapping.member_id = v_member_id
  FOR UPDATE;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.community_profiles (
      nickname,
      avatar_kind,
      avatar_path,
      preset_avatar
    )
    VALUES (
      v_nickname,
      v_effective_avatar_kind,
      CASE WHEN v_effective_avatar_kind = 'personal' THEN v_personal_avatar_path ELSE NULL END,
      CASE WHEN v_effective_avatar_kind = 'preset' THEN p_preset_avatar ELSE NULL END
    )
    RETURNING * INTO v_profile;

    INSERT INTO private.community_profile_members (profile_id, member_id)
    VALUES (v_profile.id, v_member_id);
  ELSE
    UPDATE public.community_profiles
    SET
      nickname = v_nickname,
      avatar_kind = v_effective_avatar_kind,
      avatar_path = CASE WHEN v_effective_avatar_kind = 'personal' THEN v_personal_avatar_path ELSE NULL END,
      preset_avatar = CASE WHEN v_effective_avatar_kind = 'preset' THEN p_preset_avatar ELSE NULL END
    WHERE id = v_profile_id
    RETURNING * INTO v_profile;
  END IF;

  IF v_avatar_upload_id IS NOT NULL THEN
    UPDATE private.community_processed_uploads
    SET last_used_at = now()
    WHERE id = v_avatar_upload_id;
  END IF;

  SELECT * INTO v_profile
  FROM public.community_profiles
  WHERE id = v_profile.id;
  RETURN v_profile;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_TAKEN';
END;
$$;

-- Personal avatars are protected from cleanup and can be read through the
-- existing private community-media policy when selected for community use.
CREATE OR REPLACE FUNCTION private.community_storage_object_referenced(
  p_bucket_id text,
  p_object_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_bucket_id
    WHEN 'community-avatars' THEN (
      EXISTS (
        SELECT 1
        FROM public.member_identity AS identity
        WHERE identity.personal_avatar_path = p_object_path
      )
      OR EXISTS (
        SELECT 1
        FROM public.community_profiles AS profile
        WHERE profile.avatar_path = p_object_path
          AND profile.avatar_kind IN ('upload', 'personal')
      )
    )
    WHEN 'community-media' THEN EXISTS (
      SELECT 1
      FROM public.community_post_images AS image
      WHERE image.storage_path = p_object_path
         OR image.thumbnail_path = p_object_path
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION private.community_can_read_storage_object(
  p_bucket_id text,
  p_object_path text,
  p_owner_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    private.community_is_admin()
    OR (
      p_bucket_id = 'community-avatars'
      AND p_owner_id = (SELECT auth.uid())::text
      AND private.profile_current_approved_member_id() IS NOT NULL
    )
    OR (
      private.community_can_read()
      AND (
        (
          p_bucket_id = 'community-avatars'
          AND EXISTS (
            SELECT 1
            FROM public.community_profiles AS profile
            WHERE profile.avatar_kind IN ('upload', 'personal')
              AND profile.avatar_path = p_object_path
              AND NOT private.community_interaction_is_blocked(profile.id)
          )
        )
        OR (
          p_bucket_id = 'community-media'
          AND EXISTS (
            SELECT 1
            FROM public.community_post_images AS image
            WHERE (image.storage_path = p_object_path OR image.thumbnail_path = p_object_path)
              AND private.community_post_visible_to_current(image.post_id)
          )
        )
      )
    )
$$;

-- ---------------------------------------------------------------------------
-- Attendance counts: completed participation means listed and not no-show
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.recalculate_member_activity_stats(
  p_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_activity_count integer;
  v_late_count integer;
  v_no_show_count integer;
  v_last_activity_at timestamptz;
BEGIN
  SELECT
    count(*) FILTER (
      WHERE p_member_id = ANY(activity.participant_ids)
        AND NOT (p_member_id = ANY(activity.no_show_member_ids))
    ),
    count(*) FILTER (WHERE p_member_id = ANY(activity.late_member_ids)),
    count(*) FILTER (WHERE p_member_id = ANY(activity.no_show_member_ids)),
    (max(activity.activity_date) FILTER (
      WHERE p_member_id = ANY(activity.participant_ids)
        AND NOT (p_member_id = ANY(activity.no_show_member_ids))
    ))::timestamptz
  INTO
    v_activity_count,
    v_late_count,
    v_no_show_count,
    v_last_activity_at
  FROM public.activity_records AS activity;

  INSERT INTO public.member_dynamic_stats (
    member_id,
    activity_count,
    late_count,
    no_show_count,
    last_activity_at
  )
  VALUES (
    p_member_id,
    COALESCE(v_activity_count, 0),
    COALESCE(v_late_count, 0),
    COALESCE(v_no_show_count, 0),
    v_last_activity_at
  )
  ON CONFLICT (member_id) DO UPDATE SET
    activity_count = EXCLUDED.activity_count,
    late_count = EXCLUDED.late_count,
    no_show_count = EXCLUDED.no_show_count,
    last_activity_at = EXCLUDED.last_activity_at,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION private.recalculate_activity_stats_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_member_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_member_ids := v_member_ids
      || COALESCE(OLD.participant_ids, ARRAY[]::uuid[])
      || COALESCE(OLD.late_member_ids, ARRAY[]::uuid[])
      || COALESCE(OLD.no_show_member_ids, ARRAY[]::uuid[]);
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_member_ids := v_member_ids
      || COALESCE(NEW.participant_ids, ARRAY[]::uuid[])
      || COALESCE(NEW.late_member_ids, ARRAY[]::uuid[])
      || COALESCE(NEW.no_show_member_ids, ARRAY[]::uuid[]);
  END IF;

  FOR v_member_id IN
    SELECT DISTINCT candidate
    FROM unnest(v_member_ids) AS candidate
    WHERE candidate IS NOT NULL
  LOOP
    PERFORM private.recalculate_member_activity_stats(v_member_id);
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_activity_insert ON public.activity_records;
DROP TRIGGER IF EXISTS on_activity_change_recalculate ON public.activity_records;
CREATE TRIGGER on_activity_change_recalculate
  AFTER INSERT OR UPDATE OR DELETE ON public.activity_records
  FOR EACH ROW EXECUTE FUNCTION private.recalculate_activity_stats_after_change();

SELECT private.recalculate_member_activity_stats(member.id)
FROM public.members AS member;

-- ---------------------------------------------------------------------------
-- Narrow player and community read/write RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_profile_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_result jsonb;
BEGIN
  v_member_id := private.profile_current_approved_member_id();
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Approved player access is required';
  END IF;

  SELECT jsonb_build_object(
    'member_id', member.id,
    'member_number', member.member_number,
    'status', member.status,
    'email', member.email,
    'line_user_id', member.line_user_id,
    'full_name', identity.full_name,
    'gender', identity.gender,
    'nickname', identity.nickname,
    'school_name', identity.school_name,
    'department', identity.department,
    'personal_avatar_path', identity.personal_avatar_path,
    'level', COALESCE(metrics.member_level, 1),
    'compatibility_score', CASE
      WHEN metrics.compatibility_status = 'published' THEN metrics.compatibility_score
      ELSE NULL
    END,
    'compatibility_status', COALESCE(metrics.compatibility_status, 'pending'),
    'activity_count', COALESCE(stats.activity_count, 0),
    'last_activity_at', stats.last_activity_at,
    'community_profile_id', community.id,
    'community_avatar_kind', community.avatar_kind,
    'community_avatar_path', CASE
      WHEN community.avatar_kind = 'personal' THEN identity.personal_avatar_path
      ELSE community.avatar_path
    END,
    'community_preset_avatar', community.preset_avatar,
    'identity_complete', (
      identity.id IS NOT NULL
      AND NULLIF(btrim(identity.full_name), '') IS NOT NULL
      AND identity.gender IN ('male', 'female', 'other')
      AND identity.school_name IS NOT NULL
    ),
    'supplementary_complete', (
      EXISTS (
        SELECT 1
        FROM public.member_language AS language
        WHERE language.member_id = member.id
          AND cardinality(language.communication_language_pref) > 0
      )
      AND EXISTS (
        SELECT 1
        FROM public.member_interests AS interests
        WHERE interests.member_id = member.id
          AND interests.activity_frequency IS NOT NULL
      )
    ),
    'personality_complete', EXISTS (
      SELECT 1
      FROM public.member_personality AS personality
      WHERE personality.member_id = member.id
        AND personality.extroversion IS NOT NULL
        AND personality.initiative IS NOT NULL
        AND personality.emotional_stability IS NOT NULL
        AND personality.warmup_speed IS NOT NULL
        AND cardinality(personality.expression_style_tags) > 0
    ),
    'quiz_complete', EXISTS (
      SELECT 1
      FROM public.personality_quiz_results AS quiz
      WHERE quiz.member_id = member.id
        AND quiz.score_e IS NOT NULL
    )
  )
  INTO v_result
  FROM public.members AS member
  LEFT JOIN public.member_identity AS identity
    ON identity.member_id = member.id
  LEFT JOIN private.member_profile_metrics AS metrics
    ON metrics.member_id = member.id
  LEFT JOIN public.member_dynamic_stats AS stats
    ON stats.member_id = member.id
  LEFT JOIN private.community_profile_members AS mapping
    ON mapping.member_id = member.id
  LEFT JOIN public.community_profiles AS community
    ON community.id = mapping.profile_id
  WHERE member.id = v_member_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_full_name text,
  p_gender text,
  p_nickname text DEFAULT NULL,
  p_school_name text DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_personal_avatar_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_nickname text := NULLIF(private.profile_normalize_nickname(p_nickname), '');
BEGIN
  v_member_id := private.profile_current_approved_member_id();
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Approved player access is required';
  END IF;

  IF p_full_name IS NULL
     OR char_length(btrim(p_full_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Full name must contain 1 to 100 characters';
  END IF;
  IF p_gender IS NULL OR p_gender NOT IN ('male', 'female', 'other') THEN
    RAISE EXCEPTION 'Invalid gender';
  END IF;
  IF v_nickname IS NOT NULL AND char_length(v_nickname) NOT BETWEEN 2 AND 20 THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_INVALID';
  END IF;
  IF v_nickname IS NOT NULL AND lower(v_nickname) IN (
    'admin', 'administrator', 'staff',
    '官方', '管理员', '竹溪社官方',
    '管理者', '運営', '公式'
  ) THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_RESERVED';
  END IF;
  IF p_school_name IS NOT NULL AND char_length(btrim(p_school_name)) > 120 THEN
    RAISE EXCEPTION 'School name is too long';
  END IF;
  IF p_department IS NOT NULL AND char_length(btrim(p_department)) > 120 THEN
    RAISE EXCEPTION 'Department is too long';
  END IF;
  IF v_nickname IS NULL AND EXISTS (
    SELECT 1
    FROM private.community_profile_members AS mapping
    WHERE mapping.member_id = v_member_id
  ) THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_REQUIRED_FOR_COMMUNITY';
  END IF;

  UPDATE public.member_identity
  SET
    full_name = btrim(p_full_name),
    gender = p_gender,
    nickname = v_nickname,
    school_name = NULLIF(btrim(p_school_name), ''),
    department = NULLIF(btrim(p_department), ''),
    personal_avatar_path = NULLIF(btrim(p_personal_avatar_path), '')
  WHERE member_id = v_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member identity is missing';
  END IF;

  RETURN public.get_my_profile_summary();
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'PROFILE_NICKNAME_TAKEN';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_community_member_profile_metrics(
  p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF private.profile_current_approved_member_id() IS NULL
     OR NOT private.community_can_read() THEN
    RAISE EXCEPTION 'Approved community membership is required';
  END IF;
  -- School, level and participation count are explicitly approved-community
  -- profile fields. Both directions of the block relationship are respected.
  IF private.community_interaction_is_blocked(p_profile_id) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'profile_id', profile.id,
    'school_name', identity.school_name,
    'level', COALESCE(metrics.member_level, 1),
    'compatibility_score', CASE
      WHEN metrics.compatibility_status = 'published' THEN metrics.compatibility_score
      ELSE NULL
    END,
    'compatibility_status', COALESCE(metrics.compatibility_status, 'pending'),
    'activity_count', COALESCE(stats.activity_count, 0)
  )
  INTO v_result
  FROM public.community_profiles AS profile
  JOIN private.community_profile_members AS mapping
    ON mapping.profile_id = profile.id
  JOIN public.member_identity AS identity
    ON identity.member_id = mapping.member_id
  LEFT JOIN private.member_profile_metrics AS metrics
    ON metrics.member_id = mapping.member_id
  LEFT JOIN public.member_dynamic_stats AS stats
    ON stats.member_id = mapping.member_id
  JOIN public.members AS member
    ON member.id = mapping.member_id
  WHERE profile.id = p_profile_id
    AND member.status = 'approved';

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Narrow administrator RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.profile_admin_metrics_payload(
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'member_id', metrics.member_id,
    'personal_avatar_path', identity.personal_avatar_path,
    'level', metrics.member_level,
    'compatibility_score', metrics.compatibility_score,
    'compatibility_status', metrics.compatibility_status,
    'internal_note', metrics.internal_note,
    'score_source', metrics.score_source,
    'published_at', metrics.published_at,
    'published_by', metrics.published_by,
    'updated_at', metrics.updated_at,
    'updated_by', metrics.updated_by,
    'activity_count', COALESCE(stats.activity_count, 0),
    'last_activity_at', stats.last_activity_at,
    'latest_audit', (
      SELECT jsonb_build_object(
        'id', audit.id,
        'action_type', audit.action_type,
        'changed_fields', audit.changed_fields,
        'before_values', audit.before_values,
        'after_values', audit.after_values,
        'reason', audit.reason,
        'actor_admin_id', audit.actor_admin_id,
        'actor_name', COALESCE(audit.actor_name, administrator.name),
        'created_at', audit.created_at
      )
      FROM private.member_profile_audit_log AS audit
      LEFT JOIN public.admin_users AS administrator
        ON administrator.id = audit.actor_admin_id
      WHERE audit.member_id = metrics.member_id
        AND audit.action_type IN ('metrics_update', 'activity_recalculate')
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    )
  )
  FROM private.member_profile_metrics AS metrics
  LEFT JOIN public.member_identity AS identity
    ON identity.member_id = metrics.member_id
  LEFT JOIN public.member_dynamic_stats AS stats
    ON stats.member_id = metrics.member_id
  WHERE metrics.member_id = p_member_id
$$;

CREATE OR REPLACE FUNCTION public.admin_get_member_profile_metrics(
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.profile_current_admin_id() IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  RETURN private.profile_admin_metrics_payload(p_member_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_member_profile_audit(
  p_member_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF private.profile_current_admin_id() IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Audit limit must be between 1 and 100';
  END IF;

  SELECT COALESCE(jsonb_agg(item.payload ORDER BY item.created_at DESC, item.id DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      audit.id,
      audit.created_at,
      jsonb_build_object(
        'id', audit.id,
        'action_type', audit.action_type,
        'changed_fields', audit.changed_fields,
        'before_values', audit.before_values,
        'after_values', audit.after_values,
        'reason', audit.reason,
        'actor_admin_id', audit.actor_admin_id,
        'actor_name', COALESCE(audit.actor_name, administrator.name),
        'created_at', audit.created_at
      ) AS payload
    FROM private.member_profile_audit_log AS audit
    LEFT JOIN public.admin_users AS administrator
      ON administrator.id = audit.actor_admin_id
    WHERE audit.member_id = p_member_id
    ORDER BY audit.created_at DESC, audit.id DESC
    LIMIT p_limit
  ) AS item;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_member_profile_metrics(
  p_member_id uuid,
  p_level smallint,
  p_compatibility_score numeric,
  p_compatibility_status text,
  p_internal_note text,
  p_score_source text,
  p_audit_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_before private.member_profile_metrics%ROWTYPE;
  v_after private.member_profile_metrics%ROWTYPE;
  v_fields text[] := ARRAY[]::text[];
BEGIN
  v_admin_id := private.profile_current_admin_id();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_level IS NULL OR p_level NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Level must be between 1 and 3';
  END IF;
  IF p_compatibility_score IS NULL
     OR p_compatibility_score < 1.0 OR p_compatibility_score > 5.0
     OR round(p_compatibility_score, 1) <> p_compatibility_score THEN
    RAISE EXCEPTION 'Compatibility score must use one decimal from 1.0 to 5.0';
  END IF;
  IF p_compatibility_status IS NULL
     OR p_compatibility_status NOT IN ('pending', 'published') THEN
    RAISE EXCEPTION 'Invalid compatibility status';
  END IF;
  IF p_score_source IS NULL OR p_score_source NOT IN ('initial', 'manual') THEN
    RAISE EXCEPTION 'Invalid score source';
  END IF;
  IF NULLIF(btrim(p_internal_note), '') IS NULL
     OR char_length(p_internal_note) > 2000 THEN
    RAISE EXCEPTION 'Internal note is required and must not exceed 2000 characters';
  END IF;
  IF NULLIF(btrim(p_audit_reason), '') IS NULL
     OR char_length(p_audit_reason) > 1000 THEN
    RAISE EXCEPTION 'Audit reason is required and must not exceed 1000 characters';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id) THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  INSERT INTO private.member_profile_metrics (member_id)
  VALUES (p_member_id)
  ON CONFLICT (member_id) DO NOTHING;

  SELECT * INTO v_before
  FROM private.member_profile_metrics
  WHERE member_id = p_member_id
  FOR UPDATE;

  UPDATE private.member_profile_metrics
  SET
    member_level = p_level,
    compatibility_score = p_compatibility_score,
    compatibility_status = p_compatibility_status,
    internal_note = btrim(p_internal_note),
    score_source = p_score_source,
    published_at = CASE
      WHEN p_compatibility_status = 'published' THEN now()
      ELSE NULL
    END,
    published_by = CASE
      WHEN p_compatibility_status = 'published' THEN v_admin_id
      ELSE NULL
    END,
    updated_at = now(),
    updated_by = v_admin_id
  WHERE member_id = p_member_id
  RETURNING * INTO v_after;

  IF v_before.member_level IS DISTINCT FROM v_after.member_level THEN v_fields := array_append(v_fields, 'level'); END IF;
  IF v_before.compatibility_score IS DISTINCT FROM v_after.compatibility_score THEN v_fields := array_append(v_fields, 'compatibility_score'); END IF;
  IF v_before.compatibility_status IS DISTINCT FROM v_after.compatibility_status THEN v_fields := array_append(v_fields, 'compatibility_status'); END IF;
  IF v_before.internal_note IS DISTINCT FROM v_after.internal_note THEN v_fields := array_append(v_fields, 'internal_note'); END IF;
  IF v_before.score_source IS DISTINCT FROM v_after.score_source THEN v_fields := array_append(v_fields, 'score_source'); END IF;

  IF cardinality(v_fields) > 0 THEN
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
      'metrics_update',
      v_fields,
      to_jsonb(v_before),
      to_jsonb(v_after),
      btrim(p_audit_reason),
      (SELECT auth.uid()),
      v_admin_id,
      (
        SELECT administrator.name
        FROM public.admin_users AS administrator
        WHERE administrator.id = v_admin_id
      )
    );
  END IF;

  RETURN private.profile_admin_metrics_payload(p_member_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recalculate_member_activity_stats(
  p_member_id uuid DEFAULT NULL,
  p_audit_reason text DEFAULT '活动次数重算'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_target uuid;
  v_before jsonb;
  v_after jsonb;
  v_count integer := 0;
BEGIN
  v_admin_id := private.profile_current_admin_id();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF NULLIF(btrim(p_audit_reason), '') IS NULL
     OR char_length(p_audit_reason) > 1000 THEN
    RAISE EXCEPTION 'Audit reason is required and must not exceed 1000 characters';
  END IF;

  FOR v_target IN
    SELECT member.id
    FROM public.members AS member
    WHERE p_member_id IS NULL OR member.id = p_member_id
  LOOP
    SELECT to_jsonb(stats) INTO v_before
    FROM public.member_dynamic_stats AS stats
    WHERE stats.member_id = v_target;

    PERFORM private.recalculate_member_activity_stats(v_target);

    SELECT to_jsonb(stats) INTO v_after
    FROM public.member_dynamic_stats AS stats
    WHERE stats.member_id = v_target;

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
      v_target,
      'activity_recalculate',
      ARRAY['activity_count', 'late_count', 'no_show_count', 'last_activity_at'],
      COALESCE(v_before, '{}'::jsonb),
      COALESCE(v_after, '{}'::jsonb),
      btrim(p_audit_reason),
      (SELECT auth.uid()),
      v_admin_id,
      (
        SELECT administrator.name
        FROM public.admin_users AS administrator
        WHERE administrator.id = v_admin_id
      )
    );
    v_count := v_count + 1;
  END LOOP;

  IF p_member_id IS NOT NULL AND v_count = 0 THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  RETURN jsonb_build_object('recalculated_members', v_count);
END;
$$;

-- Last-resort cleanup for an object that reached Storage but could not be
-- registered as a processed upload. The API first attempts an immediate
-- Storage deletion and uses this service-only queue when that deletion fails.
CREATE OR REPLACE FUNCTION public.profile_service_queue_avatar_cleanup(
  p_object_path text,
  p_reason text DEFAULT 'profile_avatar_upload_failed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role access is required';
  END IF;
  IF p_object_path IS NULL
     OR p_object_path = ''
     OR p_object_path LIKE '/%'
     OR p_object_path LIKE '%..%'
     OR char_length(p_object_path) > 500 THEN
    RAISE EXCEPTION 'Invalid avatar cleanup path';
  END IF;

  INSERT INTO private.community_media_cleanup_queue (
    bucket_id,
    object_path,
    reason
  )
  VALUES (
    'community-avatars',
    p_object_path,
    COALESCE(NULLIF(btrim(p_reason), ''), 'profile_avatar_upload_failed')
  )
  ON CONFLICT (bucket_id, object_path) DO UPDATE
  SET
    reason = EXCLUDED.reason,
    queued_at = now(),
    claimed_at = NULL,
    claim_token = NULL,
    processed_at = NULL,
    last_error = NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Least-privilege grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE private.member_profile_metrics FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.member_profile_audit_log FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.profile_seed_member_metrics() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.profile_current_approved_member_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.profile_current_admin_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.profile_validate_identity_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.profile_log_identity_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.profile_sync_identity_to_community() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.profile_sync_community_to_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.profile_sync_new_community_mapping() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recalculate_member_activity_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recalculate_activity_stats_after_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.profile_admin_metrics_payload(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_my_profile_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_profile(text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_community_member_profile_metrics(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.community_upsert_profile(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_member_profile_metrics(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_member_profile_audit(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_member_profile_metrics(uuid, smallint, numeric, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_recalculate_member_activity_stats(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_service_queue_avatar_cleanup(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_profile_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_member_profile_metrics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_upsert_profile(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_member_profile_metrics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_member_profile_audit(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_member_profile_metrics(uuid, smallint, numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recalculate_member_activity_stats(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_service_queue_avatar_cleanup(text, text) TO service_role;
