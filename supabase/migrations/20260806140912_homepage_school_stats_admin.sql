-- Homepage school statistics: public singleton, immutable publish history,
-- and super-admin-only atomic publish / restore RPCs.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.homepage_school_stats_featured_schools_valid(
  p_featured_schools jsonb,
  p_total_members integer
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  school jsonb;
  school_id text;
  school_zh text;
  school_ja text;
  school_count numeric;
  total_count numeric := 0;
  seen_ids text[] := ARRAY[]::text[];
  seen_zh text[] := ARRAY[]::text[];
  seen_ja text[] := ARRAY[]::text[];
BEGIN
  IF p_total_members IS NULL OR p_total_members < 0 THEN
    RETURN false;
  END IF;

  IF p_featured_schools IS NULL THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_featured_schools) <> 'array' THEN
    RETURN false;
  END IF;

  IF jsonb_array_length(p_featured_schools) > 7 THEN
    RETURN false;
  END IF;

  FOR school IN SELECT value FROM jsonb_array_elements(p_featured_schools)
  LOOP
    IF jsonb_typeof(school) <> 'object' THEN
      RETURN false;
    END IF;

    IF NOT (school ?& ARRAY['id', 'zh', 'ja', 'count'])
      OR (SELECT count(*) FROM jsonb_object_keys(school)) <> 4
    THEN
      RETURN false;
    END IF;

    IF jsonb_typeof(school->'id') <> 'string'
      OR jsonb_typeof(school->'zh') <> 'string'
      OR jsonb_typeof(school->'ja') <> 'string'
      OR jsonb_typeof(school->'count') <> 'number'
    THEN
      RETURN false;
    END IF;

    school_id := btrim(school->>'id');
    school_zh := btrim(school->>'zh');
    school_ja := btrim(school->>'ja');
    school_count := (school->>'count')::numeric;

    IF school_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
      OR lower(school_id) = 'other'
      OR char_length(school_zh) NOT BETWEEN 1 AND 40
      OR char_length(school_ja) NOT BETWEEN 1 AND 40
      OR school_count < 0
      OR school_count <> trunc(school_count)
      OR school_count > 2147483647
      OR school_zh IN ('其他', '其它')
      OR school_ja = 'その他'
    THEN
      RETURN false;
    END IF;

    IF school_id = ANY(seen_ids)
      OR lower(school_zh) = ANY(seen_zh)
      OR lower(school_ja) = ANY(seen_ja)
    THEN
      RETURN false;
    END IF;

    seen_ids := array_append(seen_ids, school_id);
    seen_zh := array_append(seen_zh, lower(school_zh));
    seen_ja := array_append(seen_ja, lower(school_ja));
    total_count := total_count + school_count;
  END LOOP;

  RETURN total_count <= p_total_members;
EXCEPTION
  WHEN others THEN
    RETURN false;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.homepage_school_stats (
  id smallint PRIMARY KEY DEFAULT 1,
  total_members integer NOT NULL,
  total_schools integer NOT NULL,
  featured_schools jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homepage_school_stats_singleton CHECK (id = 1),
  CONSTRAINT homepage_school_stats_total_members CHECK (total_members >= 0),
  CONSTRAINT homepage_school_stats_total_schools CHECK (
    CASE
      WHEN jsonb_typeof(featured_schools) = 'array'
        THEN total_schools >= jsonb_array_length(featured_schools)
      ELSE false
    END
    AND total_schools <= total_members
  ),
  CONSTRAINT homepage_school_stats_version CHECK (version > 0),
  CONSTRAINT homepage_school_stats_featured_schools CHECK (
    private.homepage_school_stats_featured_schools_valid(featured_schools, total_members)
  )
);

CREATE TABLE IF NOT EXISTS public.homepage_school_stats_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version bigint NOT NULL UNIQUE,
  total_members integer NOT NULL,
  total_schools integer NOT NULL,
  featured_schools jsonb NOT NULL,
  action text NOT NULL,
  restored_from_version bigint REFERENCES public.homepage_school_stats_history(version),
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  published_by_name text NOT NULL,
  CONSTRAINT homepage_school_stats_history_action CHECK (action IN ('seed', 'publish', 'restore')),
  CONSTRAINT homepage_school_stats_history_restore_source CHECK (
    (action = 'restore' AND restored_from_version IS NOT NULL)
    OR (action IN ('seed', 'publish') AND restored_from_version IS NULL)
  ),
  CONSTRAINT homepage_school_stats_history_total_members CHECK (total_members >= 0),
  CONSTRAINT homepage_school_stats_history_total_schools CHECK (
    CASE
      WHEN jsonb_typeof(featured_schools) = 'array'
        THEN total_schools >= jsonb_array_length(featured_schools)
      ELSE false
    END
    AND total_schools <= total_members
  ),
  CONSTRAINT homepage_school_stats_history_version CHECK (version > 0),
  CONSTRAINT homepage_school_stats_history_publisher_name CHECK (char_length(btrim(published_by_name)) BETWEEN 1 AND 120),
  CONSTRAINT homepage_school_stats_history_featured_schools CHECK (
    private.homepage_school_stats_featured_schools_valid(featured_schools, total_members)
  )
);

CREATE INDEX IF NOT EXISTS homepage_school_stats_history_published_at_idx
  ON public.homepage_school_stats_history (published_at DESC, id DESC);

INSERT INTO public.homepage_school_stats (
  id,
  total_members,
  total_schools,
  featured_schools,
  version,
  published_at
)
VALUES (
  1,
  135,
  29,
  '[
    {"id":"waseda","zh":"早稻田","ja":"早稲田","count":44},
    {"id":"todai","zh":"东大","ja":"東大","count":17},
    {"id":"tus","zh":"东理","ja":"理科大","count":16},
    {"id":"hosei","zh":"法政","ja":"法政","count":14},
    {"id":"tokyotech","zh":"东工","ja":"東工","count":9},
    {"id":"sophia","zh":"上智","ja":"上智","count":6},
    {"id":"keio","zh":"庆应","ja":"慶應","count":6}
  ]'::jsonb,
  1,
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.homepage_school_stats_history (
  version,
  total_members,
  total_schools,
  featured_schools,
  action,
  restored_from_version,
  published_at,
  published_by,
  published_by_name
)
SELECT
  stats.version,
  stats.total_members,
  stats.total_schools,
  stats.featured_schools,
  'seed',
  NULL,
  stats.published_at,
  NULL,
  '系统初始配置'
FROM public.homepage_school_stats AS stats
WHERE stats.id = 1
ON CONFLICT (version) DO NOTHING;

CREATE OR REPLACE FUNCTION private.homepage_school_stats_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users AS administrator
    WHERE administrator.user_id = (SELECT auth.uid())
      AND administrator.role = 'super_admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.publish_homepage_school_stats(
  p_total_members integer,
  p_total_schools integer,
  p_featured_schools jsonb,
  p_expected_version bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  administrator_id uuid;
  administrator_name text;
  current_stats public.homepage_school_stats%ROWTYPE;
  normalized_schools jsonb;
  next_version bigint;
  published_time timestamptz := now();
BEGIN
  SELECT
    administrator.id,
    left(
      COALESCE(
        NULLIF(btrim(administrator.name), ''),
        NULLIF(btrim(administrator.email), ''),
        '管理员'
      ),
      120
    )
    INTO administrator_id, administrator_name
  FROM public.admin_users AS administrator
  WHERE administrator.user_id = (SELECT auth.uid())
    AND administrator.role = 'super_admin'
  LIMIT 1;

  IF administrator_id IS NULL THEN
    RAISE EXCEPTION 'HOMEPAGE_SCHOOL_STATS_SUPER_ADMIN_REQUIRED';
  END IF;

  IF p_total_members IS NULL
    OR p_total_schools IS NULL
    OR p_expected_version IS NULL
    OR p_total_members < 0
    OR p_total_schools < 0
    OR p_total_schools > p_total_members
  THEN
    RAISE EXCEPTION 'HOMEPAGE_SCHOOL_STATS_INVALID_INPUT';
  END IF;

  -- Validate JSON shape before calling jsonb_array_length. Postgres does not
  -- guarantee boolean-expression evaluation order, and the latter raises for
  -- scalar JSON values.
  IF NOT private.homepage_school_stats_featured_schools_valid(
    p_featured_schools,
    p_total_members
  ) THEN
    RAISE EXCEPTION 'HOMEPAGE_SCHOOL_STATS_INVALID_INPUT';
  END IF;

  IF p_total_schools < jsonb_array_length(p_featured_schools) THEN
    RAISE EXCEPTION 'HOMEPAGE_SCHOOL_STATS_INVALID_INPUT';
  END IF;

  SELECT *
    INTO current_stats
  FROM public.homepage_school_stats
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOMEPAGE_SCHOOL_STATS_NOT_CONFIGURED';
  END IF;

  IF current_stats.version <> p_expected_version THEN
    RAISE EXCEPTION 'HOMEPAGE_SCHOOL_STATS_VERSION_CONFLICT';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', btrim(school->>'id'),
        'zh', btrim(school->>'zh'),
        'ja', btrim(school->>'ja'),
        'count', ((school->>'count')::numeric)::integer
      )
      ORDER BY position
    ),
    '[]'::jsonb
  )
  INTO normalized_schools
  FROM jsonb_array_elements(p_featured_schools) WITH ORDINALITY AS entry(school, position);

  next_version := current_stats.version + 1;

  UPDATE public.homepage_school_stats
  SET total_members = p_total_members,
      total_schools = p_total_schools,
      featured_schools = normalized_schools,
      version = next_version,
      published_at = published_time
  WHERE id = 1;

  INSERT INTO public.homepage_school_stats_history (
    version,
    total_members,
    total_schools,
    featured_schools,
    action,
    restored_from_version,
    published_at,
    published_by,
    published_by_name
  )
  VALUES (
    next_version,
    p_total_members,
    p_total_schools,
    normalized_schools,
    'publish',
    NULL,
    published_time,
    administrator_id,
    administrator_name
  );

  RETURN next_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_homepage_school_stats(
  p_history_id bigint,
  p_expected_version bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  administrator_id uuid;
  administrator_name text;
  current_stats public.homepage_school_stats%ROWTYPE;
  source_stats public.homepage_school_stats_history%ROWTYPE;
  next_version bigint;
  published_time timestamptz := now();
BEGIN
  SELECT
    administrator.id,
    left(
      COALESCE(
        NULLIF(btrim(administrator.name), ''),
        NULLIF(btrim(administrator.email), ''),
        '管理员'
      ),
      120
    )
    INTO administrator_id, administrator_name
  FROM public.admin_users AS administrator
  WHERE administrator.user_id = (SELECT auth.uid())
    AND administrator.role = 'super_admin'
  LIMIT 1;

  IF administrator_id IS NULL THEN
    RAISE EXCEPTION 'HOMEPAGE_SCHOOL_STATS_SUPER_ADMIN_REQUIRED';
  END IF;

  IF p_history_id IS NULL OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'HOMEPAGE_SCHOOL_STATS_INVALID_INPUT';
  END IF;

  SELECT *
    INTO current_stats
  FROM public.homepage_school_stats
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOMEPAGE_SCHOOL_STATS_NOT_CONFIGURED';
  END IF;

  IF current_stats.version <> p_expected_version THEN
    RAISE EXCEPTION 'HOMEPAGE_SCHOOL_STATS_VERSION_CONFLICT';
  END IF;

  SELECT *
    INTO source_stats
  FROM public.homepage_school_stats_history
  WHERE id = p_history_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOMEPAGE_SCHOOL_STATS_HISTORY_NOT_FOUND';
  END IF;

  next_version := current_stats.version + 1;

  UPDATE public.homepage_school_stats
  SET total_members = source_stats.total_members,
      total_schools = source_stats.total_schools,
      featured_schools = source_stats.featured_schools,
      version = next_version,
      published_at = published_time
  WHERE id = 1;

  INSERT INTO public.homepage_school_stats_history (
    version,
    total_members,
    total_schools,
    featured_schools,
    action,
    restored_from_version,
    published_at,
    published_by,
    published_by_name
  )
  VALUES (
    next_version,
    source_stats.total_members,
    source_stats.total_schools,
    source_stats.featured_schools,
    'restore',
    source_stats.version,
    published_time,
    administrator_id,
    administrator_name
  );

  RETURN next_version;
END;
$function$;

ALTER TABLE public.homepage_school_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_school_stats_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS homepage_school_stats_public_read ON public.homepage_school_stats;
CREATE POLICY homepage_school_stats_public_read
  ON public.homepage_school_stats
  FOR SELECT
  TO anon, authenticated
  USING (id = 1);

DROP POLICY IF EXISTS homepage_school_stats_history_super_admin_read
  ON public.homepage_school_stats_history;
CREATE POLICY homepage_school_stats_history_super_admin_read
  ON public.homepage_school_stats_history
  FOR SELECT
  TO authenticated
  USING ((SELECT private.homepage_school_stats_is_super_admin()));

REVOKE ALL ON TABLE public.homepage_school_stats
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.homepage_school_stats_history
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.homepage_school_stats
  TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.homepage_school_stats_history
  TO authenticated, service_role;

REVOKE ALL ON SEQUENCE public.homepage_school_stats_history_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION private.homepage_school_stats_featured_schools_valid(jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.homepage_school_stats_is_super_admin()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.homepage_school_stats_is_super_admin()
  TO authenticated;

REVOKE ALL ON FUNCTION public.publish_homepage_school_stats(integer, integer, jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_homepage_school_stats(integer, integer, jsonb, bigint)
  TO authenticated;

REVOKE ALL ON FUNCTION public.restore_homepage_school_stats(bigint, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_homepage_school_stats(bigint, bigint)
  TO authenticated;

COMMENT ON TABLE public.homepage_school_stats IS
  'Public singleton used by the landing-page school distribution card.';
COMMENT ON TABLE public.homepage_school_stats_history IS
  'Immutable publish history for homepage school statistics.';
