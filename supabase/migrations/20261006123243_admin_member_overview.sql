-- Read-only dashboard metrics and the reserved offline member roster.
-- No identity binding, number allocation, approval or lifecycle writes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION private.member_overview_require_admin(p_super_admin boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users AS account
    WHERE account.id = (SELECT auth.uid()) AND account.deleted_at IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.admin_users AS administrator
    WHERE administrator.user_id = (SELECT auth.uid())
      AND administrator.role IN ('admin', 'super_admin')
      AND (NOT p_super_admin OR administrator.role = 'super_admin')
  ) OR EXISTS (
    SELECT 1 FROM public.members AS member
    WHERE member.user_id = (SELECT auth.uid())
      AND (member.account_status IS DISTINCT FROM 'active' OR member.anonymized_at IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM private.member_auth_tombstones AS tombstone
    WHERE tombstone.auth_user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBER_OVERVIEW_ADMIN_REQUIRED';
  END IF;
END;
$function$;

CREATE FUNCTION private.member_overview_roster_rows()
RETURNS TABLE (
  full_name text, member_number text, member_id uuid, registered boolean,
  approved boolean, has_logged_in boolean, last_sign_in_at timestamptz,
  account_status text, activated boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT roster.full_name, roster.member_number,
    CASE WHEN member.anonymized_at IS NULL AND member.account_status <> 'closed' THEN member.id END,
    CASE WHEN member.id IS NULL OR member.anonymized_at IS NOT NULL OR member.account_status = 'closed'
      THEN NULL ELSE account.id IS NOT NULL END,
    CASE WHEN member.id IS NULL OR member.anonymized_at IS NOT NULL OR member.account_status = 'closed'
      THEN NULL WHEN member.status = 'approved' THEN true WHEN member.status = 'rejected' THEN false ELSE NULL END,
    CASE WHEN member.id IS NULL OR member.anonymized_at IS NOT NULL OR member.account_status = 'closed'
      OR account.id IS NULL THEN NULL ELSE account.last_sign_in_at IS NOT NULL END,
    CASE WHEN member.anonymized_at IS NULL AND member.account_status <> 'closed' THEN account.last_sign_in_at END,
    CASE WHEN member.anonymized_at IS NOT NULL OR member.account_status = 'closed' THEN 'closed'
      WHEN member.id IS NOT NULL THEN member.account_status
      WHEN private.member_number_history_contains(roster.member_number) THEN 'retired'
      ELSE 'unverified' END,
    COALESCE(member.account_status = 'active' AND member.anonymized_at IS NULL
      AND account.id IS NOT NULL AND account.last_sign_in_at IS NOT NULL, false)
  FROM private.member_number_roster() AS roster
  LEFT JOIN public.members AS member ON member.member_number = roster.member_number
    AND member.record_scope = 'current' AND member.record_source NOT IN ('legacy', 'import')
  LEFT JOIN auth.users AS account ON account.id = member.user_id
    AND account.deleted_at IS NULL
  WHERE roster.member_number <> 'ZXS_000'
$function$;

CREATE FUNCTION public.admin_member_dashboard_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.member_overview_require_admin(false);
  WITH gender AS (
    SELECT count(*) FILTER (WHERE identity.gender = 'male') AS male_count,
      count(*) FILTER (WHERE identity.gender = 'female') AS female_count
    FROM public.members AS member
    JOIN public.member_identity AS identity ON identity.member_id = member.id
    JOIN auth.users AS account ON account.id = member.user_id AND account.deleted_at IS NULL
    WHERE member.record_scope = 'current' AND member.account_status = 'active'
      AND member.status = 'approved' AND member.anonymized_at IS NULL
      AND member.member_number IS DISTINCT FROM 'ZXS_000'
      AND identity.gender IN ('male', 'female')
  ), legacy AS (
    SELECT count(*) AS total, count(*) FILTER (WHERE activated) AS activated
    FROM private.member_overview_roster_rows()
  )
  SELECT jsonb_build_object('male_count', gender.male_count, 'female_count', gender.female_count,
    'legacy_total', legacy.total, 'legacy_activated', legacy.activated)
  INTO v_result FROM gender CROSS JOIN legacy;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.admin_legacy_member_status(
  p_search text DEFAULT NULL, p_filter text DEFAULT 'all',
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_search text := left(btrim(COALESCE(p_search, '')), 100);
  v_filter text := CASE WHEN p_filter IN ('all', 'activated', 'inactive', 'unverified') THEN p_filter ELSE 'all' END;
  v_page integer := greatest(1, least(COALESCE(p_page, 1), 100000));
  v_page_size integer := greatest(1, least(COALESCE(p_page_size, 50), 100));
  v_total integer;
  v_pages integer;
  v_rows jsonb;
  v_filtered jsonb;
  v_items jsonb;
BEGIN
  PERFORM private.member_overview_require_admin(true);
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.member_number), '[]'::jsonb)
    INTO v_rows FROM private.member_overview_roster_rows() AS row;
  -- Search uses literal substrings, so %/_ in a member number are not wildcards.
  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'member_number'), '[]'::jsonb)
  INTO v_filtered FROM jsonb_array_elements(v_rows) AS item
  WHERE (v_search = '' OR strpos(lower(item->>'full_name'), lower(v_search)) > 0
    OR strpos(lower(item->>'member_number'), lower(v_search)) > 0)
    AND (v_filter = 'all'
      OR (v_filter = 'activated' AND (item->>'activated')::boolean)
      OR (v_filter = 'inactive' AND NOT (item->>'activated')::boolean
        AND item->>'account_status' <> 'unverified')
      OR (v_filter = 'unverified' AND item->>'account_status' = 'unverified'));
  v_total := jsonb_array_length(v_filtered);
  v_pages := (v_total + v_page_size - 1) / v_page_size;
  v_page := least(v_page, greatest(v_pages, 1));
  SELECT COALESCE(jsonb_agg(item ORDER BY ordinality), '[]'::jsonb)
  INTO v_items FROM jsonb_array_elements(v_filtered) WITH ORDINALITY AS result(item, ordinality)
  WHERE ordinality > (v_page - 1) * v_page_size AND ordinality <= v_page * v_page_size;
  RETURN jsonb_build_object('items', v_items, 'total', v_total, 'page', v_page,
    'page_size', v_page_size, 'total_pages', v_pages,
    'summary', jsonb_build_object('total', jsonb_array_length(v_rows), 'activated', (
      SELECT count(*) FROM jsonb_array_elements(v_rows) AS item WHERE (item->>'activated')::boolean
    )));
END;
$function$;

REVOKE ALL ON FUNCTION private.member_overview_require_admin(boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_overview_roster_rows() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_member_dashboard_metrics() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_legacy_member_status(text, text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_member_dashboard_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_legacy_member_status(text, text, integer, integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
