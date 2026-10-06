-- Production read-only verification; no fixture accounts or business writes.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $check$
DECLARE v_actor uuid; v_expected jsonb;
BEGIN
  SELECT administrator.user_id INTO v_actor
  FROM public.admin_users AS administrator
  JOIN auth.users AS account ON account.id = administrator.user_id AND account.deleted_at IS NULL
  WHERE administrator.role = 'super_admin'
    AND NOT EXISTS (SELECT 1 FROM public.members AS member WHERE member.user_id = administrator.user_id
      AND (member.account_status <> 'active' OR member.anonymized_at IS NOT NULL))
    AND NOT EXISTS (SELECT 1 FROM private.member_auth_tombstones WHERE auth_user_id = administrator.user_id)
  ORDER BY administrator.id LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'NO_VALID_SUPER_ADMIN'; END IF;
  SELECT jsonb_build_object(
    'male_count', count(*) FILTER (WHERE identity.gender = 'male'),
    'female_count', count(*) FILTER (WHERE identity.gender = 'female')) INTO v_expected
  FROM public.members AS member
  JOIN public.member_identity AS identity ON identity.member_id = member.id
  JOIN auth.users AS account ON account.id = member.user_id AND account.deleted_at IS NULL
  WHERE member.record_scope = 'current' AND member.account_status = 'active'
    AND member.status = 'approved' AND member.anonymized_at IS NULL
    AND member.member_number IS DISTINCT FROM 'ZXS_000';
  v_expected := v_expected || jsonb_build_object(
    'legacy_total', (SELECT count(*) FROM private.member_number_roster() WHERE member_number <> 'ZXS_000'),
    'legacy_activated', (SELECT count(*) FROM private.member_number_roster() AS roster
      JOIN public.members AS member ON member.member_number = roster.member_number
      JOIN auth.users AS account ON account.id = member.user_id AND account.deleted_at IS NULL
      WHERE roster.member_number <> 'ZXS_000' AND member.record_scope = 'current'
        AND member.record_source NOT IN ('legacy', 'import') AND member.account_status = 'active'
        AND member.anonymized_at IS NULL AND account.last_sign_in_at IS NOT NULL));
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  PERFORM set_config('app.member_overview_expected', v_expected::text, true);
  IF has_function_privilege('anon', 'public.admin_member_dashboard_metrics()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.admin_legacy_member_status(text,text,integer,integer)', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.admin_legacy_member_status(text,text,integer,integer)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'private.member_overview_roster_rows()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'private.member_number_roster()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MEMBER_OVERVIEW_ACL_FAILED';
  END IF;
END;
$check$;
SET LOCAL ROLE authenticated;
DO $check$
DECLARE v_metrics jsonb; v_page jsonb; v_expected jsonb; v_activated jsonb; v_empty jsonb;
  v_page_index integer; v_page_count integer; v_seen integer := 0;
BEGIN
  v_metrics := public.admin_member_dashboard_metrics();
  v_expected := current_setting('app.member_overview_expected')::jsonb;
  v_page := public.admin_legacy_member_status(NULL, 'all', 1, 50);
  v_activated := public.admin_legacy_member_status(NULL, 'activated', 1, 100);
  v_empty := public.admin_legacy_member_status('no_roster_match_%', 'all', 1, 50);
  IF v_metrics <> v_expected OR (v_page->>'total')::integer <> (v_expected->>'legacy_total')::integer
    OR (v_page->'summary'->>'activated')::integer <> (v_expected->>'legacy_activated')::integer
    OR (v_activated->>'total')::integer <> (v_expected->>'legacy_activated')::integer
    OR (v_empty->>'total')::integer <> 0 OR (v_empty->>'total_pages')::integer <> 0 THEN
    RAISE EXCEPTION 'MEMBER_OVERVIEW_COUNTS_FAILED';
  END IF;
  v_page_count := greatest(1, (v_page->>'total_pages')::integer);
  FOR v_page_index IN 1..v_page_count LOOP
    v_page := public.admin_legacy_member_status(NULL, 'all', v_page_index, 50);
    v_seen := v_seen + jsonb_array_length(v_page->'items');
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_page->'items') AS item
      WHERE item->>'member_number' = 'ZXS_000'
        OR (item->>'account_status' IN ('closed', 'retired', 'unverified')
          AND ((item->>'activated')::boolean OR item->>'last_sign_in_at' IS NOT NULL
            OR item->>'member_id' IS NOT NULL))) THEN
      RAISE EXCEPTION 'MEMBER_OVERVIEW_PRIVACY_FAILED';
    END IF;
  END LOOP;
  IF v_seen <> (v_expected->>'legacy_total')::integer THEN RAISE EXCEPTION 'MEMBER_OVERVIEW_PAGING_FAILED'; END IF;
END;
$check$;
SELECT jsonb_build_object('result', 'PASS', 'metrics', public.admin_member_dashboard_metrics(),
  'first_page_items', jsonb_array_length(public.admin_legacy_member_status(NULL, 'all', 1, 50)->'items'),
  'last_page_items', jsonb_array_length(public.admin_legacy_member_status(NULL, 'all', 100000, 50)->'items'),
  'unverified', public.admin_legacy_member_status(NULL, 'unverified', 1, 50)->'total') AS verification;
ROLLBACK;
