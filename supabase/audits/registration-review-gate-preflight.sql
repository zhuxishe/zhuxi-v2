-- Read-only production preflight. Returns metadata, aggregate counts and hashes;
-- never returns member identity, answers, comments, reports or exemption reasons.
-- Run before applying 20261105095725_registration_review_gate.sql and retain the
-- JSON result locally. A missing relation/column or timeout is a failed preflight.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';

WITH signatures(signature) AS (VALUES
  ('public.player_save_round_peer_review(uuid,uuid,numeric,text,integer)'),
  ('public.player_list_round_peer_review_events()'),
  ('public.player_get_round_peer_reviews(uuid,text,integer,integer)'),
  ('public.admin_preflight_member_lifecycle(uuid)'),
  ('private.round_roster_signup_authorized(uuid,uuid)'),
  ('private.round_roster_restore_authorized(uuid,uuid,uuid)'),
  ('private.test_account_round_allowed(uuid,uuid)'),
  ('matching_publication.member_ids(uuid,uuid,uuid[])'),
  ('private.peer_current_player()'),('private.peer_current_admin()'),
  ('private.peer_lock_admin()'),('private.peer_require_reason(text)'),
  ('private.peer_participant_eligible(uuid,uuid)'),
  ('private.member_master_is_super_admin()'),('private.profile_current_approved_member_id()'),
  ('private.member_master_guard_round_submission_write()'),
  ('private.guard_registration_cancellation()')
), fragments(check_name,signature,fragment) AS (VALUES
  ('save_window','public.player_save_round_peer_review(uuid,uuid,numeric,text,integer)',
    $fragment$IF NOT FOUND OR NOT v_setting.enabled OR NOT v_setting.roster_confirmed
    OR clock_timestamp()<v_setting.opens_at OR clock_timestamp()>=v_setting.closes_at THEN$fragment$),
  ('list_window','public.player_list_round_peer_review_events()',
    's.enabled AND s.roster_confirmed AND now()>=s.opens_at AND now()<s.closes_at AND private.peer_participant_eligible(r.id,v_player)'),
  ('detail_window','public.player_get_round_peer_reviews(uuid,text,integer,integer)',
    'v_eligible AND v_settings.enabled AND v_settings.roster_confirmed AND now()>=v_settings.opens_at AND now()<v_settings.closes_at'),
  ('history_window','public.player_get_round_peer_reviews(uuid,text,integer,integer)',
    $fragment$t.visible AND v_settings.enabled AND v_settings.roster_confirmed
      AND now()>=v_settings.opens_at AND now()<v_settings.closes_at AND COALESCE(rv.valid,true)$fragment$),
  ('lifecycle_counts','public.admin_preflight_member_lifecycle(uuid)',
    $fragment$'round_peer_participations',(SELECT count(*) FROM private.round_peer_review_participants WHERE member_id=p_member_id),$fragment$)
), dependencies AS (
  SELECT s.signature,p.oid IS NOT NULL AS present,
    CASE WHEN p.oid IS NOT NULL THEN md5(pg_get_functiondef(p.oid)) END AS definition_md5,
    md5(p.prosrc) AS body_md5,p.prosecdef AS security_definer,p.provolatile AS volatility,p.proconfig AS configuration
  FROM signatures s LEFT JOIN pg_proc p ON p.oid=to_regprocedure(s.signature)
), fragment_checks AS (
  SELECT f.check_name,f.signature,md5(f.fragment) AS expected_fragment_md5,
    CASE WHEN p.oid IS NULL THEN 0 ELSE
      (length(pg_get_functiondef(p.oid))-length(replace(pg_get_functiondef(p.oid),f.fragment,'')))/length(f.fragment)
    END AS exact_occurrences
  FROM fragments f LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature)
), target AS (
  SELECT r.id,r.round_name,r.purpose,r.status,r.activity_start,r.activity_end,r.is_test,r.deleted_at,
    ((r.activity_end+1)::timestamp AT TIME ZONE 'Asia/Tokyo') AS gate_ended_at,
    (SELECT count(*) FROM public.match_round_submissions s WHERE s.round_id=r.id) AS submissions,
    (SELECT count(*) FROM public.match_round_submissions s WHERE s.round_id=r.id AND s.cancelled_at IS NULL) AS active_submissions,
    (SELECT count(*) FROM public.match_sessions s WHERE s.round_id=r.id) AS sessions,
    (SELECT count(*) FROM matching_publication.active_assignments a WHERE a.round_id=r.id) AS active_assignments,
    (SELECT count(*) FROM matching_publication.publications p WHERE p.round_id=r.id AND p.withdrawn_at IS NULL) AS live_publications
  FROM public.match_rounds r
  WHERE NOT r.is_test AND r.deleted_at IS NULL AND r.purpose='matching'
    AND r.round_name='竹溪社11月匹配活动' AND r.activity_start=DATE '2026-11-04' AND r.activity_end=DATE '2026-11-17'
), business_baselines AS (
  SELECT 'match_rounds' AS relation,count(*) AS row_count,
    md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) AS rowset_md5 FROM public.match_rounds t
  UNION ALL SELECT 'match_round_submissions',count(*),md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.match_round_submissions t
  UNION ALL SELECT 'mutual_reviews',count(*),md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.mutual_reviews t
  UNION ALL SELECT 'round_peer_reviews',count(*),md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM private.round_peer_reviews t
  UNION ALL SELECT 'round_peer_reports',count(*),md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM private.round_peer_reports t
  UNION ALL SELECT 'match_results',count(*),md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.match_results t
  UNION ALL SELECT 'match_sessions',count(*),md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.match_sessions t
  UNION ALL SELECT 'round_peer_review_settings',count(*),md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.round_id),'')) FROM private.round_peer_review_settings t
  UNION ALL SELECT 'round_peer_review_participants',count(*),md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.round_id,t.member_id),'')) FROM private.round_peer_review_participants t
  UNION ALL SELECT 'matching_publications',count(*),md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM matching_publication.publications t
  UNION ALL SELECT 'matching_active_assignments',count(*),md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.round_id,t.member_id),'')) FROM matching_publication.active_assignments t
), existing_objects AS (
  SELECT 'schema.registration_review_gate' AS object,to_regnamespace('registration_review_gate') IS NOT NULL AS present
  UNION ALL SELECT 'private.round_review_requirements',to_regclass('private.round_review_requirements') IS NOT NULL
  UNION ALL SELECT 'private.round_review_exemptions',to_regclass('private.round_review_exemptions') IS NOT NULL
  UNION ALL SELECT 'private.round_review_exemption_audit',to_regclass('private.round_review_exemption_audit') IS NOT NULL
  UNION ALL SELECT 'public.player_get_registration_review_gate(uuid)',to_regprocedure('public.player_get_registration_review_gate(uuid)') IS NOT NULL
  UNION ALL SELECT 'public.admin_get_round_review_requirements(uuid)',to_regprocedure('public.admin_get_round_review_requirements(uuid)') IS NOT NULL
  UNION ALL SELECT 'public.admin_set_round_review_exemption(uuid,uuid,boolean,text,integer)',to_regprocedure('public.admin_set_round_review_exemption(uuid,uuid,boolean,text,integer)') IS NOT NULL
), migration_history AS (
  SELECT version,name FROM supabase_migrations.schema_migrations
  WHERE version='20261105095725' OR name='registration_review_gate'
), draft_scope AS (
  SELECT r.id,r.round_name,
    EXISTS(SELECT 1 FROM public.match_round_submissions s WHERE s.round_id=r.id)
    OR EXISTS(SELECT 1 FROM public.match_sessions s WHERE s.round_id=r.id)
    OR EXISTS(SELECT 1 FROM private.round_peer_review_participants p WHERE p.round_id=r.id)
    OR EXISTS(SELECT 1 FROM private.round_peer_reviews rv WHERE rv.round_id=r.id)
    OR EXISTS(SELECT 1 FROM private.round_peer_reports rp WHERE rp.round_id=r.id) AS has_participation_history
  FROM public.match_rounds r WHERE r.status='draft' AND r.deleted_at IS NULL AND NOT r.is_test
)
SELECT jsonb_build_object(
  'captured_at',clock_timestamp(),'server_version',current_setting('server_version'),
  'read_only',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),
  'ready_for_first_apply',(SELECT count(*)=1 FROM target)
    AND NOT EXISTS(SELECT 1 FROM dependencies WHERE NOT present)
    AND NOT EXISTS(SELECT 1 FROM fragment_checks WHERE exact_occurrences<>1)
    AND NOT EXISTS(SELECT 1 FROM existing_objects WHERE present)
    AND NOT EXISTS(SELECT 1 FROM migration_history),
  'historical_target',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM target t),
  'migration_history',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM migration_history t),
  'existing_objects',(SELECT jsonb_agg(to_jsonb(t) ORDER BY object) FROM existing_objects t),
  'dependencies',(SELECT jsonb_agg(to_jsonb(t) ORDER BY signature) FROM dependencies t),
  'exact_fragment_checks',(SELECT jsonb_agg(to_jsonb(t) ORDER BY check_name) FROM fragment_checks t),
  'business_baselines',(SELECT jsonb_agg(to_jsonb(t) ORDER BY relation) FROM business_baselines t),
  'existing_draft_scope',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM draft_scope t),
  'submission_triggers',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,
      'definition_md5',md5(pg_get_triggerdef(oid))) ORDER BY tgname)
    FROM pg_trigger WHERE tgrelid='public.match_round_submissions'::regclass AND NOT tgisinternal)
) AS preflight;
COMMIT;
