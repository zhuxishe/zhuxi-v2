-- User/member master migration postflight (read-only)
-- Run after 20260829175645_user_member_master_v1.sql and retain alongside
-- the preflight output. Every result set is evidence; issue rows with a
-- non-zero invalid_count require review before Preview acceptance.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

-- 1. Every Auth user should now have exactly one canonical member master row.
SELECT 'population' AS section,
       (SELECT count(*) FROM auth.users) AS auth_users,
       (SELECT count(*) FROM public.members) AS member_records,
       (SELECT count(*) FROM public.members WHERE user_id IS NOT NULL) AS linked_members,
       (SELECT count(*) FROM public.members WHERE user_id IS NULL) AS accountless_members,
       (SELECT count(*) FROM private.member_auth_tombstones) AS auth_tombstones,
       (SELECT count(*) FROM public.legacy_members) AS legacy_records,
       (SELECT count(*) FROM public.legacy_members
        WHERE canonical_member_id IS NOT NULL) AS canonicalized_legacy_records,
       (SELECT count(*)
        FROM auth.users u
        LEFT JOIN public.members m ON m.user_id = u.id
        LEFT JOIN private.member_auth_tombstones t ON t.auth_user_id = u.id
        WHERE m.id IS NULL AND t.auth_user_id IS NULL) AS auth_without_member_or_tombstone;

SELECT account_status, profile_stage, status AS approval_status,
       record_source, count(*) AS total
FROM public.members
GROUP BY account_status, profile_stage, status, record_source
ORDER BY account_status, profile_stage, status, record_source;

SELECT 'invalid_member_state' AS issue, count(*) AS invalid_count
FROM public.members
WHERE (user_id IS NULL AND account_status = 'active')
   OR (anonymized_at IS NOT NULL AND (account_status <> 'closed' OR user_id IS NOT NULL))
   OR onboarding_step NOT BETWEEN 0 AND 4
   OR (profile_stage IN ('submitted', 'complete') AND submitted_at IS NULL);

SELECT 'auth_linked_more_than_once' AS issue, count(*) AS invalid_count
FROM (
  SELECT user_id
  FROM public.members
  WHERE user_id IS NOT NULL
  GROUP BY user_id
  HAVING count(*) > 1
) AS duplicate_auth_links;

SELECT 'tombstone_still_linked_to_member' AS issue, count(*) AS invalid_count
FROM private.member_auth_tombstones AS tombstone
JOIN public.members AS member ON member.user_id = tombstone.auth_user_id;

SELECT 'legacy_without_canonical_member' AS issue, count(*) AS invalid_count
FROM public.legacy_members AS legacy
LEFT JOIN public.members AS member ON member.id = legacy.canonical_member_id
WHERE legacy.canonical_member_id IS NULL OR member.id IS NULL;

SELECT 'orphaned_legacy_shell' AS issue, count(*) AS invalid_count
FROM public.members AS member
WHERE member.record_source = 'legacy'
  AND NOT EXISTS (
    SELECT 1 FROM public.legacy_members AS legacy
    WHERE legacy.canonical_member_id = member.id
  )
  AND EXISTS (
    SELECT 1 FROM private.member_profile_audit_log AS audit
    WHERE audit.section = 'related_legacy_members'
      AND audit.after_values->>'canonical_member_id' = member.id::text
  );

-- 2. Candidate queue remains manual; no migration may silently merge it.
SELECT status, candidate_source, count(*) AS total
FROM private.member_duplicate_candidates
GROUP BY status, candidate_source
ORDER BY status, candidate_source;

SELECT 'invalid_duplicate_resolution' AS issue, count(*) AS invalid_count
FROM private.member_duplicate_candidates AS candidate
WHERE (candidate.status = 'pending' AND (
         candidate.resolved_at IS NOT NULL
         OR candidate.resolved_by_snapshot IS NOT NULL
       ))
   OR (candidate.status <> 'pending' AND (
         candidate.resolved_at IS NULL
         OR candidate.resolved_by_snapshot IS NULL
         OR NULLIF(btrim(candidate.resolution_reason), '') IS NULL
       ));

SELECT 'duplicate_active_role' AS issue, count(*) AS invalid_count
FROM (
  SELECT member_id, role_key, count(*)
  FROM private.member_role_assignments
  WHERE revoked_at IS NULL
  GROUP BY member_id, role_key
  HAVING count(*) > 1
) AS duplicates;

-- 3. Audit data is retained even if a business profile is anonymized.
SELECT action_type, count(*) AS total,
       min(created_at) AS first_event,
       max(created_at) AS last_event
FROM private.member_profile_audit_log
GROUP BY action_type
ORDER BY action_type;

SELECT 'audit_external_subject_fk' AS issue, count(*) AS invalid_count
FROM pg_constraint AS constraint_info
WHERE constraint_info.conrelid = 'private.member_profile_audit_log'::regclass
  AND constraint_info.contype = 'f'
  AND constraint_info.confrelid IN (
    'public.members'::regclass,
    'public.admin_users'::regclass,
    'auth.users'::regclass
  );

SELECT 'append_only_trigger_missing' AS issue,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_trigger AS trigger_info
         WHERE trigger_info.tgrelid = 'private.member_profile_audit_log'::regclass
           AND trigger_info.tgname = 'member_profile_audit_append_only'
           AND NOT trigger_info.tgisinternal
       ) THEN 0 ELSE 1 END AS invalid_count;

SELECT 'staff_avatar_cleanup_bucket_missing' AS issue,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint AS constraint_info
         WHERE constraint_info.conrelid =
               'private.community_media_cleanup_queue'::regclass
           AND constraint_info.contype = 'c'
           AND pg_get_constraintdef(constraint_info.oid) ILIKE '%bucket_id%'
           AND pg_get_constraintdef(constraint_info.oid) ILIKE '%staff-avatars%'
       ) THEN 0 ELSE 1 END AS invalid_count;

SELECT 'invalid_audit_actor_role_snapshot' AS issue, count(*) AS invalid_count
FROM private.member_profile_audit_log
WHERE actor_role_snapshot IS NULL
   OR actor_role_snapshot NOT IN (
     'admin', 'super_admin', 'authenticated', 'service_role', 'system'
   );

-- Privacy deletion must preserve the canonical ID while removing recoverable
-- PII from every ordinary member surface and the private anonymous-author map.
WITH anonymized AS (
  SELECT id FROM public.members WHERE anonymized_at IS NOT NULL
), residuals AS (
  SELECT 'members' AS surface, count(*) AS invalid_count
  FROM public.members AS member
  JOIN anonymized ON anonymized.id = member.id
  WHERE member.user_id IS NOT NULL
     OR member.member_number IS NOT NULL
     OR member.email IS NOT NULL
     OR member.line_user_id IS NOT NULL
     OR member.wechat_openid IS NOT NULL
     OR member.account_status <> 'closed'
  UNION ALL
  SELECT 'member_identity', count(*)
  FROM public.member_identity AS identity
  JOIN anonymized ON anonymized.id = identity.member_id
  WHERE identity.full_name NOT LIKE '匿名-%'
     OR identity.phone IS NOT NULL
     OR identity.sns_accounts IS NOT NULL
     OR identity.personal_avatar_path IS NOT NULL
  UNION ALL
  SELECT 'match_round_submissions', count(*)
  FROM public.match_round_submissions AS submission
  JOIN anonymized ON anonymized.id = submission.member_id
  WHERE submission.message IS NOT NULL
     OR submission.social_style IS NOT NULL
     OR submission.import_metadata IS NOT NULL
  UNION ALL
  SELECT 'legacy_members', count(*)
  FROM public.legacy_members AS legacy
  JOIN anonymized ON anonymized.id = legacy.canonical_member_id
  WHERE legacy.full_name NOT LIKE '匿名-%'
     OR legacy.school IS NOT NULL
     OR legacy.department IS NOT NULL
  UNION ALL
  SELECT 'member_notes', count(*)
  FROM public.member_notes AS note
  JOIN anonymized ON anonymized.id = note.member_id
  WHERE note.note IS DISTINCT FROM '[anonymized]'
  UNION ALL
  SELECT 'player_feedback', count(*)
  FROM public.player_feedback AS feedback
  JOIN anonymized ON anonymized.id = feedback.member_id
  WHERE feedback.member_name_snapshot NOT LIKE '匿名-%'
     OR feedback.content IS DISTINCT FROM '[anonymized]'
     OR feedback.admin_note IS NOT NULL
  UNION ALL
  SELECT 'script_play_records', count(*)
  FROM public.script_play_records AS play_record
  JOIN anonymized ON anonymized.id = play_record.member_id
  WHERE play_record.comment IS NOT NULL OR play_record.can_view_full
  UNION ALL
  SELECT 'unmatched_diagnostics', count(*)
  FROM public.unmatched_diagnostics AS diagnostic
  JOIN anonymized ON anonymized.id = diagnostic.member_id
  WHERE diagnostic.details IS DISTINCT FROM '{}'::jsonb
  UNION ALL
  SELECT 'staff_profiles', count(*)
  FROM public.staff_profiles AS staff
  JOIN anonymized ON anonymized.id = staff.member_id
  WHERE staff.name NOT LIKE '匿名-%'
     OR staff.school IS DISTINCT FROM 'anonymized'
     OR staff.major IS DISTINCT FROM 'anonymized'
     OR staff.intro IS DISTINCT FROM 'anonymized'
     OR staff.avatar_url IS NOT NULL
     OR staff.is_published
  UNION ALL
  SELECT 'match_result_cancellation_text', count(*)
  FROM public.match_results AS match
  JOIN anonymized ON anonymized.id = match.member_a_id
                         OR anonymized.id = match.member_b_id
                         OR anonymized.id = ANY(COALESCE(match.group_members, ARRAY[]::uuid[]))
  WHERE match.cancellation_requested_by IS NOT NULL
     OR match.cancellation_reason IS NOT NULL
  UNION ALL
  SELECT 'pair_relationship_text', count(*)
  FROM public.pair_relationships AS relationship
  JOIN anonymized ON anonymized.id = relationship.member_a_id
                         OR anonymized.id = relationship.member_b_id
  WHERE relationship.notes IS NOT NULL
     OR (relationship.member_a_id = anonymized.id AND relationship.feedback_a IS NOT NULL)
     OR (relationship.member_b_id = anonymized.id AND relationship.feedback_b IS NOT NULL)
  UNION ALL
  SELECT 'activity_notes', count(*)
  FROM public.activity_records AS activity
  JOIN anonymized ON anonymized.id = ANY(COALESCE(activity.participant_ids, ARRAY[]::uuid[]))
                         OR anonymized.id = ANY(COALESCE(activity.late_member_ids, ARRAY[]::uuid[]))
                         OR anonymized.id = ANY(COALESCE(activity.no_show_member_ids, ARRAY[]::uuid[]))
  WHERE activity.notes IS NOT NULL
  UNION ALL
  SELECT 'community_post_authors', count(*)
  FROM private.community_post_authors AS author
  JOIN anonymized ON anonymized.id = author.member_id
  UNION ALL
  SELECT 'community_comment_authors', count(*)
  FROM private.community_comment_authors AS author
  JOIN anonymized ON anonymized.id = author.member_id
)
SELECT 'anonymized_residual_' || surface AS issue, invalid_count
FROM residuals
ORDER BY surface;

-- 4. Verify only expected roles can execute the new RPC surface.
SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN (
    'ensure_my_member_record',
    'save_my_onboarding_step',
    'submit_my_onboarding',
    'request_my_match_cancellation',
    'admin_list_member_directory',
    'admin_get_member_360',
    'admin_update_member_section',
    'admin_restore_member_event',
    'admin_list_member_audit',
    'admin_preflight_member_lifecycle',
    'admin_set_member_account_status',
    'admin_anonymize_member',
    'admin_complete_member_auth_delete',
    'admin_resolve_member_duplicate_candidate',
    'admin_hard_delete_blank_member',
    'admin_upsert_activity_record',
    'admin_delete_activity_record',
    'admin_delete_operational_record',
    'admin_update_player_feedback',
    'admin_clear_unmatched_diagnostics',
    'admin_upsert_member_note',
    'admin_override_member_dynamic_stats',
    'admin_upsert_legacy_member',
    'admin_record_member_import_event',
    'admin_recalculate_member_activity_stats',
    'admin_update_member_profile_metrics',
    'admin_create_admin_whitelist',
    'admin_update_admin_user_role',
    'admin_delete_admin_user',
    'service_set_member_line_identity',
    'community_admin_list_members',
    'community_admin_get_member',
    'community_reveal_post_author',
    'community_reveal_comment_author'
  )
ORDER BY routine_name, grantee;

SELECT 'operational_reason_guard_missing' AS issue, count(*) AS invalid_count
FROM unnest(ARRAY[
  'public.member_dynamic_stats'::regclass,
  'public.member_notes'::regclass,
  'public.mutual_reviews'::regclass,
  'public.activity_records'::regclass,
  'public.match_results'::regclass,
  'public.pair_relationships'::regclass,
  'public.match_sessions'::regclass,
  'public.match_round_submissions'::regclass,
  'public.player_feedback'::regclass,
  'public.script_play_records'::regclass,
  'public.staff_profiles'::regclass,
  'public.unmatched_diagnostics'::regclass,
  'public.legacy_members'::regclass
]) AS operational(table_oid)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_attribute AS attribute_info
  WHERE attribute_info.attrelid = operational.table_oid
    AND attribute_info.attname = 'audit_reason'
    AND NOT attribute_info.attisdropped
)
OR NOT EXISTS (
  SELECT 1 FROM pg_trigger AS trigger_info
  WHERE trigger_info.tgrelid = operational.table_oid
    AND trigger_info.tgname = 'member_master_capture_audit_reason'
    AND NOT trigger_info.tgisinternal
)
OR NOT EXISTS (
  SELECT 1 FROM pg_trigger AS trigger_info
  WHERE trigger_info.tgrelid = operational.table_oid
    AND trigger_info.tgname = 'member_master_audit_related_change'
    AND NOT trigger_info.tgisinternal
);

SELECT 'admin_login_policy_invalid' AS issue,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'admin_users'
      AND policy_info.policyname = 'member_master_admin_users_self_or_super_select'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles && ARRAY['authenticated']::name[]
      AND policy_info.qual ILIKE '%user_id%'
      AND policy_info.qual ILIKE '%auth.uid%'
      AND policy_info.qual ILIKE '%member_master_is_super_admin%'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'admin_users'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles && ARRAY['public', 'authenticated']::name[]
      AND policy_info.policyname <> 'member_master_admin_users_self_or_super_select'
  ) THEN 0 ELSE 1 END AS invalid_count;

SELECT 'subjectless_operational_audit_invalid' AS issue,
  CASE WHEN
    EXISTS (
      SELECT 1 FROM pg_trigger AS trigger_info
      WHERE trigger_info.tgrelid =
            'private.subjectless_operational_audit_log'::regclass
        AND trigger_info.tgname = 'member_master_reject_audit_mutation'
        AND NOT trigger_info.tgisinternal
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint AS constraint_info
      WHERE constraint_info.conrelid =
            'private.subjectless_operational_audit_log'::regclass
        AND constraint_info.contype = 'f'
    )
    AND NOT has_table_privilege(
      'anon', 'private.subjectless_operational_audit_log', 'SELECT'
    )
    AND NOT has_table_privilege(
      'authenticated', 'private.subjectless_operational_audit_log', 'SELECT'
    )
    AND NOT has_table_privilege(
      'authenticated', 'private.subjectless_operational_audit_log', 'INSERT'
    )
    AND NOT has_table_privilege(
      'service_role', 'private.subjectless_operational_audit_log', 'INSERT'
    )
    AND has_table_privilege(
      'service_role', 'private.subjectless_operational_audit_log', 'SELECT'
    )
    AND has_schema_privilege('service_role', 'private', 'USAGE')
    AND pg_get_functiondef(
      'private.member_master_audit_related_record_change()'::regprocedure
    ) ILIKE '%subjectless_operational_audit_log%'
  THEN 0 ELSE 1 END AS invalid_count;

SELECT 'legacy_mutation_boundary_invalid' AS issue,
  CASE WHEN
    EXISTS (
      SELECT 1 FROM pg_policies AS policy_info
      WHERE policy_info.schemaname = 'public'
        AND policy_info.tablename = 'legacy_members'
        AND policy_info.policyname = 'member_master_legacy_members_super_read'
        AND policy_info.cmd = 'SELECT'
        AND policy_info.qual ILIKE '%member_master_is_super_admin%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies AS policy_info
      WHERE policy_info.schemaname = 'public'
        AND policy_info.tablename = 'legacy_members'
        AND policy_info.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
        AND policy_info.roles && ARRAY['public', 'authenticated']::name[]
    )
    AND NOT has_table_privilege('authenticated', 'public.legacy_members', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.legacy_members', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.legacy_members', 'DELETE')
    AND has_table_privilege('service_role', 'public.legacy_members', 'INSERT')
    AND has_table_privilege('service_role', 'public.legacy_members', 'UPDATE')
    AND NOT has_table_privilege('service_role', 'public.legacy_members', 'DELETE')
    AND has_function_privilege(
      'authenticated', 'public.admin_upsert_legacy_member(uuid,jsonb,text)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon', 'public.admin_upsert_legacy_member(uuid,jsonb,text)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
      'service_role', 'public.admin_upsert_legacy_member(uuid,jsonb,text)', 'EXECUTE'
    )
  THEN 0 ELSE 1 END AS invalid_count;

SELECT 'round_submission_policy_invalid' AS issue,
  CASE WHEN
    NOT EXISTS (
      SELECT 1 FROM pg_policies AS policy_info
      WHERE policy_info.schemaname = 'public'
        AND policy_info.tablename = 'match_round_submissions'
        AND policy_info.policyname IN ('player_own_submissions', 'admin_all_submissions')
    )
    AND EXISTS (
      SELECT 1 FROM pg_policies AS policy_info
      WHERE policy_info.schemaname = 'public'
        AND policy_info.tablename = 'match_round_submissions'
        AND policy_info.policyname = 'member_master_round_submissions_admin_audited_write'
        AND policy_info.cmd = 'ALL'
        AND policy_info.qual ILIKE '%member_master_is_super_admin%'
        AND policy_info.with_check ILIKE '%member_master_is_super_admin%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies AS policy_info
      WHERE policy_info.schemaname = 'public'
        AND policy_info.tablename = 'match_round_submissions'
        AND policy_info.cmd = 'DELETE'
        AND policy_info.roles && ARRAY['authenticated']::name[]
        AND policy_info.policyname <> 'member_master_round_submissions_admin_audited_write'
    )
    AND EXISTS (
      SELECT 1 FROM pg_trigger AS trigger_info
      WHERE trigger_info.tgrelid = 'public.match_round_submissions'::regclass
        AND trigger_info.tgname = 'member_master_guard_round_submission_write'
        AND NOT trigger_info.tgisinternal
    )
  THEN 0 ELSE 1 END AS invalid_count;

SELECT 'staff_public_acl_invalid' AS issue,
  CASE WHEN
    NOT has_table_privilege('anon', 'public.staff_profiles', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.staff_profiles', 'SELECT')
    AND NOT has_column_privilege('anon', 'public.staff_profiles', 'member_id', 'SELECT')
    AND NOT has_column_privilege('authenticated', 'public.staff_profiles', 'member_id', 'SELECT')
    AND NOT has_column_privilege('anon', 'public.staff_profiles', 'audit_reason', 'SELECT')
    AND NOT has_column_privilege('authenticated', 'public.staff_profiles', 'audit_reason', 'SELECT')
    AND has_table_privilege('anon', 'public.published_staff_profiles', 'SELECT')
    AND has_table_privilege('authenticated', 'public.published_staff_profiles', 'SELECT')
  THEN 0 ELSE 1 END AS invalid_count;

SELECT 'admin_user_audit_append_only_missing' AS issue,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgrelid = 'private.admin_user_audit_log'::regclass
      AND trigger_info.tgname = 'member_master_reject_audit_mutation'
      AND NOT trigger_info.tgisinternal
  ) THEN 0 ELSE 1 END AS invalid_count;

-- 5. Snapshot hardened grants and policies for review.
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema IN ('public', 'private')
  AND table_name IN (
    'members', 'member_identity', 'legacy_members', 'mutual_reviews',
    'member_role_assignments', 'member_duplicate_candidates', 'member_auth_tombstones',
    'member_profile_audit_log', 'member_privacy_review_queue',
    'member_dynamic_stats', 'member_notes', 'activity_records',
    'match_sessions', 'match_results', 'pair_relationships',
    'match_round_submissions', 'player_feedback', 'script_play_records',
    'staff_profiles', 'published_staff_profiles', 'unmatched_diagnostics',
    'admin_users', 'admin_user_audit_log', 'subjectless_operational_audit_log'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_schema, table_name, grantee, privilege_type;

SELECT table_schema, table_name, column_name, grantee, privilege_type
FROM information_schema.role_column_grants
WHERE table_schema = 'public'
  AND table_name = 'staff_profiles'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY column_name, grantee, privilege_type;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public'
       AND tablename IN (
         'members', 'member_identity', 'member_language', 'member_interests',
         'member_personality', 'member_boundaries', 'personality_quiz_results',
         'member_verification', 'interview_evaluations', 'legacy_members',
         'mutual_reviews', 'member_dynamic_stats', 'activity_records',
         'member_notes', 'match_sessions', 'match_results', 'pair_relationships',
         'match_round_submissions', 'player_feedback', 'script_play_records',
         'staff_profiles', 'unmatched_diagnostics', 'admin_users'
       ))
   OR (schemaname = 'private'
       AND tablename IN ('member_role_assignments', 'member_duplicate_candidates',
                         'member_auth_tombstones', 'member_profile_audit_log',
                         'member_privacy_review_queue', 'admin_user_audit_log',
                         'subjectless_operational_audit_log'))
ORDER BY schemaname, tablename, policyname;

-- 6. Explicit negative ACL checks. All values must be false.
SELECT
  has_table_privilege('authenticated', 'public.members', 'INSERT') AS auth_can_insert_members,
  has_table_privilege('authenticated', 'public.members', 'UPDATE') AS auth_can_update_members,
  has_table_privilege('authenticated', 'public.members', 'DELETE') AS auth_can_delete_members,
  has_table_privilege('authenticated', 'public.member_identity', 'INSERT') AS auth_can_insert_identity,
  has_table_privilege('authenticated', 'public.member_identity', 'UPDATE') AS auth_can_update_identity,
  has_function_privilege('anon', 'public.ensure_my_member_record()', 'EXECUTE') AS anon_can_ensure_member,
  has_function_privilege('anon', 'public.request_my_match_cancellation(uuid,text)', 'EXECUTE') AS anon_can_request_match_cancellation,
  has_function_privilege('authenticated', 'public.service_set_member_line_identity(uuid,text,text)', 'EXECUTE') AS auth_can_call_line_service_rpc,
  has_function_privilege('service_role', 'public.community_reveal_post_author(uuid,text,uuid)', 'EXECUTE') AS service_can_reveal_anonymous_author,
  has_function_privilege('authenticated', 'public.admin_get_member_profile_audit(uuid,integer)', 'EXECUTE') AS auth_can_call_legacy_raw_audit_rpc,
  has_function_privilege('authenticated', 'public.admin_get_member_profile_metrics(uuid)', 'EXECUTE') AS auth_can_call_legacy_metrics_rpc,
  has_function_privilege('service_role', 'public.admin_record_member_import_event(uuid,text,text,jsonb)', 'EXECUTE') AS service_can_attest_member_import,
  has_function_privilege('authenticated', 'public.admin_update_member_number(uuid,text,text)', 'EXECUTE') AS admin_can_bypass_member_number_section,
  has_function_privilege('anon', 'public.admin_delete_operational_record(text,uuid,text)', 'EXECUTE') AS anon_can_delete_operational_record,
  has_function_privilege('anon', 'public.admin_upsert_member_note(uuid,uuid,text,text)', 'EXECUTE') AS anon_can_upsert_member_note,
  has_function_privilege('anon', 'public.admin_override_member_dynamic_stats(uuid,jsonb,text)', 'EXECUTE') AS anon_can_override_member_stats,
  has_function_privilege('anon', 'public.admin_upsert_legacy_member(uuid,jsonb,text)', 'EXECUTE') AS anon_can_upsert_legacy_member,
  has_function_privilege('service_role', 'public.admin_upsert_legacy_member(uuid,jsonb,text)', 'EXECUTE') AS service_can_upsert_legacy_member,
  has_function_privilege('anon', 'public.admin_update_player_feedback(uuid,text,text,text,timestamptz)', 'EXECUTE') AS anon_can_update_player_feedback,
  has_function_privilege('anon', 'public.admin_clear_unmatched_diagnostics(uuid,uuid[],text)', 'EXECUTE') AS anon_can_clear_unmatched_diagnostics,
  has_function_privilege('anon', 'public.admin_create_admin_whitelist(text,text,text,text)', 'EXECUTE') AS anon_can_create_admin,
  has_function_privilege('anon', 'public.admin_update_admin_user_role(uuid,text,text)', 'EXECUTE') AS anon_can_update_admin_role,
  has_function_privilege('anon', 'public.admin_delete_admin_user(uuid,text)', 'EXECUTE') AS anon_can_delete_admin,
  has_table_privilege('authenticated', 'public.admin_users', 'INSERT') AS auth_can_insert_admin_users,
  has_table_privilege('authenticated', 'public.admin_users', 'UPDATE') AS auth_can_update_admin_users,
  has_table_privilege('authenticated', 'public.admin_users', 'DELETE') AS auth_can_delete_admin_users,
  has_table_privilege('authenticated', 'public.legacy_members', 'INSERT') AS auth_can_insert_legacy_members,
  has_table_privilege('authenticated', 'public.legacy_members', 'UPDATE') AS auth_can_update_legacy_members,
  has_table_privilege('authenticated', 'public.legacy_members', 'DELETE') AS auth_can_delete_legacy_members,
  has_table_privilege('service_role', 'public.legacy_members', 'DELETE') AS service_can_delete_legacy_members,
  has_table_privilege('anon', 'private.subjectless_operational_audit_log', 'SELECT') AS anon_can_read_subjectless_audit,
  has_table_privilege('authenticated', 'private.subjectless_operational_audit_log', 'SELECT') AS auth_can_read_subjectless_audit,
  has_table_privilege('authenticated', 'private.subjectless_operational_audit_log', 'INSERT') AS auth_can_insert_subjectless_audit,
  has_table_privilege('service_role', 'private.subjectless_operational_audit_log', 'INSERT') AS service_can_insert_subjectless_audit,
  has_table_privilege('anon', 'public.staff_profiles', 'SELECT') AS anon_can_select_staff_base,
  has_table_privilege('authenticated', 'public.staff_profiles', 'SELECT') AS auth_can_select_all_staff_columns,
  has_column_privilege('authenticated', 'public.staff_profiles', 'member_id', 'SELECT') AS auth_can_select_staff_member_id,
  has_column_privilege('authenticated', 'public.staff_profiles', 'audit_reason', 'SELECT') AS auth_can_select_staff_audit_reason;

ROLLBACK;
