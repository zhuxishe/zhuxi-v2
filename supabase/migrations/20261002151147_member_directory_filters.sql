-- Read-only directory controls; the original RPC remains available during rollout.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- Exact aliases from src/data/universities.json. Unknown free-text schools stay separate.
CREATE OR REPLACE FUNCTION private.member_directory_school_name(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $function$
  SELECT COALESCE((
    SELECT school.name FROM (VALUES
    ('东京大学', ARRAY['东京大学', '東京大学', 'The University of Tokyo', '东大']),
    ('早稻田大学', ARRAY['早稻田大学', '早稲田大学', 'Waseda University', '早大']),
    ('庆应义塾大学', ARRAY['庆应义塾大学', '慶應義塾大学', 'Keio University', '庆应']),
    ('明治大学', ARRAY['明治大学', 'Meiji University']),
    ('上智大学', ARRAY['上智大学', 'Sophia University']),
    ('立教大学', ARRAY['立教大学', 'Rikkyo University']),
    ('中央大学', ARRAY['中央大学', 'Chuo University']),
    ('法政大学', ARRAY['法政大学', 'Hosei University']),
    ('青山学院大学', ARRAY['青山学院大学', 'Aoyama Gakuin University']),
    ('学习院大学', ARRAY['学习院大学', '学習院大学', 'Gakushuin University']),
    ('东京科学大学', ARRAY['东京科学大学', '東京科学大学', 'Tokyo Institute of Technology', '东工大', '东京工业大学', '東京工業大学', '東京工业大学', '东京工業大学', 'Institute of Science Tokyo']),
    ('一桥大学', ARRAY['一桥大学', '一橋大学', 'Hitotsubashi University']),
    ('东京外国语大学', ARRAY['东京外国语大学', '東京外国語大学', 'Tokyo University of Foreign Studies', '东外大']),
    ('东京艺术大学', ARRAY['东京艺术大学', '東京藝術大学', 'Tokyo University of the Arts', '艺大']),
    ('筑波大学', ARRAY['筑波大学', 'University of Tsukuba']),
    ('横滨国立大学', ARRAY['横滨国立大学', '横浜国立大学', 'Yokohama National University']),
    ('千叶大学', ARRAY['千叶大学', '千葉大学', 'Chiba University']),
    ('埼玉大学', ARRAY['埼玉大学', 'Saitama University']),
    ('日本大学', ARRAY['日本大学', 'Nihon University', '日大']),
    ('东洋大学', ARRAY['东洋大学', '東洋大学', 'Toyo University']),
    ('驹泽大学', ARRAY['驹泽大学', '駒澤大学', 'Komazawa University']),
    ('专修大学', ARRAY['专修大学', '専修大学', 'Senshu University']),
    ('东京理科大学', ARRAY['东京理科大学', '東京理科大学', 'Tokyo University of Science', '理科大']),
    ('国际基督教大学', ARRAY['国际基督教大学', '国際基督教大学', 'International Christian University', 'ICU']),
    ('顺天堂大学', ARRAY['顺天堂大学', '順天堂大学', 'Juntendo University']),
    ('武藏野大学', ARRAY['武藏野大学', '武蔵野大学', 'Musashino University']),
    ('帝京大学', ARRAY['帝京大学', 'Teikyo University']),
    ('东海大学', ARRAY['东海大学', '東海大学', 'Tokai University']),
    ('多摩美术大学', ARRAY['多摩美术大学', '多摩美術大学', 'Tama Art University']),
    ('武藏野美术大学', ARRAY['武藏野美术大学', '武蔵野美術大学', 'Musashino Art University'])
    ) AS school(name, aliases)
    WHERE lower(btrim(p_name)) IN (SELECT lower(alias) FROM unnest(school.aliases) AS alias)
    LIMIT 1
  ), NULLIF(btrim(p_name), ''));
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_member_directory_filtered(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_account_status text DEFAULT NULL,
  p_profile_stage text DEFAULT NULL,
  p_record_source text DEFAULT NULL,
  p_schools text[] DEFAULT NULL,
  p_sort text DEFAULT 'default',
  p_school_order text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_search text := NULLIF(btrim(p_search), '');
  v_can_read_high_risk boolean := private.member_master_is_super_admin()
    OR COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role';
  v_total bigint;
  v_items jsonb;
  v_schools jsonb;
BEGIN
  IF NOT private.member_master_is_admin()
     AND COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_ADMIN_REQUIRED';
  END IF;
  IF p_page IS NULL OR p_page < 1
     OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MEMBER_MASTER_PAGINATION_INVALID';
  END IF;
  IF p_status IS NOT NULL
     AND p_status NOT IN ('pending', 'approved', 'rejected', 'inactive') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_FILTER_INVALID';
  END IF;
  IF p_account_status IS NOT NULL
     AND p_account_status NOT IN ('unbound', 'active', 'suspended', 'closed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_FILTER_INVALID';
  END IF;
  IF p_profile_stage IS NOT NULL
     AND p_profile_stage NOT IN ('not_started', 'in_progress', 'submitted', 'complete') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_FILTER_INVALID';
  END IF;
  IF p_record_source IS NOT NULL
     AND p_record_source NOT IN ('app', 'line', 'legacy', 'import', 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_FILTER_INVALID';
  END IF;

  IF p_sort IS NULL OR p_sort NOT IN ('default', 'updated_asc', 'updated_desc', 'number_asc', 'number_desc')
     OR p_school_order IS NULL OR p_school_order NOT IN ('default', 'name_asc', 'name_desc', 'count_desc') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_MASTER_FILTER_INVALID';
  END IF;
  IF NOT v_can_read_high_risk AND p_sort IN ('number_asc', 'number_desc') THEN
    p_sort := 'default';
  END IF;

  WITH base AS MATERIALIZED (
    SELECT
      member.id AS member_id,
      COALESCE(NULLIF(btrim(identity.full_name), ''), legacy_rollup.full_name) AS full_name,
      identity.nickname,
      member.email,
      CASE WHEN v_can_read_high_risk THEN auth_user.email ELSE NULL END AS auth_email,
      CASE WHEN v_can_read_high_risk THEN
        CASE
          WHEN jsonb_typeof(auth_user.raw_app_meta_data->'providers') = 'array'
            THEN auth_user.raw_app_meta_data->'providers'
          WHEN NULLIF(auth_user.raw_app_meta_data->>'provider', '') IS NOT NULL
            THEN jsonb_build_array(auth_user.raw_app_meta_data->>'provider')
          ELSE '[]'::jsonb
        END
      ELSE '[]'::jsonb END AS auth_providers,
      private.member_directory_school_name(COALESCE(NULLIF(btrim(identity.school_name), ''), legacy_rollup.school)) AS school_name,
      member.status,
      member.profile_stage,
      member.record_source,
      member.onboarding_step,
      member.last_profile_saved_at,
      member.submitted_at,
      member.created_at,
      member.updated_at,
      CASE WHEN v_can_read_high_risk THEN member.member_number ELSE NULL END AS member_number,
      member.account_status,
      member.user_id IS NOT NULL AS auth_bound,
      legacy_rollup.record_count > 0 AS has_legacy_record,
      legacy_rollup.record_count AS legacy_record_count
    FROM public.members AS member
    LEFT JOIN public.member_identity AS identity ON identity.member_id = member.id
    LEFT JOIN auth.users AS auth_user ON auth_user.id = member.user_id
    LEFT JOIN LATERAL (
      SELECT
        count(*)::integer AS record_count,
        (
          array_agg(NULLIF(btrim(legacy.full_name), '') ORDER BY legacy.created_at, legacy.id)
          FILTER (WHERE NULLIF(btrim(legacy.full_name), '') IS NOT NULL)
        )[1] AS full_name,
        (
          array_agg(NULLIF(btrim(legacy.school), '') ORDER BY legacy.created_at, legacy.id)
          FILTER (WHERE NULLIF(btrim(legacy.school), '') IS NOT NULL)
        )[1] AS school
      FROM public.legacy_members AS legacy
      WHERE legacy.canonical_member_id = member.id
    ) AS legacy_rollup ON true
    WHERE member.record_scope = 'current'
      AND (p_status IS NULL OR member.status = p_status)
      AND (p_account_status IS NULL OR member.account_status = p_account_status)
      AND (p_profile_stage IS NULL OR member.profile_stage = p_profile_stage)
      AND (p_record_source IS NULL OR member.record_source = p_record_source)
      AND (
        v_search IS NULL
        OR member.id::text ILIKE '%' || v_search || '%'
        OR COALESCE(identity.full_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(identity.nickname, '') ILIKE '%' || v_search || '%'
        OR COALESCE(member.email, '') ILIKE '%' || v_search || '%'
        OR EXISTS (
          SELECT 1
          FROM public.legacy_members AS legacy_search
          WHERE legacy_search.canonical_member_id = member.id
            AND (
              COALESCE(legacy_search.full_name, '') ILIKE '%' || v_search || '%'
              OR COALESCE(legacy_search.school, '') ILIKE '%' || v_search || '%'
              OR (
                v_can_read_high_risk
                AND COALESCE(legacy_search.member_no, '') ILIKE '%' || v_search || '%'
              )
            )
        )
        OR (
          v_can_read_high_risk
          AND (
            COALESCE(member.member_number, '') ILIKE '%' || v_search || '%'
            OR COALESCE(auth_user.email, '') ILIKE '%' || v_search || '%'
          )
        )
      )
  ), school_counts AS (
    SELECT COALESCE(school_name, '') AS value, count(*) AS count
    FROM base GROUP BY school_name
  ), filtered AS MATERIALIZED (
    SELECT base.*, school_counts.count AS school_count,
      substring(base.member_number FROM '[0-9]+$')::numeric AS number_value
    FROM base JOIN school_counts ON school_counts.value = COALESCE(base.school_name, '')
    WHERE COALESCE(cardinality(p_schools), 0) = 0
      OR COALESCE(base.school_name, '') IN (
        SELECT COALESCE(private.member_directory_school_name(school), '') FROM unnest(p_schools) AS school
      )
  ), ranked AS (
    SELECT filtered.*, row_number() OVER (ORDER BY
      CASE WHEN p_school_order <> 'default' THEN school_name IS NULL END ASC,
      CASE WHEN p_school_order = 'count_desc' THEN school_count END DESC,
      CASE WHEN p_school_order IN ('name_asc', 'count_desc') THEN school_name END COLLATE "C" ASC,
      CASE WHEN p_school_order = 'name_desc' THEN school_name END COLLATE "C" DESC,
      CASE WHEN p_sort = 'updated_asc' THEN updated_at END ASC NULLS LAST,
      CASE WHEN p_sort = 'updated_desc' THEN updated_at END DESC NULLS LAST,
      CASE WHEN p_sort IN ('number_asc', 'number_desc') THEN NULLIF(btrim(member_number), '') IS NULL END ASC,
      CASE WHEN p_sort = 'number_asc' THEN number_value END ASC NULLS LAST,
      CASE WHEN p_sort = 'number_desc' THEN number_value END DESC NULLS LAST,
      CASE WHEN p_sort = 'number_asc' THEN member_number END COLLATE "C" ASC NULLS LAST,
      CASE WHEN p_sort = 'number_desc' THEN member_number END COLLATE "C" DESC NULLS LAST,
      created_at DESC, member_id DESC
    ) AS directory_position
    FROM filtered
  ), page_rows AS (
    SELECT * FROM ranked ORDER BY directory_position
    OFFSET (p_page - 1) * p_page_size LIMIT p_page_size
  )
  SELECT
    (SELECT count(*) FROM filtered),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(page_row) - 'school_count' - 'number_value' - 'directory_position' ORDER BY directory_position)
      FROM page_rows AS page_row
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(school) ORDER BY value = '', value COLLATE "C") FROM school_counts AS school
    ), '[]'::jsonb)
  INTO v_total, v_items, v_schools;

  RETURN jsonb_build_object(
    'page', p_page,
    'page_size', p_page_size,
    'total', v_total,
    'total_pages', CASE
      WHEN v_total = 0 THEN 0
      ELSE ceil(v_total::numeric / p_page_size)::integer
    END,
    'items', v_items,
    'schools', v_schools,
    'redacted_fields', CASE
      WHEN v_can_read_high_risk THEN '[]'::jsonb
      ELSE jsonb_build_array('member_number', 'auth_email', 'auth_providers')
    END
  );
END
$function$;

REVOKE ALL ON FUNCTION private.member_directory_school_name(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_member_directory_filtered(integer, integer, text, text, text, text, text, text[], text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_member_directory_filtered(integer, integer, text, text, text, text, text, text[], text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
