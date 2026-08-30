-- Reconcile the one missing legacy baseline effect without replaying the
-- historical 001-038 migration series. This migration is intentionally safe
-- on the already-migrated isolated Preview and fail-closed on an incompatible
-- Production catalog.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_advisory_xact_lock(
  hashtextextended('production-baseline-reconciliation', 0)
);

-- Every relation referenced directly by the member-master migration or through
-- its preserved trigger chain must already exist.
-- A missing relation means the April/July history cannot be treated as an
-- equivalent baseline and requires a separately reviewed forward migration.
DO $baseline_relations$
DECLARE
  v_missing text;
BEGIN
  WITH expected_relation(qualified_name) AS (
    VALUES
      ('auth.users'),
      ('private.community_comment_authors'),
      ('private.community_post_authors'),
      ('private.community_processed_uploads'),
      ('public.members'),
      ('public.legacy_members'),
      ('public.member_identity'),
      ('public.member_language'),
      ('public.member_interests'),
      ('public.member_personality'),
      ('public.member_boundaries'),
      ('public.member_verification'),
      ('public.personality_quiz_results'),
      ('public.personality_quiz_config'),
      ('public.member_dynamic_stats'),
      ('public.member_notes'),
      ('public.interview_evaluations'),
      ('public.admin_users'),
      ('public.staff_profiles'),
      ('public.past_event_reviews'),
      ('public.match_round_submissions'),
      ('public.script_play_records'),
      ('public.unmatched_diagnostics'),
      ('public.community_notification_preferences'),
      ('public.community_moderation_actions'),
      ('public.community_nickname_history'),
      ('public.community_post_images'),
      ('public.community_posts'),
      ('public.community_comments'),
      ('public.community_profiles'),
      ('public.community_reports'),
      ('public.community_sanctions'),
      ('public.player_feedback'),
      ('public.match_results'),
      ('public.mutual_reviews'),
      ('public.activity_records'),
      ('public.pair_relationships'),
      ('public.match_sessions'),
      ('public.match_rounds'),
      ('public.scripts'),
      ('public.player_activity_settings'),
      ('private.member_profile_metrics'),
      ('private.community_profile_members'),
      ('private.member_profile_audit_log'),
      ('private.community_media_cleanup_queue'),
      ('storage.objects')
  )
  SELECT string_agg(qualified_name, ', ' ORDER BY qualified_name)
  INTO v_missing
  FROM expected_relation
  WHERE to_regclass(qualified_name) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'PRODUCTION_BASELINE_RELATIONS_MISSING',
      DETAIL = v_missing;
  END IF;
END
$baseline_relations$;

-- Existing helpers referenced before the member migration can create or replace
-- its own routines. Missing helpers must fail before any member backfill starts.
DO $baseline_external_objects$
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
      MESSAGE = 'PRODUCTION_BASELINE_ROUTINES_MISSING',
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
      MESSAGE = 'PRODUCTION_BASELINE_AUDIT_IDENTITY_MISMATCH';
  END IF;
END
$baseline_external_objects$;

-- These legacy triggers remain active while the member migration replaces or
-- calls their functions. Validate the binding, firing mode, event/timing bits
-- and UPDATE OF columns so a same-name but weakened trigger cannot pass.
DO $baseline_trigger_bindings$
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
      MESSAGE = 'PRODUCTION_BASELINE_TRIGGER_BINDINGS_MISSING',
      DETAIL = v_missing_or_mismatched;
  END IF;
END
$baseline_trigger_bindings$;

-- Every pre-existing ON CONFLICT target used by the member migrations must be
-- backed by a full, non-expression, ready and valid unique index.
DO $baseline_unique_arbiters$
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
      MESSAGE = 'PRODUCTION_BASELINE_UNIQUE_ARBITERS_MISSING',
      DETAIL = v_missing_or_mismatched;
  END IF;
END
$baseline_unique_arbiters$;


-- The remote April history once converted this single-select field to text[].
-- The live catalog, application contract and generated types all require text.
DO $baseline_social_goal$
DECLARE
  v_type text;
BEGIN
  SELECT format_type(attribute.atttypid, attribute.atttypmod)
  INTO v_type
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.member_interests'::regclass
    AND attribute.attname = 'social_goal_secondary'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  IF v_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42804',
      MESSAGE = 'PRODUCTION_BASELINE_SOCIAL_GOAL_TYPE_MISMATCH',
      DETAIL = 'Expected public.member_interests.social_goal_secondary text, found ' ||
        COALESCE(v_type, '<missing>');
  END IF;
END
$baseline_social_goal$;

-- The historical local 011 included this safe backfill, while the recorded
-- remote 011 only added the column. It is a no-op on the verified Production
-- snapshot but keeps other equivalent baselines deterministic.
SELECT set_config(
  'app.member_master_audit_source',
  'production_baseline_reconciliation',
  true
);
SELECT set_config(
  'app.member_master_audit_reason',
  'Production baseline interviewer name reconciliation',
  true
);

UPDATE public.interview_evaluations AS evaluation
SET interviewer_name = administrator.name
FROM public.admin_users AS administrator
WHERE administrator.id = evaluation.interviewer_id
  AND evaluation.interviewer_name IS NULL;

-- Production is missing only the local 035 effect. ADD COLUMN IF NOT EXISTS is
-- safe both before the member migration and on the fully migrated Preview.
ALTER TABLE public.match_round_submissions
  ADD COLUMN IF NOT EXISTS import_metadata jsonb;

DO $baseline_assertions$
DECLARE
  v_failures text[] := ARRAY[]::text[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.interview_evaluations AS evaluation
    JOIN public.admin_users AS administrator
      ON administrator.id = evaluation.interviewer_id
    WHERE evaluation.interviewer_name IS NULL
  ) THEN
    v_failures := array_append(
      v_failures,
      'backfillable interview_evaluations.interviewer_name rows remain'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'match_round_submissions'
      AND column_info.column_name = 'import_metadata'
      AND column_info.udt_name = 'jsonb'
      AND column_info.is_nullable = 'YES'
      AND column_info.column_default IS NULL
      AND column_info.is_generated = 'NEVER'
  ) THEN
    v_failures := array_append(
      v_failures,
      'match_round_submissions.import_metadata jsonb is missing'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'admin_users'
      AND column_info.column_name = 'user_id'
      AND column_info.is_nullable <> 'YES'
  ) OR NOT EXISTS (
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
    v_failures := array_append(
      v_failures,
      'admin_users.user_id is not nullable and uniquely indexed'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_info
    JOIN pg_class AS member_table ON member_table.oid = index_info.indrelid
    JOIN pg_namespace AS member_schema ON member_schema.oid = member_table.relnamespace
    JOIN pg_attribute AS user_id_attribute
      ON user_id_attribute.attrelid = member_table.oid
     AND user_id_attribute.attname = 'user_id'
     AND NOT user_id_attribute.attisdropped
    WHERE member_schema.nspname = 'public'
      AND member_table.relname = 'members'
      AND index_info.indisunique
      AND index_info.indisvalid
      AND index_info.indisready
      AND index_info.indnkeyatts = 1
      AND index_info.indkey[0] = user_id_attribute.attnum
      AND index_info.indpred IS NULL
  ) THEN
    v_failures := array_append(
      v_failures,
      'members.user_id lacks the full unique index required by upsert'
    );
  END IF;

  IF to_regclass('public.staff_profiles') IS NULL
     OR to_regclass('public.idx_staff_profiles_published_order') IS NULL
     OR to_regclass('public.past_event_reviews') IS NULL
     OR to_regclass('public.idx_past_event_reviews_public_order') IS NULL THEN
    v_failures := array_append(
      v_failures,
      'staff_profiles or past_event_reviews baseline objects are incomplete'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'storage'
      AND policy_info.tablename = 'objects'
      AND policy_info.policyname IN (
        'community_storage_insert',
        'community_storage_update',
        'community_storage_delete'
      )
  ) OR EXISTS (
    WITH expected_policy(
      policy_name,
      command_name,
      row_filter,
      check_filter
    ) AS (
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
    SELECT 1
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
    )
  ) THEN
    v_failures := array_append(
      v_failures,
      'community route-only Storage migration is not fully applied'
    );
  END IF;

  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PRODUCTION_BASELINE_RECONCILIATION_FAILED',
      DETAIL = array_to_string(v_failures, E'\n');
  END IF;

  RAISE NOTICE 'PASS Production baseline reconciliation';
END
$baseline_assertions$;

COMMIT;
