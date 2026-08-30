-- PostgREST first checks table privileges and then applies row-level security.
-- Expose only the DML used by the current session clients. Existing RLS
-- policies remain the row-level authorization boundary.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '3min';

SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration', 0));

-- Fail closed before granting table access if a required RLS boundary is absent.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid IN (
      'public.scripts'::regclass,
      'public.match_results'::regclass,
      'public.match_rounds'::regclass,
      'public.match_sessions'::regclass,
      'public.member_dynamic_stats'::regclass,
      'public.member_notes'::regclass,
      'public.mutual_reviews'::regclass,
      'public.activity_records'::regclass,
      'public.pair_relationships'::regclass,
      'public.match_round_submissions'::regclass,
      'public.player_feedback'::regclass,
      'public.script_play_records'::regclass,
      'public.unmatched_diagnostics'::regclass,
      'public.personality_quiz_config'::regclass
    )
      AND NOT relation.relrowsecurity
  )
  OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('scripts', 'admin_all_scripts', 'ALL', 'authenticated'),
      ('scripts', 'player_read_published', 'SELECT', 'authenticated'),
      ('scripts', 'anon_read_published', 'SELECT', 'anon'),
      ('match_results', 'member_master_match_results_active_self_read', 'SELECT', 'authenticated'),
      ('match_results', 'member_master_match_results_admin_audited_write', 'ALL', 'authenticated'),
      ('match_rounds', 'admin_all_rounds', 'ALL', 'authenticated'),
      ('match_rounds', 'player_read_open_rounds', 'SELECT', 'authenticated'),
      ('match_sessions', 'member_master_match_sessions_active_member_read', 'SELECT', 'authenticated'),
      ('match_sessions', 'member_master_match_sessions_admin_audited_write', 'ALL', 'authenticated'),
      ('member_dynamic_stats', 'member_master_dynamic_stats_active_self_read', 'SELECT', 'authenticated'),
      ('member_dynamic_stats', 'member_master_dynamic_stats_admin_audited_write', 'ALL', 'authenticated'),
      ('member_notes', 'member_master_member_notes_admin_audited_write', 'ALL', 'authenticated'),
      ('mutual_reviews', 'member_master_mutual_reviews_active_self_read', 'SELECT', 'authenticated'),
      ('mutual_reviews', 'member_master_player_write_related_review', 'INSERT', 'authenticated'),
      ('mutual_reviews', 'member_master_mutual_reviews_admin_audited_write', 'ALL', 'authenticated'),
      ('activity_records', 'member_master_activity_records_active_self_read', 'SELECT', 'authenticated'),
      ('activity_records', 'member_master_activity_records_admin_audited_write', 'ALL', 'authenticated'),
      ('pair_relationships', 'member_master_pair_relationships_admin_audited_write', 'ALL', 'authenticated'),
      ('match_round_submissions', 'member_master_round_submissions_active_self_read', 'SELECT', 'authenticated'),
      ('match_round_submissions', 'member_master_round_submissions_active_self_insert', 'INSERT', 'authenticated'),
      ('match_round_submissions', 'member_master_round_submissions_active_self_update', 'UPDATE', 'authenticated'),
      ('match_round_submissions', 'member_master_round_submissions_admin_audited_write', 'ALL', 'authenticated'),
      ('script_play_records', 'member_master_script_play_records_active_self_read', 'SELECT', 'authenticated'),
      ('script_play_records', 'member_master_script_play_records_admin_audited_write', 'ALL', 'authenticated'),
      ('unmatched_diagnostics', 'member_master_unmatched_diagnostics_admin_audited_write', 'ALL', 'authenticated'),
      ('personality_quiz_config', '认证用户可读问卷配置', 'SELECT', 'authenticated'),
      ('personality_quiz_config', '管理员可写问卷配置', 'ALL', 'authenticated')
    ) AS required_policy(table_name, policy_name, command_name, role_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_policies AS policy_info
      WHERE policy_info.schemaname = 'public'
        AND policy_info.tablename = required_policy.table_name
        AND policy_info.policyname = required_policy.policy_name
        AND policy_info.cmd = required_policy.command_name
        AND required_policy.role_name::name = ANY(policy_info.roles)
    )
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'scripts'
      AND policy_info.policyname = 'anon_read_published'
      AND policy_info.qual ILIKE '%is_published%true%'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_round_submissions'
      AND policy_info.policyname = 'member_master_round_submissions_active_self_insert'
      AND policy_info.with_check ILIKE '%status%open%'
      AND policy_info.with_check ILIKE '%survey_end%'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'personality_quiz_config'
      AND policy_info.policyname = '管理员可写问卷配置'
      AND policy_info.qual ILIKE '%admin_users%'
      AND policy_info.with_check ILIKE '%admin_users%'
  )
  OR EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'player_feedback'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ADMIN_SURFACE_RLS_POLICY_INVALID';
  END IF;
END
$do$;

-- Normalize historical/default grants before adding the exact Data API surface.
REVOKE ALL ON TABLE
  public.scripts,
  public.match_results,
  public.match_rounds,
  public.match_sessions,
  public.member_dynamic_stats,
  public.member_notes,
  public.mutual_reviews,
  public.activity_records,
  public.pair_relationships,
  public.match_round_submissions,
  public.player_feedback,
  public.script_play_records,
  public.unmatched_diagnostics,
  public.personality_quiz_config
FROM PUBLIC, anon, authenticated, service_role;

-- Anonymous catalogue access is limited to published scripts by RLS.
GRANT SELECT ON TABLE public.scripts TO anon;

-- Authenticated script CRUD is restricted to administrators by RLS; players can
-- only read published scripts.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scripts TO authenticated;

-- Matching and quiz administration use direct authenticated create/update
-- actions. Deletes remain on audited RPC or trusted service paths.
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.match_results,
  public.match_rounds,
  public.match_sessions,
  public.pair_relationships,
  public.match_round_submissions,
  public.script_play_records,
  public.personality_quiz_config
TO authenticated;

-- These session-client paths are read-only; RLS selects either the active
-- member's own rows or administrator-visible rows.
GRANT SELECT ON TABLE
  public.member_dynamic_stats,
  public.member_notes,
  public.mutual_reviews,
  public.activity_records
TO authenticated;

-- Round matching inserts diagnostics directly; reads and destructive cleanup
-- use trusted service clients or audited RPCs.
GRANT INSERT ON TABLE public.unmatched_diagnostics TO authenticated;

-- Trusted server clients need operational CRUD. Player feedback intentionally
-- remains append/update-only so feedback cannot be deleted through PostgREST.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.scripts,
  public.match_results,
  public.match_rounds,
  public.match_sessions,
  public.member_dynamic_stats,
  public.member_notes,
  public.mutual_reviews,
  public.activity_records,
  public.pair_relationships,
  public.match_round_submissions,
  public.script_play_records,
  public.unmatched_diagnostics,
  public.personality_quiz_config
TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.player_feedback TO service_role;

-- Assert the exact effective DML matrix, reject broad PUBLIC grants, and ensure
-- schema-changing table privileges were not reintroduced accidentally.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      COALESCE(relation.relacl, acldefault('r', relation.relowner))
    ) AS privilege_info
    WHERE relation.oid IN (
      'public.scripts'::regclass,
      'public.match_results'::regclass,
      'public.match_rounds'::regclass,
      'public.match_sessions'::regclass,
      'public.member_dynamic_stats'::regclass,
      'public.member_notes'::regclass,
      'public.mutual_reviews'::regclass,
      'public.activity_records'::regclass,
      'public.pair_relationships'::regclass,
      'public.match_round_submissions'::regclass,
      'public.player_feedback'::regclass,
      'public.script_play_records'::regclass,
      'public.unmatched_diagnostics'::regclass,
      'public.personality_quiz_config'::regclass
    )
      AND privilege_info.grantee = 0
  )
  OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.scripts'::regclass, true, false, false, false),
      ('public.match_results'::regclass, false, false, false, false),
      ('public.match_rounds'::regclass, false, false, false, false),
      ('public.match_sessions'::regclass, false, false, false, false),
      ('public.member_dynamic_stats'::regclass, false, false, false, false),
      ('public.member_notes'::regclass, false, false, false, false),
      ('public.mutual_reviews'::regclass, false, false, false, false),
      ('public.activity_records'::regclass, false, false, false, false),
      ('public.pair_relationships'::regclass, false, false, false, false),
      ('public.match_round_submissions'::regclass, false, false, false, false),
      ('public.player_feedback'::regclass, false, false, false, false),
      ('public.script_play_records'::regclass, false, false, false, false),
      ('public.unmatched_diagnostics'::regclass, false, false, false, false),
      ('public.personality_quiz_config'::regclass, false, false, false, false)
    ) AS expected(table_oid, can_select, can_insert, can_update, can_delete)
    WHERE has_table_privilege('anon', expected.table_oid, 'SELECT') IS DISTINCT FROM expected.can_select
       OR has_table_privilege('anon', expected.table_oid, 'INSERT') IS DISTINCT FROM expected.can_insert
       OR has_table_privilege('anon', expected.table_oid, 'UPDATE') IS DISTINCT FROM expected.can_update
       OR has_table_privilege('anon', expected.table_oid, 'DELETE') IS DISTINCT FROM expected.can_delete
  )
  OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.scripts'::regclass, true, true, true, true),
      ('public.match_results'::regclass, true, true, true, false),
      ('public.match_rounds'::regclass, true, true, true, false),
      ('public.match_sessions'::regclass, true, true, true, false),
      ('public.member_dynamic_stats'::regclass, true, false, false, false),
      ('public.member_notes'::regclass, true, false, false, false),
      ('public.mutual_reviews'::regclass, true, false, false, false),
      ('public.activity_records'::regclass, true, false, false, false),
      ('public.pair_relationships'::regclass, true, true, true, false),
      ('public.match_round_submissions'::regclass, true, true, true, false),
      ('public.player_feedback'::regclass, false, false, false, false),
      ('public.script_play_records'::regclass, true, true, true, false),
      ('public.unmatched_diagnostics'::regclass, false, true, false, false),
      ('public.personality_quiz_config'::regclass, true, true, true, false)
    ) AS expected(table_oid, can_select, can_insert, can_update, can_delete)
    WHERE has_table_privilege('authenticated', expected.table_oid, 'SELECT') IS DISTINCT FROM expected.can_select
       OR has_table_privilege('authenticated', expected.table_oid, 'INSERT') IS DISTINCT FROM expected.can_insert
       OR has_table_privilege('authenticated', expected.table_oid, 'UPDATE') IS DISTINCT FROM expected.can_update
       OR has_table_privilege('authenticated', expected.table_oid, 'DELETE') IS DISTINCT FROM expected.can_delete
  )
  OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.scripts'::regclass, true),
      ('public.match_results'::regclass, true),
      ('public.match_rounds'::regclass, true),
      ('public.match_sessions'::regclass, true),
      ('public.member_dynamic_stats'::regclass, true),
      ('public.member_notes'::regclass, true),
      ('public.mutual_reviews'::regclass, true),
      ('public.activity_records'::regclass, true),
      ('public.pair_relationships'::regclass, true),
      ('public.match_round_submissions'::regclass, true),
      ('public.player_feedback'::regclass, false),
      ('public.script_play_records'::regclass, true),
      ('public.unmatched_diagnostics'::regclass, true),
      ('public.personality_quiz_config'::regclass, true)
    ) AS expected(table_oid, can_delete)
    WHERE NOT has_table_privilege('service_role', expected.table_oid, 'SELECT')
       OR NOT has_table_privilege('service_role', expected.table_oid, 'INSERT')
       OR NOT has_table_privilege('service_role', expected.table_oid, 'UPDATE')
       OR has_table_privilege('service_role', expected.table_oid, 'DELETE') IS DISTINCT FROM expected.can_delete
  )
  OR EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS scoped_role(role_name)
    CROSS JOIN unnest(ARRAY[
      'public.scripts'::regclass,
      'public.match_results'::regclass,
      'public.match_rounds'::regclass,
      'public.match_sessions'::regclass,
      'public.member_dynamic_stats'::regclass,
      'public.member_notes'::regclass,
      'public.mutual_reviews'::regclass,
      'public.activity_records'::regclass,
      'public.pair_relationships'::regclass,
      'public.match_round_submissions'::regclass,
      'public.player_feedback'::regclass,
      'public.script_play_records'::regclass,
      'public.unmatched_diagnostics'::regclass,
      'public.personality_quiz_config'::regclass
    ]) AS scoped_table(table_oid)
    WHERE has_table_privilege(scoped_role.role_name, scoped_table.table_oid, 'TRUNCATE')
       OR has_table_privilege(scoped_role.role_name, scoped_table.table_oid, 'REFERENCES')
       OR has_table_privilege(scoped_role.role_name, scoped_table.table_oid, 'TRIGGER')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ADMIN_SURFACE_TABLE_ACL_INVALID';
  END IF;
END
$do$;

COMMIT;
