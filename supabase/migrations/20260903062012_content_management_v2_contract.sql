-- Content Management V2: contract phase.
--
-- Apply only after every application consumer reads protected script payloads
-- from `script_protected_content` and serves files from the private `scripts`
-- bucket through short-lived signed URLs.  This migration intentionally fails
-- closed when a protected row, referenced Storage object, path invariant, ACL,
-- or time-bounded grant invariant is incomplete.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

SELECT pg_advisory_xact_lock(
  hashtextextended('content-management-v2-contract', 0)
);

-- Fail before destructive contraction when Expand has not completed.
DO $do$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(required_object.object_name ORDER BY required_object.object_name)
  INTO v_missing
  FROM (VALUES
    ('private.subjectless_operational_audit_log', to_regclass('private.subjectless_operational_audit_log') IS NOT NULL),
    ('public.admin_users', to_regclass('public.admin_users') IS NOT NULL),
    ('public.members', to_regclass('public.members') IS NOT NULL),
    ('public.past_event_reviews', to_regclass('public.past_event_reviews') IS NOT NULL),
    ('public.player_activity_settings', to_regclass('public.player_activity_settings') IS NOT NULL),
    ('public.script_play_records', to_regclass('public.script_play_records') IS NOT NULL),
    ('public.script_protected_content', to_regclass('public.script_protected_content') IS NOT NULL),
    ('public.scripts', to_regclass('public.scripts') IS NOT NULL),
    ('storage.buckets', to_regclass('storage.buckets') IS NOT NULL),
    ('storage.objects', to_regclass('storage.objects') IS NOT NULL),
    ('private.content_management_v2_audit_change()', to_regprocedure('private.content_management_v2_audit_change()') IS NOT NULL),
    ('private.content_management_v2_guard_archive_transition()', to_regprocedure('private.content_management_v2_guard_archive_transition()') IS NOT NULL),
    ('private.content_management_v2_can_read_protected_script(uuid)', to_regprocedure('private.content_management_v2_can_read_protected_script(uuid)') IS NOT NULL),
    ('private.member_master_current_admin_id()', to_regprocedure('private.member_master_current_admin_id()') IS NOT NULL),
    ('private.member_master_is_super_admin()', to_regprocedure('private.member_master_is_super_admin()') IS NOT NULL),
    ('public.is_admin()', to_regprocedure('public.is_admin()') IS NOT NULL)
  ) AS required_object(object_name, is_present)
  WHERE NOT required_object.is_present;

  IF COALESCE(cardinality(v_missing), 0) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_CONTRACT_DEPENDENCY_MISSING',
      DETAIL = array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(expected.column_name ORDER BY expected.column_name)
  INTO v_missing
  FROM (VALUES
    ('content_html'),
    ('roles'),
    ('pdf_url'),
    ('page_images'),
    ('page_count'),
    ('audit_reason'),
    ('archived_at')
  ) AS expected(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'scripts'
      AND column_info.column_name = expected.column_name
  );

  IF COALESCE(cardinality(v_missing), 0) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_CONTRACT_SCRIPT_COLUMN_MISSING',
      DETAIL = array_to_string(v_missing, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets AS bucket
    WHERE bucket.id = 'scripts'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_CONTRACT_SCRIPTS_BUCKET_MISSING';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgrelid = 'public.script_play_records'::regclass
      AND trigger_info.tgname IN (
        'member_master_capture_audit_reason',
        'member_master_audit_related_change'
      )
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled <> 'D'
  ) <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_CONTRACT_GRANT_AUDIT_TRIGGER_MISSING';
  END IF;
END
$do$;

-- Prevent a writer from changing metadata, protected paths, grants, or Storage
-- objects between the destructive preflight and the postflight assertions.
LOCK TABLE public.scripts IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.script_protected_content IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.script_play_records IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE storage.objects IN SHARE MODE;

-- -------------------------------------------------------------------------
-- Durable path invariants.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.content_management_v2_path_is_safe(
  p_path text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(
    NULLIF(btrim(p_path), '') IS NOT NULL
    AND p_path = btrim(p_path)
    AND char_length(p_path) <= 500
    AND p_path !~* '^[a-z][a-z0-9+.-]*:'
    AND p_path !~ '^/'
    AND p_path !~ '[[:cntrl:]]'
    AND right(p_path, 1) <> '/'
    AND strpos(p_path, '//') = 0
    AND strpos(p_path, '..') = 0
    AND p_path !~ '(^|/)[.](/|$)'
    AND strpos(p_path, chr(92)) = 0
    AND strpos(p_path, '?') = 0
    AND strpos(p_path, '#') = 0
    AND lower(p_path) !~ '%(25|2e|2f|5c|3f|23)',
    false
  )
$function$;

CREATE OR REPLACE FUNCTION private.content_management_v2_paths_are_relative(
  p_paths text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(
    bool_and(private.content_management_v2_path_is_safe(path.value)),
    true
  )
  FROM unnest(COALESCE(p_paths, ARRAY[]::text[])) AS path(value)
$function$;

CREATE OR REPLACE FUNCTION private.content_management_v2_paths_have_prefix(
  p_paths text[],
  p_prefixes text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT
    private.content_management_v2_paths_are_relative(p_paths)
    AND cardinality(COALESCE(p_paths, ARRAY[]::text[])) = (
      SELECT count(DISTINCT path.value)
      FROM unnest(COALESCE(p_paths, ARRAY[]::text[])) AS path(value)
    )
    AND COALESCE(
      (
        SELECT bool_and(EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p_prefixes, ARRAY[]::text[])) AS prefix(value)
          WHERE left(path.value, char_length(prefix.value)) = prefix.value
        ))
        FROM unnest(COALESCE(p_paths, ARRAY[]::text[])) AS path(value)
      ),
      true
    )
$function$;

-- Public cleanup relies on exact URL-to-object-name comparison.  Managed
-- public Storage references must therefore use the canonical public-object
-- route and an unescaped ASCII object path.  Public metadata may never point
-- at the private `scripts` bucket.  URLs outside Supabase Storage route shapes
-- remain unaffected.
CREATE OR REPLACE FUNCTION private.content_management_v2_public_media_url_is_canonical(
  p_url text,
  p_bucket_id text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_clean_url text;
  v_marker text;
  v_object_path text;
BEGIN
  IF p_url IS NULL OR NULLIF(btrim(p_url), '') IS NULL THEN
    RETURN true;
  END IF;
  IF p_url ~ '[[:cntrl:]]' OR strpos(p_url, chr(92)) > 0 THEN
    RETURN false;
  END IF;
  IF p_bucket_id IS NULL
     OR p_bucket_id NOT IN ('scripts', 'scripts-covers', 'activity-media') THEN
    RETURN false;
  END IF;

  v_clean_url := split_part(split_part(p_url, '?', 1), '#', 1);
  IF v_clean_url ~* '/storage/v1/'
     AND (
       strpos(v_clean_url, '%') > 0
       OR v_clean_url ~ '(^|/)[.](/|$)'
       OR v_clean_url ~ '(^|/)[.][.](/|$)'
     ) THEN
    RETURN false;
  END IF;
  IF v_clean_url !~* (
    '/storage/v1/(object|render/image)/(public|sign|authenticated)/'
    || p_bucket_id
    || '/'
  ) THEN
    RETURN true;
  END IF;

  IF p_bucket_id = 'scripts' THEN
    RETURN false;
  END IF;

  v_marker := '/storage/v1/object/public/' || p_bucket_id || '/';
  IF v_clean_url !~ (
    '^https://[^/?#]+'
    || v_marker
    || '.+$'
  ) THEN
    RETURN false;
  END IF;

  v_object_path := substring(
    v_clean_url
    FROM strpos(v_clean_url, v_marker) + char_length(v_marker)
  );
  RETURN v_object_path ~ '^[A-Za-z0-9._~/-]+$'
    AND strpos(v_object_path, '..') = 0
    AND v_object_path !~ '(^|/)[.](/|$)'
    AND strpos(v_object_path, '//') = 0
    AND right(v_object_path, 1) <> '/'
    AND CASE p_bucket_id
      WHEN 'scripts-covers' THEN v_object_path ~ (
        '^covers/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
      )
      WHEN 'activity-media' THEN v_object_path ~ (
        '^activities/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
      )
      ELSE false
    END;
END
$function$;

CREATE OR REPLACE FUNCTION private.content_management_v2_guard_public_media_urls()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_url text;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME NOT IN ('scripts', 'past_event_reviews') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_PUBLIC_MEDIA_GUARD_TARGET_INVALID';
  END IF;

  IF NOT private.content_management_v2_public_media_url_is_canonical(
      NEW.cover_url,
      'scripts-covers'
    )
    OR NOT private.content_management_v2_public_media_url_is_canonical(
      NEW.cover_url,
      'activity-media'
    )
    OR NOT private.content_management_v2_public_media_url_is_canonical(
      NEW.cover_url,
      'scripts'
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_V2_PUBLIC_MEDIA_URL_NOT_CANONICAL',
      DETAIL = TG_TABLE_NAME || '.cover_url';
  END IF;

  IF TG_TABLE_NAME = 'past_event_reviews' THEN
    IF jsonb_typeof(NEW.gallery_urls) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'CONTENT_V2_REVIEW_GALLERY_INVALID';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(NEW.gallery_urls) AS gallery(value)
      WHERE jsonb_typeof(gallery.value) <> 'string'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'CONTENT_V2_REVIEW_GALLERY_INVALID';
    END IF;

    FOR v_url IN
      SELECT gallery.url
      FROM jsonb_array_elements_text(NEW.gallery_urls) AS gallery(url)
    LOOP
      IF NOT private.content_management_v2_public_media_url_is_canonical(
          v_url,
          'scripts-covers'
        )
        OR NOT private.content_management_v2_public_media_url_is_canonical(
          v_url,
          'activity-media'
        )
        OR NOT private.content_management_v2_public_media_url_is_canonical(
          v_url,
          'scripts'
        ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'CONTENT_V2_PUBLIC_MEDIA_URL_NOT_CANONICAL',
          DETAIL = 'past_event_reviews.gallery_urls';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_path_is_safe(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.content_management_v2_paths_are_relative(text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.content_management_v2_paths_have_prefix(text[], text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.content_management_v2_public_media_url_is_canonical(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.content_management_v2_guard_public_media_urls()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.content_management_v2_path_is_safe(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.content_management_v2_paths_are_relative(text[])
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.content_management_v2_paths_have_prefix(text[], text[])
  TO authenticated, service_role;

-- The protected table is the sole payload source at Contract.  Missing rows,
-- cross-script paths, or missing Storage objects must be repaired before this
-- migration is allowed to clear the legacy copies.
DO $do$
DECLARE
  v_script_id uuid;
  v_path text;
  v_bucket_id text;
BEGIN
  IF NOT private.content_management_v2_public_media_url_is_canonical(
    'https://example.test/storage/v1/object/public/scripts-covers/covers/00000000-0000-4000-8000-000000000000/example.webp',
    'scripts-covers'
  )
  OR private.content_management_v2_public_media_url_is_canonical(
    'https://example.test/storage/v1/object/public/scripts-covers/covers/00000000-0000-4000-8000-000000000000/a%20b.webp',
    'scripts-covers'
  )
  OR private.content_management_v2_public_media_url_is_canonical(
    'https://example.test/storage/v1/object/public/scripts-covers/covers/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA/example.webp',
    'scripts-covers'
  )
  OR private.content_management_v2_public_media_url_is_canonical(
    'https://example.test/storage/v1/render/image/public/activity-media/activities/00000000-0000-4000-8000-000000000000/example.webp',
    'activity-media'
  )
  OR private.content_management_v2_public_media_url_is_canonical(
    'https://example.test/storage/v1/object/public/activity-media/activities/00000000-0000-4000-8000-000000000000/foo/./bar.webp',
    'activity-media'
  )
  OR private.content_management_v2_public_media_url_is_canonical(
    'https://example.test/storage/v1/object/public/activity-media/activities/00000000-0000-4000-8000-000000000000/%2e/bar.webp',
    'activity-media'
  )
  OR private.content_management_v2_public_media_url_is_canonical(
    'https://example.test/storage/v1/object/public/activity-media'
      || chr(92)
      || 'activities/00000000-0000-4000-8000-000000000000/example.webp',
    'activity-media'
  )
  OR private.content_management_v2_public_media_url_is_canonical(
    'https://example.test/storage/v1/object/'
      || chr(9)
      || 'public/activity-media/activities/00000000-0000-4000-8000-000000000000/example.webp',
    'activity-media'
  )
  OR private.content_management_v2_public_media_url_is_canonical(
    'https://example.test/storage/v1/object/sign/scripts/pdfs/00000000-0000-4000-8000-000000000000/example.pdf',
    'scripts'
  )
  OR private.content_management_v2_public_media_url_is_canonical(
    'https://example.test/storage/v1/object/public/%61ctivity-media/activities/00000000-0000-4000-8000-000000000000/example.webp',
    'activity-media'
  )
  OR private.content_management_v2_public_media_url_is_canonical(
    'https://example.test/storage/v1/%6fbject/public/activity-media/activities/00000000-0000-4000-8000-000000000000/example.webp',
    'activity-media'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_PUBLIC_MEDIA_CANONICAL_GATE_INVALID';
  END IF;

  SELECT review.id
  INTO v_script_id
  FROM public.past_event_reviews AS review
  WHERE jsonb_typeof(review.gallery_urls) IS DISTINCT FROM 'array'
  ORDER BY review.id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_V2_REVIEW_GALLERY_INVALID',
      DETAIL = format('review_id=%s expected=json_array', v_script_id);
  END IF;

  SELECT review.id
  INTO v_script_id
  FROM public.past_event_reviews AS review
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(review.gallery_urls) AS gallery(value)
    WHERE jsonb_typeof(gallery.value) <> 'string'
  )
  ORDER BY review.id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_V2_REVIEW_GALLERY_INVALID',
      DETAIL = format('review_id=%s expected=string_elements', v_script_id);
  END IF;

  -- Main historically wrote some covers as `covers/<uuid>.<ext>`.  That path
  -- has no unambiguous owner-prefix fence, so Contract must stop with a
  -- migration-specific error instead of silently making it uncollectable.
  SELECT media.content_id, contract.bucket_id, parsed.object_path
  INTO v_script_id, v_bucket_id, v_path
  FROM (
    SELECT script.id AS content_id, script.cover_url AS url
    FROM public.scripts AS script
    UNION ALL
    SELECT review.id AS content_id, review.cover_url AS url
    FROM public.past_event_reviews AS review
    UNION ALL
    SELECT review.id AS content_id, gallery.url
    FROM public.past_event_reviews AS review
    CROSS JOIN LATERAL jsonb_array_elements_text(review.gallery_urls)
      AS gallery(url)
  ) AS media
  CROSS JOIN LATERAL (
    SELECT split_part(split_part(media.url, '?', 1), '#', 1) AS clean_url
  ) AS clean
  CROSS JOIN LATERAL (VALUES
    (
      'scripts-covers'::text,
      '/storage/v1/object/public/scripts-covers/'::text
    ),
    (
      'activity-media'::text,
      '/storage/v1/object/public/activity-media/'::text
    )
  ) AS contract(bucket_id, marker)
  CROSS JOIN LATERAL (
    SELECT substring(
      clean.clean_url
      FROM strpos(clean.clean_url, contract.marker) + char_length(contract.marker)
    ) AS object_path
  ) AS parsed
  WHERE clean.clean_url ~ ('^https://[^/?#]+' || contract.marker || '.+$')
    AND CASE contract.bucket_id
      WHEN 'scripts-covers' THEN parsed.object_path !~ (
        '^covers/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
      )
      ELSE parsed.object_path !~ (
        '^activities/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
      )
    END
  ORDER BY media.content_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_LEGACY_PUBLIC_MEDIA_PATH_REQUIRES_MIGRATION',
      DETAIL = format(
        'content_id=%s bucket=%s path=%s',
        v_script_id,
        v_bucket_id,
        left(v_path, 200)
      );
  END IF;

  SELECT object.bucket_id, object.name
  INTO v_bucket_id, v_path
  FROM storage.objects AS object
  WHERE (
    object.bucket_id = 'scripts-covers'
    AND object.name LIKE 'covers/%'
    AND (
      NOT private.content_management_v2_path_is_safe(object.name)
      OR object.name !~ (
        '^covers/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
      )
    )
  ) OR (
    object.bucket_id = 'activity-media'
    AND object.name LIKE 'activities/%'
    AND (
      NOT private.content_management_v2_path_is_safe(object.name)
      OR object.name !~ (
        '^activities/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
      )
    )
  ) OR (
    object.bucket_id = 'scripts'
    AND (object.name LIKE 'pdfs/%' OR object.name LIKE 'pages/%')
    AND (
      NOT private.content_management_v2_path_is_safe(object.name)
      OR object.name !~ (
        '^(pdfs|pages)/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
      )
    )
  )
  ORDER BY object.bucket_id, object.name
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_LEGACY_STORAGE_OBJECT_REQUIRES_MIGRATION',
      DETAIL = format(
        'bucket=%s path=%s',
        v_bucket_id,
        left(v_path, 200)
      );
  END IF;

  SELECT media.content_id, media.url
  INTO v_script_id, v_path
  FROM (
    SELECT script.id AS content_id, script.cover_url AS url
    FROM public.scripts AS script
    UNION ALL
    SELECT review.id AS content_id, review.cover_url AS url
    FROM public.past_event_reviews AS review
    UNION ALL
    SELECT review.id AS content_id, gallery.url
    FROM public.past_event_reviews AS review
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(review.gallery_urls) = 'array'
          THEN review.gallery_urls
        ELSE '[]'::jsonb
      END
    ) AS gallery(url)
  ) AS media
  WHERE NOT private.content_management_v2_public_media_url_is_canonical(
      media.url,
      'scripts-covers'
    )
    OR NOT private.content_management_v2_public_media_url_is_canonical(
      media.url,
      'activity-media'
    )
    OR NOT private.content_management_v2_public_media_url_is_canonical(
      media.url,
      'scripts'
    )
  ORDER BY media.content_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_V2_PUBLIC_MEDIA_URL_NOT_CANONICAL',
      DETAIL = format('content_id=%s value=%s', v_script_id, left(v_path, 200));
  END IF;

  SELECT media.content_id, contract.bucket_id, parsed.object_path
  INTO v_script_id, v_bucket_id, v_path
  FROM (
    SELECT script.id AS content_id, script.cover_url AS url
    FROM public.scripts AS script
    UNION ALL
    SELECT review.id AS content_id, review.cover_url AS url
    FROM public.past_event_reviews AS review
    UNION ALL
    SELECT review.id AS content_id, gallery.url
    FROM public.past_event_reviews AS review
    CROSS JOIN LATERAL jsonb_array_elements_text(review.gallery_urls)
      AS gallery(url)
  ) AS media
  CROSS JOIN LATERAL (
    SELECT split_part(split_part(media.url, '?', 1), '#', 1) AS clean_url
  ) AS clean
  CROSS JOIN LATERAL (VALUES
    (
      'scripts-covers'::text,
      '/storage/v1/object/public/scripts-covers/'::text
    ),
    (
      'activity-media'::text,
      '/storage/v1/object/public/activity-media/'::text
    )
  ) AS contract(bucket_id, marker)
  CROSS JOIN LATERAL (
    SELECT substring(
      clean.clean_url
      FROM strpos(clean.clean_url, contract.marker) + char_length(contract.marker)
    ) AS object_path
  ) AS parsed
  WHERE clean.clean_url ~ ('^https://[^/?#]+' || contract.marker || '.+$')
    AND NOT EXISTS (
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id = contract.bucket_id
        AND object.name = parsed.object_path
    )
  ORDER BY media.content_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_PUBLIC_MEDIA_STORAGE_OBJECT_MISSING',
      DETAIL = format(
        'content_id=%s bucket=%s path=%s',
        v_script_id,
        v_bucket_id,
        left(v_path, 200)
      );
  END IF;

  SELECT script.id, script.cover_url
  INTO v_script_id, v_path
  FROM public.scripts AS script
  WHERE NULLIF(btrim(script.cover_url), '') IS NOT NULL
    AND script.cover_url ~*
      '/storage/v1/(object|render/image)/(public|sign|authenticated)/scripts/'
  ORDER BY script.id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_PUBLIC_COVER_IN_PRIVATE_BUCKET',
      DETAIL = format('script_id=%s value=%s', v_script_id, left(v_path, 200));
  END IF;

  SELECT review.id, media.url
  INTO v_script_id, v_path
  FROM public.past_event_reviews AS review
  CROSS JOIN LATERAL (
    SELECT review.cover_url AS url
    UNION ALL
    SELECT gallery.url
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(review.gallery_urls) = 'array'
          THEN review.gallery_urls
        ELSE '[]'::jsonb
      END
    ) AS gallery(url)
  ) AS media
  WHERE media.url ~*
    '/storage/v1/(object|render/image)/(public|sign|authenticated)/scripts/'
  ORDER BY review.id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_PUBLIC_REVIEW_MEDIA_IN_PRIVATE_BUCKET',
      DETAIL = format('review_id=%s value=%s', v_script_id, left(v_path, 200));
  END IF;

  SELECT script.id
  INTO v_script_id
  FROM public.scripts AS script
  LEFT JOIN public.script_protected_content AS protected
    ON protected.script_id = script.id
  WHERE protected.script_id IS NULL
  ORDER BY script.id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_PROTECTED_ROW_MISSING',
      DETAIL = format('script_id=%s', v_script_id);
  END IF;

  SELECT protected.script_id, protected.pdf_storage_path
  INTO v_script_id, v_path
  FROM public.script_protected_content AS protected
  WHERE protected.pdf_storage_path IS NOT NULL
    AND (
      NOT private.content_management_v2_path_is_safe(protected.pdf_storage_path)
      OR left(
        protected.pdf_storage_path,
        char_length('pdfs/' || protected.script_id::text || '/')
      ) <> 'pdfs/' || protected.script_id::text || '/'
    )
  ORDER BY protected.script_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_V2_PROTECTED_PDF_PATH_INVALID',
      DETAIL = format('script_id=%s path=%s', v_script_id, left(v_path, 200));
  END IF;

  SELECT protected.script_id, page.value
  INTO v_script_id, v_path
  FROM public.script_protected_content AS protected
  CROSS JOIN LATERAL unnest(protected.page_image_paths)
    WITH ORDINALITY AS page(value, position)
  WHERE NOT private.content_management_v2_path_is_safe(page.value)
     OR left(
       page.value,
       char_length('pages/' || protected.script_id::text || '/')
     ) <> 'pages/' || protected.script_id::text || '/'
  ORDER BY protected.script_id, page.position
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_V2_PROTECTED_PAGE_PATH_INVALID',
      DETAIL = format('script_id=%s path=%s', v_script_id, left(v_path, 200));
  END IF;

  SELECT protected.script_id
  INTO v_script_id
  FROM public.script_protected_content AS protected
  WHERE protected.page_count <> cardinality(protected.page_image_paths)
     OR cardinality(protected.page_image_paths) > 500
     OR cardinality(protected.page_image_paths) <> (
       SELECT count(DISTINCT page.value)
       FROM unnest(protected.page_image_paths) AS page(value)
     )
  ORDER BY protected.script_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_V2_PROTECTED_PAGE_MANIFEST_INVALID',
      DETAIL = format('script_id=%s', v_script_id);
  END IF;

  SELECT protected.script_id, protected.pdf_storage_path
  INTO v_script_id, v_path
  FROM public.script_protected_content AS protected
  WHERE protected.pdf_storage_path IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id = 'scripts'
        AND object.name = protected.pdf_storage_path
    )
  ORDER BY protected.script_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_PROTECTED_STORAGE_OBJECT_MISSING',
      DETAIL = format('script_id=%s path=%s', v_script_id, left(v_path, 200));
  END IF;

  SELECT protected.script_id, page.value
  INTO v_script_id, v_path
  FROM public.script_protected_content AS protected
  CROSS JOIN LATERAL unnest(protected.page_image_paths)
    WITH ORDINALITY AS page(value, position)
  WHERE NOT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'scripts'
      AND object.name = page.value
  )
  ORDER BY protected.script_id, page.position
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_PROTECTED_STORAGE_OBJECT_MISSING',
      DETAIL = format('script_id=%s path=%s', v_script_id, left(v_path, 200));
  END IF;
END
$do$;

DROP TRIGGER IF EXISTS content_v2_01_guard_public_media_urls
  ON public.scripts;
CREATE TRIGGER content_v2_01_guard_public_media_urls
  BEFORE INSERT OR UPDATE OF cover_url ON public.scripts
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_guard_public_media_urls();

DROP TRIGGER IF EXISTS content_v2_01_guard_public_media_urls
  ON public.past_event_reviews;
CREATE TRIGGER content_v2_01_guard_public_media_urls
  BEFORE INSERT OR UPDATE OF cover_url, gallery_urls
  ON public.past_event_reviews
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_guard_public_media_urls();

ALTER TABLE public.script_protected_content
  DROP CONSTRAINT IF EXISTS script_protected_content_pdf_path_check,
  DROP CONSTRAINT IF EXISTS script_protected_content_page_paths_check,
  DROP CONSTRAINT IF EXISTS script_protected_content_page_count_check,
  ADD CONSTRAINT script_protected_content_pdf_path_check CHECK (
    pdf_storage_path IS NULL
    OR (
      private.content_management_v2_path_is_safe(pdf_storage_path)
      AND left(
        pdf_storage_path,
        char_length('pdfs/' || script_id::text || '/')
      ) = 'pdfs/' || script_id::text || '/'
    )
  ),
  ADD CONSTRAINT script_protected_content_page_paths_check CHECK (
    cardinality(page_image_paths) <= 500
    AND private.content_management_v2_paths_have_prefix(
      page_image_paths,
      ARRAY['pages/' || script_id::text || '/']
    )
  ),
  ADD CONSTRAINT script_protected_content_page_count_check CHECK (
    page_count >= 0
    AND page_count = cardinality(page_image_paths)
  );

-- -------------------------------------------------------------------------
-- Durable Storage cleanup outbox.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.content_management_v2_cleanup_manifest_valid(
  p_content_kind text,
  p_content_id uuid,
  p_bucket_id text,
  p_object_paths text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT
    cardinality(COALESCE(p_object_paths, ARRAY[]::text[])) >= 1
    AND CASE
      WHEN p_content_kind = 'script' AND p_bucket_id = 'scripts' THEN
        private.content_management_v2_paths_have_prefix(
          p_object_paths,
          ARRAY[
            'pdfs/' || p_content_id::text || '/',
            'pages/' || p_content_id::text || '/'
          ]
        )
      WHEN p_content_kind = 'script' AND p_bucket_id = 'scripts-covers' THEN
        private.content_management_v2_paths_have_prefix(
          p_object_paths,
          ARRAY['covers/' || p_content_id::text || '/']
        )
      WHEN p_content_kind = 'past_event_review'
           AND p_bucket_id = 'activity-media' THEN
        private.content_management_v2_paths_have_prefix(
          p_object_paths,
          ARRAY['activities/' || p_content_id::text || '/']
        )
      ELSE false
    END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_cleanup_manifest_valid(text, uuid, text, text[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.content_management_v2_cleanup_manifest_valid(text, uuid, text, text[])
  TO authenticated, service_role;

-- Return the requested object paths that are still referenced by any content
-- row.  Cleanup workers must treat an RPC error as fail-closed and may delete
-- only input paths absent from this result.  The lookup is global rather than
-- scoped to the job's content id because public media URLs can be reused.
CREATE OR REPLACE FUNCTION private.content_management_v2_referenced_paths(
  p_bucket_id text,
  p_object_paths text[]
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_referenced_paths text[];
  v_public_marker text;
BEGIN
  IF p_bucket_id IS NULL
     OR p_bucket_id NOT IN ('scripts', 'scripts-covers', 'activity-media') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_CLEANUP_BUCKET_INVALID';
  END IF;

  IF p_object_paths IS NULL OR EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_object_paths, ARRAY[]::text[])) AS path(value)
    WHERE NOT private.content_management_v2_path_is_safe(path.value)
      OR CASE p_bucket_id
        WHEN 'scripts' THEN path.value !~ (
          '^(pdfs|pages)/'
          || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
          || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
        )
        WHEN 'scripts-covers' THEN path.value !~ (
          '^covers/'
          || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
          || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
        )
        WHEN 'activity-media' THEN path.value !~ (
          '^activities/'
          || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
          || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
        )
        ELSE true
      END
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_CLEANUP_PATH_INVALID';
  END IF;

  IF p_bucket_id = 'scripts' THEN
    SELECT COALESCE(
      array_agg(referenced.path ORDER BY referenced.path),
      ARRAY[]::text[]
    )
    INTO v_referenced_paths
    FROM (
      SELECT DISTINCT candidate.value AS path
      FROM unnest(p_object_paths) AS candidate(value)
      WHERE EXISTS (
        SELECT 1
        FROM public.script_protected_content AS protected
        WHERE protected.pdf_storage_path = candidate.value
           OR candidate.value = ANY(protected.page_image_paths)
      )
    ) AS referenced;
  ELSE
    v_public_marker := '/storage/v1/object/public/' || p_bucket_id || '/';
    SELECT COALESCE(
      array_agg(referenced.path ORDER BY referenced.path),
      ARRAY[]::text[]
    )
    INTO v_referenced_paths
    FROM (
      SELECT DISTINCT candidate.value AS path
      FROM unnest(p_object_paths) AS candidate(value)
      WHERE EXISTS (
        SELECT 1
        FROM (
          SELECT script.cover_url AS url
          FROM public.scripts AS script
          UNION ALL
          SELECT review.cover_url AS url
          FROM public.past_event_reviews AS review
          UNION ALL
          SELECT gallery.url
          FROM public.past_event_reviews AS review
          CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(review.gallery_urls) = 'array'
                THEN review.gallery_urls
              ELSE '[]'::jsonb
            END
          ) AS gallery(url)
        ) AS media
        WHERE right(
          split_part(split_part(media.url, '?', 1), '#', 1),
          char_length(v_public_marker || candidate.value)
        ) = v_public_marker || candidate.value
      )
    ) AS referenced;
  END IF;

  RETURN v_referenced_paths;
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_referenced_paths(
  text,
  text[]
) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.content_media_cleanup_referenced_paths_v2(
  text,
  text[]
);

-- A cleanup job is also a durable deletion claim.  Claims survive job
-- acknowledgement so a stale URL can never resurrect an object path that was
-- already deleted.  Every claim/read guard uses the same sorted advisory-lock
-- key to serialize concurrent removals, retries, and new references.
CREATE OR REPLACE FUNCTION private.content_management_v2_cleanup_object_path_is_valid(
  p_bucket_id text,
  p_object_path text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT private.content_management_v2_path_is_safe(p_object_path)
    AND CASE p_bucket_id
      WHEN 'scripts' THEN p_object_path ~ (
        '^(pdfs|pages)/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
      )
      WHEN 'scripts-covers' THEN p_object_path ~ (
        '^covers/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
      )
      WHEN 'activity-media' THEN p_object_path ~ (
        '^activities/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
      )
      ELSE false
    END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_cleanup_object_path_is_valid(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.content_management_v2_cleanup_object_path_is_valid(text, text)
  TO service_role;

CREATE TABLE IF NOT EXISTS private.content_media_deletion_claims (
  bucket_id text NOT NULL,
  object_path text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  last_error text,
  PRIMARY KEY (bucket_id, object_path)
);

ALTER TABLE private.content_media_deletion_claims
  ADD COLUMN IF NOT EXISTS bucket_id text,
  ADD COLUMN IF NOT EXISTS object_path text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE private.content_media_deletion_claims
  ALTER COLUMN bucket_id SET NOT NULL,
  ALTER COLUMN object_path SET NOT NULL,
  ALTER COLUMN claimed_at SET DEFAULT now(),
  ALTER COLUMN claimed_at SET NOT NULL,
  DROP CONSTRAINT IF EXISTS content_media_deletion_claims_bucket_check,
  DROP CONSTRAINT IF EXISTS content_media_deletion_claims_path_check,
  DROP CONSTRAINT IF EXISTS content_media_deletion_claims_deleted_at_check,
  DROP CONSTRAINT IF EXISTS content_media_deletion_claims_last_error_check,
  ADD CONSTRAINT content_media_deletion_claims_bucket_check CHECK (
    bucket_id IN ('scripts', 'scripts-covers', 'activity-media')
  ),
  ADD CONSTRAINT content_media_deletion_claims_path_check CHECK (
    private.content_management_v2_cleanup_object_path_is_valid(
      bucket_id,
      object_path
    )
  ),
  ADD CONSTRAINT content_media_deletion_claims_deleted_at_check CHECK (
    deleted_at IS NULL OR deleted_at >= claimed_at
  ),
  ADD CONSTRAINT content_media_deletion_claims_last_error_check CHECK (
    last_error IS NULL OR char_length(last_error) BETWEEN 1 AND 500
  );

CREATE INDEX IF NOT EXISTS content_media_deletion_claims_status_idx
  ON private.content_media_deletion_claims (deleted_at, claimed_at);

ALTER TABLE private.content_media_deletion_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.content_media_deletion_claims
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE private.content_media_deletion_claims TO service_role;

CREATE TABLE IF NOT EXISTS private.content_media_deleted_content_ids (
  content_kind text NOT NULL,
  content_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  deleted_by uuid,
  PRIMARY KEY (content_kind, content_id)
);

ALTER TABLE private.content_media_deleted_content_ids
  ADD COLUMN IF NOT EXISTS content_kind text,
  ADD COLUMN IF NOT EXISTS content_id uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE private.content_media_deleted_content_ids
  ALTER COLUMN content_kind SET NOT NULL,
  ALTER COLUMN content_id SET NOT NULL,
  ALTER COLUMN deleted_at SET DEFAULT now(),
  ALTER COLUMN deleted_at SET NOT NULL,
  ALTER COLUMN reason SET NOT NULL,
  DROP CONSTRAINT IF EXISTS content_media_deleted_content_ids_kind_check,
  DROP CONSTRAINT IF EXISTS content_media_deleted_content_ids_reason_check,
  DROP CONSTRAINT IF EXISTS content_media_deleted_content_ids_deleted_by_fkey,
  ADD CONSTRAINT content_media_deleted_content_ids_kind_check CHECK (
    content_kind IN ('script', 'past_event_review')
  ),
  ADD CONSTRAINT content_media_deleted_content_ids_reason_check CHECK (
    char_length(btrim(reason)) BETWEEN 4 AND 500
  ),
  ADD CONSTRAINT content_media_deleted_content_ids_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.admin_users(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_media_deleted_content_ids_deleted_at_idx
  ON private.content_media_deleted_content_ids (deleted_at, content_kind);

ALTER TABLE private.content_media_deleted_content_ids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.content_media_deleted_content_ids
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE
  ON TABLE private.content_media_deleted_content_ids TO service_role;

CREATE OR REPLACE FUNCTION private.content_management_v2_lock_content_id(
  p_content_kind text,
  p_content_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_content_kind IS NULL
     OR p_content_kind NOT IN ('script', 'past_event_review')
     OR p_content_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_CONTENT_ID_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'content-media-deleted-id-v2:'
        || p_content_kind
        || ':'
        || p_content_id::text,
      0
    )
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.content_management_v2_tombstone_content_id(
  p_content_kind text,
  p_content_id uuid,
  p_reason text,
  p_deleted_by uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_REASON_INVALID';
  END IF;

  PERFORM private.content_management_v2_lock_content_id(
    p_content_kind,
    p_content_id
  );

  INSERT INTO private.content_media_deleted_content_ids (
    content_kind,
    content_id,
    deleted_at,
    reason,
    deleted_by
  ) VALUES (
    p_content_kind,
    p_content_id,
    statement_timestamp(),
    v_reason,
    p_deleted_by
  )
  ON CONFLICT (content_kind, content_id) DO NOTHING;
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_lock_content_id(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.content_management_v2_tombstone_content_id(text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.content_management_v2_lock_media_paths(
  p_bucket_id text,
  p_object_paths text[]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_object_path text;
BEGIN
  IF p_bucket_id IS NULL
     OR p_bucket_id NOT IN ('scripts', 'scripts-covers', 'activity-media')
     OR EXISTS (
       SELECT 1
       FROM unnest(COALESCE(p_object_paths, ARRAY[]::text[])) AS path(value)
       WHERE NOT private.content_management_v2_cleanup_object_path_is_valid(
         p_bucket_id,
         path.value
       )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_CLEANUP_PATH_INVALID';
  END IF;

  FOR v_object_path IN
    SELECT DISTINCT path.value
    FROM unnest(COALESCE(p_object_paths, ARRAY[]::text[])) AS path(value)
    ORDER BY path.value
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'content-media-deletion-v2:' || p_bucket_id || ':' || v_object_path,
        0
      )
    );
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION private.content_management_v2_claim_media_paths(
  p_bucket_id text,
  p_object_paths text[]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.content_management_v2_lock_media_paths(
    p_bucket_id,
    p_object_paths
  );

  INSERT INTO private.content_media_deletion_claims AS existing_claim (
    bucket_id,
    object_path,
    claimed_at
  )
  SELECT
    p_bucket_id,
    path.value,
    statement_timestamp()
  FROM (
    SELECT DISTINCT object_path.value
    FROM unnest(COALESCE(p_object_paths, ARRAY[]::text[])) AS object_path(value)
  ) AS path(value)
  ON CONFLICT (bucket_id, object_path) DO UPDATE
  SET claimed_at = LEAST(
    existing_claim.claimed_at,
    EXCLUDED.claimed_at
  );
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_lock_media_paths(text, text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.content_management_v2_claim_media_paths(text, text[])
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.content_media_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_kind text NOT NULL,
  content_id uuid NOT NULL,
  bucket_id text NOT NULL,
  object_paths text[] NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempted_at timestamptz,
  last_error text
);

ALTER TABLE public.content_media_cleanup_jobs
  ADD COLUMN IF NOT EXISTS content_kind text,
  ADD COLUMN IF NOT EXISTS content_id uuid,
  ADD COLUMN IF NOT EXISTS bucket_id text,
  ADD COLUMN IF NOT EXISTS object_paths text[],
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.content_media_cleanup_jobs
  ALTER COLUMN content_kind SET NOT NULL,
  ALTER COLUMN content_id SET NOT NULL,
  ALTER COLUMN bucket_id SET NOT NULL,
  ALTER COLUMN object_paths SET NOT NULL,
  ALTER COLUMN reason SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  DROP CONSTRAINT IF EXISTS content_media_cleanup_jobs_created_by_fkey,
  DROP CONSTRAINT IF EXISTS content_media_cleanup_jobs_kind_check,
  DROP CONSTRAINT IF EXISTS content_media_cleanup_jobs_bucket_check,
  DROP CONSTRAINT IF EXISTS content_media_cleanup_jobs_reason_check,
  DROP CONSTRAINT IF EXISTS content_media_cleanup_jobs_last_error_check,
  DROP CONSTRAINT IF EXISTS content_media_cleanup_jobs_manifest_check,
  ADD CONSTRAINT content_media_cleanup_jobs_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.admin_users(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT content_media_cleanup_jobs_kind_check CHECK (
    content_kind IN ('script', 'past_event_review')
  ),
  ADD CONSTRAINT content_media_cleanup_jobs_bucket_check CHECK (
    bucket_id IN ('scripts', 'scripts-covers', 'activity-media')
  ),
  ADD CONSTRAINT content_media_cleanup_jobs_reason_check CHECK (
    char_length(btrim(reason)) BETWEEN 4 AND 500
  ),
  ADD CONSTRAINT content_media_cleanup_jobs_last_error_check CHECK (
    last_error IS NULL OR char_length(last_error) BETWEEN 1 AND 500
  ),
  ADD CONSTRAINT content_media_cleanup_jobs_manifest_check CHECK (
    private.content_management_v2_cleanup_manifest_valid(
      content_kind,
      content_id,
      bucket_id,
      object_paths
    )
  );

-- Jobs are append-only.  A replacement/removal that races a worker therefore
-- gets a new id and cannot be accidentally acknowledged when that worker
-- deletes the older job it read.  Repeated object deletion is intentionally
-- idempotent at the Storage layer.
DROP INDEX IF EXISTS public.content_media_cleanup_jobs_content_bucket_uidx;
CREATE INDEX IF NOT EXISTS content_media_cleanup_jobs_content_bucket_idx
  ON public.content_media_cleanup_jobs (content_kind, content_id, bucket_id);
CREATE INDEX IF NOT EXISTS content_media_cleanup_jobs_created_at_idx
  ON public.content_media_cleanup_jobs (created_at, id);

ALTER TABLE public.content_media_cleanup_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_v2_cleanup_super_select
  ON public.content_media_cleanup_jobs;
DROP POLICY IF EXISTS content_v2_cleanup_super_insert
  ON public.content_media_cleanup_jobs;
DROP POLICY IF EXISTS content_v2_cleanup_super_update
  ON public.content_media_cleanup_jobs;
DROP POLICY IF EXISTS content_v2_cleanup_super_delete
  ON public.content_media_cleanup_jobs;
DROP POLICY IF EXISTS content_v2_cleanup_super_select_guard
  ON public.content_media_cleanup_jobs;
DROP POLICY IF EXISTS content_v2_cleanup_super_insert_guard
  ON public.content_media_cleanup_jobs;
DROP POLICY IF EXISTS content_v2_cleanup_super_update_guard
  ON public.content_media_cleanup_jobs;
DROP POLICY IF EXISTS content_v2_cleanup_super_delete_guard
  ON public.content_media_cleanup_jobs;

CREATE POLICY content_v2_cleanup_super_select
  ON public.content_media_cleanup_jobs
  FOR SELECT TO authenticated
  USING ((SELECT private.member_master_is_super_admin()));
CREATE POLICY content_v2_cleanup_super_select_guard
  ON public.content_media_cleanup_jobs
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING ((SELECT private.member_master_is_super_admin()));
CREATE POLICY content_v2_cleanup_super_insert
  ON public.content_media_cleanup_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.member_master_is_super_admin())
    AND created_by = private.member_master_current_admin_id()
  );
CREATE POLICY content_v2_cleanup_super_insert_guard
  ON public.content_media_cleanup_jobs
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.member_master_is_super_admin())
    AND created_by = private.member_master_current_admin_id()
  );
CREATE POLICY content_v2_cleanup_super_update
  ON public.content_media_cleanup_jobs
  FOR UPDATE TO authenticated
  USING ((SELECT private.member_master_is_super_admin()))
  WITH CHECK ((SELECT private.member_master_is_super_admin()));
CREATE POLICY content_v2_cleanup_super_update_guard
  ON public.content_media_cleanup_jobs
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.member_master_is_super_admin()))
  WITH CHECK ((SELECT private.member_master_is_super_admin()));
CREATE POLICY content_v2_cleanup_super_delete
  ON public.content_media_cleanup_jobs
  FOR DELETE TO authenticated
  USING ((SELECT private.member_master_is_super_admin()));
CREATE POLICY content_v2_cleanup_super_delete_guard
  ON public.content_media_cleanup_jobs
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((SELECT private.member_master_is_super_admin()));

REVOKE ALL ON TABLE public.content_media_cleanup_jobs
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.content_media_cleanup_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.content_media_cleanup_jobs TO service_role;

CREATE OR REPLACE FUNCTION private.content_management_v2_claim_cleanup_job_paths()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.content_management_v2_claim_media_paths(
    NEW.bucket_id,
    NEW.object_paths
  );
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_claim_cleanup_job_paths()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS content_v2_00_claim_cleanup_job_paths
  ON public.content_media_cleanup_jobs;
CREATE TRIGGER content_v2_00_claim_cleanup_job_paths
  BEFORE INSERT OR UPDATE OF bucket_id, object_paths
  ON public.content_media_cleanup_jobs
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_claim_cleanup_job_paths();

-- A scratch rerun may already contain retry jobs.  Convert every path into a
-- permanent claim before content writes are allowed to proceed.
DO $do$
DECLARE
  v_claim record;
BEGIN
  FOR v_claim IN
    SELECT
      job.bucket_id,
      array_agg(DISTINCT path.value ORDER BY path.value) AS object_paths
    FROM public.content_media_cleanup_jobs AS job
    CROSS JOIN LATERAL unnest(job.object_paths) AS path(value)
    GROUP BY job.bucket_id
    ORDER BY job.bucket_id
  LOOP
    PERFORM private.content_management_v2_claim_media_paths(
      v_claim.bucket_id,
      v_claim.object_paths
    );
  END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION public.content_media_cleanup_referenced_paths_v2(
  p_job_id uuid,
  p_bucket_id text,
  p_object_paths text[]
)
RETURNS text[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_job public.content_media_cleanup_jobs%ROWTYPE;
BEGIN
  IF p_job_id IS NULL
     OR p_bucket_id IS NULL
     OR p_object_paths IS NULL
     OR cardinality(p_object_paths) = 0
     OR cardinality(p_object_paths) <> (
       SELECT count(DISTINCT path.value)
       FROM unnest(p_object_paths) AS path(value)
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_CLEANUP_MANIFEST_INVALID';
  END IF;

  SELECT job.*
  INTO v_job
  FROM public.content_media_cleanup_jobs AS job
  WHERE job.id = p_job_id
  FOR SHARE;

  IF NOT FOUND
     OR v_job.bucket_id IS DISTINCT FROM p_bucket_id
     OR cardinality(v_job.object_paths) <> cardinality(p_object_paths)
     OR EXISTS (
       SELECT job_path.value
       FROM unnest(v_job.object_paths) AS job_path(value)
       EXCEPT
       SELECT requested_path.value
       FROM unnest(p_object_paths) AS requested_path(value)
     )
     OR EXISTS (
       SELECT requested_path.value
       FROM unnest(p_object_paths) AS requested_path(value)
       EXCEPT
       SELECT job_path.value
       FROM unnest(v_job.object_paths) AS job_path(value)
     )
     OR NOT private.content_management_v2_cleanup_manifest_valid(
       v_job.content_kind,
       v_job.content_id,
       v_job.bucket_id,
       v_job.object_paths
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_MANAGEMENT_CLEANUP_JOB_MISMATCH';
  END IF;

  -- A job UPDATE owns the tuple before its BEFORE trigger takes path locks.
  -- Match that row-then-path order so a retry cannot deadlock this RPC.
  PERFORM private.content_management_v2_lock_media_paths(
    p_bucket_id,
    p_object_paths
  );

  IF EXISTS (
    SELECT 1
    FROM unnest(p_object_paths) AS requested_path(value)
    WHERE NOT EXISTS (
      SELECT 1
      FROM private.content_media_deletion_claims AS claim
      WHERE claim.bucket_id = p_bucket_id
        AND claim.object_path = requested_path.value
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_MANAGEMENT_CLEANUP_CLAIM_MISSING';
  END IF;

  RETURN private.content_management_v2_referenced_paths(
    p_bucket_id,
    p_object_paths
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.content_media_cleanup_complete_claims_v2(
  p_job_id uuid,
  p_bucket_id text,
  p_object_paths text[]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_job public.content_media_cleanup_jobs%ROWTYPE;
  v_updated integer;
BEGIN
  IF p_job_id IS NULL
     OR p_bucket_id IS NULL
     OR p_object_paths IS NULL
     OR cardinality(p_object_paths) = 0
     OR cardinality(p_object_paths) <> (
       SELECT count(DISTINCT path.value)
       FROM unnest(p_object_paths) AS path(value)
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_CLEANUP_MANIFEST_INVALID';
  END IF;

  SELECT job.*
  INTO v_job
  FROM public.content_media_cleanup_jobs AS job
  WHERE job.id = p_job_id
  FOR SHARE;

  IF NOT FOUND
     OR v_job.bucket_id IS DISTINCT FROM p_bucket_id
     OR EXISTS (
       SELECT requested_path.value
       FROM unnest(p_object_paths) AS requested_path(value)
       EXCEPT
       SELECT job_path.value
       FROM unnest(v_job.object_paths) AS job_path(value)
     )
     OR NOT private.content_management_v2_cleanup_manifest_valid(
       v_job.content_kind,
       v_job.content_id,
       v_job.bucket_id,
       v_job.object_paths
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_MANAGEMENT_CLEANUP_JOB_MISMATCH';
  END IF;

  -- Keep the same tuple-then-path lock order as cleanup-job UPDATEs.
  PERFORM private.content_management_v2_lock_media_paths(
    p_bucket_id,
    p_object_paths
  );

  IF EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = p_bucket_id
      AND object.name = ANY(p_object_paths)
  ) OR cardinality(
    private.content_management_v2_referenced_paths(
      p_bucket_id,
      p_object_paths
    )
  ) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_MANAGEMENT_CLEANUP_NOT_COMPLETE';
  END IF;

  UPDATE private.content_media_deletion_claims AS claim
  SET
    deleted_at = COALESCE(claim.deleted_at, statement_timestamp()),
    last_error = NULL
  WHERE claim.bucket_id = p_bucket_id
    AND claim.object_path = ANY(p_object_paths);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> cardinality(p_object_paths) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_MANAGEMENT_CLEANUP_CLAIM_MISSING';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.content_media_cleanup_referenced_paths_v2(uuid, text, text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.content_media_cleanup_complete_claims_v2(uuid, text, text[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.content_media_cleanup_referenced_paths_v2(uuid, text, text[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.content_media_cleanup_complete_claims_v2(uuid, text, text[])
  TO service_role;

-- Remove an earlier review-draft helper if this migration is re-run against a
-- scratch database.  Producers insert append-only jobs directly under the
-- super-admin RLS policy or with the service role.
DROP FUNCTION IF EXISTS public.admin_enqueue_content_media_cleanup_job_v2(
  text,
  uuid,
  text,
  text[],
  text
);

CREATE OR REPLACE FUNCTION private.content_management_v2_guard_deleted_content_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_content_kind text;
BEGIN
  IF TG_OP NOT IN ('INSERT', 'UPDATE', 'DELETE')
     OR TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME NOT IN ('scripts', 'past_event_reviews') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_DELETED_ID_GUARD_TARGET_INVALID';
  END IF;

  v_content_kind := CASE TG_TABLE_NAME
    WHEN 'scripts' THEN 'script'
    ELSE 'past_event_review'
  END;
  IF TG_OP = 'DELETE' THEN
    PERFORM private.content_management_v2_lock_content_id(
      v_content_kind,
      OLD.id
    );
    IF NOT EXISTS (
      SELECT 1
      FROM private.content_media_deleted_content_ids AS tombstone
      WHERE tombstone.content_kind = v_content_kind
        AND tombstone.content_id = OLD.id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'CONTENT_MANAGEMENT_HARD_DELETE_RPC_REQUIRED';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'CONTENT_MANAGEMENT_CONTENT_ID_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;

  PERFORM private.content_management_v2_lock_content_id(
    v_content_kind,
    NEW.id
  );

  IF EXISTS (
    SELECT 1
    FROM private.content_media_deleted_content_ids AS tombstone
    WHERE tombstone.content_kind = v_content_kind
      AND tombstone.content_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_MANAGEMENT_CONTENT_ID_RETIRED';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.content_management_v2_guard_storage_content_fence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_content_kind text;
  v_old_content_id uuid;
  v_old_bucket_id text;
  v_old_object_path text;
  v_new_content_kind text;
  v_new_content_id uuid;
  v_new_bucket_id text;
  v_new_object_path text;
  v_key_changed boolean := false;
  v_lock record;
BEGIN
  IF TG_TABLE_SCHEMA <> 'storage'
     OR TG_TABLE_NAME <> 'objects'
     OR TG_OP NOT IN ('INSERT', 'UPDATE', 'DELETE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_STORAGE_FENCE_TARGET_INVALID';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_bucket_id := OLD.bucket_id;
    v_old_object_path := OLD.name;
    IF OLD.bucket_id = 'scripts'
       AND OLD.name ~ (
         '^(pdfs|pages)/'
         || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
         || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
       ) THEN
      v_old_content_kind := 'script';
      v_old_content_id := split_part(OLD.name, '/', 2)::uuid;
    ELSIF OLD.bucket_id = 'scripts-covers'
       AND OLD.name ~ (
         '^covers/'
         || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
         || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
       ) THEN
      v_old_content_kind := 'script';
      v_old_content_id := split_part(OLD.name, '/', 2)::uuid;
    ELSIF OLD.bucket_id = 'activity-media'
       AND OLD.name ~ (
         '^activities/'
         || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
         || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
       ) THEN
      v_old_content_kind := 'past_event_review';
      v_old_content_id := split_part(OLD.name, '/', 2)::uuid;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_bucket_id := NEW.bucket_id;
    v_new_object_path := NEW.name;
    IF NEW.bucket_id = 'scripts'
       AND NEW.name ~ (
         '^(pdfs|pages)/'
         || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
         || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
       ) THEN
      v_new_content_kind := 'script';
      v_new_content_id := split_part(NEW.name, '/', 2)::uuid;
    ELSIF NEW.bucket_id = 'scripts-covers'
       AND NEW.name ~ (
         '^covers/'
         || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
         || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
       ) THEN
      v_new_content_kind := 'script';
      v_new_content_id := split_part(NEW.name, '/', 2)::uuid;
    ELSIF NEW.bucket_id = 'activity-media'
       AND NEW.name ~ (
         '^activities/'
         || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
         || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
       ) THEN
      v_new_content_kind := 'past_event_review';
      v_new_content_id := split_part(NEW.name, '/', 2)::uuid;
    END IF;
  END IF;

  v_key_changed := TG_OP = 'DELETE' OR (
    TG_OP = 'UPDATE'
    AND (
      OLD.bucket_id IS DISTINCT FROM NEW.bucket_id
      OR OLD.name IS DISTINCT FROM NEW.name
    )
  );

  -- Lock every affected owner, then every affected object path, in a single
  -- deterministic order.  A<->B key moves and concurrent hard deletes cannot
  -- acquire the same lock sets in opposite orders.
  FOR v_lock IN
    SELECT DISTINCT owner.content_kind, owner.content_id
    FROM (VALUES
      (v_old_content_kind, v_old_content_id),
      (v_new_content_kind, v_new_content_id)
    ) AS owner(content_kind, content_id)
    WHERE owner.content_kind IS NOT NULL
      AND owner.content_id IS NOT NULL
    ORDER BY owner.content_kind, owner.content_id
  LOOP
    PERFORM private.content_management_v2_lock_content_id(
      v_lock.content_kind,
      v_lock.content_id
    );
  END LOOP;

  FOR v_lock IN
    SELECT DISTINCT object.bucket_id, object.object_path
    FROM (VALUES
      (v_old_bucket_id, v_old_object_path, v_old_content_kind),
      (v_new_bucket_id, v_new_object_path, v_new_content_kind)
    ) AS object(bucket_id, object_path, content_kind)
    WHERE object.content_kind IS NOT NULL
    ORDER BY object.bucket_id, object.object_path
  LOOP
    PERFORM private.content_management_v2_lock_media_paths(
      v_lock.bucket_id,
      ARRAY[v_lock.object_path]
    );
  END LOOP;

  -- A key-changing UPDATE removes OLD exactly like DELETE.  Its source key
  -- must already be claimed and globally unreferenced.
  IF v_key_changed AND v_old_content_kind IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM private.content_media_deletion_claims AS claim
      WHERE claim.bucket_id = v_old_bucket_id
        AND claim.object_path = v_old_object_path
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'CONTENT_MANAGEMENT_MEDIA_DELETE_CLAIM_REQUIRED';
    END IF;

    IF cardinality(
      private.content_management_v2_referenced_paths(
        v_old_bucket_id,
        ARRAY[v_old_object_path]
      )
    ) > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'CONTENT_MANAGEMENT_MEDIA_STILL_REFERENCED';
    END IF;
  END IF;

  -- INSERT, same-key Storage upserts, and key-changing UPDATE destinations all
  -- write NEW bytes/state.  A claimed or retired path is permanently frozen.
  IF v_new_content_kind IS NOT NULL
     AND TG_OP IN ('INSERT', 'UPDATE') THEN
    IF EXISTS (
      SELECT 1
      FROM private.content_media_deleted_content_ids AS tombstone
      WHERE tombstone.content_kind = v_new_content_kind
        AND tombstone.content_id = v_new_content_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'CONTENT_MANAGEMENT_CONTENT_ID_RETIRED';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM private.content_media_deletion_claims AS claim
      WHERE claim.bucket_id = v_new_bucket_id
        AND claim.object_path = v_new_object_path
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'CONTENT_MANAGEMENT_MEDIA_PATH_CLAIMED';
    END IF;

    IF v_new_content_kind = 'script' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.scripts AS script
        WHERE script.id = v_new_content_id
          AND script.archived_at IS NULL
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'CONTENT_MANAGEMENT_MEDIA_PARENT_UNAVAILABLE';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM public.past_event_reviews AS review
      WHERE review.id = v_new_content_id
        AND review.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'CONTENT_MANAGEMENT_MEDIA_PARENT_UNAVAILABLE';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_guard_deleted_content_id()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.content_management_v2_guard_storage_content_fence()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS content_v2_00_guard_deleted_content_id
  ON public.scripts;
CREATE TRIGGER content_v2_00_guard_deleted_content_id
  BEFORE INSERT OR DELETE OR UPDATE OF id ON public.scripts
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_guard_deleted_content_id();
DROP TRIGGER IF EXISTS content_v2_00_guard_deleted_content_id
  ON public.past_event_reviews;
CREATE TRIGGER content_v2_00_guard_deleted_content_id
  BEFORE INSERT OR DELETE OR UPDATE OF id ON public.past_event_reviews
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_guard_deleted_content_id();

DROP TRIGGER IF EXISTS content_v2_00_guard_storage_delete_claim
  ON storage.objects;
DROP FUNCTION IF EXISTS private.content_management_v2_guard_storage_delete_claim();
DROP TRIGGER IF EXISTS content_v2_00_guard_storage_content_fence
  ON storage.objects;
CREATE TRIGGER content_v2_00_guard_storage_content_fence
  BEFORE INSERT OR DELETE OR UPDATE ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_guard_storage_content_fence();

-- The old split delete function/trigger is intentionally removed above.  A
-- single trigger must acquire the complete OLD+NEW lock set before validating
-- either half of a key move.


CREATE OR REPLACE FUNCTION private.content_management_v2_public_media_refs(
  p_urls text[]
)
RETURNS TABLE (
  bucket_id text,
  object_path text,
  content_kind text,
  content_id uuid
)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  WITH url_values AS (
    SELECT DISTINCT
      split_part(split_part(url.value, '?', 1), '#', 1) AS clean_url
    FROM unnest(COALESCE(p_urls, ARRAY[]::text[])) AS url(value)
    WHERE NULLIF(btrim(url.value), '') IS NOT NULL
  ), bucket_contract AS (
    SELECT *
    FROM (VALUES
      (
        'scripts-covers'::text,
        '/storage/v1/object/public/scripts-covers/'::text,
        'script'::text
      ),
      (
        'activity-media'::text,
        '/storage/v1/object/public/activity-media/'::text,
        'past_event_review'::text
      )
    ) AS contract(bucket_id, marker, content_kind)
  ), parsed AS (
    SELECT
      contract.bucket_id,
      substring(
        url.clean_url
        FROM strpos(url.clean_url, contract.marker) + char_length(contract.marker)
      ) AS object_path,
      contract.content_kind
    FROM url_values AS url
    CROSS JOIN bucket_contract AS contract
    WHERE private.content_management_v2_public_media_url_is_canonical(
      url.clean_url,
      contract.bucket_id
    )
      AND url.clean_url ~ (
        '^https://[^/?#]+'
        || contract.marker
        || '.+$'
      )
  )
  SELECT DISTINCT
    parsed.bucket_id,
    parsed.object_path,
    parsed.content_kind,
    split_part(parsed.object_path, '/', 2)::uuid AS content_id
  FROM parsed
  WHERE private.content_management_v2_cleanup_object_path_is_valid(
    parsed.bucket_id,
    parsed.object_path
  )
$function$;

CREATE OR REPLACE FUNCTION private.content_management_v2_assert_media_refs_available(
  p_new_public_urls text[],
  p_old_public_urls text[],
  p_script_id uuid,
  p_new_script_paths text[],
  p_old_script_paths text[]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ref record;
BEGIN
  IF (
    p_script_id IS NULL
    AND (
      cardinality(COALESCE(p_new_script_paths, ARRAY[]::text[])) > 0
      OR cardinality(COALESCE(p_old_script_paths, ARRAY[]::text[])) > 0
    )
  ) OR (
    p_script_id IS NOT NULL
    AND (
      NOT private.content_management_v2_paths_have_prefix(
        p_new_script_paths,
        ARRAY[
          'pdfs/' || p_script_id::text || '/',
          'pages/' || p_script_id::text || '/'
        ]
      )
      OR NOT private.content_management_v2_paths_have_prefix(
        p_old_script_paths,
        ARRAY[
          'pdfs/' || p_script_id::text || '/',
          'pages/' || p_script_id::text || '/'
        ]
      )
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_CLEANUP_PATH_INVALID';
  END IF;

  -- Lock the complete old/new union in one global order before checking any
  -- introduced path.  This prevents A->B and B->A replacements from taking
  -- opposite partial lock orders across the 03 and 05 triggers.
  FOR v_ref IN
    WITH touched AS (
      SELECT refs.bucket_id, refs.object_path
      FROM private.content_management_v2_public_media_refs(
        COALESCE(p_new_public_urls, ARRAY[]::text[])
          || COALESCE(p_old_public_urls, ARRAY[]::text[])
      ) AS refs
      UNION
      SELECT 'scripts'::text, path.value
      FROM unnest(
        COALESCE(p_new_script_paths, ARRAY[]::text[])
          || COALESCE(p_old_script_paths, ARRAY[]::text[])
      ) AS path(value)
      WHERE p_script_id IS NOT NULL
    )
    SELECT touched.bucket_id, touched.object_path
    FROM touched
    ORDER BY touched.bucket_id, touched.object_path
  LOOP
    PERFORM private.content_management_v2_lock_media_paths(
      v_ref.bucket_id,
      ARRAY[v_ref.object_path]
    );
  END LOOP;

  FOR v_ref IN
    WITH new_refs AS (
      SELECT refs.bucket_id, refs.object_path
      FROM private.content_management_v2_public_media_refs(
        p_new_public_urls
      ) AS refs
      UNION
      SELECT 'scripts'::text, path.value
      FROM unnest(COALESCE(p_new_script_paths, ARRAY[]::text[])) AS path(value)
      WHERE p_script_id IS NOT NULL
    ), old_refs AS (
      SELECT refs.bucket_id, refs.object_path
      FROM private.content_management_v2_public_media_refs(
        p_old_public_urls
      ) AS refs
      UNION
      SELECT 'scripts'::text, path.value
      FROM unnest(COALESCE(p_old_script_paths, ARRAY[]::text[])) AS path(value)
      WHERE p_script_id IS NOT NULL
    ), introduced AS (
      SELECT new_ref.bucket_id, new_ref.object_path
      FROM new_refs AS new_ref
      EXCEPT
      SELECT old_ref.bucket_id, old_ref.object_path
      FROM old_refs AS old_ref
    )
    SELECT introduced.bucket_id, introduced.object_path
    FROM introduced
    ORDER BY introduced.bucket_id, introduced.object_path
  LOOP
    IF EXISTS (
      SELECT 1
      FROM private.content_media_deletion_claims AS claim
      WHERE claim.bucket_id = v_ref.bucket_id
        AND claim.object_path = v_ref.object_path
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'CONTENT_MANAGEMENT_MEDIA_PATH_CLAIMED',
        DETAIL = format(
          'bucket=%s path=%s',
          v_ref.bucket_id,
          left(v_ref.object_path, 300)
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id = v_ref.bucket_id
        AND object.name = v_ref.object_path
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'CONTENT_MANAGEMENT_MEDIA_OBJECT_MISSING',
        DETAIL = format(
          'bucket=%s path=%s',
          v_ref.bucket_id,
          left(v_ref.object_path, 300)
        );
    END IF;
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION private.content_management_v2_enqueue_removed_media(
  p_reason text,
  p_created_by uuid,
  p_old_public_urls text[],
  p_new_public_urls text[],
  p_script_id uuid,
  p_old_script_paths text[],
  p_new_script_paths text[]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group record;
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  FOR v_group IN
    WITH old_refs AS (
      SELECT
        refs.bucket_id,
        refs.object_path,
        refs.content_kind,
        refs.content_id
      FROM private.content_management_v2_public_media_refs(
        p_old_public_urls
      ) AS refs
      UNION
      SELECT
        'scripts'::text,
        path.value,
        'script'::text,
        p_script_id
      FROM unnest(COALESCE(p_old_script_paths, ARRAY[]::text[])) AS path(value)
      WHERE p_script_id IS NOT NULL
    ), new_refs AS (
      SELECT
        refs.bucket_id,
        refs.object_path,
        refs.content_kind,
        refs.content_id
      FROM private.content_management_v2_public_media_refs(
        p_new_public_urls
      ) AS refs
      UNION
      SELECT
        'scripts'::text,
        path.value,
        'script'::text,
        p_script_id
      FROM unnest(COALESCE(p_new_script_paths, ARRAY[]::text[])) AS path(value)
      WHERE p_script_id IS NOT NULL
    ), removed AS (
      SELECT
        old_ref.bucket_id,
        old_ref.object_path,
        old_ref.content_kind,
        old_ref.content_id
      FROM old_refs AS old_ref
      EXCEPT
      SELECT
        new_ref.bucket_id,
        new_ref.object_path,
        new_ref.content_kind,
        new_ref.content_id
      FROM new_refs AS new_ref
    )
    SELECT
      removed.bucket_id,
      removed.content_kind,
      removed.content_id,
      array_agg(removed.object_path ORDER BY removed.object_path) AS object_paths
    FROM removed
    GROUP BY removed.bucket_id, removed.content_kind, removed.content_id
    ORDER BY removed.bucket_id, removed.content_kind, removed.content_id
  LOOP
    IF v_reason IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'CONTENT_MANAGEMENT_REASON_REQUIRED';
    END IF;
    IF char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'CONTENT_MANAGEMENT_REASON_INVALID';
    END IF;

    INSERT INTO public.content_media_cleanup_jobs (
      content_kind,
      content_id,
      bucket_id,
      object_paths,
      reason,
      created_by
    ) VALUES (
      v_group.content_kind,
      v_group.content_id,
      v_group.bucket_id,
      v_group.object_paths,
      v_reason,
      p_created_by
    );
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION private.content_management_v2_guard_media_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_new_urls text[] := ARRAY[]::text[];
  v_old_urls text[] := ARRAY[]::text[];
  v_new_script_paths text[] := ARRAY[]::text[];
  v_old_script_paths text[] := ARRAY[]::text[];
  v_script_id uuid;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME NOT IN (
       'scripts',
       'past_event_reviews',
       'script_protected_content'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_MEDIA_CLAIM_GUARD_TARGET_INVALID';
  END IF;

  IF TG_TABLE_NAME = 'scripts' THEN
    v_new_urls := ARRAY[NEW.cover_url];
    IF TG_OP = 'UPDATE' THEN
      v_old_urls := ARRAY[OLD.cover_url];
    END IF;
  ELSIF TG_TABLE_NAME = 'past_event_reviews' THEN
    SELECT ARRAY[NEW.cover_url] || COALESCE(
      array_agg(gallery.url ORDER BY gallery.position),
      ARRAY[]::text[]
    )
    INTO v_new_urls
    FROM jsonb_array_elements_text(NEW.gallery_urls)
      WITH ORDINALITY AS gallery(url, position);

    IF TG_OP = 'UPDATE' THEN
      SELECT ARRAY[OLD.cover_url] || COALESCE(
        array_agg(gallery.url ORDER BY gallery.position),
        ARRAY[]::text[]
      )
      INTO v_old_urls
      FROM jsonb_array_elements_text(OLD.gallery_urls)
        WITH ORDINALITY AS gallery(url, position);
    END IF;
  ELSE
    IF TG_OP = 'UPDATE' AND NEW.script_id IS DISTINCT FROM OLD.script_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'CONTENT_MANAGEMENT_SCRIPT_ID_IMMUTABLE';
    END IF;
    v_script_id := NEW.script_id;
    v_new_script_paths := array_remove(
      ARRAY[NEW.pdf_storage_path]
        || COALESCE(NEW.page_image_paths, ARRAY[]::text[]),
      NULL
    );
    IF TG_OP = 'UPDATE' THEN
      v_old_script_paths := array_remove(
        ARRAY[OLD.pdf_storage_path]
          || COALESCE(OLD.page_image_paths, ARRAY[]::text[]),
        NULL
      );
    END IF;
  END IF;

  PERFORM private.content_management_v2_assert_media_refs_available(
    v_new_urls,
    v_old_urls,
    v_script_id,
    v_new_script_paths,
    v_old_script_paths
  );
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.content_management_v2_queue_removed_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_new_urls text[] := ARRAY[]::text[];
  v_old_urls text[] := ARRAY[]::text[];
  v_new_script_paths text[] := ARRAY[]::text[];
  v_old_script_paths text[] := ARRAY[]::text[];
  v_script_id uuid;
  v_reason text;
BEGIN
  IF TG_OP <> 'UPDATE'
     OR TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME NOT IN (
       'scripts',
       'past_event_reviews',
       'script_protected_content'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_MEDIA_QUEUE_TRIGGER_TARGET_INVALID';
  END IF;

  v_reason := COALESCE(
    NULLIF(btrim(NEW.audit_reason), ''),
    NULLIF(btrim(current_setting('app.content_v2_audit_reason', true)), '')
  );

  IF TG_TABLE_NAME = 'scripts' THEN
    v_old_urls := ARRAY[OLD.cover_url];
    v_new_urls := ARRAY[NEW.cover_url];
  ELSIF TG_TABLE_NAME = 'past_event_reviews' THEN
    SELECT ARRAY[OLD.cover_url] || COALESCE(
      array_agg(gallery.url ORDER BY gallery.position),
      ARRAY[]::text[]
    )
    INTO v_old_urls
    FROM jsonb_array_elements_text(OLD.gallery_urls)
      WITH ORDINALITY AS gallery(url, position);
    SELECT ARRAY[NEW.cover_url] || COALESCE(
      array_agg(gallery.url ORDER BY gallery.position),
      ARRAY[]::text[]
    )
    INTO v_new_urls
    FROM jsonb_array_elements_text(NEW.gallery_urls)
      WITH ORDINALITY AS gallery(url, position);
  ELSE
    v_script_id := NEW.script_id;
    v_old_script_paths := array_remove(
      ARRAY[OLD.pdf_storage_path]
        || COALESCE(OLD.page_image_paths, ARRAY[]::text[]),
      NULL
    );
    v_new_script_paths := array_remove(
      ARRAY[NEW.pdf_storage_path]
        || COALESCE(NEW.page_image_paths, ARRAY[]::text[]),
      NULL
    );
  END IF;

  PERFORM private.content_management_v2_enqueue_removed_media(
    v_reason,
    private.member_master_current_admin_id(),
    v_old_urls,
    v_new_urls,
    v_script_id,
    v_old_script_paths,
    v_new_script_paths
  );
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_public_media_refs(text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.content_management_v2_assert_media_refs_available(text[], text[], uuid, text[], text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.content_management_v2_enqueue_removed_media(text, uuid, text[], text[], uuid, text[], text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.content_management_v2_guard_media_claims()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.content_management_v2_queue_removed_media()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS content_v2_03_guard_media_claims ON public.scripts;
CREATE TRIGGER content_v2_03_guard_media_claims
  BEFORE INSERT OR UPDATE OF cover_url ON public.scripts
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_guard_media_claims();
DROP TRIGGER IF EXISTS content_v2_05_queue_removed_media ON public.scripts;
CREATE TRIGGER content_v2_05_queue_removed_media
  BEFORE UPDATE OF cover_url ON public.scripts
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_queue_removed_media();

DROP TRIGGER IF EXISTS content_v2_03_guard_media_claims
  ON public.past_event_reviews;
CREATE TRIGGER content_v2_03_guard_media_claims
  BEFORE INSERT OR UPDATE OF cover_url, gallery_urls
  ON public.past_event_reviews
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_guard_media_claims();
DROP TRIGGER IF EXISTS content_v2_05_queue_removed_media
  ON public.past_event_reviews;
CREATE TRIGGER content_v2_05_queue_removed_media
  BEFORE UPDATE OF cover_url, gallery_urls ON public.past_event_reviews
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_queue_removed_media();

DROP TRIGGER IF EXISTS content_v2_03_guard_media_claims
  ON public.script_protected_content;
CREATE TRIGGER content_v2_03_guard_media_claims
  BEFORE INSERT OR UPDATE OF script_id, pdf_storage_path, page_image_paths
  ON public.script_protected_content
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_guard_media_claims();
DROP TRIGGER IF EXISTS content_v2_05_queue_removed_media
  ON public.script_protected_content;
CREATE TRIGGER content_v2_05_queue_removed_media
  BEFORE UPDATE OF pdf_storage_path, page_image_paths
  ON public.script_protected_content
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_queue_removed_media();

-- -------------------------------------------------------------------------
-- Strict recycle-bin transitions and mandatory content change reasons.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.content_management_v2_guard_archive_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_is_admin boolean := (SELECT public.is_admin());
  v_is_super_admin boolean := private.member_master_is_super_admin();
  v_reason text;
  v_old_business jsonb;
  v_new_business jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.archived_at IS NOT NULL THEN
      IF NOT v_is_admin THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = 'CONTENT_MANAGEMENT_ADMIN_REQUIRED';
      END IF;
      v_reason := NULLIF(btrim(NEW.archive_reason), '');
      IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'CONTENT_MANAGEMENT_REASON_INVALID';
      END IF;
      NEW.archive_reason := v_reason;
      NEW.archived_by := COALESCE(v_admin_id, NEW.archived_by);
      NEW.audit_reason := COALESCE(NEW.audit_reason, v_reason);
    ELSIF NEW.archived_by IS NOT NULL OR NEW.archive_reason IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'CONTENT_MANAGEMENT_ARCHIVE_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.archived_at IS NOT NULL THEN
    IF NEW.archived_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'CONTENT_MANAGEMENT_ARCHIVED_ROW_IMMUTABLE';
    END IF;

    IF NOT v_is_super_admin THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'CONTENT_MANAGEMENT_SUPER_ADMIN_REQUIRED';
    END IF;

    v_old_business := to_jsonb(OLD)
      - 'archived_at' - 'archived_by' - 'archive_reason'
      - 'audit_reason' - 'updated_at';
    v_new_business := to_jsonb(NEW)
      - 'archived_at' - 'archived_by' - 'archive_reason'
      - 'audit_reason' - 'updated_at';
    IF v_old_business IS DISTINCT FROM v_new_business THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'CONTENT_MANAGEMENT_ARCHIVED_ROW_IMMUTABLE';
    END IF;

    v_reason := COALESCE(
      NULLIF(btrim(NEW.audit_reason), ''),
      NULLIF(btrim(current_setting('app.content_v2_audit_reason', true)), '')
    );
    IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'CONTENT_MANAGEMENT_REASON_INVALID';
    END IF;

    NEW.archived_by := NULL;
    NEW.archive_reason := NULL;
    NEW.audit_reason := v_reason;
    RETURN NEW;
  END IF;

  IF NEW.archived_at IS NOT NULL THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'CONTENT_MANAGEMENT_ADMIN_REQUIRED';
    END IF;
    v_reason := NULLIF(btrim(NEW.archive_reason), '');
    IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'CONTENT_MANAGEMENT_REASON_INVALID';
    END IF;
    NEW.archive_reason := v_reason;
    NEW.archived_by := v_admin_id;
    NEW.audit_reason := COALESCE(NEW.audit_reason, v_reason);
  ELSIF NEW.archived_by IS NOT NULL OR NEW.archive_reason IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_ARCHIVE_STATE_INVALID';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_guard_archive_transition()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.content_management_v2_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_before jsonb := CASE
    WHEN TG_OP = 'INSERT' THEN '{}'::jsonb
    ELSE to_jsonb(OLD)
  END;
  v_after jsonb := CASE
    WHEN TG_OP = 'DELETE' THEN '{}'::jsonb
    ELSE to_jsonb(NEW)
  END;
  v_changed_fields text[];
  v_reason text;
  v_admin_id uuid := private.member_master_current_admin_id();
  v_actor_name text;
  v_actor_role text;
  v_source text;
  v_record_id text;
BEGIN
  SELECT COALESCE(array_agg(changed.key ORDER BY changed.key), ARRAY[]::text[])
  INTO v_changed_fields
  FROM (
    SELECT key
    FROM jsonb_object_keys(v_before || v_after) AS field(key)
    WHERE (v_before -> key) IS DISTINCT FROM (v_after -> key)
      AND key NOT IN ('audit_reason', 'created_at', 'updated_at')
  ) AS changed;

  IF cardinality(v_changed_fields) = 0 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    NEW.audit_reason := NULL;
    RETURN NEW;
  END IF;

  v_reason := COALESCE(
    CASE
      WHEN TG_OP = 'DELETE' THEN NULLIF(btrim(OLD.audit_reason), '')
      ELSE NULLIF(btrim(NEW.audit_reason), '')
    END,
    NULLIF(btrim(current_setting('app.content_v2_audit_reason', true)), '')
  );

  IF v_reason IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_REASON_REQUIRED';
  END IF;
  IF char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_REASON_INVALID';
  END IF;

  PERFORM set_config('app.content_v2_audit_reason', v_reason, true);

  IF v_admin_id IS NOT NULL THEN
    SELECT administrator.name, administrator.role
    INTO v_actor_name, v_actor_role
    FROM public.admin_users AS administrator
    WHERE administrator.id = v_admin_id;
    v_actor_role := COALESCE(v_actor_role, 'admin');
    v_source := 'admin';
  ELSIF COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role' THEN
    v_actor_role := 'service_role';
    v_source := 'service';
  ELSIF (SELECT auth.uid()) IS NOT NULL THEN
    v_actor_role := 'authenticated';
    v_source := 'app';
  ELSE
    v_actor_role := 'system';
    v_source := 'system';
  END IF;

  v_record_id := COALESCE(
    v_after->>'id',
    v_before->>'id',
    v_after->>'script_id',
    v_before->>'script_id',
    TG_TABLE_NAME || ':' || TG_OP
  );

  -- Never copy content values into the audit trail.  Only field names, actor
  -- snapshots, the stable record locator, and the required reason are stored.
  INSERT INTO private.subjectless_operational_audit_log (
    table_schema,
    table_name,
    record_id_snapshot,
    operation,
    changed_fields,
    before_values,
    after_values,
    reason,
    source,
    actor_user_id_snapshot,
    actor_admin_id_snapshot,
    actor_name_snapshot,
    actor_role_snapshot
  ) VALUES (
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_changed_fields,
    '{}'::jsonb,
    '{}'::jsonb,
    v_reason,
    v_source,
    (SELECT auth.uid()),
    v_admin_id,
    v_actor_name,
    v_actor_role
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  NEW.audit_reason := NULL;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_audit_change()
  FROM PUBLIC, anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- Remove legacy payload synchronization and seal the old script columns.
-- -------------------------------------------------------------------------

DROP TRIGGER IF EXISTS content_v2_90_sync_legacy_script_protected
  ON public.scripts;
DROP FUNCTION IF EXISTS private.content_management_v2_sync_legacy_script_protected();

-- The archive guard correctly freezes archived rows, so disable only that one
-- trigger while this exclusively locked, audited, migration-only scrub runs.
ALTER TABLE public.scripts
  DISABLE TRIGGER content_v2_00_guard_archive_transition;

SELECT set_config(
  'app.content_v2_audit_reason',
  'Content V2 contract removes deprecated duplicate script payload fields',
  true
);

UPDATE public.scripts
SET
  content_html = NULL,
  roles = NULL,
  pdf_url = NULL,
  page_images = ARRAY[]::text[],
  page_count = 0,
  audit_reason = 'Content V2 contract removes deprecated duplicate script payload fields'
WHERE content_html IS NOT NULL
   OR roles IS NOT NULL
   OR pdf_url IS NOT NULL
   OR page_images IS NULL
   OR cardinality(page_images) <> 0
   OR page_count IS NULL
   OR page_count <> 0;

SELECT set_config('app.content_v2_audit_reason', '', true);

ALTER TABLE public.scripts
  ENABLE TRIGGER content_v2_00_guard_archive_transition;

ALTER TABLE public.scripts
  ALTER COLUMN content_html DROP DEFAULT,
  ALTER COLUMN roles DROP DEFAULT,
  ALTER COLUMN pdf_url DROP DEFAULT,
  ALTER COLUMN page_images SET DEFAULT '{}',
  ALTER COLUMN page_images SET NOT NULL,
  ALTER COLUMN page_count SET DEFAULT 0,
  ALTER COLUMN page_count SET NOT NULL,
  DROP CONSTRAINT IF EXISTS scripts_legacy_protected_columns_empty_check,
  ADD CONSTRAINT scripts_legacy_protected_columns_empty_check CHECK (
    content_html IS NULL
    AND roles IS NULL
    AND pdf_url IS NULL
    AND page_images IS NOT NULL
    AND cardinality(page_images) = 0
    AND page_count IS NOT NULL
    AND page_count = 0
  );

-- -------------------------------------------------------------------------
-- Retire permanent legacy grants, then validate the active-expiry invariant.
-- -------------------------------------------------------------------------

SELECT set_config(
  'app.member_master_audit_reason',
  '内容管理 V2 安全迁移：撤销无到期时间的旧全文授权',
  true
);

UPDATE public.script_play_records
SET
  can_view_full = false,
  revoked_at = COALESCE(revoked_at, statement_timestamp())
WHERE can_view_full = true
  AND expires_at IS NULL;

SELECT set_config('app.member_master_audit_reason', '', true);

ALTER TABLE public.script_play_records
  VALIDATE CONSTRAINT script_play_records_active_expiry_check;

-- -------------------------------------------------------------------------
-- Player identity boundary and parent-archive write boundary.
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS content_v2_reviews_authenticated_read
  ON public.past_event_reviews;
DROP POLICY IF EXISTS content_v2_reviews_authenticated_read_guard
  ON public.past_event_reviews;

CREATE POLICY content_v2_reviews_authenticated_read
  ON public.past_event_reviews
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      archived_at IS NULL
      AND (
        is_published = true
        OR (
          is_player_visible = true
          AND status IN ('published', 'cancelled')
          AND EXISTS (
            SELECT 1
            FROM public.members AS member
            WHERE member.user_id = (SELECT auth.uid())
              AND member.status = 'approved'
              AND member.account_status = 'active'
              AND member.record_scope = 'current'
              AND member.membership_type = 'player'
          )
          AND EXISTS (
            SELECT 1
            FROM public.player_activity_settings AS settings
            WHERE settings.id = 1
              AND settings.large_activities_enabled = true
          )
        )
      )
    )
  );
CREATE POLICY content_v2_reviews_authenticated_read_guard
  ON public.past_event_reviews
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      archived_at IS NULL
      AND (
        is_published = true
        OR (
          is_player_visible = true
          AND status IN ('published', 'cancelled')
          AND EXISTS (
            SELECT 1
            FROM public.members AS member
            WHERE member.user_id = (SELECT auth.uid())
              AND member.status = 'approved'
              AND member.account_status = 'active'
              AND member.record_scope = 'current'
              AND member.membership_type = 'player'
          )
          AND EXISTS (
            SELECT 1
            FROM public.player_activity_settings AS settings
            WHERE settings.id = 1
              AND settings.large_activities_enabled = true
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS content_v2_scripts_authenticated_read
  ON public.scripts;
DROP POLICY IF EXISTS content_v2_scripts_authenticated_read_guard
  ON public.scripts;

CREATE POLICY content_v2_scripts_authenticated_read
  ON public.scripts
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      archived_at IS NULL
      AND (
        is_published = true
        OR (
          is_player_visible = true
          AND EXISTS (
            SELECT 1
            FROM public.members AS member
            WHERE member.user_id = (SELECT auth.uid())
              AND member.status = 'approved'
              AND member.account_status = 'active'
              AND member.record_scope = 'current'
              AND member.membership_type = 'player'
          )
          AND EXISTS (
            SELECT 1
            FROM public.player_activity_settings AS settings
            WHERE settings.id = 1
              AND (
                settings.script_library_enabled = true
                OR (
                  is_social_script = true
                  AND settings.social_scripts_enabled = true
                )
              )
          )
        )
      )
    )
  );
CREATE POLICY content_v2_scripts_authenticated_read_guard
  ON public.scripts
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      archived_at IS NULL
      AND (
        is_published = true
        OR (
          is_player_visible = true
          AND EXISTS (
            SELECT 1
            FROM public.members AS member
            WHERE member.user_id = (SELECT auth.uid())
              AND member.status = 'approved'
              AND member.account_status = 'active'
              AND member.record_scope = 'current'
              AND member.membership_type = 'player'
          )
          AND EXISTS (
            SELECT 1
            FROM public.player_activity_settings AS settings
            WHERE settings.id = 1
              AND (
                settings.script_library_enabled = true
                OR (
                  is_social_script = true
                  AND settings.social_scripts_enabled = true
                )
              )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS content_v2_settings_read
  ON public.player_activity_settings;
DROP POLICY IF EXISTS content_v2_settings_read_guard
  ON public.player_activity_settings;

CREATE POLICY content_v2_settings_read
  ON public.player_activity_settings
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
        AND member.record_scope = 'current'
        AND member.membership_type = 'player'
    )
  );
CREATE POLICY content_v2_settings_read_guard
  ON public.player_activity_settings
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
        AND member.record_scope = 'current'
        AND member.membership_type = 'player'
    )
  );

CREATE OR REPLACE FUNCTION private.content_management_v2_can_read_protected_script(
  p_script_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.script_play_records AS play
      JOIN public.members AS member
        ON member.id = play.member_id
      JOIN public.scripts AS script
        ON script.id = play.script_id
      WHERE play.script_id = p_script_id
        AND member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
        AND member.record_scope = 'current'
        AND member.membership_type = 'player'
        AND script.is_player_visible = true
        AND script.archived_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.player_activity_settings AS settings
          WHERE settings.id = 1
            AND (
              settings.script_library_enabled = true
              OR (
                script.is_social_script = true
                AND settings.social_scripts_enabled = true
              )
            )
        )
        AND play.can_view_full = true
        AND play.granted_at <= now()
        AND play.revoked_at IS NULL
        AND play.expires_at > now()
    )
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_can_read_protected_script(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.content_management_v2_can_read_protected_script(uuid)
  TO authenticated;

DROP POLICY IF EXISTS content_v2_script_protected_admin_insert
  ON public.script_protected_content;
DROP POLICY IF EXISTS content_v2_script_protected_admin_update
  ON public.script_protected_content;
DROP POLICY IF EXISTS content_v2_script_protected_admin_delete
  ON public.script_protected_content;
DROP POLICY IF EXISTS content_v2_script_protected_admin_insert_guard
  ON public.script_protected_content;
DROP POLICY IF EXISTS content_v2_script_protected_admin_update_guard
  ON public.script_protected_content;
DROP POLICY IF EXISTS content_v2_script_protected_admin_delete_guard
  ON public.script_protected_content;

CREATE POLICY content_v2_script_protected_admin_insert
  ON public.script_protected_content
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );
CREATE POLICY content_v2_script_protected_admin_insert_guard
  ON public.script_protected_content
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );
CREATE POLICY content_v2_script_protected_admin_update
  ON public.script_protected_content
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );
CREATE POLICY content_v2_script_protected_admin_update_guard
  ON public.script_protected_content
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );
CREATE POLICY content_v2_script_protected_admin_delete
  ON public.script_protected_content
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );
CREATE POLICY content_v2_script_protected_admin_delete_guard
  ON public.script_protected_content
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );

DROP POLICY IF EXISTS member_master_script_play_records_admin_audited_write
  ON public.script_play_records;
DROP POLICY IF EXISTS member_master_script_play_records_active_self_read
  ON public.script_play_records;
DROP POLICY IF EXISTS "admin_all"
  ON public.script_play_records;
DROP POLICY IF EXISTS "player_read_own"
  ON public.script_play_records;
DROP POLICY IF EXISTS content_v2_script_play_records_read_guard
  ON public.script_play_records;
DROP POLICY IF EXISTS content_v2_script_play_records_admin_read
  ON public.script_play_records;
DROP POLICY IF EXISTS content_v2_script_play_records_admin_insert
  ON public.script_play_records;
DROP POLICY IF EXISTS content_v2_script_play_records_admin_update
  ON public.script_play_records;
DROP POLICY IF EXISTS content_v2_script_play_records_admin_delete
  ON public.script_play_records;
DROP POLICY IF EXISTS content_v2_script_play_records_admin_insert_guard
  ON public.script_play_records;
DROP POLICY IF EXISTS content_v2_script_play_records_admin_update_guard
  ON public.script_play_records;
DROP POLICY IF EXISTS content_v2_script_play_records_admin_delete_guard
  ON public.script_play_records;

CREATE POLICY member_master_script_play_records_active_self_read
  ON public.script_play_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.members AS member
      WHERE member.id = member_id
        AND member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
        AND member.record_scope = 'current'
        AND member.membership_type = 'player'
    )
  );
CREATE POLICY content_v2_script_play_records_admin_read
  ON public.script_play_records
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
CREATE POLICY content_v2_script_play_records_read_guard
  ON public.script_play_records
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.members AS member
      WHERE member.id = member_id
        AND member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
        AND member.account_status = 'active'
        AND member.record_scope = 'current'
        AND member.membership_type = 'player'
    )
  );
CREATE POLICY content_v2_script_play_records_admin_insert
  ON public.script_play_records
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );
CREATE POLICY content_v2_script_play_records_admin_insert_guard
  ON public.script_play_records
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );
CREATE POLICY content_v2_script_play_records_admin_update
  ON public.script_play_records
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );
CREATE POLICY content_v2_script_play_records_admin_update_guard
  ON public.script_play_records
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );
CREATE POLICY content_v2_script_play_records_admin_delete
  ON public.script_play_records
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );
CREATE POLICY content_v2_script_play_records_admin_delete_guard
  ON public.script_play_records
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.scripts AS parent
      WHERE parent.id = script_id
        AND parent.archived_at IS NULL
    )
  );

-- -------------------------------------------------------------------------
-- Exact scripts Data API surface.  RLS cannot hide selected columns, so all
-- table-level grants and pre-existing column grants are removed first.
-- -------------------------------------------------------------------------

REVOKE ALL ON TABLE public.scripts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES (
  id,
  title,
  title_ja,
  description,
  author,
  player_count_min,
  player_count_max,
  duration_minutes,
  difficulty,
  genre_tags,
  theme_tags,
  cover_url,
  pdf_url,
  is_published,
  is_featured,
  play_count,
  created_by,
  created_at,
  updated_at,
  content_html,
  script_type,
  roles,
  warnings,
  language,
  page_images,
  page_count,
  budget,
  location,
  is_social_script,
  show_on_player_activity,
  player_activity_order,
  pin_in_social_library,
  social_library_order,
  is_player_visible,
  archived_at,
  archived_by,
  archive_reason,
  audit_reason
) ON TABLE public.scripts
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT (
  id,
  title,
  title_ja,
  description,
  author,
  player_count_min,
  player_count_max,
  duration_minutes,
  difficulty,
  genre_tags,
  theme_tags,
  cover_url,
  is_published,
  is_featured,
  play_count,
  created_at,
  updated_at,
  script_type,
  warnings,
  language,
  budget,
  location,
  is_social_script,
  show_on_player_activity,
  player_activity_order,
  pin_in_social_library,
  social_library_order,
  is_player_visible,
  archived_at
) ON TABLE public.scripts TO anon;

GRANT SELECT (
  id,
  title,
  title_ja,
  description,
  author,
  player_count_min,
  player_count_max,
  duration_minutes,
  difficulty,
  genre_tags,
  theme_tags,
  cover_url,
  is_published,
  is_featured,
  play_count,
  created_by,
  created_at,
  updated_at,
  script_type,
  warnings,
  language,
  budget,
  location,
  is_social_script,
  show_on_player_activity,
  player_activity_order,
  pin_in_social_library,
  social_library_order,
  is_player_visible,
  archived_at,
  archived_by,
  archive_reason,
  audit_reason
) ON TABLE public.scripts TO authenticated;

GRANT INSERT (
  id,
  title,
  title_ja,
  description,
  author,
  player_count_min,
  player_count_max,
  duration_minutes,
  difficulty,
  genre_tags,
  theme_tags,
  cover_url,
  is_published,
  is_featured,
  created_by,
  script_type,
  warnings,
  language,
  budget,
  location,
  is_social_script,
  show_on_player_activity,
  player_activity_order,
  pin_in_social_library,
  social_library_order,
  is_player_visible,
  archived_at,
  archived_by,
  archive_reason,
  audit_reason
) ON TABLE public.scripts TO authenticated;

GRANT UPDATE (
  title,
  title_ja,
  description,
  author,
  player_count_min,
  player_count_max,
  duration_minutes,
  difficulty,
  genre_tags,
  theme_tags,
  cover_url,
  is_published,
  is_featured,
  play_count,
  script_type,
  warnings,
  language,
  budget,
  location,
  is_social_script,
  show_on_player_activity,
  player_activity_order,
  pin_in_social_library,
  social_library_order,
  is_player_visible,
  archived_at,
  archived_by,
  archive_reason,
  audit_reason
) ON TABLE public.scripts TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.scripts TO service_role;

-- Existing play-record ACL remains explicit: authenticated callers cannot
-- delete directly, and parent-active policies gate admin insert/update.
REVOKE ALL ON TABLE public.script_play_records
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.script_play_records
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.script_play_records
  TO service_role;

-- Private delivery is now authoritative.  Existing signed URLs naturally
-- remain valid only until their individual expiry.
UPDATE storage.buckets
SET public = false
WHERE id = 'scripts';

-- A private bucket still evaluates Storage RLS.  These anonymous restrictive
-- policies make every legacy or future permissive policy incapable of reading
-- or mutating `scripts` objects, while remaining neutral for other buckets.
DROP POLICY IF EXISTS content_v2_scripts_storage_anon_select_guard
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_scripts_storage_anon_insert_guard
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_scripts_storage_anon_update_guard
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_scripts_storage_anon_delete_guard
  ON storage.objects;

CREATE POLICY content_v2_scripts_storage_anon_select_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR SELECT TO anon
  USING (bucket_id <> 'scripts');
CREATE POLICY content_v2_scripts_storage_anon_insert_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO anon
  WITH CHECK (bucket_id <> 'scripts');
CREATE POLICY content_v2_scripts_storage_anon_update_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE TO anon
  USING (bucket_id <> 'scripts')
  WITH CHECK (bucket_id <> 'scripts');
CREATE POLICY content_v2_scripts_storage_anon_delete_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE TO anon
  USING (bucket_id <> 'scripts');

-- -------------------------------------------------------------------------
-- Audited hard deletion with an in-transaction durable cleanup manifest.
-- -------------------------------------------------------------------------

-- Contract callers must bind a permanent-delete request to the exact recycle-
-- bin version they reviewed.  The two-argument Expand entry points are
-- intentionally removed instead of accepting an optional version that could
-- bypass the stale-request guard.
DROP FUNCTION IF EXISTS public.admin_hard_delete_script_v2(uuid, text);
DROP FUNCTION IF EXISTS public.admin_hard_delete_past_event_review_v2(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_hard_delete_script_v2(
  p_script_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_archived_at timestamptz;
  v_updated_at timestamptz;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_script_paths text[];
  v_public_group record;
  v_admin_id uuid := private.member_master_current_admin_id();
BEGIN
  IF NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_MANAGEMENT_SUPER_ADMIN_REQUIRED';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_REASON_INVALID';
  END IF;

  PERFORM private.content_management_v2_lock_content_id(
    'script',
    p_script_id
  );

  SELECT script.archived_at, script.updated_at
  INTO STRICT v_archived_at, v_updated_at
  FROM public.scripts AS script
  WHERE script.id = p_script_id
  FOR UPDATE;

  IF v_archived_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_MANAGEMENT_NOT_ARCHIVED';
  END IF;
  IF v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'CONTENT_MANAGEMENT_VERSION_CONFLICT';
  END IF;

  -- The content-id advisory fence serializes uploads for this owner.  An
  -- upload that committed before this lock is visible below; a later upload
  -- waits, then observes the permanent content-id tombstone and is rejected.
  SELECT COALESCE(array_agg(candidate.path ORDER BY candidate.path), ARRAY[]::text[])
  INTO v_script_paths
  FROM (
    SELECT protected.pdf_storage_path AS path
    FROM public.script_protected_content AS protected
    WHERE protected.script_id = p_script_id
      AND protected.pdf_storage_path IS NOT NULL
    UNION
    SELECT page.value AS path
    FROM public.script_protected_content AS protected
    CROSS JOIN LATERAL unnest(protected.page_image_paths) AS page(value)
    WHERE protected.script_id = p_script_id
    UNION
    SELECT object.name AS path
    FROM storage.objects AS object
    WHERE object.bucket_id = 'scripts'
      AND (
        left(object.name, char_length('pdfs/' || p_script_id::text || '/'))
          = 'pdfs/' || p_script_id::text || '/'
        OR left(object.name, char_length('pages/' || p_script_id::text || '/'))
          = 'pages/' || p_script_id::text || '/'
      )
  ) AS candidate;

  PERFORM set_config('app.content_v2_audit_reason', v_reason, true);
  PERFORM set_config('app.member_master_audit_reason', v_reason, true);

  IF cardinality(v_script_paths) > 0 THEN
    INSERT INTO public.content_media_cleanup_jobs (
      content_kind,
      content_id,
      bucket_id,
      object_paths,
      reason,
      created_by
    ) VALUES (
      'script',
      p_script_id,
      'scripts',
      v_script_paths,
      v_reason,
      v_admin_id
    );
  END IF;

  -- Queue both this script's complete cover prefix and every managed object
  -- actually referenced by its cover URL.  The latter may intentionally be a
  -- cross-record or cross-bucket shared object, so group jobs by the parsed
  -- object owner and let the global reference RPC retain shared paths.
  FOR v_public_group IN
    WITH candidates AS (
      SELECT
        'scripts-covers'::text AS bucket_id,
        object.name AS object_path,
        'script'::text AS content_kind,
        p_script_id AS content_id
      FROM storage.objects AS object
      WHERE object.bucket_id = 'scripts-covers'
        AND left(
          object.name,
          char_length('covers/' || p_script_id::text || '/')
        ) = 'covers/' || p_script_id::text || '/'
      UNION
      SELECT
        refs.bucket_id,
        refs.object_path,
        refs.content_kind,
        refs.content_id
      FROM public.scripts AS script
      CROSS JOIN LATERAL private.content_management_v2_public_media_refs(
        ARRAY[script.cover_url]
      ) AS refs
      WHERE script.id = p_script_id
    )
    SELECT
      candidates.bucket_id,
      candidates.content_kind,
      candidates.content_id,
      array_agg(candidates.object_path ORDER BY candidates.object_path)
        AS object_paths
    FROM candidates
    GROUP BY
      candidates.bucket_id,
      candidates.content_kind,
      candidates.content_id
    ORDER BY
      candidates.bucket_id,
      candidates.content_kind,
      candidates.content_id
  LOOP
    INSERT INTO public.content_media_cleanup_jobs (
      content_kind,
      content_id,
      bucket_id,
      object_paths,
      reason,
      created_by
    ) VALUES (
      v_public_group.content_kind,
      v_public_group.content_id,
      v_public_group.bucket_id,
      v_public_group.object_paths,
      v_reason,
      v_admin_id
    );
  END LOOP;

  PERFORM private.content_management_v2_tombstone_content_id(
    'script',
    p_script_id,
    v_reason,
    v_admin_id
  );

  DELETE FROM public.scripts AS script
  WHERE script.id = p_script_id;
EXCEPTION
  WHEN no_data_found THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'CONTENT_MANAGEMENT_TARGET_NOT_FOUND';
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_hard_delete_past_event_review_v2(
  p_review_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_archived_at timestamptz;
  v_updated_at timestamptz;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_public_group record;
  v_admin_id uuid := private.member_master_current_admin_id();
BEGIN
  IF NOT private.member_master_is_super_admin() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_MANAGEMENT_SUPER_ADMIN_REQUIRED';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_MANAGEMENT_REASON_INVALID';
  END IF;

  PERFORM private.content_management_v2_lock_content_id(
    'past_event_review',
    p_review_id
  );

  SELECT review.archived_at, review.updated_at
  INTO STRICT v_archived_at, v_updated_at
  FROM public.past_event_reviews AS review
  WHERE review.id = p_review_id
  FOR UPDATE;

  IF v_archived_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_MANAGEMENT_NOT_ARCHIVED';
  END IF;
  IF v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'CONTENT_MANAGEMENT_VERSION_CONFLICT';
  END IF;

  -- The content-id advisory fence serializes uploads for this owner.  An
  -- upload that committed before this lock is visible below; a later upload
  -- waits, then observes the permanent content-id tombstone and is rejected.
  PERFORM set_config('app.content_v2_audit_reason', v_reason, true);

  -- Include the complete owner prefix plus every managed cover/gallery path.
  -- Cross-module URLs are grouped by the object path's real owner.
  FOR v_public_group IN
    WITH candidates AS (
      SELECT
        'activity-media'::text AS bucket_id,
        object.name AS object_path,
        'past_event_review'::text AS content_kind,
        p_review_id AS content_id
      FROM storage.objects AS object
      WHERE object.bucket_id = 'activity-media'
        AND left(
          object.name,
          char_length('activities/' || p_review_id::text || '/')
        ) = 'activities/' || p_review_id::text || '/'
      UNION
      SELECT
        refs.bucket_id,
        refs.object_path,
        refs.content_kind,
        refs.content_id
      FROM public.past_event_reviews AS review
      CROSS JOIN LATERAL private.content_management_v2_public_media_refs(
        ARRAY[review.cover_url] || ARRAY(
          SELECT gallery.url
          FROM jsonb_array_elements_text(review.gallery_urls) AS gallery(url)
        )
      ) AS refs
      WHERE review.id = p_review_id
    )
    SELECT
      candidates.bucket_id,
      candidates.content_kind,
      candidates.content_id,
      array_agg(candidates.object_path ORDER BY candidates.object_path)
        AS object_paths
    FROM candidates
    GROUP BY
      candidates.bucket_id,
      candidates.content_kind,
      candidates.content_id
    ORDER BY
      candidates.bucket_id,
      candidates.content_kind,
      candidates.content_id
  LOOP
    INSERT INTO public.content_media_cleanup_jobs (
      content_kind,
      content_id,
      bucket_id,
      object_paths,
      reason,
      created_by
    ) VALUES (
      v_public_group.content_kind,
      v_public_group.content_id,
      v_public_group.bucket_id,
      v_public_group.object_paths,
      v_reason,
      v_admin_id
    );
  END LOOP;

  PERFORM private.content_management_v2_tombstone_content_id(
    'past_event_review',
    p_review_id,
    v_reason,
    v_admin_id
  );

  DELETE FROM public.past_event_reviews AS review
  WHERE review.id = p_review_id;
EXCEPTION
  WHEN no_data_found THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'CONTENT_MANAGEMENT_TARGET_NOT_FOUND';
END
$function$;

REVOKE ALL ON FUNCTION public.admin_hard_delete_script_v2(uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_hard_delete_past_event_review_v2(uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_script_v2(uuid, text, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_past_event_review_v2(uuid, text, timestamptz)
  TO authenticated;

-- -------------------------------------------------------------------------
-- Contract postflight.  Any failure rolls back the entire migration.
-- -------------------------------------------------------------------------

DO $do$
DECLARE
  v_function_definition text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.past_event_reviews'::regclass),
      ('public.player_activity_settings'::regclass),
      ('public.script_play_records'::regclass),
      ('public.script_protected_content'::regclass),
      ('public.scripts'::regclass),
      ('public.content_media_cleanup_jobs'::regclass),
      ('private.content_media_deletion_claims'::regclass),
      ('private.content_media_deleted_content_ids'::regclass),
      ('storage.objects'::regclass)
    ) AS expected(table_id)
    LEFT JOIN pg_class AS relation
      ON relation.oid = expected.table_id
    WHERE relation.oid IS NULL OR NOT relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_RLS_NOT_ENABLED';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgname = 'content_v2_10_audit_change'
      AND trigger_info.tgrelid IN (
        'public.past_event_reviews'::regclass,
        'public.scripts'::regclass,
        'public.player_activity_settings'::regclass,
        'public.script_protected_content'::regclass
      )
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled <> 'D'
  ) <> 4
  OR (
    SELECT count(*)
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgname = 'content_v2_00_guard_archive_transition'
      AND trigger_info.tgrelid IN (
        'public.past_event_reviews'::regclass,
        'public.scripts'::regclass
      )
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled <> 'D'
  ) <> 2
  OR (
    SELECT count(*)
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgname = 'content_v2_01_guard_public_media_urls'
      AND trigger_info.tgrelid IN (
        'public.past_event_reviews'::regclass,
        'public.scripts'::regclass
      )
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled <> 'D'
  ) <> 2
  OR (
    SELECT count(*)
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgname = 'content_v2_00_guard_deleted_content_id'
      AND trigger_info.tgrelid IN (
        'public.past_event_reviews'::regclass,
        'public.scripts'::regclass
      )
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled <> 'D'
  ) <> 2
  OR (
    SELECT count(*)
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgname = 'content_v2_00_guard_storage_content_fence'
      AND trigger_info.tgrelid = 'storage.objects'::regclass
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled <> 'D'
      -- ROW(1) + BEFORE(2) + INSERT(4) + DELETE(8) + UPDATE(16).
      AND trigger_info.tgtype = 31
  ) <> 1
  OR (
    SELECT count(*)
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgname = 'content_v2_00_claim_cleanup_job_paths'
      AND trigger_info.tgrelid =
        'public.content_media_cleanup_jobs'::regclass
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled <> 'D'
  ) <> 1
  OR (
    SELECT count(*)
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgname = 'content_v2_03_guard_media_claims'
      AND trigger_info.tgrelid IN (
        'public.past_event_reviews'::regclass,
        'public.script_protected_content'::regclass,
        'public.scripts'::regclass
      )
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled <> 'D'
  ) <> 3
  OR (
    SELECT count(*)
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgname = 'content_v2_05_queue_removed_media'
      AND trigger_info.tgrelid IN (
        'public.past_event_reviews'::regclass,
        'public.script_protected_content'::regclass,
        'public.scripts'::regclass
      )
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled <> 'D'
  ) <> 3
  OR EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgname = 'content_v2_00_guard_storage_delete_claim'
      AND trigger_info.tgrelid = 'storage.objects'::regclass
      AND NOT trigger_info.tgisinternal
  )
  OR to_regprocedure(
    'private.content_management_v2_guard_storage_delete_claim()'
  ) IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_TRIGGER_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.scripts AS script
    LEFT JOIN public.script_protected_content AS protected
      ON protected.script_id = script.id
    WHERE protected.script_id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_PROTECTED_ROW_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.script_protected_content AS protected
    WHERE (
      protected.pdf_storage_path IS NOT NULL
      AND (
        NOT private.content_management_v2_path_is_safe(protected.pdf_storage_path)
        OR left(
          protected.pdf_storage_path,
          char_length('pdfs/' || protected.script_id::text || '/')
        ) <> 'pdfs/' || protected.script_id::text || '/'
        OR NOT EXISTS (
          SELECT 1
          FROM storage.objects AS object
          WHERE object.bucket_id = 'scripts'
            AND object.name = protected.pdf_storage_path
        )
      )
    )
    OR NOT private.content_management_v2_paths_have_prefix(
      protected.page_image_paths,
      ARRAY['pages/' || protected.script_id::text || '/']
    )
    OR protected.page_count <> cardinality(protected.page_image_paths)
    OR EXISTS (
      SELECT 1
      FROM unnest(protected.page_image_paths) AS page(value)
      WHERE NOT EXISTS (
        SELECT 1
        FROM storage.objects AS object
        WHERE object.bucket_id = 'scripts'
          AND object.name = page.value
      )
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_PROTECTED_CONTENT_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE (
      object.bucket_id = 'scripts-covers'
      AND object.name LIKE 'covers/%'
      AND (
        NOT private.content_management_v2_path_is_safe(object.name)
        OR object.name !~ (
          '^covers/'
          || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
          || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
        )
      )
    ) OR (
      object.bucket_id = 'activity-media'
      AND object.name LIKE 'activities/%'
      AND (
        NOT private.content_management_v2_path_is_safe(object.name)
        OR object.name !~ (
          '^activities/'
          || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
          || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
        )
      )
    ) OR (
      object.bucket_id = 'scripts'
      AND (object.name LIKE 'pdfs/%' OR object.name LIKE 'pages/%')
      AND (
        NOT private.content_management_v2_path_is_safe(object.name)
        OR object.name !~ (
          '^(pdfs|pages)/'
          || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
          || '[0-9a-f]{4}-[0-9a-f]{12}/.+'
        )
      )
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_STORAGE_NAMESPACE_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.scripts AS script
    WHERE script.content_html IS NOT NULL
       OR script.roles IS NOT NULL
       OR script.pdf_url IS NOT NULL
       OR script.page_images IS NULL
       OR cardinality(script.page_images) <> 0
       OR script.page_count IS NULL
       OR script.page_count <> 0
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_LEGACY_PAYLOAD_NOT_EMPTY';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      (
        'public.scripts'::regclass,
        'scripts_legacy_protected_columns_empty_check'
      ),
      (
        'public.script_protected_content'::regclass,
        'script_protected_content_pdf_path_check'
      ),
      (
        'public.script_protected_content'::regclass,
        'script_protected_content_page_paths_check'
      ),
      (
        'public.script_protected_content'::regclass,
        'script_protected_content_page_count_check'
      ),
      (
        'public.content_media_cleanup_jobs'::regclass,
        'content_media_cleanup_jobs_manifest_check'
      ),
      (
        'public.content_media_cleanup_jobs'::regclass,
        'content_media_cleanup_jobs_pkey'
      ),
      (
        'private.content_media_deletion_claims'::regclass,
        'content_media_deletion_claims_pkey'
      ),
      (
        'private.content_media_deletion_claims'::regclass,
        'content_media_deletion_claims_bucket_check'
      ),
      (
        'private.content_media_deletion_claims'::regclass,
        'content_media_deletion_claims_path_check'
      ),
      (
        'private.content_media_deletion_claims'::regclass,
        'content_media_deletion_claims_deleted_at_check'
      ),
      (
        'private.content_media_deleted_content_ids'::regclass,
        'content_media_deleted_content_ids_kind_check'
      ),
      (
        'private.content_media_deleted_content_ids'::regclass,
        'content_media_deleted_content_ids_pkey'
      ),
      (
        'private.content_media_deleted_content_ids'::regclass,
        'content_media_deleted_content_ids_reason_check'
      )
    ) AS expected(table_id, constraint_name)
    LEFT JOIN pg_constraint AS constraint_info
      ON constraint_info.conrelid = expected.table_id
      AND constraint_info.conname = expected.constraint_name
    WHERE constraint_info.oid IS NULL
       OR NOT constraint_info.convalidated
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_CONSTRAINT_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgrelid = 'public.scripts'::regclass
      AND trigger_info.tgname = 'content_v2_90_sync_legacy_script_protected'
      AND NOT trigger_info.tgisinternal
  ) OR to_regprocedure(
    'private.content_management_v2_sync_legacy_script_protected()'
  ) IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_LEGACY_SYNC_REMAINS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets AS bucket
    WHERE bucket.id = 'scripts'
      AND bucket.public = false
  ) OR EXISTS (
    SELECT 1
    FROM public.scripts AS script
    WHERE NULLIF(btrim(script.cover_url), '') IS NOT NULL
      AND script.cover_url ~*
        '/storage/v1/(object|render/image)/(public|sign|authenticated)/scripts/'
  ) OR EXISTS (
    SELECT 1
    FROM public.past_event_reviews AS review
    CROSS JOIN LATERAL (
      SELECT review.cover_url AS url
      UNION ALL
      SELECT gallery.url
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(review.gallery_urls) = 'array'
            THEN review.gallery_urls
          ELSE '[]'::jsonb
        END
      ) AS gallery(url)
    ) AS media
    WHERE media.url ~*
      '/storage/v1/(object|render/image)/(public|sign|authenticated)/scripts/'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_SCRIPTS_PRIVATE_BOUNDARY_INVALID';
  END IF;

  IF NOT private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/public/scripts-covers/covers/00000000-0000-4000-8000-000000000000/example.webp',
      'scripts-covers'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/public/scripts-covers/covers/00000000-0000-4000-8000-000000000000/a%41.webp',
      'scripts-covers'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/public/scripts-covers/covers/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA/example.webp',
      'scripts-covers'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/public/scripts-covers/foo/example.webp',
      'scripts-covers'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/render/image/public/activity-media/activities/00000000-0000-4000-8000-000000000000/example.webp',
      'activity-media'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/sign/activity-media/activities/00000000-0000-4000-8000-000000000000/example.webp',
      'activity-media'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/authenticated/scripts-covers/covers/00000000-0000-4000-8000-000000000000/example.webp',
      'scripts-covers'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/public/activity-media/activities/00000000-0000-4000-8000-000000000000/foo/./bar.webp',
      'activity-media'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/public/activity-media/activities/00000000-0000-4000-8000-000000000000/%2e/bar.webp',
      'activity-media'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/public/activity-media'
        || chr(92)
        || 'activities/00000000-0000-4000-8000-000000000000/example.webp',
      'activity-media'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/'
        || chr(9)
        || 'public/activity-media/activities/00000000-0000-4000-8000-000000000000/example.webp',
      'activity-media'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/sign/scripts/pdfs/00000000-0000-4000-8000-000000000000/example.pdf',
      'scripts'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/object/public/%61ctivity-media/activities/00000000-0000-4000-8000-000000000000/example.webp',
      'activity-media'
    )
  OR private.content_management_v2_public_media_url_is_canonical(
      'https://example.test/storage/v1/%6fbject/public/activity-media/activities/00000000-0000-4000-8000-000000000000/example.webp',
      'activity-media'
    )
  OR (
    SELECT managed.object_path
    FROM private.content_management_v2_public_media_refs(ARRAY[
      'https://example.test/storage/v1/object/public/scripts-covers/covers/00000000-0000-4000-8000-000000000000/folder/storage/v1/object/public/scripts-covers/example.webp'
    ]) AS managed
    WHERE managed.bucket_id = 'scripts-covers'
    LIMIT 1
  ) IS DISTINCT FROM
    'covers/00000000-0000-4000-8000-000000000000/folder/storage/v1/object/public/scripts-covers/example.webp'
  OR EXISTS (
    SELECT 1
    FROM public.past_event_reviews AS review
    WHERE jsonb_typeof(review.gallery_urls) IS DISTINCT FROM 'array'
  )
  OR EXISTS (
    SELECT 1
    FROM public.past_event_reviews AS review
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(review.gallery_urls) = 'array'
          THEN review.gallery_urls
        ELSE '[]'::jsonb
      END
    ) AS gallery(value)
    WHERE jsonb_typeof(gallery.value) <> 'string'
  )
  OR EXISTS (
    SELECT 1
    FROM (
      SELECT script.cover_url AS url
      FROM public.scripts AS script
      UNION ALL
      SELECT review.cover_url AS url
      FROM public.past_event_reviews AS review
      UNION ALL
      SELECT gallery.url
      FROM public.past_event_reviews AS review
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(review.gallery_urls) = 'array'
            THEN review.gallery_urls
          ELSE '[]'::jsonb
        END
      ) AS gallery(url)
    ) AS media
    WHERE NOT private.content_management_v2_public_media_url_is_canonical(
        media.url,
        'scripts-covers'
      )
      OR NOT private.content_management_v2_public_media_url_is_canonical(
        media.url,
        'activity-media'
      )
      OR NOT private.content_management_v2_public_media_url_is_canonical(
        media.url,
        'scripts'
      )
  )
  OR EXISTS (
    SELECT 1
    FROM (
      SELECT script.cover_url AS url
      FROM public.scripts AS script
      UNION ALL
      SELECT review.cover_url AS url
      FROM public.past_event_reviews AS review
      UNION ALL
      SELECT gallery.url
      FROM public.past_event_reviews AS review
      CROSS JOIN LATERAL jsonb_array_elements_text(review.gallery_urls)
        AS gallery(url)
    ) AS media
    CROSS JOIN LATERAL private.content_management_v2_public_media_refs(
      ARRAY[media.url]
    ) AS managed
    WHERE NOT EXISTS (
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id = managed.bucket_id
        AND object.name = managed.object_path
    )
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_info
    WHERE function_info.oid =
      'private.content_management_v2_public_media_url_is_canonical(text,text)'::regprocedure
      AND function_info.provolatile = 'i'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_info
    WHERE function_info.oid =
      'private.content_management_v2_guard_public_media_urls()'::regprocedure
      AND function_info.prosecdef
  )
  OR has_function_privilege(
    'anon',
    'private.content_management_v2_public_media_url_is_canonical(text,text)',
    'EXECUTE'
  )
  OR has_function_privilege(
    'authenticated',
    'private.content_management_v2_public_media_url_is_canonical(text,text)',
    'EXECUTE'
  )
  OR has_function_privilege(
    'service_role',
    'private.content_management_v2_public_media_url_is_canonical(text,text)',
    'EXECUTE'
  )
  OR has_function_privilege(
    'anon',
    'private.content_management_v2_guard_public_media_urls()',
    'EXECUTE'
  )
  OR has_function_privilege(
    'authenticated',
    'private.content_management_v2_guard_public_media_urls()',
    'EXECUTE'
  )
  OR has_function_privilege(
    'service_role',
    'private.content_management_v2_guard_public_media_urls()',
    'EXECUTE'
  )
  OR pg_get_functiondef(
    'private.content_management_v2_guard_public_media_urls()'::regprocedure
  ) NOT ILIKE '%scripts-covers%activity-media%gallery_urls%'
  OR pg_get_functiondef(
    'private.content_management_v2_public_media_url_is_canonical(text,text)'::regprocedure
  ) NOT ILIKE '%p_bucket_id = ''scripts''%RETURN false%'
  OR pg_get_functiondef(
    'private.content_management_v2_public_media_url_is_canonical(text,text)'::regprocedure
  ) NOT ILIKE '%substring%strpos%char_length%'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_PUBLIC_MEDIA_CANONICAL_GATE_INVALID';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'storage'
      AND policy_info.tablename = 'objects'
      AND policy_info.policyname IN (
        'content_v2_scripts_storage_admin_select_guard',
        'content_v2_scripts_storage_admin_insert_guard',
        'content_v2_scripts_storage_admin_update_guard',
        'content_v2_scripts_storage_admin_delete_guard'
      )
      AND policy_info.permissive = 'RESTRICTIVE'
      AND 'authenticated' = ANY(policy_info.roles)
      AND COALESCE(policy_info.qual, policy_info.with_check)
        ILIKE '%scripts%is_admin%'
  ) <> 4
  OR (
    SELECT count(*)
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'storage'
      AND policy_info.tablename = 'objects'
      AND policy_info.policyname IN (
        'content_v2_scripts_storage_anon_select_guard',
        'content_v2_scripts_storage_anon_insert_guard',
        'content_v2_scripts_storage_anon_update_guard',
        'content_v2_scripts_storage_anon_delete_guard'
      )
      AND policy_info.permissive = 'RESTRICTIVE'
      AND 'anon' = ANY(policy_info.roles)
      AND COALESCE(policy_info.qual, policy_info.with_check)
        ILIKE '%bucket_id%<>%scripts%'
  ) <> 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_STORAGE_POLICY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.script_play_records AS play
    WHERE play.can_view_full = true
      AND play.expires_at IS NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid = 'public.script_play_records'::regclass
      AND constraint_info.conname = 'script_play_records_active_expiry_check'
      AND constraint_info.convalidated
      AND pg_get_constraintdef(constraint_info.oid)
        ILIKE '%NOT can_view_full%expires_at IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_ACTIVE_EXPIRY_INVALID';
  END IF;

  -- Column grants, not RLS, are the hard boundary preventing old payload reads.
  IF has_table_privilege('anon', 'public.scripts', 'SELECT')
     OR has_table_privilege('anon', 'public.scripts', 'INSERT')
     OR has_table_privilege('anon', 'public.scripts', 'UPDATE')
     OR has_table_privilege('anon', 'public.scripts', 'DELETE')
     OR has_table_privilege('authenticated', 'public.scripts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.scripts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.scripts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.scripts', 'DELETE')
     OR NOT has_table_privilege('service_role', 'public.scripts', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.scripts', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.scripts', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.scripts', 'DELETE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_SCRIPTS_TABLE_ACL_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('anon', 'content_html', 'SELECT'),
      ('anon', 'roles', 'SELECT'),
      ('anon', 'pdf_url', 'SELECT'),
      ('anon', 'page_images', 'SELECT'),
      ('anon', 'page_count', 'SELECT'),
      ('anon', 'content_html', 'INSERT'),
      ('anon', 'roles', 'INSERT'),
      ('anon', 'pdf_url', 'INSERT'),
      ('anon', 'page_images', 'INSERT'),
      ('anon', 'page_count', 'INSERT'),
      ('anon', 'content_html', 'UPDATE'),
      ('anon', 'roles', 'UPDATE'),
      ('anon', 'pdf_url', 'UPDATE'),
      ('anon', 'page_images', 'UPDATE'),
      ('anon', 'page_count', 'UPDATE'),
      ('authenticated', 'content_html', 'SELECT'),
      ('authenticated', 'roles', 'SELECT'),
      ('authenticated', 'pdf_url', 'SELECT'),
      ('authenticated', 'page_images', 'SELECT'),
      ('authenticated', 'page_count', 'SELECT'),
      ('authenticated', 'content_html', 'INSERT'),
      ('authenticated', 'roles', 'INSERT'),
      ('authenticated', 'pdf_url', 'INSERT'),
      ('authenticated', 'page_images', 'INSERT'),
      ('authenticated', 'page_count', 'INSERT'),
      ('authenticated', 'content_html', 'UPDATE'),
      ('authenticated', 'roles', 'UPDATE'),
      ('authenticated', 'pdf_url', 'UPDATE'),
      ('authenticated', 'page_images', 'UPDATE'),
      ('authenticated', 'page_count', 'UPDATE')
    ) AS forbidden(role_name, column_name, privilege_name)
    WHERE has_column_privilege(
      forbidden.role_name,
      'public.scripts',
      forbidden.column_name,
      forbidden.privilege_name
    )
  ) OR NOT has_column_privilege(
    'anon', 'public.scripts', 'id', 'SELECT'
  ) OR EXISTS (
    SELECT 1
    FROM pg_attribute AS column_info
    WHERE column_info.attrelid = 'public.scripts'::regclass
      AND column_info.attnum > 0
      AND NOT column_info.attisdropped
      AND column_info.attname NOT IN (
        'content_html', 'roles', 'pdf_url', 'page_images', 'page_count'
      )
      AND NOT has_column_privilege(
        'authenticated',
        'public.scripts',
        column_info.attname,
        'SELECT'
      )
  ) OR NOT has_column_privilege(
    'authenticated', 'public.scripts', 'id', 'SELECT'
  ) OR NOT has_column_privilege(
    'authenticated', 'public.scripts', 'id', 'INSERT'
  ) OR NOT has_column_privilege(
    'authenticated', 'public.scripts', 'title', 'INSERT'
  ) OR NOT has_column_privilege(
    'authenticated', 'public.scripts', 'title', 'UPDATE'
  ) OR NOT has_column_privilege(
    'authenticated', 'public.scripts', 'audit_reason', 'INSERT'
  ) OR NOT has_column_privilege(
    'authenticated', 'public.scripts', 'audit_reason', 'UPDATE'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_SCRIPTS_COLUMN_ACL_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid = 'public.content_media_cleanup_jobs'::regclass
      AND relation.relrowsecurity
  )
  OR has_table_privilege('anon', 'public.content_media_cleanup_jobs', 'SELECT')
  OR has_table_privilege('anon', 'public.content_media_cleanup_jobs', 'INSERT')
  OR has_table_privilege('anon', 'public.content_media_cleanup_jobs', 'UPDATE')
  OR has_table_privilege('anon', 'public.content_media_cleanup_jobs', 'DELETE')
  OR NOT has_table_privilege('authenticated', 'public.content_media_cleanup_jobs', 'SELECT')
  OR NOT has_table_privilege('authenticated', 'public.content_media_cleanup_jobs', 'INSERT')
  OR NOT has_table_privilege('authenticated', 'public.content_media_cleanup_jobs', 'UPDATE')
  OR NOT has_table_privilege('authenticated', 'public.content_media_cleanup_jobs', 'DELETE')
  OR NOT has_table_privilege('service_role', 'public.content_media_cleanup_jobs', 'SELECT')
  OR NOT has_table_privilege('service_role', 'public.content_media_cleanup_jobs', 'INSERT')
  OR NOT has_table_privilege('service_role', 'public.content_media_cleanup_jobs', 'UPDATE')
  OR NOT has_table_privilege('service_role', 'public.content_media_cleanup_jobs', 'DELETE')
  OR to_regclass(
    'public.content_media_cleanup_jobs_content_bucket_uidx'
  ) IS NOT NULL
  OR to_regclass(
    'public.content_media_cleanup_jobs_content_bucket_idx'
  ) IS NULL
  OR EXISTS (
    SELECT 1
    FROM pg_index AS index_info
    WHERE index_info.indrelid = 'public.content_media_cleanup_jobs'::regclass
      AND index_info.indisunique
      AND (
        SELECT array_agg(column_info.attname::text ORDER BY key_info.position)
        FROM unnest(index_info.indkey::smallint[])
          WITH ORDINALITY AS key_info(attnum, position)
        JOIN pg_attribute AS column_info
          ON column_info.attrelid = index_info.indrelid
          AND column_info.attnum = key_info.attnum
        WHERE key_info.position <= index_info.indnkeyatts
      ) = ARRAY['content_kind', 'content_id', 'bucket_id']::text[]
  )
  OR to_regprocedure(
    'public.admin_enqueue_content_media_cleanup_job_v2(text,uuid,text,text[],text)'
  ) IS NOT NULL
  OR to_regprocedure(
    'public.content_media_cleanup_referenced_paths_v2(text,text[])'
  ) IS NOT NULL
  OR has_function_privilege(
    'anon',
    'public.content_media_cleanup_referenced_paths_v2(uuid,text,text[])',
    'EXECUTE'
  )
  OR has_function_privilege(
    'authenticated',
    'public.content_media_cleanup_referenced_paths_v2(uuid,text,text[])',
    'EXECUTE'
  )
  OR NOT has_function_privilege(
    'service_role',
    'public.content_media_cleanup_referenced_paths_v2(uuid,text,text[])',
    'EXECUTE'
  )
  OR has_function_privilege(
    'anon',
    'public.content_media_cleanup_complete_claims_v2(uuid,text,text[])',
    'EXECUTE'
  )
  OR has_function_privilege(
    'authenticated',
    'public.content_media_cleanup_complete_claims_v2(uuid,text,text[])',
    'EXECUTE'
  )
  OR NOT has_function_privilege(
    'service_role',
    'public.content_media_cleanup_complete_claims_v2(uuid,text,text[])',
    'EXECUTE'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_info
    WHERE function_info.oid =
      'public.content_media_cleanup_referenced_paths_v2(uuid,text,text[])'::regprocedure
      AND function_info.prosecdef
      AND function_info.provolatile = 'v'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_info
    WHERE function_info.oid =
      'public.content_media_cleanup_complete_claims_v2(uuid,text,text[])'::regprocedure
      AND function_info.prosecdef
      AND function_info.provolatile = 'v'
  )
  OR (
    SELECT count(*)
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'content_media_cleanup_jobs'
      AND policy_info.policyname IN (
        'content_v2_cleanup_super_select',
        'content_v2_cleanup_super_insert',
        'content_v2_cleanup_super_update',
        'content_v2_cleanup_super_delete',
        'content_v2_cleanup_super_select_guard',
        'content_v2_cleanup_super_insert_guard',
        'content_v2_cleanup_super_update_guard',
        'content_v2_cleanup_super_delete_guard'
      )
      AND COALESCE(policy_info.qual, policy_info.with_check)
        ILIKE '%member_master_is_super_admin%'
  ) <> 8 THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_CLEANUP_ACL_INVALID';
  END IF;

  IF has_table_privilege(
       'anon', 'private.content_media_deletion_claims', 'SELECT'
     )
     OR has_table_privilege(
       'anon', 'private.content_media_deletion_claims', 'INSERT'
     )
     OR has_table_privilege(
       'anon', 'private.content_media_deletion_claims', 'UPDATE'
     )
     OR has_table_privilege(
       'anon', 'private.content_media_deletion_claims', 'DELETE'
     )
     OR has_table_privilege(
       'authenticated', 'private.content_media_deletion_claims', 'SELECT'
     )
     OR has_table_privilege(
       'authenticated', 'private.content_media_deletion_claims', 'INSERT'
     )
     OR has_table_privilege(
       'authenticated', 'private.content_media_deletion_claims', 'UPDATE'
     )
     OR has_table_privilege(
       'authenticated', 'private.content_media_deletion_claims', 'DELETE'
     )
     OR NOT has_table_privilege(
       'service_role', 'private.content_media_deletion_claims', 'SELECT'
     )
     OR NOT has_table_privilege(
       'service_role', 'private.content_media_deletion_claims', 'INSERT'
     )
     OR NOT has_table_privilege(
       'service_role', 'private.content_media_deletion_claims', 'UPDATE'
     )
     OR NOT has_table_privilege(
       'service_role', 'private.content_media_deletion_claims', 'DELETE'
     )
     OR has_table_privilege(
       'anon', 'private.content_media_deleted_content_ids', 'SELECT'
     )
     OR has_table_privilege(
       'anon', 'private.content_media_deleted_content_ids', 'INSERT'
     )
     OR has_table_privilege(
       'anon', 'private.content_media_deleted_content_ids', 'UPDATE'
     )
     OR has_table_privilege(
       'anon', 'private.content_media_deleted_content_ids', 'DELETE'
     )
     OR has_table_privilege(
       'authenticated', 'private.content_media_deleted_content_ids', 'SELECT'
     )
     OR has_table_privilege(
       'authenticated', 'private.content_media_deleted_content_ids', 'INSERT'
     )
     OR has_table_privilege(
       'authenticated', 'private.content_media_deleted_content_ids', 'UPDATE'
     )
     OR has_table_privilege(
       'authenticated', 'private.content_media_deleted_content_ids', 'DELETE'
     )
     OR NOT has_table_privilege(
       'service_role', 'private.content_media_deleted_content_ids', 'SELECT'
     )
     OR NOT has_table_privilege(
       'service_role', 'private.content_media_deleted_content_ids', 'INSERT'
     )
     OR NOT has_table_privilege(
       'service_role', 'private.content_media_deleted_content_ids', 'UPDATE'
     )
     OR has_table_privilege(
       'service_role', 'private.content_media_deleted_content_ids', 'DELETE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_policies AS policy_info
       WHERE policy_info.schemaname = 'private'
         AND policy_info.tablename IN (
           'content_media_deletion_claims',
           'content_media_deleted_content_ids'
         )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_TOMBSTONE_ACL_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.content_media_cleanup_jobs AS job
    CROSS JOIN LATERAL unnest(job.object_paths) AS path(value)
    WHERE NOT EXISTS (
      SELECT 1
      FROM private.content_media_deletion_claims AS claim
      WHERE claim.bucket_id = job.bucket_id
        AND claim.object_path = path.value
    )
  )
  OR EXISTS (
    SELECT 1
    FROM private.content_media_deletion_claims AS claim
    WHERE NOT private.content_management_v2_cleanup_object_path_is_valid(
      claim.bucket_id,
      claim.object_path
    )
      OR (
        claim.deleted_at IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM storage.objects AS object
          WHERE object.bucket_id = claim.bucket_id
            AND object.name = claim.object_path
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM private.content_media_deleted_content_ids AS tombstone
    WHERE (
      tombstone.content_kind = 'script'
      AND EXISTS (
        SELECT 1
        FROM public.scripts AS script
        WHERE script.id = tombstone.content_id
      )
    ) OR (
      tombstone.content_kind = 'past_event_review'
      AND EXISTS (
        SELECT 1
        FROM public.past_event_reviews AS review
        WHERE review.id = tombstone.content_id
      )
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_TOMBSTONE_DATA_INVALID';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.policyname IN (
        'content_v2_script_protected_admin_insert',
        'content_v2_script_protected_admin_update',
        'content_v2_script_protected_admin_delete',
        'content_v2_script_protected_admin_insert_guard',
        'content_v2_script_protected_admin_update_guard',
        'content_v2_script_protected_admin_delete_guard',
        'content_v2_script_play_records_admin_insert',
        'content_v2_script_play_records_admin_update',
        'content_v2_script_play_records_admin_delete',
        'content_v2_script_play_records_admin_insert_guard',
        'content_v2_script_play_records_admin_update_guard',
        'content_v2_script_play_records_admin_delete_guard'
      )
      AND COALESCE(policy_info.qual, policy_info.with_check)
        ILIKE '%archived_at%IS NULL%'
  ) <> 12 THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_PARENT_ARCHIVE_POLICY_INVALID';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.policyname IN (
        'content_v2_reviews_authenticated_read',
        'content_v2_reviews_authenticated_read_guard',
        'content_v2_scripts_authenticated_read',
        'content_v2_scripts_authenticated_read_guard',
        'content_v2_settings_read',
        'content_v2_settings_read_guard',
        'member_master_script_play_records_active_self_read',
        'content_v2_script_play_records_read_guard'
      )
      AND policy_info.qual ILIKE '%record_scope%current%'
      AND policy_info.qual ILIKE '%membership_type%player%'
  ) <> 8 THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_PLAYER_IDENTITY_POLICY_INVALID';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'past_event_reviews'
      AND policy_info.policyname IN (
        'content_v2_reviews_authenticated_read',
        'content_v2_reviews_authenticated_read_guard'
      )
      AND policy_info.qual ILIKE '%large_activities_enabled%'
  ) <> 2
  OR (
    SELECT count(*)
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'scripts'
      AND policy_info.policyname IN (
        'content_v2_scripts_authenticated_read',
        'content_v2_scripts_authenticated_read_guard'
      )
      AND policy_info.qual ILIKE '%script_library_enabled%'
      AND policy_info.qual ILIKE '%social_scripts_enabled%'
      AND policy_info.qual ILIKE '%is_social_script%'
  ) <> 2
  OR pg_get_functiondef(
    'private.content_management_v2_can_read_protected_script(uuid)'::regprocedure
  ) NOT ILIKE '%script_library_enabled%'
  OR pg_get_functiondef(
    'private.content_management_v2_can_read_protected_script(uuid)'::regprocedure
  ) NOT ILIKE '%social_scripts_enabled%'
  OR pg_get_functiondef(
    'private.content_management_v2_can_read_protected_script(uuid)'::regprocedure
  ) NOT ILIKE '%is_social_script%' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_PLAYER_MODULE_POLICY_INVALID';
  END IF;

  v_function_definition := pg_get_functiondef(
    'private.content_management_v2_audit_change()'::regprocedure
  );
  IF v_function_definition NOT ILIKE '%CONTENT_MANAGEMENT_REASON_REQUIRED%'
     OR v_function_definition ILIKE '%Admin % on %'
     OR v_function_definition ILIKE '%Service % on %'
     OR v_function_definition ILIKE '%Authenticated % on %'
     OR v_function_definition ILIKE '%System % on %' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_AUDIT_REASON_NOT_STRICT';
  END IF;

  v_function_definition := pg_get_functiondef(
    'private.content_management_v2_referenced_paths(text,text[])'::regprocedure
  );
  IF v_function_definition NOT ILIKE '%script_protected_content%'
     OR v_function_definition NOT ILIKE '%scripts%'
     OR v_function_definition NOT ILIKE '%past_event_reviews%'
     OR v_function_definition NOT ILIKE '%cover_url%'
     OR v_function_definition NOT ILIKE '%gallery_urls%'
     OR v_function_definition NOT ILIKE '%CONTENT_MANAGEMENT_CLEANUP_PATH_INVALID%' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_GLOBAL_REFERENCE_HELPER_INVALID';
  END IF;

  v_function_definition := pg_get_functiondef(
    'public.content_media_cleanup_referenced_paths_v2(uuid,text,text[])'::regprocedure
  );
  IF v_function_definition NOT ILIKE '%content_media_cleanup_jobs%'
     OR v_function_definition NOT ILIKE '%content_media_deletion_claims%'
     OR v_function_definition NOT ILIKE '%content_management_v2_lock_media_paths%'
     OR v_function_definition NOT ILIKE '%content_management_v2_referenced_paths%'
     OR v_function_definition NOT ILIKE '%FROM public.content_media_cleanup_jobs%FOR SHARE%content_management_v2_lock_media_paths%'
     OR v_function_definition NOT ILIKE '%CONTENT_MANAGEMENT_CLEANUP_JOB_MISMATCH%'
     OR v_function_definition NOT ILIKE '%CONTENT_MANAGEMENT_CLEANUP_CLAIM_MISSING%' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_GLOBAL_REFERENCE_RPC_INVALID';
  END IF;

  v_function_definition := pg_get_functiondef(
    'public.content_media_cleanup_complete_claims_v2(uuid,text,text[])'::regprocedure
  );
  IF v_function_definition NOT ILIKE '%content_media_cleanup_jobs%'
     OR v_function_definition NOT ILIKE '%content_media_deletion_claims%'
     OR v_function_definition NOT ILIKE '%storage.objects%'
     OR v_function_definition NOT ILIKE '%content_management_v2_referenced_paths%'
     OR v_function_definition NOT ILIKE '%FROM public.content_media_cleanup_jobs%FOR SHARE%content_management_v2_lock_media_paths%'
     OR v_function_definition NOT ILIKE '%deleted_at%'
     OR v_function_definition NOT ILIKE '%CONTENT_MANAGEMENT_CLEANUP_NOT_COMPLETE%' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_CLEANUP_COMPLETION_RPC_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('private.content_management_v2_lock_content_id(text,uuid)'::regprocedure),
      ('private.content_management_v2_tombstone_content_id(text,uuid,text,uuid)'::regprocedure),
      ('private.content_management_v2_lock_media_paths(text,text[])'::regprocedure),
      ('private.content_management_v2_claim_media_paths(text,text[])'::regprocedure),
      ('private.content_management_v2_referenced_paths(text,text[])'::regprocedure),
      ('private.content_management_v2_claim_cleanup_job_paths()'::regprocedure),
      ('private.content_management_v2_guard_deleted_content_id()'::regprocedure),
      ('private.content_management_v2_guard_storage_content_fence()'::regprocedure),
      ('private.content_management_v2_assert_media_refs_available(text[],text[],uuid,text[],text[])'::regprocedure),
      ('private.content_management_v2_enqueue_removed_media(text,uuid,text[],text[],uuid,text[],text[])'::regprocedure),
      ('private.content_management_v2_guard_media_claims()'::regprocedure),
      ('private.content_management_v2_queue_removed_media()'::regprocedure),
      ('public.content_media_cleanup_referenced_paths_v2(uuid,text,text[])'::regprocedure),
      ('public.content_media_cleanup_complete_claims_v2(uuid,text,text[])'::regprocedure),
      ('public.admin_hard_delete_script_v2(uuid,text,timestamptz)'::regprocedure),
      ('public.admin_hard_delete_past_event_review_v2(uuid,text,timestamptz)'::regprocedure)
    ) AS expected(function_id)
    LEFT JOIN pg_proc AS function_info
      ON function_info.oid = expected.function_id
    WHERE function_info.oid IS NULL OR NOT function_info.prosecdef
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_SECURITY_DEFINER_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('private.content_management_v2_referenced_paths(text,text[])'::regprocedure),
      ('private.content_management_v2_lock_content_id(text,uuid)'::regprocedure),
      ('private.content_management_v2_tombstone_content_id(text,uuid,text,uuid)'::regprocedure),
      ('private.content_management_v2_lock_media_paths(text,text[])'::regprocedure),
      ('private.content_management_v2_claim_media_paths(text,text[])'::regprocedure),
      ('private.content_management_v2_claim_cleanup_job_paths()'::regprocedure),
      ('private.content_management_v2_guard_deleted_content_id()'::regprocedure),
      ('private.content_management_v2_guard_storage_content_fence()'::regprocedure),
      ('private.content_management_v2_public_media_refs(text[])'::regprocedure),
      ('private.content_management_v2_assert_media_refs_available(text[],text[],uuid,text[],text[])'::regprocedure),
      ('private.content_management_v2_enqueue_removed_media(text,uuid,text[],text[],uuid,text[],text[])'::regprocedure),
      ('private.content_management_v2_guard_media_claims()'::regprocedure),
      ('private.content_management_v2_queue_removed_media()'::regprocedure)
    ) AS expected(function_id)
    CROSS JOIN (VALUES
      ('anon'),
      ('authenticated'),
      ('service_role')
    ) AS caller(role_name)
    WHERE has_function_privilege(
      caller.role_name,
      expected.function_id,
      'EXECUTE'
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_PRIVATE_FUNCTION_ACL_INVALID';
  END IF;

  IF pg_get_functiondef(
    'private.content_management_v2_guard_archive_transition()'::regprocedure
  ) NOT ILIKE '%CONTENT_MANAGEMENT_ARCHIVED_ROW_IMMUTABLE%'
  OR pg_get_functiondef(
    'private.content_management_v2_guard_archive_transition()'::regprocedure
  ) NOT ILIKE '%v_old_business IS DISTINCT FROM v_new_business%'
  OR pg_get_functiondef(
    'private.content_management_v2_can_read_protected_script(uuid)'::regprocedure
  ) NOT ILIKE '%membership_type%player%'
  OR pg_get_functiondef(
    'private.content_management_v2_can_read_protected_script(uuid)'::regprocedure
  ) NOT ILIKE '%expires_at > now()%'
  OR pg_get_functiondef(
    'private.content_management_v2_lock_content_id(text,uuid)'::regprocedure
  ) NOT ILIKE '%pg_advisory_xact_lock%'
  OR pg_get_functiondef(
    'private.content_management_v2_lock_media_paths(text,text[])'::regprocedure
  ) NOT ILIKE '%pg_advisory_xact_lock%'
  OR pg_get_functiondef(
    'private.content_management_v2_lock_media_paths(text,text[])'::regprocedure
  ) NOT ILIKE '%ORDER BY path.value%'
  OR pg_get_functiondef(
    'private.content_management_v2_tombstone_content_id(text,uuid,text,uuid)'::regprocedure
  ) NOT ILIKE '%content_media_deleted_content_ids%ON CONFLICT%DO NOTHING%'
  OR pg_get_functiondef(
    'private.content_management_v2_assert_media_refs_available(text[],text[],uuid,text[],text[])'::regprocedure
  ) NOT ILIKE '%WITH touched AS%ORDER BY touched.bucket_id, touched.object_path%'
  OR pg_get_functiondef(
    'private.content_management_v2_assert_media_refs_available(text[],text[],uuid,text[],text[])'::regprocedure
  ) NOT ILIKE '%content_media_deletion_claims%storage.objects%'
  OR pg_get_functiondef(
    'private.content_management_v2_enqueue_removed_media(text,uuid,text[],text[],uuid,text[],text[])'::regprocedure
  ) NOT ILIKE '%EXCEPT%content_media_cleanup_jobs%'
  OR pg_get_functiondef(
    'private.content_management_v2_guard_deleted_content_id()'::regprocedure
  ) NOT ILIKE '%CONTENT_MANAGEMENT_CONTENT_ID_IMMUTABLE%content_media_deleted_content_ids%'
  OR pg_get_functiondef(
    'private.content_management_v2_guard_deleted_content_id()'::regprocedure
  ) NOT ILIKE '%CONTENT_MANAGEMENT_HARD_DELETE_RPC_REQUIRED%'
  OR pg_get_functiondef(
    'private.content_management_v2_guard_storage_content_fence()'::regprocedure
  ) NOT ILIKE '%lock_content_id%lock_media_paths%content_media_deleted_content_ids%content_media_deletion_claims%archived_at%'
  OR pg_get_functiondef(
    'private.content_management_v2_guard_storage_content_fence()'::regprocedure
  ) NOT ILIKE '%v_old_content_kind%v_new_content_kind%ORDER BY owner.content_kind, owner.content_id%ORDER BY object.bucket_id, object.object_path%'
  OR pg_get_functiondef(
    'private.content_management_v2_guard_storage_content_fence()'::regprocedure
  ) NOT ILIKE '%content_management_v2_referenced_paths%'
  OR pg_get_functiondef(
    'private.content_management_v2_guard_storage_content_fence()'::regprocedure
  ) NOT ILIKE '%CONTENT_MANAGEMENT_MEDIA_DELETE_CLAIM_REQUIRED%'
  OR pg_get_functiondef(
    'private.content_management_v2_guard_storage_content_fence()'::regprocedure
  ) NOT ILIKE '%CONTENT_MANAGEMENT_MEDIA_STILL_REFERENCED%'
  OR pg_get_functiondef(
    'private.content_management_v2_guard_storage_content_fence()'::regprocedure
  ) NOT ILIKE '%v_new_content_kind IS NOT NULL%TG_OP IN (''INSERT'', ''UPDATE'')%CONTENT_MANAGEMENT_CONTENT_ID_RETIRED%CONTENT_MANAGEMENT_MEDIA_PATH_CLAIMED%'
  OR pg_get_functiondef(
    'private.content_management_v2_public_media_refs(text[])'::regprocedure
  ) NOT ILIKE '%cleanup_object_path_is_valid%'
  OR pg_get_functiondef(
    'private.content_management_v2_public_media_refs(text[])'::regprocedure
  ) NOT ILIKE '%substring%strpos%char_length%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_script_v2(uuid,text,timestamptz)'::regprocedure
  ) NOT ILIKE '%content_media_cleanup_jobs%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_script_v2(uuid,text,timestamptz)'::regprocedure
  ) NOT ILIKE '%storage.objects%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_script_v2(uuid,text,timestamptz)'::regprocedure
  ) NOT ILIKE '%tombstone_content_id%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_script_v2(uuid,text,timestamptz)'::regprocedure
  ) NOT ILIKE '%content_management_v2_public_media_refs%v_public_group%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_script_v2(uuid,text,timestamptz)'::regprocedure
  ) NOT ILIKE '%p_expected_updated_at%CONTENT_MANAGEMENT_VERSION_CONFLICT%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_script_v2(uuid,text,timestamptz)'::regprocedure
  ) ILIKE '%LOCK TABLE storage.objects%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_past_event_review_v2(uuid,text,timestamptz)'::regprocedure
  ) NOT ILIKE '%content_media_cleanup_jobs%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_past_event_review_v2(uuid,text,timestamptz)'::regprocedure
  ) NOT ILIKE '%storage.objects%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_past_event_review_v2(uuid,text,timestamptz)'::regprocedure
  ) NOT ILIKE '%tombstone_content_id%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_past_event_review_v2(uuid,text,timestamptz)'::regprocedure
  ) NOT ILIKE '%content_management_v2_public_media_refs%gallery_urls%v_public_group%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_past_event_review_v2(uuid,text,timestamptz)'::regprocedure
  ) NOT ILIKE '%p_expected_updated_at%CONTENT_MANAGEMENT_VERSION_CONFLICT%'
  OR pg_get_functiondef(
    'public.admin_hard_delete_past_event_review_v2(uuid,text,timestamptz)'::regprocedure
  ) ILIKE '%LOCK TABLE storage.objects%' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_FUNCTION_GUARD_INVALID';
  END IF;

  IF to_regprocedure(
       'public.admin_hard_delete_script_v2(uuid,text)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.admin_hard_delete_past_event_review_v2(uuid,text)'
     ) IS NOT NULL
     OR NOT has_function_privilege(
       'authenticated',
       'public.admin_hard_delete_script_v2(uuid,text,timestamptz)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.admin_hard_delete_past_event_review_v2(uuid,text,timestamptz)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.admin_hard_delete_script_v2(uuid,text,timestamptz)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.admin_hard_delete_past_event_review_v2(uuid,text,timestamptz)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.admin_hard_delete_script_v2(uuid,text,timestamptz)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.admin_hard_delete_past_event_review_v2(uuid,text,timestamptz)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_HARD_DELETE_RPC_ACL_INVALID';
  END IF;
END
$do$;

COMMIT;
