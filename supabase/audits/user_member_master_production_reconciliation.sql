-- Production reconciliation audit for the user/member master release.
--
-- This script is intentionally read-only and emits only schema facts and
-- aggregate counts. It never returns names, emails, UUIDs, free text, or raw
-- questionnaire answers. Run it before any migration-history repair or push.

BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

-- 1. Remote migration history. The CLI compares versions, not SQL hashes, so
-- this inventory must be reviewed together with the actual catalog below.
SELECT version::text,
       name,
       COALESCE(cardinality(statements), 0) AS recorded_statement_count
FROM supabase_migrations.schema_migrations
ORDER BY version::text;

-- 2. Production effects that were historically applied outside the local
-- numeric migration versions. False means a forward migration is required;
-- it must not be hidden with migration repair.
SELECT
  (SELECT is_nullable = 'YES'
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'admin_users'
     AND column_name = 'user_id') AS admin_user_id_nullable,
  to_regclass('public.idx_admin_users_user_id_unique') IS NOT NULL
    AS admin_user_id_partial_unique_index,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_users'
      AND policyname = 'self_check_by_email'
  ) AS admin_self_check_policy,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_users'
      AND policyname = 'self_bind_by_email'
  ) AS admin_self_bind_policy,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'match_round_submissions'
      AND column_name = 'import_metadata'
      AND udt_name = 'jsonb'
      AND is_nullable = 'YES'
      AND column_default IS NULL
      AND is_generated = 'NEVER'
  ) AS match_round_import_metadata_column_valid,
  to_regclass('public.staff_profiles') IS NOT NULL AS staff_profiles_table,
  to_regclass('public.idx_staff_profiles_published_order') IS NOT NULL
    AS staff_profiles_index,
  to_regclass('public.past_event_reviews') IS NOT NULL
    AS past_event_reviews_table,
  to_regclass('public.idx_past_event_reviews_public_order') IS NOT NULL
    AS past_event_reviews_index,
  to_regclass('public.idx_members_user_id_full') IS NOT NULL
    AS members_user_id_full_unique_index;

SELECT table_schema,
       table_name,
       column_name,
       data_type,
       udt_name,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'member_interests'
  AND column_name = 'social_goal_secondary';

SELECT 'interview_evaluation_name_completeness' AS section,
       count(*) AS total_evaluations,
       count(*) FILTER (WHERE evaluation.interviewer_name IS NULL)
         AS null_interviewer_names,
       count(*) FILTER (
         WHERE evaluation.interviewer_name IS NULL
           AND administrator.id IS NOT NULL
       ) AS backfillable_null_names,
       count(*) FILTER (
         WHERE evaluation.interviewer_name IS NOT NULL
           AND administrator.id IS NOT NULL
           AND evaluation.interviewer_name IS DISTINCT FROM administrator.name
       ) AS names_different_from_current_admin
FROM public.interview_evaluations AS evaluation
LEFT JOIN public.admin_users AS administrator
  ON administrator.id = evaluation.interviewer_id;

-- 3. Storage policy state. Route-only policies are required before the member
-- release because direct authenticated writes bypass server image validation.
SELECT policyname, permissive, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname IN (
    'community_storage_insert',
    'community_storage_update',
    'community_storage_delete',
    'community_storage_route_only_insert',
    'community_storage_route_only_update',
    'community_storage_route_only_delete'
  )
ORDER BY policyname;

-- 4. All base relations referenced directly or through preserved triggers by
-- the member directory/360 migration.
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
SELECT count(*) AS expected_relations,
       count(*) FILTER (WHERE to_regclass(qualified_name) IS NOT NULL)
         AS present_relations,
       array_agg(qualified_name ORDER BY qualified_name)
         FILTER (WHERE to_regclass(qualified_name) IS NULL)
         AS missing_relations
FROM expected_relation;

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
SELECT count(*) AS expected_routines,
       count(*) FILTER (WHERE to_regprocedure(signature) IS NOT NULL)
         AS present_routines,
       array_agg(signature ORDER BY signature)
         FILTER (WHERE to_regprocedure(signature) IS NULL)
         AS missing_routines,
       EXISTS (
         SELECT 1
         FROM pg_class AS sequence_info
         JOIN pg_namespace AS sequence_schema
           ON sequence_schema.oid = sequence_info.relnamespace
         WHERE sequence_schema.nspname = 'private'
           AND sequence_info.relname = 'member_profile_audit_log_id_seq'
           AND sequence_info.relkind = 'S'
       ) AS member_profile_audit_sequence_present,
       pg_get_serial_sequence(
         'private.member_profile_audit_log',
         'id'
       ) = 'private.member_profile_audit_log_id_seq'
         AS member_profile_audit_sequence_bound,
       EXISTS (
         SELECT 1
         FROM information_schema.columns AS column_info
         WHERE column_info.table_schema = 'private'
           AND column_info.table_name = 'member_profile_audit_log'
           AND column_info.column_name = 'id'
           AND column_info.is_identity = 'YES'
           AND column_info.identity_generation = 'ALWAYS'
       ) AS member_profile_audit_id_identity_valid,
       EXISTS (
         SELECT 1
         FROM pg_index AS index_info
         JOIN pg_class AS audit_table ON audit_table.oid = index_info.indrelid
         JOIN pg_namespace AS audit_schema
           ON audit_schema.oid = audit_table.relnamespace
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
       ) AS member_profile_audit_id_unique
FROM expected_routine;

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
), trigger_status AS (
  SELECT expected.*,
         EXISTS (
           SELECT 1
           FROM pg_trigger AS trigger_info
           JOIN pg_class AS trigger_table
             ON trigger_table.oid = trigger_info.tgrelid
           JOIN pg_namespace AS trigger_schema
             ON trigger_schema.oid = trigger_table.relnamespace
           WHERE trigger_schema.nspname = expected.table_schema
             AND trigger_table.relname = expected.table_name
             AND trigger_info.tgname = expected.trigger_name
             AND NOT trigger_info.tgisinternal
             AND trigger_info.tgenabled IN ('O', 'A')
             AND trigger_info.tgfoid
                 = to_regprocedure(expected.function_signature)
             AND trigger_info.tgtype::integer = expected.trigger_type
             AND COALESCE(
               (
                 SELECT array_agg(
                          attribute.attname::text
                          ORDER BY trigger_column.ordinality
                        )
                 FROM unnest(trigger_info.tgattr::smallint[])
                   WITH ORDINALITY AS trigger_column(attnum, ordinality)
                 JOIN pg_attribute AS attribute
                   ON attribute.attrelid = trigger_info.tgrelid
                  AND attribute.attnum = trigger_column.attnum
                  AND NOT attribute.attisdropped
               ),
               ARRAY[]::text[]
             ) = expected.update_columns
         ) AS valid
  FROM expected_trigger AS expected
)
SELECT count(*) AS expected_triggers,
       count(*) FILTER (WHERE valid) AS valid_triggers,
       array_agg(
         format(
           '%I.%I.%I -> %s',
           table_schema,
           table_name,
           trigger_name,
           function_signature
         ) ORDER BY table_schema, table_name, trigger_name
       ) FILTER (WHERE NOT valid) AS missing_or_mismatched_triggers
FROM trigger_status;

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
), unique_status AS (
  SELECT expected.*,
         EXISTS (
           SELECT 1
           FROM pg_index AS index_info
           JOIN pg_class AS indexed_table
             ON indexed_table.oid = index_info.indrelid
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
               SELECT array_agg(
                        attribute.attname::text ORDER BY key_column.ordinality
                      )
               FROM unnest(index_info.indkey::smallint[])
                 WITH ORDINALITY AS key_column(attnum, ordinality)
               JOIN pg_attribute AS attribute
                 ON attribute.attrelid = index_info.indrelid
                AND attribute.attnum = key_column.attnum
                AND NOT attribute.attisdropped
               WHERE key_column.ordinality <= index_info.indnkeyatts
             ) = expected.column_names
         ) AS valid
  FROM expected_unique AS expected
)
SELECT count(*) AS expected_unique_arbiters,
       count(*) FILTER (WHERE valid) AS valid_unique_arbiters,
       array_agg(
         format(
           '%I.%I(%s)',
           table_schema,
           table_name,
           array_to_string(column_names, ', ')
         ) ORDER BY table_schema, table_name
       ) FILTER (WHERE NOT valid) AS missing_or_mismatched_unique_arbiters
FROM unique_status;

-- 5. Member-master objects. Production should report these as absent before
-- the feature migrations and present after them.
WITH expected_migration(version, migration_name) AS (
  VALUES
    ('20260829175645', 'user_member_master_v1'),
    ('20260830162310', 'admin_create_missing_member_identity'),
    ('20260830163614', 'fix_member_restore_and_quiz_answers'),
    ('20260830165712', 'restore_matching_table_acl'),
    ('20260830174115', 'fix_operational_audit_trigger_record_scope'),
    ('20260830195942', 'explicit_data_api_acl_for_admin_surfaces'),
    ('20260902073905', 'archive_historical_member_records')
), expected_column(table_schema, table_name, column_name) AS (
  VALUES
    ('public', 'members', 'account_status'),
    ('public', 'members', 'profile_stage'),
    ('public', 'members', 'record_source'),
    ('public', 'members', 'record_scope'),
    ('public', 'members', 'onboarding_step'),
    ('public', 'members', 'last_profile_saved_at'),
    ('public', 'members', 'submitted_at'),
    ('public', 'members', 'account_linked_at'),
    ('public', 'members', 'anonymized_at'),
    ('public', 'legacy_members', 'canonical_member_id'),
    ('public', 'staff_profiles', 'member_id'),
    ('private', 'member_profile_audit_log', 'member_id_snapshot'),
    ('private', 'member_profile_audit_log', 'section'),
    ('private', 'member_profile_audit_log', 'source'),
    ('private', 'member_profile_audit_log', 'restored_from_event_id'),
    ('private', 'member_profile_audit_log', 'request_id'),
    ('private', 'member_profile_audit_log', 'event_schema_version'),
    ('private', 'member_profile_audit_log', 'metadata'),
    ('private', 'member_profile_audit_log', 'actor_role_snapshot')
), expected_table(qualified_name) AS (
  VALUES
    ('private.member_profile_audit_log'),
    ('private.member_role_assignments'),
    ('private.member_duplicate_candidates'),
    ('private.member_auth_tombstones'),
    ('private.member_privacy_review_queue'),
    ('private.subjectless_operational_audit_log'),
    ('private.admin_user_audit_log')
), expected_function(signature) AS (
  VALUES
    ('public.ensure_my_member_record()'),
    ('public.save_my_onboarding_step(smallint,jsonb)'),
    ('public.submit_my_onboarding()'),
    ('public.request_my_match_cancellation(uuid,text)'),
    ('public.admin_list_member_directory(integer,integer,text,text,text,text,text)'),
    ('public.admin_get_member_360(uuid)'),
    ('public.admin_update_member_section(uuid,text,jsonb,text,timestamptz)'),
    ('public.admin_restore_member_event(bigint,text)'),
    ('public.admin_list_member_audit(uuid,integer,integer)'),
    ('public.admin_preflight_member_lifecycle(uuid)'),
    ('public.admin_set_member_account_status(uuid,text,text)'),
    ('public.admin_anonymize_member(uuid,text)'),
    ('public.admin_complete_member_auth_delete(uuid,uuid,text)'),
    ('public.admin_resolve_member_duplicate_candidate(bigint,text,text)'),
    ('public.admin_hard_delete_blank_member(uuid,uuid,text)'),
    ('public.admin_upsert_activity_record(uuid,jsonb,text)'),
    ('public.admin_delete_activity_record(uuid,text)'),
    ('public.admin_delete_operational_record(text,uuid,text)'),
    ('public.admin_update_player_feedback(uuid,text,text,text,timestamptz)'),
    ('public.admin_clear_unmatched_diagnostics(uuid,uuid[],text)'),
    ('public.admin_upsert_member_note(uuid,uuid,text,text)'),
    ('public.admin_override_member_dynamic_stats(uuid,jsonb,text)'),
    ('public.admin_upsert_legacy_member(uuid,jsonb,text)'),
    ('public.admin_record_member_import_event(uuid,text,text,jsonb)'),
    ('public.admin_update_member_profile_metrics(uuid,smallint,numeric,text,text,text,text)'),
    ('public.admin_recalculate_member_activity_stats(uuid,text)'),
    ('public.admin_create_admin_whitelist(text,text,text,text)'),
    ('public.admin_update_admin_user_role(uuid,text,text)'),
    ('public.admin_delete_admin_user(uuid,text)'),
    ('public.community_admin_list_members(integer,timestamptz,uuid)'),
    ('public.community_admin_get_member(uuid)'),
    ('public.community_reveal_post_author(uuid,text,uuid)'),
    ('public.community_reveal_comment_author(uuid,text,uuid)'),
    ('public.service_set_member_line_identity(uuid,text,text)')
), audit_table(table_name) AS (
  VALUES
    ('member_dynamic_stats'),
    ('member_notes'),
    ('mutual_reviews'),
    ('activity_records'),
    ('match_results'),
    ('pair_relationships'),
    ('match_sessions'),
    ('match_round_submissions'),
    ('player_feedback'),
    ('script_play_records'),
    ('staff_profiles'),
    ('unmatched_diagnostics'),
    ('legacy_members')
), result AS (
  SELECT 'migration'::text AS category,
         version || '_' || migration_name AS item,
         EXISTS (
           SELECT 1
           FROM supabase_migrations.schema_migrations AS applied
           WHERE applied.version::text = expected_migration.version
         ) AS present
  FROM expected_migration

  UNION ALL

  SELECT 'column',
         table_schema || '.' || table_name || '.' || column_name,
         EXISTS (
           SELECT 1
           FROM information_schema.columns AS existing_column
           WHERE existing_column.table_schema = expected_column.table_schema
             AND existing_column.table_name = expected_column.table_name
             AND existing_column.column_name = expected_column.column_name
         )
  FROM expected_column

  UNION ALL

  SELECT 'table', qualified_name, to_regclass(qualified_name) IS NOT NULL
  FROM expected_table

  UNION ALL

  SELECT 'function', signature, to_regprocedure(signature) IS NOT NULL
  FROM expected_function

  UNION ALL

  SELECT 'audit_reason_column',
         'public.' || table_name || '.audit_reason',
         EXISTS (
           SELECT 1
           FROM information_schema.columns AS existing_column
           WHERE existing_column.table_schema = 'public'
             AND existing_column.table_name = audit_table.table_name
             AND existing_column.column_name = 'audit_reason'
         )
  FROM audit_table
)
SELECT category, item, present
FROM result
ORDER BY category, item;

-- 6. Aggregate data migration risk. The direct-reference set covers every
-- pre-existing member UUID column used by the six release migrations; the
-- three activity arrays and match group array are checked separately.
WITH direct_member_reference(source_name, referenced_member_id) AS (
  SELECT 'private.community_comment_authors', member_id
  FROM private.community_comment_authors
  UNION ALL
  SELECT 'private.community_post_authors', member_id
  FROM private.community_post_authors
  UNION ALL
  SELECT 'private.community_profile_members', member_id
  FROM private.community_profile_members
  UNION ALL
  SELECT 'private.member_profile_audit_log', member_id
  FROM private.member_profile_audit_log
  UNION ALL
  SELECT 'private.member_profile_metrics', member_id
  FROM private.member_profile_metrics
  UNION ALL
  SELECT 'public.community_notification_preferences', member_id
  FROM public.community_notification_preferences
  UNION ALL
  SELECT 'public.community_sanctions', member_id
  FROM public.community_sanctions
  UNION ALL
  SELECT 'public.interview_evaluations', member_id
  FROM public.interview_evaluations
  UNION ALL
  SELECT 'public.legacy_members.claimed_by', claimed_by
  FROM public.legacy_members
  UNION ALL
  SELECT 'public.match_results.member_a_id', member_a_id
  FROM public.match_results
  UNION ALL
  SELECT 'public.match_results.member_b_id', member_b_id
  FROM public.match_results
  UNION ALL
  SELECT 'public.match_round_submissions', member_id
  FROM public.match_round_submissions
  UNION ALL
  SELECT 'public.member_boundaries', member_id
  FROM public.member_boundaries
  UNION ALL
  SELECT 'public.member_dynamic_stats', member_id
  FROM public.member_dynamic_stats
  UNION ALL
  SELECT 'public.member_identity', member_id
  FROM public.member_identity
  UNION ALL
  SELECT 'public.member_interests', member_id
  FROM public.member_interests
  UNION ALL
  SELECT 'public.member_language', member_id
  FROM public.member_language
  UNION ALL
  SELECT 'public.member_notes', member_id
  FROM public.member_notes
  UNION ALL
  SELECT 'public.member_personality', member_id
  FROM public.member_personality
  UNION ALL
  SELECT 'public.member_verification', member_id
  FROM public.member_verification
  UNION ALL
  SELECT 'public.mutual_reviews.reviewer_id', reviewer_id
  FROM public.mutual_reviews
  UNION ALL
  SELECT 'public.mutual_reviews.reviewee_id', reviewee_id
  FROM public.mutual_reviews
  UNION ALL
  SELECT 'public.pair_relationships.member_a_id', member_a_id
  FROM public.pair_relationships
  UNION ALL
  SELECT 'public.pair_relationships.member_b_id', member_b_id
  FROM public.pair_relationships
  UNION ALL
  SELECT 'public.personality_quiz_results', member_id
  FROM public.personality_quiz_results
  UNION ALL
  SELECT 'public.player_feedback', member_id
  FROM public.player_feedback
  UNION ALL
  SELECT 'public.script_play_records', member_id
  FROM public.script_play_records
  UNION ALL
  SELECT 'public.unmatched_diagnostics', member_id
  FROM public.unmatched_diagnostics
), array_member_reference(source_name, referenced_member_id) AS (
  SELECT 'public.match_results.group_members', grouped.member_id
  FROM public.match_results AS result
  CROSS JOIN LATERAL unnest(
    COALESCE(result.group_members, '{}'::uuid[])
  ) AS grouped(member_id)
  UNION ALL
  SELECT 'public.activity_records.participant_ids', participant.member_id
  FROM public.activity_records AS activity
  CROSS JOIN LATERAL unnest(
    COALESCE(activity.participant_ids, '{}'::uuid[])
  ) AS participant(member_id)
  UNION ALL
  SELECT 'public.activity_records.late_member_ids', late_member.member_id
  FROM public.activity_records AS activity
  CROSS JOIN LATERAL unnest(
    COALESCE(activity.late_member_ids, '{}'::uuid[])
  ) AS late_member(member_id)
  UNION ALL
  SELECT 'public.activity_records.no_show_member_ids', no_show.member_id
  FROM public.activity_records AS activity
  CROSS JOIN LATERAL unnest(
    COALESCE(activity.no_show_member_ids, '{}'::uuid[])
  ) AS no_show(member_id)
), invalid_reference AS (
  SELECT count(*) AS invalid_count
  FROM direct_member_reference AS reference
  LEFT JOIN public.members AS member
    ON member.id = reference.referenced_member_id
  WHERE reference.referenced_member_id IS NOT NULL
    AND member.id IS NULL

  UNION ALL

  SELECT count(*)
  FROM array_member_reference AS reference
  LEFT JOIN public.members AS member
    ON member.id = reference.referenced_member_id
  WHERE reference.referenced_member_id IS NOT NULL
    AND member.id IS NULL
), population AS (
  SELECT
    (SELECT count(*) FROM auth.users) AS auth_users,
    (SELECT count(*) FROM public.members) AS members,
    (SELECT count(*) FROM public.members WHERE user_id IS NOT NULL)
      AS linked_members,
    (SELECT count(*) FROM public.members WHERE user_id IS NULL)
      AS accountless_members,
    (SELECT count(*) FROM public.member_identity) AS identity_records,
    (SELECT count(*) FROM public.legacy_members) AS legacy_records,
    (SELECT count(*)
     FROM auth.users AS auth_user
     LEFT JOIN public.members AS member ON member.user_id = auth_user.id
     WHERE member.id IS NULL) AS auth_without_member,
    (SELECT count(*)
     FROM public.members AS member
     LEFT JOIN public.member_identity AS identity
       ON identity.member_id = member.id
     WHERE identity.member_id IS NULL) AS identity_missing,
    (SELECT count(*)
     FROM public.members AS member
     JOIN auth.users AS auth_user
       ON lower(btrim(member.email)) = lower(btrim(auth_user.email))
     WHERE member.user_id IS NULL
       AND member.email IS NOT NULL
       AND auth_user.email IS NOT NULL) AS unbound_email_candidates,
    (SELECT count(*)
     FROM (
       SELECT lower(btrim(email))
       FROM public.members
       WHERE email IS NOT NULL AND btrim(email) <> ''
       GROUP BY lower(btrim(email))
       HAVING count(*) > 1
     ) AS duplicate_group) AS duplicate_member_email_groups,
    (SELECT count(*)
     FROM (
       SELECT lower(btrim(email))
       FROM auth.users
       WHERE email IS NOT NULL AND btrim(email) <> ''
       GROUP BY lower(btrim(email))
       HAVING count(*) > 1
     ) AS duplicate_group) AS duplicate_auth_email_groups,
    (SELECT COALESCE(sum(invalid_count), 0) FROM invalid_reference)
      AS invalid_member_references,
    (SELECT count(*)
     FROM public.mutual_reviews
     WHERE reviewer_id = reviewee_id) AS self_reviews
)
SELECT *,
       members + auth_without_member +
         (SELECT count(*) FROM public.legacy_members WHERE claimed_by IS NULL)
         AS projected_member_rows_after_v1
FROM population;

SELECT 'legacy_population' AS section,
       count(*) AS legacy_records,
       count(*) FILTER (WHERE claimed_by IS NOT NULL) AS linked_legacy_records,
       count(*) FILTER (WHERE claimed_by IS NULL) AS unlinked_legacy_records,
       count(*) FILTER (WHERE claim_status = 'pending') AS pending_claims,
       count(DISTINCT claimed_by) FILTER (WHERE claimed_by IS NOT NULL)
         AS distinct_claimed_members,
       (SELECT count(*)
        FROM public.legacy_members AS legacy
        LEFT JOIN public.members AS member ON member.id = legacy.claimed_by
        WHERE legacy.claimed_by IS NOT NULL AND member.id IS NULL)
         AS missing_claimed_member_references,
       (SELECT count(*)
        FROM (
          SELECT claimed_by
          FROM public.legacy_members
          WHERE claimed_by IS NOT NULL
          GROUP BY claimed_by
          HAVING count(*) > 1
        ) AS duplicate_claim) AS multiple_legacy_member_groups
FROM public.legacy_members;

SELECT 'legacy_candidate_counts' AS section,
       (SELECT count(*)
        FROM public.legacy_members AS legacy
        JOIN public.member_identity AS identity
          ON lower(btrim(identity.full_name)) = lower(btrim(legacy.full_name))
         AND identity.school_name IS NOT NULL
         AND legacy.school IS NOT NULL
         AND lower(btrim(identity.school_name)) = lower(btrim(legacy.school)))
         AS legacy_rows_matching_existing_identity_name_school,
       (SELECT count(*)
        FROM (
          SELECT lower(btrim(full_name)), lower(btrim(school))
          FROM public.legacy_members
          WHERE school IS NOT NULL AND btrim(school) <> ''
          GROUP BY lower(btrim(full_name)), lower(btrim(school))
          HAVING count(*) > 1
        ) AS duplicate_group) AS duplicate_legacy_name_school_groups,
       (SELECT count(*)
        FROM public.member_identity AS first_identity
        JOIN public.member_identity AS second_identity
          ON first_identity.member_id < second_identity.member_id
         AND first_identity.phone IS NOT NULL
         AND second_identity.phone IS NOT NULL
         AND regexp_replace(first_identity.phone, '[^0-9+]', '', 'g') <> ''
         AND regexp_replace(first_identity.phone, '[^0-9+]', '', 'g') =
             regexp_replace(second_identity.phone, '[^0-9+]', '', 'g')
         AND lower(btrim(first_identity.full_name)) =
             lower(btrim(second_identity.full_name)))
         AS identity_phone_name_duplicate_pairs;

-- 7. Every non-array quiz row must be a safely convertible JSON-stringified
-- array before the repair migration can validate its CHECK constraint.
WITH quiz_input AS (
  SELECT answers,
         jsonb_typeof(answers) AS outer_type,
         CASE
           WHEN jsonb_typeof(answers) = 'string'
             THEN pg_input_is_valid(answers #>> '{}', 'jsonb')
           ELSE false
         END AS inner_json_valid
  FROM public.personality_quiz_results
), quiz_classified AS (
  SELECT answers,
         outer_type,
         inner_json_valid,
         CASE
           WHEN outer_type = 'string' AND inner_json_valid
             THEN jsonb_typeof((answers #>> '{}')::jsonb)
           ELSE NULL
         END AS inner_type
  FROM quiz_input
)
SELECT 'quiz_answer_shapes' AS section,
       count(*) FILTER (WHERE outer_type = 'array') AS arrays,
       count(*) FILTER (
         WHERE outer_type = 'string' AND inner_type = 'array'
       ) AS safely_convertible_stringified_arrays,
       count(*) FILTER (
         WHERE outer_type = 'string' AND NOT inner_json_valid
       ) AS invalid_json_strings,
       count(*) FILTER (
         WHERE outer_type IS DISTINCT FROM 'array'
           AND NOT (outer_type = 'string' AND inner_type = 'array')
       ) AS nonconvertible_nonarrays
FROM quiz_classified;

SELECT 'administrator_counts' AS section,
       count(*) AS administrator_rows,
       count(*) FILTER (WHERE role = 'super_admin') AS super_admin_rows,
       count(*) FILTER (WHERE role = 'admin') AS admin_rows,
       count(*) FILTER (WHERE user_id IS NOT NULL) AS bound_admin_rows,
       count(*) FILTER (
         WHERE role = 'super_admin' AND user_id IS NOT NULL
       ) AS bound_super_admin_rows
FROM public.admin_users;

SELECT 'existing_profile_audit_counts' AS section,
       count(*) AS audit_rows,
       count(*) FILTER (WHERE member_id IS NULL) AS null_member_rows,
       count(*) FILTER (WHERE action_type IS NULL) AS null_action_rows
FROM private.member_profile_audit_log;

ROLLBACK;
