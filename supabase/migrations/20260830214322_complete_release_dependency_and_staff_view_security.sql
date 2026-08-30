-- Close the final release dependency and public staff-view security gaps.
-- This migration must run after the six user/member master migrations: it
-- deliberately fails closed when their lifecycle schema is not present.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_advisory_xact_lock(
  hashtextextended('user-member-master-release-hardening', 0)
);

-- Exact union of pre-existing relations referenced by the six member-master
-- migrations or their preserved trigger chain. Relations created by those
-- migrations are asserted separately.
DO $release_dependencies$
DECLARE
  v_missing text;
BEGIN
  WITH expected_relation(qualified_name) AS (
    VALUES
      ('auth.users'),
      ('private.community_comment_authors'),
      ('private.community_media_cleanup_queue'),
      ('private.community_post_authors'),
      ('private.community_processed_uploads'),
      ('private.community_profile_members'),
      ('private.member_profile_audit_log'),
      ('private.member_profile_metrics'),
      ('public.activity_records'),
      ('public.admin_users'),
      ('public.community_comments'),
      ('public.community_moderation_actions'),
      ('public.community_nickname_history'),
      ('public.community_notification_preferences'),
      ('public.community_post_images'),
      ('public.community_posts'),
      ('public.community_profiles'),
      ('public.community_reports'),
      ('public.community_sanctions'),
      ('public.interview_evaluations'),
      ('public.legacy_members'),
      ('public.match_results'),
      ('public.match_round_submissions'),
      ('public.match_rounds'),
      ('public.match_sessions'),
      ('public.member_boundaries'),
      ('public.member_dynamic_stats'),
      ('public.member_identity'),
      ('public.member_interests'),
      ('public.member_language'),
      ('public.member_notes'),
      ('public.member_personality'),
      ('public.member_verification'),
      ('public.members'),
      ('public.mutual_reviews'),
      ('public.pair_relationships'),
      ('public.past_event_reviews'),
      ('public.personality_quiz_config'),
      ('public.personality_quiz_results'),
      ('public.player_activity_settings'),
      ('public.player_feedback'),
      ('public.script_play_records'),
      ('public.scripts'),
      ('public.staff_profiles'),
      ('public.unmatched_diagnostics'),
      ('storage.objects')
  )
  SELECT string_agg(qualified_name, ', ' ORDER BY qualified_name)
  INTO v_missing
  FROM expected_relation
  WHERE to_regclass(qualified_name) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'MEMBER_MASTER_RELEASE_DEPENDENCIES_MISSING',
      DETAIL = v_missing;
  END IF;

  IF to_regprocedure('public.admin_get_member_360(uuid)') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns AS column_info
       WHERE column_info.table_schema = 'public'
         AND column_info.table_name = 'members'
         AND column_info.column_name = 'account_status'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MEMBER_MASTER_MIGRATIONS_REQUIRED_BEFORE_HARDENING';
  END IF;
END
$release_dependencies$;

DO $release_external_objects$
DECLARE
  v_missing_routines text;
BEGIN
  WITH expected_routine(signature) AS (
    VALUES
      ('private.profile_admin_metrics_payload(uuid)'),
      ('private.community_storage_object_referenced(text,text)'),
      ('private.profile_current_admin_id()'),
      ('private.profile_normalize_nickname(text)'),
      ('private.recalculate_member_activity_stats(uuid)'),
      ('public.admin_get_member_profile_audit(uuid,integer)'),
      ('public.admin_get_member_profile_metrics(uuid)'),
      ('public.admin_update_member_number(uuid,text,text)'),
      ('public.is_admin()'),
      ('public.my_email()')
  )
  SELECT string_agg(signature, ', ' ORDER BY signature)
  INTO v_missing_routines
  FROM expected_routine
  WHERE to_regprocedure(signature) IS NULL;

  IF v_missing_routines IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42883',
      MESSAGE = 'MEMBER_MASTER_RELEASE_ROUTINES_MISSING',
      DETAIL = v_missing_routines;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS sequence_info
    JOIN pg_namespace AS sequence_schema
      ON sequence_schema.oid = sequence_info.relnamespace
    WHERE sequence_schema.nspname = 'private'
      AND sequence_info.relname = 'member_profile_audit_log_id_seq'
      AND sequence_info.relkind = 'S'
  ) OR pg_get_serial_sequence(
    'private.member_profile_audit_log',
    'id'
  ) IS DISTINCT FROM 'private.member_profile_audit_log_id_seq'
  OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'private'
      AND column_info.table_name = 'member_profile_audit_log'
      AND column_info.column_name = 'id'
      AND column_info.is_identity = 'YES'
      AND column_info.identity_generation = 'ALWAYS'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_info
    JOIN pg_class AS audit_table ON audit_table.oid = index_info.indrelid
    JOIN pg_namespace AS audit_schema ON audit_schema.oid = audit_table.relnamespace
    JOIN pg_attribute AS id_attribute
      ON id_attribute.attrelid = audit_table.oid
     AND id_attribute.attname = 'id'
     AND NOT id_attribute.attisdropped
    WHERE audit_schema.nspname = 'private'
      AND audit_table.relname = 'member_profile_audit_log'
      AND index_info.indisunique
      AND index_info.indisvalid
      AND index_info.indisready
      AND index_info.indpred IS NULL
      AND index_info.indexprs IS NULL
      AND index_info.indnkeyatts = 1
      AND index_info.indkey[0] = id_attribute.attnum
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MEMBER_MASTER_RELEASE_AUDIT_IDENTITY_MISMATCH';
  END IF;
END
$release_external_objects$;

DO $release_trigger_bindings$
DECLARE
  v_missing_or_mismatched text;
BEGIN
  WITH expected_trigger(
    table_schema,
    table_name,
    trigger_name,
    function_signature,
    trigger_type,
    update_columns
  ) AS (
    VALUES
      (
        'public', 'members', 'members_seed_profile_metrics',
        'private.profile_seed_member_metrics()', 5, ARRAY[]::text[]
      ),
      (
        'public', 'member_identity', 'member_identity_validate_profile_fields',
        'private.profile_validate_identity_fields()', 23,
        ARRAY['nickname', 'personal_avatar_path']::text[]
      ),
      (
        'public', 'member_identity', 'member_identity_log_profile_change',
        'private.profile_log_identity_change()', 17,
        ARRAY[
          'full_name', 'gender', 'nickname', 'school_name', 'department',
          'personal_avatar_path'
        ]::text[]
      ),
      (
        'public', 'member_identity', 'member_identity_sync_community_profile',
        'private.profile_sync_identity_to_community()', 17,
        ARRAY['nickname', 'personal_avatar_path']::text[]
      ),
      (
        'public', 'community_profiles', 'community_profiles_sync_member_identity',
        'private.profile_sync_community_to_identity()', 17,
        ARRAY['nickname', 'avatar_kind', 'avatar_path']::text[]
      ),
      (
        'private', 'community_profile_members',
        'community_profile_mapping_sync_identity',
        'private.profile_sync_new_community_mapping()', 21,
        ARRAY['member_id']::text[]
      ),
      (
        'public', 'activity_records', 'on_activity_change_recalculate',
        'private.recalculate_activity_stats_after_change()', 29,
        ARRAY[]::text[]
      )
  )
  SELECT string_agg(
           format(
             '%I.%I.%I -> %s',
             expected.table_schema,
             expected.table_name,
             expected.trigger_name,
             expected.function_signature
           ),
           ', ' ORDER BY expected.table_schema, expected.table_name,
             expected.trigger_name
         )
  INTO v_missing_or_mismatched
  FROM expected_trigger AS expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_info
    JOIN pg_class AS trigger_table ON trigger_table.oid = trigger_info.tgrelid
    JOIN pg_namespace AS trigger_schema
      ON trigger_schema.oid = trigger_table.relnamespace
    WHERE trigger_schema.nspname = expected.table_schema
      AND trigger_table.relname = expected.table_name
      AND trigger_info.tgname = expected.trigger_name
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgenabled IN ('O', 'A')
      AND trigger_info.tgfoid = to_regprocedure(expected.function_signature)
      AND trigger_info.tgtype::integer = expected.trigger_type
      AND COALESCE(
        (
          SELECT array_agg(attribute.attname::text ORDER BY trigger_column.ordinality)
          FROM unnest(trigger_info.tgattr::smallint[])
            WITH ORDINALITY AS trigger_column(attnum, ordinality)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = trigger_info.tgrelid
           AND attribute.attnum = trigger_column.attnum
           AND NOT attribute.attisdropped
        ),
        ARRAY[]::text[]
      ) = expected.update_columns
  );

  IF v_missing_or_mismatched IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MEMBER_MASTER_RELEASE_TRIGGER_BINDINGS_MISSING',
      DETAIL = v_missing_or_mismatched;
  END IF;
END
$release_trigger_bindings$;

DO $release_unique_arbiters$
DECLARE
  v_missing_or_mismatched text;
BEGIN
  WITH expected_unique(table_schema, table_name, column_names) AS (
    VALUES
      ('public', 'member_identity', ARRAY['member_id']::text[]),
      ('public', 'member_language', ARRAY['member_id']::text[]),
      ('public', 'member_interests', ARRAY['member_id']::text[]),
      ('public', 'member_personality', ARRAY['member_id']::text[]),
      ('public', 'member_boundaries', ARRAY['member_id']::text[]),
      ('public', 'personality_quiz_results', ARRAY['member_id']::text[]),
      ('public', 'member_verification', ARRAY['member_id']::text[]),
      ('public', 'member_dynamic_stats', ARRAY['member_id']::text[]),
      ('public', 'members', ARRAY['member_number']::text[]),
      (
        'public', 'interview_evaluations',
        ARRAY['member_id', 'interviewer_id']::text[]
      ),
      ('private', 'member_profile_metrics', ARRAY['member_id']::text[]),
      (
        'private', 'community_media_cleanup_queue',
        ARRAY['bucket_id', 'object_path']::text[]
      )
  )
  SELECT string_agg(
           format(
             '%I.%I(%s)',
             expected.table_schema,
             expected.table_name,
             array_to_string(expected.column_names, ', ')
           ),
           ', ' ORDER BY expected.table_schema, expected.table_name
         )
  INTO v_missing_or_mismatched
  FROM expected_unique AS expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_info
    JOIN pg_class AS indexed_table ON indexed_table.oid = index_info.indrelid
    JOIN pg_namespace AS indexed_schema
      ON indexed_schema.oid = indexed_table.relnamespace
    WHERE indexed_schema.nspname = expected.table_schema
      AND indexed_table.relname = expected.table_name
      AND index_info.indisunique
      AND index_info.indisvalid
      AND index_info.indisready
      AND index_info.indpred IS NULL
      AND index_info.indexprs IS NULL
      AND index_info.indnkeyatts = cardinality(expected.column_names)
      AND (
        SELECT array_agg(attribute.attname::text ORDER BY key_column.ordinality)
        FROM unnest(index_info.indkey::smallint[])
          WITH ORDINALITY AS key_column(attnum, ordinality)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_info.indrelid
         AND attribute.attnum = key_column.attnum
         AND NOT attribute.attisdropped
        WHERE key_column.ordinality <= index_info.indnkeyatts
      ) = expected.column_names
  );

  IF v_missing_or_mismatched IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MEMBER_MASTER_RELEASE_UNIQUE_ARBITERS_MISSING',
      DETAIL = v_missing_or_mismatched;
  END IF;
END
$release_unique_arbiters$;


-- Verify the actual commands and predicates, not only the three policy names.
DO $storage_policy_contract$
DECLARE
  v_missing_or_mismatched text;
BEGIN
  WITH expected_policy(policy_name, command_name, row_filter, check_filter) AS (
    VALUES
      (
        'community_storage_route_only_insert',
        'INSERT',
        NULL::text,
        '(bucket_id <> ALL (ARRAY[''community-avatars''::text, ''community-media''::text]))'
      ),
      (
        'community_storage_route_only_update',
        'UPDATE',
        '(bucket_id <> ALL (ARRAY[''community-avatars''::text, ''community-media''::text]))',
        '(bucket_id <> ALL (ARRAY[''community-avatars''::text, ''community-media''::text]))'
      ),
      (
        'community_storage_route_only_delete',
        'DELETE',
        '(bucket_id <> ALL (ARRAY[''community-avatars''::text, ''community-media''::text]))',
        NULL::text
      )
  )
  SELECT string_agg(expected.policy_name, ', ' ORDER BY expected.policy_name)
  INTO v_missing_or_mismatched
  FROM expected_policy AS expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_policies AS actual
    WHERE actual.schemaname = 'storage'
      AND actual.tablename = 'objects'
      AND actual.policyname = expected.policy_name
      AND actual.permissive = 'RESTRICTIVE'
      AND actual.cmd = expected.command_name
      AND actual.roles = ARRAY['authenticated'::name]
      AND actual.qual IS NOT DISTINCT FROM expected.row_filter
      AND actual.with_check IS NOT DISTINCT FROM expected.check_filter
  );

  IF v_missing_or_mismatched IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COMMUNITY_STORAGE_ROUTE_ONLY_POLICY_MISMATCH',
      DETAIL = v_missing_or_mismatched;
  END IF;
END
$storage_policy_contract$;

-- The canonical partial index is acceptable because NULL values do not bind an
-- Auth account. Any other partial predicate would not enforce the contract.
DO $admin_user_binding_contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_info
    JOIN pg_class AS index_class ON index_class.oid = index_info.indexrelid
    JOIN pg_class AS admin_table ON admin_table.oid = index_info.indrelid
    JOIN pg_namespace AS admin_schema ON admin_schema.oid = admin_table.relnamespace
    JOIN pg_attribute AS user_id_attribute
      ON user_id_attribute.attrelid = admin_table.oid
     AND user_id_attribute.attname = 'user_id'
     AND NOT user_id_attribute.attisdropped
    WHERE admin_schema.nspname = 'public'
      AND admin_table.relname = 'admin_users'
      AND index_class.relname = 'idx_admin_users_user_id_unique'
      AND index_info.indisunique
      AND index_info.indisvalid
      AND index_info.indisready
      AND index_info.indnkeyatts = 1
      AND index_info.indkey[0] = user_id_attribute.attnum
      AND pg_get_expr(index_info.indpred, index_info.indrelid)
          = '(user_id IS NOT NULL)'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'ADMIN_USER_BINDING_UNIQUE_INDEX_MISMATCH';
  END IF;
END
$admin_user_binding_contract$;

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_master_staff_profiles_public_read
  ON public.staff_profiles;
CREATE POLICY member_master_staff_profiles_public_read
  ON public.staff_profiles
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

REVOKE ALL ON TABLE public.staff_profiles FROM PUBLIC, anon;
GRANT SELECT (
  id, name, school, major, intro, avatar_url,
  is_published, sort_order, created_at
) ON TABLE public.staff_profiles TO anon;
GRANT SELECT (
  id, name, school, major, intro, avatar_url,
  is_published, sort_order, created_at, updated_at
) ON TABLE public.staff_profiles TO authenticated;

CREATE OR REPLACE VIEW public.published_staff_profiles
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  staff.id,
  staff.name,
  staff.school,
  staff.major,
  staff.intro,
  staff.avatar_url
FROM public.staff_profiles AS staff
WHERE staff.is_published = true
ORDER BY staff.sort_order, staff.created_at;

REVOKE ALL ON TABLE public.published_staff_profiles
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.published_staff_profiles
  TO anon, authenticated, service_role;

DO $staff_view_contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS view_info
    JOIN pg_namespace AS view_schema ON view_schema.oid = view_info.relnamespace
    WHERE view_schema.nspname = 'public'
      AND view_info.relname = 'published_staff_profiles'
      AND view_info.relkind = 'v'
      AND COALESCE(view_info.reloptions, ARRAY[]::text[])
          @> ARRAY['security_invoker=true', 'security_barrier=true']
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'staff_profiles'
      AND policy_info.policyname = 'member_master_staff_profiles_public_read'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles @> ARRAY['anon'::name, 'authenticated'::name]
      AND policy_info.qual = '(is_published = true)'
  ) OR NOT has_table_privilege(
    'anon', 'public.published_staff_profiles', 'SELECT'
  ) OR NOT has_table_privilege(
    'authenticated', 'public.published_staff_profiles', 'SELECT'
  ) OR has_column_privilege(
    'anon', 'public.staff_profiles', 'member_id', 'SELECT'
  ) OR has_column_privilege(
    'anon', 'public.staff_profiles', 'audit_reason', 'SELECT'
  ) OR has_column_privilege(
    'authenticated', 'public.staff_profiles', 'member_id', 'SELECT'
  ) OR has_column_privilege(
    'authenticated', 'public.staff_profiles', 'audit_reason', 'SELECT'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PUBLISHED_STAFF_SECURITY_INVOKER_CONTRACT_FAILED';
  END IF;
END
$staff_view_contract$;

COMMIT;
