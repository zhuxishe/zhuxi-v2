-- Fresh projects do not provide the matching tables with the DML privileges
-- expected by the existing session-client workflows. Restore only read/create/
-- update privileges for authenticated workflows, keep deletes on trusted
-- service paths, and preserve the historical player draft-session restriction.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration', 0));

DROP POLICY IF EXISTS member_master_match_sessions_active_member_read
  ON public.match_sessions;
CREATE POLICY member_master_match_sessions_active_member_read
  ON public.match_sessions FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      status IN ('confirmed', 'published', 'closed')
      AND EXISTS (
        SELECT 1
        FROM public.members AS member
        WHERE member.user_id = (SELECT auth.uid())
          AND member.status = 'approved'
          AND member.account_status = 'active'
      )
    )
  );

REVOKE ALL ON TABLE
  public.match_rounds,
  public.match_sessions
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.match_rounds,
  public.match_sessions
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.match_rounds,
  public.match_sessions
TO service_role;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid IN (
      'public.match_rounds'::regclass,
      'public.match_sessions'::regclass
    )
      AND NOT relation.relrowsecurity
  )
  OR EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.match_rounds'::regclass,
      'public.match_sessions'::regclass
    ]) AS scoped_table(table_oid)
    WHERE NOT has_table_privilege('authenticated', scoped_table.table_oid, 'SELECT')
       OR NOT has_table_privilege('authenticated', scoped_table.table_oid, 'INSERT')
       OR NOT has_table_privilege('authenticated', scoped_table.table_oid, 'UPDATE')
       OR has_table_privilege('authenticated', scoped_table.table_oid, 'DELETE')
       OR has_table_privilege('anon', scoped_table.table_oid, 'SELECT')
       OR has_table_privilege('anon', scoped_table.table_oid, 'INSERT')
       OR has_table_privilege('anon', scoped_table.table_oid, 'UPDATE')
       OR has_table_privilege('anon', scoped_table.table_oid, 'DELETE')
       OR NOT has_table_privilege('service_role', scoped_table.table_oid, 'SELECT')
       OR NOT has_table_privilege('service_role', scoped_table.table_oid, 'INSERT')
       OR NOT has_table_privilege('service_role', scoped_table.table_oid, 'UPDATE')
       OR NOT has_table_privilege('service_role', scoped_table.table_oid, 'DELETE')
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_rounds'
      AND policy_info.policyname = 'admin_all_rounds'
      AND policy_info.roles && ARRAY['authenticated']::name[]
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_sessions'
      AND policy_info.policyname = 'member_master_match_sessions_active_member_read'
      AND policy_info.roles && ARRAY['authenticated']::name[]
      AND policy_info.cmd = 'SELECT'
      AND policy_info.qual LIKE '%status = ANY%confirmed%published%closed%'
      AND policy_info.qual LIKE '%member.status = ''approved''%'
      AND policy_info.qual LIKE '%member.account_status = ''active''%'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_sessions'
      AND policy_info.policyname = 'member_master_match_sessions_admin_audited_write'
      AND policy_info.roles && ARRAY['authenticated']::name[]
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_MATCHING_TABLE_ACL_INVALID';
  END IF;
END
$do$;

COMMIT;
