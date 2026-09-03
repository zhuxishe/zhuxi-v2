-- Content Management V2: expand phase.
--
-- This migration deliberately keeps the legacy script content columns and the
-- public `scripts` bucket in place.  The application can therefore move to the
-- protected table without a flag day; a later contract migration may remove
-- the legacy columns and make the bucket private after every consumer has been
-- verified against short-lived signed URLs.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

SELECT pg_advisory_xact_lock(
  hashtextextended('content-management-v2-expand', 0)
);

-- Fail before changing anything when this migration is applied out of order.
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
    ('public.scripts', to_regclass('public.scripts') IS NOT NULL),
    ('storage.buckets', to_regclass('storage.buckets') IS NOT NULL),
    ('storage.objects', to_regclass('storage.objects') IS NOT NULL),
    ('private.member_master_current_admin_id()', to_regprocedure('private.member_master_current_admin_id()') IS NOT NULL),
    ('private.member_master_is_super_admin()', to_regprocedure('private.member_master_is_super_admin()') IS NOT NULL),
    ('public.is_admin()', to_regprocedure('public.is_admin()') IS NOT NULL),
    ('public.update_updated_at()', to_regprocedure('public.update_updated_at()') IS NOT NULL)
  ) AS required_object(object_name, is_present)
  WHERE NOT required_object.is_present;

  IF COALESCE(cardinality(v_missing), 0) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_DEPENDENCY_MISSING',
      DETAIL = array_to_string(v_missing, ', ');
  END IF;
END
$do$;

-- The previous isolation migration intentionally hid these fifteen catalogue
-- rows from the public site.  V2 restores them only after proving that every
-- expected stable source key is present, so a partial seed cannot be silently
-- published.
DO $do$
DECLARE
  v_present integer;
BEGIN
  WITH expected(source_key) AS (
    VALUES
      ('red-packet-luck-battle'),
      ('cat-mouse-game'),
      ('moonlit-wolf-feast'),
      ('fuji-q-adventure'),
      ('komatsuzawa-farm'),
      ('shinjuku-gyoen-color-picnic'),
      ('spring-2026-welcome-party'),
      ('kpop-party'),
      ('bbq-gathering'),
      ('team-games'),
      ('autumn-trip'),
      ('shibuya-party'),
      ('boardgame-party'),
      ('disney-trip'),
      ('zhuxi-founded')
  )
  SELECT count(*)
  INTO v_present
  FROM expected
  JOIN public.past_event_reviews AS review USING (source_key);

  IF v_present <> 15 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_LEGACY_ACTIVITY_SEED_INCOMPLETE',
      DETAIL = format('expected 15 rows, found %s', v_present);
  END IF;
END
$do$;

-- Convert a legacy Supabase public/signed object URL (or an already-relative
-- object key) into the path expected by Storage signing APIs.  External URLs
-- are rejected by the preflight below rather than being copied into a column
-- that claims to contain a `scripts` bucket path.
CREATE OR REPLACE FUNCTION private.content_management_v2_script_storage_path(
  p_value text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_value text := NULLIF(btrim(p_value), '');
  v_without_query text;
  v_match text[];
BEGIN
  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;

  v_without_query := split_part(v_value, '?', 1);
  v_match := regexp_match(
    v_without_query,
    '/storage/v1/object/(public|sign|authenticated)/scripts/(.+)$'
  );

  IF v_match IS NOT NULL THEN
    RETURN NULLIF(ltrim(v_match[2], '/'), '');
  END IF;

  IF v_without_query !~* '^[a-z][a-z0-9+.-]*://'
     AND v_without_query !~ '^//'
     AND v_without_query !~ '^/storage/' THEN
    RETURN NULLIF(ltrim(v_without_query, '/'), '');
  END IF;

  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_script_storage_path(text)
  FROM PUBLIC, anon, authenticated, service_role;

DO $do$
DECLARE
  v_script_id uuid;
  v_bad_value text;
BEGIN
  SELECT script.id, script.pdf_url
  INTO v_script_id, v_bad_value
  FROM public.scripts AS script
  WHERE NULLIF(btrim(script.pdf_url), '') IS NOT NULL
    AND private.content_management_v2_script_storage_path(script.pdf_url) IS NULL
  ORDER BY script.id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_V2_UNSUPPORTED_SCRIPT_PDF_URL',
      DETAIL = format('script_id=%s value=%s', v_script_id, left(v_bad_value, 200));
  END IF;

  SELECT script.id, page.value
  INTO v_script_id, v_bad_value
  FROM public.scripts AS script
  CROSS JOIN LATERAL unnest(COALESCE(script.page_images, ARRAY[]::text[]))
    WITH ORDINALITY AS page(value, position)
  WHERE NULLIF(btrim(page.value), '') IS NOT NULL
    AND private.content_management_v2_script_storage_path(page.value) IS NULL
  ORDER BY script.id, page.position
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_V2_UNSUPPORTED_SCRIPT_PAGE_URL',
      DETAIL = format('script_id=%s value=%s', v_script_id, left(v_bad_value, 200));
  END IF;
END
$do$;

-- -------------------------------------------------------------------------
-- Shared public metadata: independent Player visibility and recycle bin.
-- -------------------------------------------------------------------------

ALTER TABLE public.past_event_reviews
  ADD COLUMN IF NOT EXISTS is_player_visible boolean,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS audit_reason text,
  ADD COLUMN IF NOT EXISTS registration_status text,
  ADD COLUMN IF NOT EXISTS registration_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS registration_label text;

UPDATE public.past_event_reviews
SET is_player_visible = status IN ('published', 'cancelled')
WHERE is_player_visible IS NULL;

UPDATE public.past_event_reviews
SET registration_status = CASE
  WHEN status = 'cancelled' THEN 'ended'
  WHEN COALESCE(end_at, start_at, event_date::timestamptz) < now() THEN 'ended'
  WHEN NULLIF(btrim(registration_url), '') IS NOT NULL THEN 'open'
  ELSE 'coming_soon'
END
WHERE registration_status IS NULL;

ALTER TABLE public.past_event_reviews
  ALTER COLUMN is_player_visible SET DEFAULT false,
  ALTER COLUMN is_player_visible SET NOT NULL,
  ALTER COLUMN registration_status SET DEFAULT 'coming_soon',
  ALTER COLUMN registration_status SET NOT NULL,
  DROP CONSTRAINT IF EXISTS past_event_reviews_archived_by_fkey,
  DROP CONSTRAINT IF EXISTS past_event_reviews_archive_state_check,
  DROP CONSTRAINT IF EXISTS past_event_reviews_audit_reason_check,
  DROP CONSTRAINT IF EXISTS past_event_reviews_registration_status_check,
  DROP CONSTRAINT IF EXISTS past_event_reviews_registration_label_check,
  ADD CONSTRAINT past_event_reviews_archived_by_fkey
    FOREIGN KEY (archived_by) REFERENCES public.admin_users(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT past_event_reviews_archive_state_check CHECK (
    (
      archived_at IS NULL
      AND archived_by IS NULL
      AND archive_reason IS NULL
    )
    OR (
      archived_at IS NOT NULL
      AND archive_reason IS NOT NULL
      AND char_length(btrim(archive_reason)) BETWEEN 4 AND 500
    )
  ),
  ADD CONSTRAINT past_event_reviews_audit_reason_check CHECK (
    audit_reason IS NULL
    OR char_length(btrim(audit_reason)) BETWEEN 4 AND 500
  ),
  ADD CONSTRAINT past_event_reviews_registration_status_check CHECK (
    registration_status IN ('open', 'closed', 'coming_soon', 'ended')
  ),
  ADD CONSTRAINT past_event_reviews_registration_label_check CHECK (
    registration_label IS NULL
    OR char_length(btrim(registration_label)) BETWEEN 1 AND 80
  );

CREATE INDEX IF NOT EXISTS past_event_reviews_player_visible_idx
  ON public.past_event_reviews (
    is_player_visible,
    pin_in_player_library DESC,
    player_library_order,
    start_at DESC,
    event_date DESC
  )
  WHERE archived_at IS NULL
    AND status IN ('published', 'cancelled');

CREATE INDEX IF NOT EXISTS past_event_reviews_archive_idx
  ON public.past_event_reviews (archived_at DESC, id)
  WHERE archived_at IS NOT NULL;

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS is_player_visible boolean,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS audit_reason text;

UPDATE public.scripts
SET is_player_visible = is_published
WHERE is_player_visible IS NULL;

ALTER TABLE public.scripts
  ALTER COLUMN is_player_visible SET DEFAULT false,
  ALTER COLUMN is_player_visible SET NOT NULL,
  DROP CONSTRAINT IF EXISTS scripts_archived_by_fkey,
  DROP CONSTRAINT IF EXISTS scripts_archive_state_check,
  DROP CONSTRAINT IF EXISTS scripts_audit_reason_check,
  ADD CONSTRAINT scripts_archived_by_fkey
    FOREIGN KEY (archived_by) REFERENCES public.admin_users(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT scripts_archive_state_check CHECK (
    (
      archived_at IS NULL
      AND archived_by IS NULL
      AND archive_reason IS NULL
    )
    OR (
      archived_at IS NOT NULL
      AND archive_reason IS NOT NULL
      AND char_length(btrim(archive_reason)) BETWEEN 4 AND 500
    )
  ),
  ADD CONSTRAINT scripts_audit_reason_check CHECK (
    audit_reason IS NULL
    OR char_length(btrim(audit_reason)) BETWEEN 4 AND 500
  );

CREATE INDEX IF NOT EXISTS scripts_player_visible_idx
  ON public.scripts (
    is_player_visible,
    is_social_script,
    pin_in_social_library DESC,
    social_library_order,
    created_at DESC
  )
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS scripts_archive_idx
  ON public.scripts (archived_at DESC, id)
  WHERE archived_at IS NOT NULL;

-- Restore the established public catalogue only after the fifteen-row
-- assertion above has passed.
UPDATE public.past_event_reviews
SET is_published = true
WHERE source_key IN (
  'red-packet-luck-battle',
  'cat-mouse-game',
  'moonlit-wolf-feast',
  'fuji-q-adventure',
  'komatsuzawa-farm',
  'shinjuku-gyoen-color-picnic',
  'spring-2026-welcome-party',
  'kpop-party',
  'bbq-gathering',
  'team-games',
  'autumn-trip',
  'shibuya-party',
  'boardgame-party',
  'disney-trip',
  'zhuxi-founded'
);

-- -------------------------------------------------------------------------
-- Singleton module switches and home limits.
-- -------------------------------------------------------------------------

ALTER TABLE public.player_activity_settings
  ADD COLUMN IF NOT EXISTS large_activities_enabled boolean,
  ADD COLUMN IF NOT EXISTS social_scripts_enabled boolean,
  ADD COLUMN IF NOT EXISTS script_library_enabled boolean,
  ADD COLUMN IF NOT EXISTS large_home_limit smallint,
  ADD COLUMN IF NOT EXISTS audit_reason text;

INSERT INTO public.player_activity_settings (id, social_home_limit)
VALUES (1, 5)
ON CONFLICT (id) DO NOTHING;

UPDATE public.player_activity_settings
SET
  large_activities_enabled = COALESCE(large_activities_enabled, true),
  social_scripts_enabled = COALESCE(social_scripts_enabled, true),
  script_library_enabled = COALESCE(script_library_enabled, true),
  large_home_limit = COALESCE(large_home_limit, 2),
  social_home_limit = COALESCE(social_home_limit, 5)
WHERE id = 1;

ALTER TABLE public.player_activity_settings
  ALTER COLUMN large_activities_enabled SET DEFAULT true,
  ALTER COLUMN large_activities_enabled SET NOT NULL,
  ALTER COLUMN social_scripts_enabled SET DEFAULT true,
  ALTER COLUMN social_scripts_enabled SET NOT NULL,
  ALTER COLUMN script_library_enabled SET DEFAULT true,
  ALTER COLUMN script_library_enabled SET NOT NULL,
  ALTER COLUMN large_home_limit SET DEFAULT 2,
  ALTER COLUMN large_home_limit SET NOT NULL,
  DROP CONSTRAINT IF EXISTS player_activity_settings_social_limit,
  DROP CONSTRAINT IF EXISTS player_activity_settings_large_limit,
  DROP CONSTRAINT IF EXISTS player_activity_settings_audit_reason_check,
  ADD CONSTRAINT player_activity_settings_social_limit
    CHECK (social_home_limit BETWEEN 0 AND 12),
  ADD CONSTRAINT player_activity_settings_large_limit
    CHECK (large_home_limit BETWEEN 0 AND 12),
  ADD CONSTRAINT player_activity_settings_audit_reason_check CHECK (
    audit_reason IS NULL
    OR char_length(btrim(audit_reason)) BETWEEN 4 AND 500
  );

-- -------------------------------------------------------------------------
-- Time-bounded and revocable Player script grants.
-- -------------------------------------------------------------------------

ALTER TABLE public.script_play_records
  ADD COLUMN IF NOT EXISTS granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS granted_by uuid,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Existing member-master audit triggers must not turn this mechanical schema
-- backfill into one durable member-history event per row.
SELECT set_config('app.member_master_explicit_audit', 'on', true);

UPDATE public.script_play_records
SET
  granted_at = COALESCE(granted_at, created_at),
  updated_at = COALESCE(updated_at, created_at)
WHERE granted_at IS NULL OR updated_at IS NULL;

SELECT set_config('app.member_master_explicit_audit', 'off', true);

ALTER TABLE public.script_play_records
  ALTER COLUMN granted_at SET DEFAULT now(),
  ALTER COLUMN granted_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  DROP CONSTRAINT IF EXISTS script_play_records_granted_by_fkey,
  DROP CONSTRAINT IF EXISTS script_play_records_revoked_by_fkey,
  DROP CONSTRAINT IF EXISTS script_play_records_expiry_check,
  DROP CONSTRAINT IF EXISTS script_play_records_active_expiry_check,
  DROP CONSTRAINT IF EXISTS script_play_records_revocation_check,
  ADD CONSTRAINT script_play_records_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES public.admin_users(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT script_play_records_revoked_by_fkey
    FOREIGN KEY (revoked_by) REFERENCES public.admin_users(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT script_play_records_expiry_check CHECK (
    expires_at IS NULL OR expires_at > granted_at
  ),
  -- Preserve legacy NULL expiries without treating them as permanent access,
  -- while requiring every new or subsequently updated active grant to expire.
  ADD CONSTRAINT script_play_records_active_expiry_check CHECK (
    NOT can_view_full OR expires_at IS NOT NULL
  ) NOT VALID,
  ADD CONSTRAINT script_play_records_revocation_check CHECK (
    (revoked_at IS NULL OR revoked_at >= granted_at)
    AND (revoked_by IS NULL OR revoked_at IS NOT NULL)
    AND (NOT can_view_full OR revoked_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS script_play_records_effective_access_idx
  ON public.script_play_records (member_id, script_id, expires_at)
  WHERE can_view_full = true AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION private.content_management_v2_normalize_script_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.granted_at := COALESCE(NEW.granted_at, now());
    IF NEW.can_view_full THEN
      NEW.granted_by := COALESCE(NEW.granted_by, v_admin_id);
      NEW.revoked_at := NULL;
      NEW.revoked_by := NULL;
    END IF;
  ELSIF NEW.can_view_full
        AND (
          NOT OLD.can_view_full
          OR OLD.revoked_at IS NOT NULL
        ) THEN
    NEW.granted_at := now();
    NEW.granted_by := COALESCE(v_admin_id, NEW.granted_by);
    NEW.revoked_at := NULL;
    NEW.revoked_by := NULL;
  ELSIF OLD.can_view_full AND NOT NEW.can_view_full THEN
    NEW.revoked_at := COALESCE(NEW.revoked_at, now());
    NEW.revoked_by := COALESCE(NEW.revoked_by, v_admin_id);
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_normalize_script_grant()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS content_v2_05_normalize_script_grant
  ON public.script_play_records;
CREATE TRIGGER content_v2_05_normalize_script_grant
  BEFORE INSERT OR UPDATE ON public.script_play_records
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_normalize_script_grant();

DROP TRIGGER IF EXISTS script_play_records_updated_at
  ON public.script_play_records;
CREATE TRIGGER script_play_records_updated_at
  BEFORE UPDATE ON public.script_play_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- -------------------------------------------------------------------------
-- Protected script payload.  Only relative object paths are durable here;
-- signed URLs are generated on demand by the server and are never persisted.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.script_protected_content (
  script_id uuid PRIMARY KEY
    REFERENCES public.scripts(id) ON DELETE CASCADE,
  core_content_html text,
  roles jsonb,
  pdf_storage_path text,
  page_image_paths text[] NOT NULL DEFAULT '{}',
  page_count integer NOT NULL DEFAULT 0,
  audit_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL
);

ALTER TABLE public.script_protected_content
  ADD COLUMN IF NOT EXISTS core_content_html text,
  ADD COLUMN IF NOT EXISTS roles jsonb,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS page_image_paths text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS page_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audit_reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION private.content_management_v2_paths_are_relative(
  p_paths text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(bool_and(
    NULLIF(btrim(path.value), '') IS NOT NULL
    AND path.value !~* '^[a-z][a-z0-9+.-]*://'
    AND path.value !~ '^/'
    AND strpos(path.value, '?') = 0
  ), true)
  FROM unnest(COALESCE(p_paths, ARRAY[]::text[])) AS path(value)
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_paths_are_relative(text[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.content_management_v2_paths_are_relative(text[])
  TO authenticated, service_role;

UPDATE public.script_protected_content
SET
  page_image_paths = COALESCE(page_image_paths, ARRAY[]::text[]),
  page_count = cardinality(COALESCE(page_image_paths, ARRAY[]::text[])),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now())
WHERE page_image_paths IS NULL
   OR page_count IS DISTINCT FROM cardinality(
     COALESCE(page_image_paths, ARRAY[]::text[])
   )
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.script_protected_content
  ALTER COLUMN script_id SET NOT NULL,
  ALTER COLUMN page_image_paths SET DEFAULT '{}',
  ALTER COLUMN page_image_paths SET NOT NULL,
  ALTER COLUMN page_count SET DEFAULT 0,
  ALTER COLUMN page_count SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  DROP CONSTRAINT IF EXISTS script_protected_content_script_id_fkey,
  DROP CONSTRAINT IF EXISTS script_protected_content_updated_by_fkey,
  DROP CONSTRAINT IF EXISTS script_protected_content_roles_check,
  DROP CONSTRAINT IF EXISTS script_protected_content_pdf_path_check,
  DROP CONSTRAINT IF EXISTS script_protected_content_page_paths_check,
  DROP CONSTRAINT IF EXISTS script_protected_content_page_count_check,
  DROP CONSTRAINT IF EXISTS script_protected_content_audit_reason_check,
  ADD CONSTRAINT script_protected_content_script_id_fkey
    FOREIGN KEY (script_id) REFERENCES public.scripts(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT script_protected_content_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.admin_users(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT script_protected_content_roles_check CHECK (
    roles IS NULL OR jsonb_typeof(roles) = 'array'
  ),
  ADD CONSTRAINT script_protected_content_pdf_path_check CHECK (
    pdf_storage_path IS NULL
    OR (
      NULLIF(btrim(pdf_storage_path), '') IS NOT NULL
      AND pdf_storage_path !~* '^[a-z][a-z0-9+.-]*://'
      AND pdf_storage_path !~ '^/'
      AND strpos(pdf_storage_path, '?') = 0
    )
  ),
  ADD CONSTRAINT script_protected_content_page_paths_check CHECK (
    private.content_management_v2_paths_are_relative(page_image_paths)
  ),
  ADD CONSTRAINT script_protected_content_page_count_check CHECK (
    page_count >= 0
    AND page_count = cardinality(page_image_paths)
  ),
  ADD CONSTRAINT script_protected_content_audit_reason_check CHECK (
    audit_reason IS NULL
    OR char_length(btrim(audit_reason)) BETWEEN 4 AND 500
  );

INSERT INTO public.script_protected_content (
  script_id,
  core_content_html,
  roles,
  pdf_storage_path,
  page_image_paths,
  page_count,
  created_at,
  updated_at,
  updated_by
)
SELECT
  script.id,
  script.content_html,
  script.roles,
  private.content_management_v2_script_storage_path(script.pdf_url),
  ARRAY(
    SELECT private.content_management_v2_script_storage_path(page.value)
    FROM unnest(COALESCE(script.page_images, ARRAY[]::text[]))
      WITH ORDINALITY AS page(value, position)
    WHERE NULLIF(btrim(page.value), '') IS NOT NULL
    ORDER BY page.position
  ),
  cardinality(ARRAY(
    SELECT page.value
    FROM unnest(COALESCE(script.page_images, ARRAY[]::text[])) AS page(value)
    WHERE NULLIF(btrim(page.value), '') IS NOT NULL
  )),
  script.created_at,
  script.updated_at,
  script.created_by
FROM public.scripts AS script
ON CONFLICT (script_id) DO NOTHING;

DROP TRIGGER IF EXISTS script_protected_content_updated_at
  ON public.script_protected_content;
CREATE TRIGGER script_protected_content_updated_at
  BEFORE UPDATE ON public.script_protected_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- During expand, keep legacy writers functional by copying only legacy
-- sensitive columns into the protected row.  New writers should write the
-- protected table directly.  There is intentionally no reverse sync.
CREATE OR REPLACE FUNCTION private.content_management_v2_sync_legacy_script_protected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_page_paths text[];
  v_pdf_path text;
  v_reason text := NULLIF(
    btrim(current_setting('app.content_v2_audit_reason', true)),
    ''
  );
BEGIN
  -- The V2 create flow writes metadata first and inserts the protected row in
  -- a second statement.  Do not pre-create an empty row that would turn that
  -- intentional INSERT into a duplicate-key failure.  Legacy creates that
  -- still carry any protected payload continue to be mirrored.
  IF TG_OP = 'INSERT'
     AND NULLIF(btrim(NEW.content_html), '') IS NULL
     AND NEW.roles IS NULL
     AND NULLIF(btrim(NEW.pdf_url), '') IS NULL
     AND cardinality(COALESCE(NEW.page_images, ARRAY[]::text[])) = 0
     AND COALESCE(NEW.page_count, 0) = 0 THEN
    RETURN NEW;
  END IF;

  v_pdf_path := private.content_management_v2_script_storage_path(NEW.pdf_url);
  IF NULLIF(btrim(NEW.pdf_url), '') IS NOT NULL AND v_pdf_path IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_V2_UNSUPPORTED_SCRIPT_PDF_URL',
      DETAIL = format('script_id=%s', NEW.id);
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(NEW.page_images, ARRAY[]::text[])) AS page(value)
    WHERE NULLIF(btrim(page.value), '') IS NOT NULL
      AND private.content_management_v2_script_storage_path(page.value) IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CONTENT_V2_UNSUPPORTED_SCRIPT_PAGE_URL',
      DETAIL = format('script_id=%s', NEW.id);
  END IF;

  SELECT ARRAY(
    SELECT private.content_management_v2_script_storage_path(page.value)
    FROM unnest(COALESCE(NEW.page_images, ARRAY[]::text[]))
      WITH ORDINALITY AS page(value, position)
    WHERE NULLIF(btrim(page.value), '') IS NOT NULL
    ORDER BY page.position
  )
  INTO v_page_paths;

  INSERT INTO public.script_protected_content (
    script_id,
    core_content_html,
    roles,
    pdf_storage_path,
    page_image_paths,
    page_count,
    audit_reason,
    created_at,
    updated_at,
    updated_by
  ) VALUES (
    NEW.id,
    NEW.content_html,
    NEW.roles,
    v_pdf_path,
    v_page_paths,
    cardinality(v_page_paths),
    COALESCE(v_reason, 'Legacy script content synchronization'),
    NEW.created_at,
    NEW.updated_at,
    private.member_master_current_admin_id()
  )
  ON CONFLICT (script_id) DO UPDATE SET
    core_content_html = EXCLUDED.core_content_html,
    roles = EXCLUDED.roles,
    pdf_storage_path = EXCLUDED.pdf_storage_path,
    page_image_paths = EXCLUDED.page_image_paths,
    page_count = EXCLUDED.page_count,
    audit_reason = EXCLUDED.audit_reason,
    updated_by = COALESCE(EXCLUDED.updated_by, public.script_protected_content.updated_by)
  WHERE (
    public.script_protected_content.core_content_html,
    public.script_protected_content.roles,
    public.script_protected_content.pdf_storage_path,
    public.script_protected_content.page_image_paths,
    public.script_protected_content.page_count
  ) IS DISTINCT FROM (
    EXCLUDED.core_content_html,
    EXCLUDED.roles,
    EXCLUDED.pdf_storage_path,
    EXCLUDED.page_image_paths,
    EXCLUDED.page_count
  );

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_sync_legacy_script_protected()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS content_v2_90_sync_legacy_script_protected
  ON public.scripts;
CREATE TRIGGER content_v2_90_sync_legacy_script_protected
  AFTER INSERT OR UPDATE OF content_html, roles, pdf_url, page_images, page_count
  ON public.scripts
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_sync_legacy_script_protected();

-- -------------------------------------------------------------------------
-- Recycle-bin guard and value-free content audit.
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
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
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
  ELSIF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
    IF NOT v_is_super_admin THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'CONTENT_MANAGEMENT_SUPER_ADMIN_REQUIRED';
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
  ELSIF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NOT NULL
        AND NOT v_is_super_admin THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_MANAGEMENT_ARCHIVED_ROW_IMMUTABLE';
  ELSIF NEW.archived_at IS NULL
        AND (
          NEW.archived_by IS NOT NULL
          OR NEW.archive_reason IS NOT NULL
        ) THEN
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
    NULLIF(btrim(current_setting('app.content_v2_audit_reason', true)), ''),
    CASE
      WHEN v_admin_id IS NOT NULL
        THEN 'Admin ' || TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
      WHEN COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role'
        THEN 'Service ' || TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
      WHEN (SELECT auth.uid()) IS NOT NULL
        THEN 'Authenticated ' || TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
      ELSE 'System ' || TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    END
  );

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

  -- Content values intentionally remain empty.  The audit retains only which
  -- fields changed, the stable record locator, actor snapshot, and reason.
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

DROP TRIGGER IF EXISTS content_v2_00_guard_archive_transition
  ON public.past_event_reviews;
CREATE TRIGGER content_v2_00_guard_archive_transition
  BEFORE INSERT OR UPDATE ON public.past_event_reviews
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_guard_archive_transition();

DROP TRIGGER IF EXISTS content_v2_10_audit_change
  ON public.past_event_reviews;
CREATE TRIGGER content_v2_10_audit_change
  BEFORE INSERT OR UPDATE OR DELETE ON public.past_event_reviews
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_audit_change();

DROP TRIGGER IF EXISTS content_v2_00_guard_archive_transition
  ON public.scripts;
CREATE TRIGGER content_v2_00_guard_archive_transition
  BEFORE INSERT OR UPDATE ON public.scripts
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_guard_archive_transition();

DROP TRIGGER IF EXISTS content_v2_10_audit_change
  ON public.scripts;
CREATE TRIGGER content_v2_10_audit_change
  BEFORE INSERT OR UPDATE OR DELETE ON public.scripts
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_audit_change();

DROP TRIGGER IF EXISTS content_v2_10_audit_change
  ON public.player_activity_settings;
CREATE TRIGGER content_v2_10_audit_change
  BEFORE INSERT OR UPDATE OR DELETE ON public.player_activity_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_audit_change();

DROP TRIGGER IF EXISTS content_v2_10_audit_change
  ON public.script_protected_content;
CREATE TRIGGER content_v2_10_audit_change
  BEFORE INSERT OR UPDATE OR DELETE ON public.script_protected_content
  FOR EACH ROW
  EXECUTE FUNCTION private.content_management_v2_audit_change();

-- -------------------------------------------------------------------------
-- Data API access.  Restrictive guards provide an upper bound even if another
-- permissive policy is introduced later.  Deletes stay off the authenticated
-- table ACL and are available only through the two audited RPCs below.
-- -------------------------------------------------------------------------

ALTER TABLE public.past_event_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_activity_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_protected_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_read_published_reviews"
  ON public.past_event_reviews;
DROP POLICY IF EXISTS "admin_all_reviews"
  ON public.past_event_reviews;
DROP POLICY IF EXISTS approved_members_read_player_activity_reviews
  ON public.past_event_reviews;
DROP POLICY IF EXISTS content_v2_reviews_anon_read
  ON public.past_event_reviews;
DROP POLICY IF EXISTS content_v2_reviews_authenticated_read
  ON public.past_event_reviews;
DROP POLICY IF EXISTS content_v2_reviews_admin_insert
  ON public.past_event_reviews;
DROP POLICY IF EXISTS content_v2_reviews_admin_update
  ON public.past_event_reviews;
DROP POLICY IF EXISTS content_v2_reviews_anon_read_guard
  ON public.past_event_reviews;
DROP POLICY IF EXISTS content_v2_reviews_authenticated_read_guard
  ON public.past_event_reviews;
DROP POLICY IF EXISTS content_v2_reviews_admin_insert_guard
  ON public.past_event_reviews;
DROP POLICY IF EXISTS content_v2_reviews_admin_update_guard
  ON public.past_event_reviews;

CREATE POLICY content_v2_reviews_anon_read
  ON public.past_event_reviews
  FOR SELECT TO anon
  USING (is_published = true AND archived_at IS NULL);
CREATE POLICY content_v2_reviews_anon_read_guard
  ON public.past_event_reviews
  AS RESTRICTIVE
  FOR SELECT TO anon
  USING (is_published = true AND archived_at IS NULL);

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
          )
        )
      )
    )
  );

CREATE POLICY content_v2_reviews_admin_insert
  ON public.past_event_reviews
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY content_v2_reviews_admin_insert_guard
  ON public.past_event_reviews
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY content_v2_reviews_admin_update
  ON public.past_event_reviews
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY content_v2_reviews_admin_update_guard
  ON public.past_event_reviews
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "admin_all_scripts" ON public.scripts;
DROP POLICY IF EXISTS "player_read_published" ON public.scripts;
DROP POLICY IF EXISTS "anon_read_published" ON public.scripts;
DROP POLICY IF EXISTS content_v2_scripts_anon_read ON public.scripts;
DROP POLICY IF EXISTS content_v2_scripts_authenticated_read ON public.scripts;
DROP POLICY IF EXISTS content_v2_scripts_admin_insert ON public.scripts;
DROP POLICY IF EXISTS content_v2_scripts_admin_update ON public.scripts;
DROP POLICY IF EXISTS content_v2_scripts_anon_read_guard ON public.scripts;
DROP POLICY IF EXISTS content_v2_scripts_authenticated_read_guard ON public.scripts;
DROP POLICY IF EXISTS content_v2_scripts_admin_insert_guard ON public.scripts;
DROP POLICY IF EXISTS content_v2_scripts_admin_update_guard ON public.scripts;

CREATE POLICY content_v2_scripts_anon_read
  ON public.scripts
  FOR SELECT TO anon
  USING (is_published = true AND archived_at IS NULL);
CREATE POLICY content_v2_scripts_anon_read_guard
  ON public.scripts
  AS RESTRICTIVE
  FOR SELECT TO anon
  USING (is_published = true AND archived_at IS NULL);

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
          )
        )
      )
    )
  );

CREATE POLICY content_v2_scripts_admin_insert
  ON public.scripts
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY content_v2_scripts_admin_insert_guard
  ON public.scripts
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY content_v2_scripts_admin_update
  ON public.scripts
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY content_v2_scripts_admin_update_guard
  ON public.scripts
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS approved_members_or_admin_read_player_activity_settings
  ON public.player_activity_settings;
DROP POLICY IF EXISTS admin_update_player_activity_settings
  ON public.player_activity_settings;
DROP POLICY IF EXISTS content_v2_settings_read
  ON public.player_activity_settings;
DROP POLICY IF EXISTS content_v2_settings_super_update
  ON public.player_activity_settings;
DROP POLICY IF EXISTS content_v2_settings_read_guard
  ON public.player_activity_settings;
DROP POLICY IF EXISTS content_v2_settings_super_update_guard
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
    )
  );
CREATE POLICY content_v2_settings_super_update
  ON public.player_activity_settings
  FOR UPDATE TO authenticated
  USING ((SELECT private.member_master_is_super_admin()))
  WITH CHECK (
    (SELECT private.member_master_is_super_admin())
    AND id = 1
  );
CREATE POLICY content_v2_settings_super_update_guard
  ON public.player_activity_settings
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT private.member_master_is_super_admin()))
  WITH CHECK (
    (SELECT private.member_master_is_super_admin())
    AND id = 1
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
        AND script.is_player_visible = true
        AND script.archived_at IS NULL
        AND play.can_view_full = true
        AND play.granted_at <= now()
        AND play.revoked_at IS NULL
        -- NULL is retained for historical rows but never means permanent
        -- access.  Every effective V2 grant must have a future expiry.
        AND play.expires_at > now()
    )
$function$;

REVOKE ALL ON FUNCTION private.content_management_v2_can_read_protected_script(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.content_management_v2_can_read_protected_script(uuid)
  TO authenticated;

DROP POLICY IF EXISTS content_v2_script_protected_read
  ON public.script_protected_content;
DROP POLICY IF EXISTS content_v2_script_protected_admin_insert
  ON public.script_protected_content;
DROP POLICY IF EXISTS content_v2_script_protected_admin_update
  ON public.script_protected_content;
DROP POLICY IF EXISTS content_v2_script_protected_read_guard
  ON public.script_protected_content;
DROP POLICY IF EXISTS content_v2_script_protected_admin_insert_guard
  ON public.script_protected_content;
DROP POLICY IF EXISTS content_v2_script_protected_admin_update_guard
  ON public.script_protected_content;

CREATE POLICY content_v2_script_protected_read
  ON public.script_protected_content
  FOR SELECT TO authenticated
  USING (
    private.content_management_v2_can_read_protected_script(script_id)
  );
CREATE POLICY content_v2_script_protected_read_guard
  ON public.script_protected_content
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    private.content_management_v2_can_read_protected_script(script_id)
  );
CREATE POLICY content_v2_script_protected_admin_insert
  ON public.script_protected_content
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY content_v2_script_protected_admin_insert_guard
  ON public.script_protected_content
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY content_v2_script_protected_admin_update
  ON public.script_protected_content
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY content_v2_script_protected_admin_update_guard
  ON public.script_protected_content
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- Normalize table ACLs.  The service role remains the trusted server path;
-- authenticated deletion is intentionally absent.
REVOKE ALL ON TABLE
  public.past_event_reviews,
  public.scripts,
  public.player_activity_settings,
  public.script_protected_content
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.past_event_reviews, public.scripts TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.past_event_reviews,
  public.scripts,
  public.script_protected_content
TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.player_activity_settings
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.past_event_reviews,
  public.scripts,
  public.player_activity_settings,
  public.script_protected_content
TO service_role;

-- Keep the already-established play-record ACL and make it explicit after the
-- new grant columns are added.  Authenticated users have no direct DELETE.
REVOKE ALL ON TABLE public.script_play_records
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.script_play_records
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.script_play_records
  TO service_role;

-- -------------------------------------------------------------------------
-- Storage expand phase.  These buckets remain public until the contract
-- migration, but authenticated Storage mutations in `scripts` are admin-only.
-- Player delivery must use server-generated, short-lived signed URLs.
-- -------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('scripts', 'scripts', true),
  ('scripts-covers', 'scripts-covers', true),
  ('activity-media', 'activity-media', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DROP POLICY IF EXISTS content_v2_scripts_storage_admin_select
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_scripts_storage_admin_insert
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_scripts_storage_admin_update
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_scripts_storage_admin_delete
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_scripts_storage_admin_select_guard
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_scripts_storage_admin_insert_guard
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_scripts_storage_admin_update_guard
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_scripts_storage_admin_delete_guard
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_activity_media_service_insert_guard
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_activity_media_service_update_guard
  ON storage.objects;
DROP POLICY IF EXISTS content_v2_activity_media_service_delete_guard
  ON storage.objects;

CREATE POLICY content_v2_scripts_storage_admin_select
  ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'scripts' AND (SELECT public.is_admin()));
CREATE POLICY content_v2_scripts_storage_admin_insert
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'scripts' AND (SELECT public.is_admin()));
CREATE POLICY content_v2_scripts_storage_admin_update
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'scripts' AND (SELECT public.is_admin()))
  WITH CHECK (bucket_id = 'scripts' AND (SELECT public.is_admin()));
CREATE POLICY content_v2_scripts_storage_admin_delete
  ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'scripts' AND (SELECT public.is_admin()));

-- These restrictive policies do not affect other buckets.  For `scripts`,
-- they prevent an unrelated future permissive policy from admitting a
-- non-admin authenticated client.
CREATE POLICY content_v2_scripts_storage_admin_select_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (bucket_id <> 'scripts' OR (SELECT public.is_admin()));
CREATE POLICY content_v2_scripts_storage_admin_insert_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'scripts' OR (SELECT public.is_admin()));
CREATE POLICY content_v2_scripts_storage_admin_update_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (bucket_id <> 'scripts' OR (SELECT public.is_admin()))
  WITH CHECK (bucket_id <> 'scripts' OR (SELECT public.is_admin()));
CREATE POLICY content_v2_scripts_storage_admin_delete_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (bucket_id <> 'scripts' OR (SELECT public.is_admin()));

-- Activity media is uploaded and removed only through the validated server
-- route.  Restrictive denials keep direct authenticated Storage writes closed
-- even if another permissive policy later covers the bucket.
CREATE POLICY content_v2_activity_media_service_insert_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'activity-media');
CREATE POLICY content_v2_activity_media_service_update_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (bucket_id <> 'activity-media')
  WITH CHECK (bucket_id <> 'activity-media');
CREATE POLICY content_v2_activity_media_service_delete_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (bucket_id <> 'activity-media');

-- -------------------------------------------------------------------------
-- Super-admin-only permanent deletion.  Both functions lock and re-check the
-- archived target, propagate one audited reason through all cascading rows,
-- and expose no table-level authenticated DELETE grant.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_hard_delete_script_v2(
  p_script_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_archived_at timestamptz;
  v_reason text := NULLIF(btrim(p_reason), '');
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

  SELECT script.archived_at
  INTO STRICT v_archived_at
  FROM public.scripts AS script
  WHERE script.id = p_script_id
  FOR UPDATE;

  IF v_archived_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_MANAGEMENT_NOT_ARCHIVED';
  END IF;

  PERFORM set_config('app.content_v2_audit_reason', v_reason, true);
  PERFORM set_config('app.member_master_audit_reason', v_reason, true);

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
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_archived_at timestamptz;
  v_reason text := NULLIF(btrim(p_reason), '');
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

  SELECT review.archived_at
  INTO STRICT v_archived_at
  FROM public.past_event_reviews AS review
  WHERE review.id = p_review_id
  FOR UPDATE;

  IF v_archived_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_MANAGEMENT_NOT_ARCHIVED';
  END IF;

  PERFORM set_config('app.content_v2_audit_reason', v_reason, true);

  DELETE FROM public.past_event_reviews AS review
  WHERE review.id = p_review_id;
EXCEPTION
  WHEN no_data_found THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'CONTENT_MANAGEMENT_TARGET_NOT_FOUND';
END
$function$;

REVOKE ALL ON FUNCTION public.admin_hard_delete_script_v2(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_hard_delete_past_event_review_v2(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_script_v2(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_past_event_review_v2(uuid, text)
  TO authenticated;

-- -------------------------------------------------------------------------
-- Postflight assertions.  These are part of the migration so Preview cannot
-- report success with a partial ACL, missing backfill, or accidentally private
-- expand-phase bucket.
-- -------------------------------------------------------------------------

DO $do$
DECLARE
  v_missing_columns text[];
  v_legacy_published integer;
BEGIN
  SELECT array_agg(expected.table_name || '.' || expected.column_name)
  INTO v_missing_columns
  FROM (VALUES
    ('past_event_reviews', 'is_player_visible'),
    ('past_event_reviews', 'archived_at'),
    ('past_event_reviews', 'archived_by'),
    ('past_event_reviews', 'archive_reason'),
    ('past_event_reviews', 'audit_reason'),
    ('past_event_reviews', 'registration_status'),
    ('past_event_reviews', 'registration_deadline'),
    ('past_event_reviews', 'registration_label'),
    ('scripts', 'is_player_visible'),
    ('scripts', 'archived_at'),
    ('scripts', 'archived_by'),
    ('scripts', 'archive_reason'),
    ('scripts', 'audit_reason'),
    ('player_activity_settings', 'large_activities_enabled'),
    ('player_activity_settings', 'social_scripts_enabled'),
    ('player_activity_settings', 'script_library_enabled'),
    ('player_activity_settings', 'large_home_limit'),
    ('script_play_records', 'granted_at'),
    ('script_play_records', 'expires_at'),
    ('script_play_records', 'revoked_at'),
    ('script_play_records', 'granted_by'),
    ('script_play_records', 'revoked_by'),
    ('script_play_records', 'updated_at'),
    ('script_protected_content', 'core_content_html'),
    ('script_protected_content', 'roles'),
    ('script_protected_content', 'pdf_storage_path'),
    ('script_protected_content', 'page_image_paths'),
    ('script_protected_content', 'page_count'),
    ('script_protected_content', 'audit_reason')
  ) AS expected(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = expected.table_name
      AND column_info.column_name = expected.column_name
  );

  IF COALESCE(cardinality(v_missing_columns), 0) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_POSTFLIGHT_COLUMN_MISSING',
      DETAIL = array_to_string(v_missing_columns, ', ');
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
      MESSAGE = 'CONTENT_V2_PROTECTED_BACKFILL_INCOMPLETE';
  END IF;

  SELECT count(*)
  INTO v_legacy_published
  FROM public.past_event_reviews AS review
  WHERE review.source_key IN (
    'red-packet-luck-battle',
    'cat-mouse-game',
    'moonlit-wolf-feast',
    'fuji-q-adventure',
    'komatsuzawa-farm',
    'shinjuku-gyoen-color-picnic',
    'spring-2026-welcome-party',
    'kpop-party',
    'bbq-gathering',
    'team-games',
    'autumn-trip',
    'shibuya-party',
    'boardgame-party',
    'disney-trip',
    'zhuxi-founded'
  )
    AND review.is_published = true;

  IF v_legacy_published <> 15 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_LEGACY_ACTIVITY_RESTORE_INCOMPLETE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.player_activity_settings AS settings
    WHERE settings.id = 1
      AND settings.large_home_limit BETWEEN 0 AND 12
      AND settings.social_home_limit BETWEEN 0 AND 12
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_SETTINGS_SINGLETON_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid = 'public.script_play_records'::regclass
      AND constraint_info.conname = 'script_play_records_active_expiry_check'
      AND constraint_info.contype = 'c'
      AND NOT constraint_info.convalidated
      AND pg_get_constraintdef(constraint_info.oid)
        ILIKE '%NOT can_view_full%expires_at IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_ACTIVE_GRANT_EXPIRY_GUARD_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid = 'public.script_protected_content'::regclass
      AND constraint_info.conname = 'script_protected_content_page_count_check'
      AND pg_get_constraintdef(constraint_info.oid)
        ILIKE '%page_count = cardinality(page_image_paths)%'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_PAGE_COUNT_GUARD_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('past_event_reviews'),
      ('scripts'),
      ('player_activity_settings'),
      ('script_protected_content')
    ) AS expected(table_name)
    LEFT JOIN pg_class AS relation
      ON relation.relname = expected.table_name
      AND relation.relnamespace = 'public'::regnamespace
    WHERE relation.oid IS NULL OR NOT relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_RLS_NOT_ENABLED';
  END IF;

  IF has_table_privilege('authenticated', 'public.scripts', 'DELETE')
     OR has_table_privilege('authenticated', 'public.past_event_reviews', 'DELETE')
     OR has_table_privilege('authenticated', 'public.script_protected_content', 'DELETE')
     OR has_table_privilege('anon', 'public.script_protected_content', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.script_protected_content', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.script_protected_content', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.script_protected_content', 'UPDATE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_TABLE_ACL_INVALID';
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
        'content_v2_settings_read_guard'
      )
      AND policy_info.qual ILIKE '%record_scope%current%'
  ) <> 6
  OR pg_get_functiondef(
    'private.content_management_v2_can_read_protected_script(uuid)'::regprocedure
  ) NOT ILIKE '%record_scope%current%'
  OR pg_get_functiondef(
    'private.content_management_v2_can_read_protected_script(uuid)'::regprocedure
  ) NOT ILIKE '%expires_at > now()%'
  OR pg_get_functiondef(
    'private.content_management_v2_can_read_protected_script(uuid)'::regprocedure
  ) ILIKE '%expires_at IS NULL%' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_PROTECTED_ACCESS_GUARD_INVALID';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.admin_hard_delete_script_v2(uuid,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.admin_hard_delete_past_event_review_v2(uuid,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.admin_hard_delete_script_v2(uuid,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.admin_hard_delete_past_event_review_v2(uuid,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'CONTENT_V2_RPC_ACL_INVALID';
  END IF;

  IF (
    SELECT count(*)
    FROM storage.buckets AS bucket
    WHERE bucket.id IN ('scripts', 'scripts-covers', 'activity-media')
      AND bucket.public = true
  ) <> 3 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_EXPAND_BUCKET_INVALID';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'storage'
      AND policy_info.tablename = 'objects'
      AND policy_info.policyname IN (
        'content_v2_scripts_storage_admin_select',
        'content_v2_scripts_storage_admin_insert',
        'content_v2_scripts_storage_admin_update',
        'content_v2_scripts_storage_admin_delete',
        'content_v2_scripts_storage_admin_select_guard',
        'content_v2_scripts_storage_admin_insert_guard',
        'content_v2_scripts_storage_admin_update_guard',
        'content_v2_scripts_storage_admin_delete_guard',
        'content_v2_activity_media_service_insert_guard',
        'content_v2_activity_media_service_update_guard',
        'content_v2_activity_media_service_delete_guard'
      )
  ) <> 11 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_STORAGE_POLICY_INCOMPLETE';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_trigger AS trigger_info
    JOIN pg_class AS relation ON relation.oid = trigger_info.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE NOT trigger_info.tgisinternal
      AND namespace.nspname = 'public'
      AND trigger_info.tgname = 'content_v2_10_audit_change'
      AND relation.relname IN (
        'past_event_reviews',
        'scripts',
        'player_activity_settings',
        'script_protected_content'
      )
  ) <> 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_AUDIT_TRIGGER_INCOMPLETE';
  END IF;
END
$do$;

COMMIT;
