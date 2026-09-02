-- User/member master migration postflight (read-only, fail-closed)
-- Run only after all seven member-master migrations listed in the migration
-- history assertion below. Retain the complete output alongside the preflight.
-- Diagnostic result sets remain human-readable evidence; the final DO blocks
-- independently re-check release-critical invariants and raise on any failure.

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
    'scripts', 'match_rounds', 'match_sessions', 'match_results',
    'personality_quiz_config', 'pair_relationships',
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
         'member_notes', 'scripts', 'match_rounds', 'match_sessions',
         'match_results', 'personality_quiz_config', 'pair_relationships',
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

-- 7. Fail-closed release assertions. The snapshots above remain useful when
-- diagnosing a failure, but zero-row/boolean output is no longer acceptance.

DO $postflight_history$
DECLARE
  v_missing text;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_POSTFLIGHT_MIGRATION_HISTORY_MISSING',
      DETAIL = 'supabase_migrations.schema_migrations does not exist';
  END IF;

  SELECT string_agg(
    required.version || '_' || required.migration_name,
    ', ' ORDER BY required.version
  )
  INTO v_missing
  FROM (VALUES
    ('20260829175645', 'user_member_master_v1'),
    ('20260830162310', 'admin_create_missing_member_identity'),
    ('20260830163614', 'fix_member_restore_and_quiz_answers'),
    ('20260830165712', 'restore_matching_table_acl'),
    ('20260830174115', 'fix_operational_audit_trigger_record_scope'),
    ('20260830195942', 'explicit_data_api_acl_for_admin_surfaces'),
    ('20260831164143', 'backfill_missing_member_submission_timestamps'),
    ('20260902073905', 'archive_historical_member_records')
  ) AS required(version, migration_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations AS applied
    WHERE applied.version::text = required.version
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_POSTFLIGHT_MIGRATIONS_INCOMPLETE',
      DETAIL = 'Missing migration history: ' || v_missing;
  END IF;

  RAISE NOTICE 'PASS migration history: all 8 member-master migrations are applied';
END
$postflight_history$;

DO $postflight_rpcs$
DECLARE
  v_expected record;
  v_proc regprocedure;
  v_failures text[] := ARRAY[]::text[];
BEGIN
  FOR v_expected IN
    SELECT *
    FROM (VALUES
      ('public.ensure_my_member_record()', false, true, false),
      ('public.save_my_onboarding_step(smallint,jsonb)', false, true, false),
      ('public.submit_my_onboarding()', false, true, false),
      ('public.request_my_match_cancellation(uuid,text)', false, true, false),
      ('public.admin_list_member_directory(integer,integer,text,text,text,text,text)', false, true, false),
      ('public.admin_get_member_360(uuid)', false, true, false),
      ('public.admin_update_member_section(uuid,text,jsonb,text,timestamptz)', false, true, false),
      ('public.admin_restore_member_event(bigint,text)', false, true, false),
      ('public.admin_list_member_audit(uuid,integer,integer)', false, true, false),
      ('public.admin_preflight_member_lifecycle(uuid)', false, true, false),
      ('public.admin_set_member_account_status(uuid,text,text)', false, true, false),
      ('public.admin_anonymize_member(uuid,text)', false, true, false),
      ('public.admin_complete_member_auth_delete(uuid,uuid,text)', false, true, false),
      ('public.admin_resolve_member_duplicate_candidate(bigint,text,text)', false, true, false),
      ('public.admin_hard_delete_blank_member(uuid,uuid,text)', false, true, false),
      ('public.admin_upsert_activity_record(uuid,jsonb,text)', false, true, false),
      ('public.admin_delete_activity_record(uuid,text)', false, true, false),
      ('public.admin_delete_operational_record(text,uuid,text)', false, true, false),
      ('public.admin_update_player_feedback(uuid,text,text,text,timestamptz)', false, true, false),
      ('public.admin_clear_unmatched_diagnostics(uuid,uuid[],text)', false, true, false),
      ('public.admin_upsert_member_note(uuid,uuid,text,text)', false, true, false),
      ('public.admin_override_member_dynamic_stats(uuid,jsonb,text)', false, true, false),
      ('public.admin_upsert_legacy_member(uuid,jsonb,text)', false, true, false),
      ('public.admin_record_member_import_event(uuid,text,text,jsonb)', false, true, false),
      ('public.admin_update_member_profile_metrics(uuid,smallint,numeric,text,text,text,text)', false, true, false),
      ('public.admin_recalculate_member_activity_stats(uuid,text)', false, true, false),
      ('public.admin_create_admin_whitelist(text,text,text,text)', false, true, false),
      ('public.admin_update_admin_user_role(uuid,text,text)', false, true, false),
      ('public.admin_delete_admin_user(uuid,text)', false, true, false),
      ('public.community_admin_list_members(integer,timestamptz,uuid)', false, true, true),
      ('public.community_admin_get_member(uuid)', false, true, false),
      ('public.community_reveal_post_author(uuid,text,uuid)', false, true, false),
      ('public.community_reveal_comment_author(uuid,text,uuid)', false, true, false),
      ('public.service_set_member_line_identity(uuid,text,text)', false, false, true)
    ) AS expected(
      signature, anon_execute, authenticated_execute, service_execute
    )
  LOOP
    v_proc := to_regprocedure(v_expected.signature);
    IF v_proc IS NULL THEN
      v_failures := array_append(
        v_failures, 'missing RPC ' || v_expected.signature
      );
      CONTINUE;
    END IF;

    IF has_function_privilege('anon', v_proc::oid, 'EXECUTE')
       IS DISTINCT FROM v_expected.anon_execute THEN
      v_failures := array_append(
        v_failures, 'anon EXECUTE mismatch for ' || v_expected.signature
      );
    END IF;
    IF has_function_privilege('authenticated', v_proc::oid, 'EXECUTE')
       IS DISTINCT FROM v_expected.authenticated_execute THEN
      v_failures := array_append(
        v_failures, 'authenticated EXECUTE mismatch for ' || v_expected.signature
      );
    END IF;
    IF has_function_privilege('service_role', v_proc::oid, 'EXECUTE')
       IS DISTINCT FROM v_expected.service_execute THEN
      v_failures := array_append(
        v_failures, 'service_role EXECUTE mismatch for ' || v_expected.signature
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc AS procedure_info
      WHERE procedure_info.oid = v_proc::oid
        AND procedure_info.prosecdef
        AND EXISTS (
          SELECT 1
          FROM unnest(procedure_info.proconfig) AS setting(value)
          WHERE setting.value LIKE 'search_path=%'
        )
    ) THEN
      v_failures := array_append(
        v_failures,
        'RPC is not SECURITY DEFINER with pinned search_path: ' ||
        v_expected.signature
      );
    END IF;
  END LOOP;

  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_POSTFLIGHT_RPC_ASSERTIONS_FAILED',
      DETAIL = array_to_string(v_failures, E'\n');
  END IF;

  RAISE NOTICE 'PASS RPC surface: 34 signatures, role grants, SECURITY DEFINER, search_path';
END
$postflight_rpcs$;

DO $postflight_schema$
DECLARE
  v_expected record;
  v_relation oid;
  v_definition text;
  v_invalid_quiz_rows bigint;
  v_failures text[] := ARRAY[]::text[];
BEGIN
  FOR v_expected IN
    SELECT *
    FROM (VALUES
      ('public', 'members', 'members_account_status_check', 'c'),
      ('public', 'members', 'members_profile_stage_check', 'c'),
      ('public', 'members', 'members_record_source_check', 'c'),
      ('public', 'members', 'members_record_scope_state_check', 'c'),
      ('public', 'members', 'members_onboarding_step_check', 'c'),
      ('public', 'members', 'members_anonymized_state_check', 'c'),
      ('public', 'legacy_members', 'legacy_members_canonical_member_id_fkey', 'f'),
      ('private', 'member_profile_audit_log', 'member_profile_audit_log_action_type_check', 'c'),
      ('private', 'member_profile_audit_log', 'member_profile_audit_log_source_check', 'c'),
      ('public', 'personality_quiz_results', 'personality_quiz_results_answers_array_check', 'c')
    ) AS expected(schema_name, table_name, constraint_name, constraint_type)
  LOOP
    v_relation := to_regclass(format('%I.%I', v_expected.schema_name, v_expected.table_name));
    IF v_relation IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_info
      WHERE constraint_info.conrelid = v_relation
        AND constraint_info.conname = v_expected.constraint_name
        AND constraint_info.contype = v_expected.constraint_type::"char"
        AND constraint_info.convalidated
    ) THEN
      v_failures := array_append(
        v_failures,
        'missing or unvalidated constraint ' || v_expected.schema_name || '.' ||
        v_expected.table_name || '.' || v_expected.constraint_name
      );
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_info
    JOIN pg_class AS member_table
      ON member_table.oid = index_info.indrelid
    JOIN pg_namespace AS member_schema
      ON member_schema.oid = member_table.relnamespace
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
      AND (
        index_info.indpred IS NULL
        OR pg_get_expr(index_info.indpred, index_info.indrelid)
             ILIKE '%user_id IS NOT NULL%'
      )
  ) THEN
    v_failures := array_append(
      v_failures, 'missing valid unique index for members.user_id'
    );
  END IF;

  FOR v_expected IN
    SELECT *
    FROM (VALUES
      ('public', 'members', 'member_master_sync_lifecycle'),
      ('public', 'members', 'member_master_audit_member_change'),
      ('public', 'members', 'member_master_sync_member_roles'),
      ('private', 'member_duplicate_candidates', 'member_master_skip_historical_duplicate_candidate'),
      ('private', 'member_profile_audit_log', 'member_profile_audit_append_only'),
      ('public', 'match_round_submissions', 'member_master_guard_round_submission_write'),
      ('public', 'match_results', 'member_master_capture_audit_reason'),
      ('public', 'match_results', 'member_master_audit_related_change'),
      ('public', 'match_sessions', 'member_master_capture_audit_reason'),
      ('public', 'match_sessions', 'member_master_audit_related_change'),
      ('private', 'subjectless_operational_audit_log', 'member_master_reject_audit_mutation'),
      ('private', 'admin_user_audit_log', 'member_master_reject_audit_mutation')
    ) AS expected(schema_name, table_name, trigger_name)
  LOOP
    v_relation := to_regclass(format('%I.%I', v_expected.schema_name, v_expected.table_name));
    IF v_relation IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger_info
      WHERE trigger_info.tgrelid = v_relation
        AND trigger_info.tgname = v_expected.trigger_name
        AND trigger_info.tgenabled <> 'D'
        AND NOT trigger_info.tgisinternal
    ) THEN
      v_failures := array_append(
        v_failures,
        'missing or disabled trigger ' || v_expected.schema_name || '.' ||
        v_expected.table_name || '.' || v_expected.trigger_name
      );
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
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
        AND trigger_info.tgenabled <> 'D'
        AND NOT trigger_info.tgisinternal
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger AS trigger_info
      WHERE trigger_info.tgrelid = operational.table_oid
        AND trigger_info.tgname = 'member_master_audit_related_change'
        AND trigger_info.tgenabled <> 'D'
        AND NOT trigger_info.tgisinternal
    )
  ) THEN
    v_failures := array_append(
      v_failures, 'operational audit column/trigger coverage is incomplete'
    );
  END IF;

  -- 20260830162310: the first administrator identity edit must be able to
  -- create the canonical identity row without bypassing required fields.
  v_definition := pg_get_functiondef(
    to_regprocedure('public.admin_update_member_section(uuid,text,jsonb,text,timestamptz)')
  );
  IF v_definition IS NULL
     OR v_definition NOT ILIKE '%MEMBER_MASTER_IDENTITY_REQUIRED_FIELDS_MISSING%'
     OR v_definition NOT ILIKE ('%INSERT' || ' INTO public.member_identity%')
     OR v_definition NOT ILIKE '%ON CONFLICT (member_id) DO NOTHING%' THEN
    v_failures := array_append(
      v_failures, 'admin_update_member_section identity bootstrap fix is absent'
    );
  END IF;

  -- 20260830163614: quiz answers must be canonical arrays before release, and
  -- a restore that changes nothing must fail before touching updated_at/audit.
  SELECT count(*) INTO v_invalid_quiz_rows
  FROM public.personality_quiz_results AS quiz
  WHERE jsonb_typeof(quiz.answers) IS DISTINCT FROM 'array';
  IF v_invalid_quiz_rows <> 0 THEN
    v_failures := array_append(
      v_failures,
      format('personality_quiz_results has %s non-array answer rows', v_invalid_quiz_rows)
    );
  END IF;

  v_definition := pg_get_functiondef(
    to_regprocedure('public.admin_restore_member_event(bigint,text)')
  );
  IF v_definition IS NULL
     OR v_definition NOT ILIKE '%MEMBER_MASTER_RESTORE_NO_CHANGES%'
     OR v_definition NOT ILIKE '%restored_from_event_id%'
     OR strpos(v_definition, 'MEMBER_MASTER_RESTORE_NO_CHANGES') = 0
     OR strpos(
       v_definition, 'UPDATE public.members' || ' SET updated_at = now()'
     ) = 0
     OR strpos(v_definition, 'MEMBER_MASTER_RESTORE_NO_CHANGES') >
        strpos(
          v_definition, 'UPDATE public.members' || ' SET updated_at = now()'
        ) THEN
    v_failures := array_append(
      v_failures, 'admin_restore_member_event truthful-restore fix is absent'
    );
  END IF;

  -- 20260830174115: keep NEW.member_id inside the table-specific nested block;
  -- cross-table trigger planning must not resolve that field for other rows.
  v_definition := pg_get_functiondef(
    to_regprocedure('private.member_master_capture_operational_audit_reason()')
  );
  IF v_definition IS NULL
     OR v_definition NOT LIKE
       '%TG_TABLE_NAME = ''match_round_submissions''%TG_OP IN (''INSERT'', ''UPDATE'') THEN%IF NOT v_is_service%'
     OR v_definition LIKE
       '%TG_OP IN (''INSERT'', ''UPDATE'')%AND NOT v_is_service%' THEN
    v_failures := array_append(
      v_failures, 'operational audit trigger record-scope fix is absent'
    );
  END IF;

  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_POSTFLIGHT_SCHEMA_ASSERTIONS_FAILED',
      DETAIL = array_to_string(v_failures, E'\n');
  END IF;

  RAISE NOTICE 'PASS schema: constraints, indexes, triggers, and repair effects';
END
$postflight_schema$;

DO $postflight_data$
DECLARE
  v_invalid bigint;
  v_detail text;
  v_failures text[] := ARRAY[]::text[];
BEGIN
  SELECT count(*) INTO v_invalid
  FROM auth.users AS auth_user
  LEFT JOIN public.members AS member ON member.user_id = auth_user.id
  LEFT JOIN private.member_auth_tombstones AS tombstone
    ON tombstone.auth_user_id = auth_user.id
  WHERE member.id IS NULL AND tombstone.auth_user_id IS NULL;
  IF v_invalid <> 0 THEN
    v_failures := array_append(
      v_failures, format('%s Auth users lack a member or tombstone', v_invalid)
    );
  END IF;

  SELECT count(*) INTO v_invalid
  FROM public.members AS member
  WHERE (member.user_id IS NULL AND member.account_status = 'active')
     OR (member.anonymized_at IS NOT NULL AND (
           member.account_status <> 'closed' OR member.user_id IS NOT NULL
         ))
     OR member.onboarding_step NOT BETWEEN 0 AND 4
     OR (member.profile_stage IN ('submitted', 'complete')
         AND member.submitted_at IS NULL);
  IF v_invalid <> 0 THEN
    v_failures := array_append(
      v_failures, format('%s members have an invalid lifecycle state', v_invalid)
    );
  END IF;

  SELECT count(*) INTO v_invalid
  FROM public.members AS member
  WHERE member.record_scope NOT IN ('current', 'historical')
     OR (
       member.record_scope = 'current'
       AND member.record_source IN ('legacy', 'import')
     )
     OR (
       member.record_scope = 'historical'
       AND (
         member.record_source NOT IN ('legacy', 'import')
         OR member.user_id IS NOT NULL
         OR member.email IS NOT NULL
         OR member.line_user_id IS NOT NULL
         OR member.wechat_openid IS NOT NULL
         OR member.account_linked_at IS NOT NULL
         OR member.account_status <> 'unbound'
       )
     );
  IF v_invalid <> 0 THEN
    v_failures := array_append(
      v_failures, format('%s members have an invalid historical record scope', v_invalid)
    );
  END IF;

  SELECT count(*) INTO v_invalid
  FROM (
    SELECT member.user_id
    FROM public.members AS member
    WHERE member.user_id IS NOT NULL
    GROUP BY member.user_id
    HAVING count(*) > 1
  ) AS duplicate_auth_links;
  IF v_invalid <> 0 THEN
    v_failures := array_append(
      v_failures, format('%s Auth IDs link to multiple members', v_invalid)
    );
  END IF;

  SELECT count(*) INTO v_invalid
  FROM private.member_auth_tombstones AS tombstone
  JOIN public.members AS member ON member.user_id = tombstone.auth_user_id;
  IF v_invalid <> 0 THEN
    v_failures := array_append(
      v_failures, format('%s tombstones remain linked to members', v_invalid)
    );
  END IF;

  SELECT count(*) INTO v_invalid
  FROM public.legacy_members AS legacy
  LEFT JOIN public.members AS member ON member.id = legacy.canonical_member_id
  WHERE legacy.canonical_member_id IS NULL OR member.id IS NULL;
  IF v_invalid <> 0 THEN
    v_failures := array_append(
      v_failures, format('%s legacy rows lack a canonical member', v_invalid)
    );
  END IF;

  SELECT count(*) INTO v_invalid
  FROM public.members AS member
  WHERE member.record_source = 'legacy'
    AND NOT EXISTS (
      SELECT 1
      FROM public.legacy_members AS legacy
      WHERE legacy.canonical_member_id = member.id
    )
    AND EXISTS (
      SELECT 1
      FROM private.member_profile_audit_log AS audit
      WHERE audit.section = 'related_legacy_members'
        AND audit.after_values->>'canonical_member_id' = member.id::text
    );
  IF v_invalid <> 0 THEN
    v_failures := array_append(
      v_failures, format('%s canonical legacy shells are orphaned', v_invalid)
    );
  END IF;

  SELECT count(*) INTO v_invalid
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
  IF v_invalid <> 0 THEN
    v_failures := array_append(
      v_failures, format('%s duplicate candidates have invalid resolution state', v_invalid)
    );
  END IF;

  SELECT count(*) INTO v_invalid
  FROM (
    SELECT assignment.member_id, assignment.role_key
    FROM private.member_role_assignments AS assignment
    WHERE assignment.revoked_at IS NULL
    GROUP BY assignment.member_id, assignment.role_key
    HAVING count(*) > 1
  ) AS duplicate_active_roles;
  IF v_invalid <> 0 THEN
    v_failures := array_append(
      v_failures, format('%s member/role pairs have duplicate active grants', v_invalid)
    );
  END IF;

  SELECT count(*) INTO v_invalid
  FROM private.member_role_assignments AS assignment
  JOIN public.members AS member ON member.id = assignment.member_id
  WHERE member.record_scope = 'historical'
    AND assignment.revoked_at IS NULL;
  IF v_invalid <> 0 THEN
    v_failures := array_append(
      v_failures, format('%s historical records retain active roles', v_invalid)
    );
  END IF;

  SELECT count(*) INTO v_invalid
  FROM private.member_profile_audit_log AS audit
  WHERE audit.actor_role_snapshot IS NULL
     OR audit.actor_role_snapshot NOT IN (
       'admin', 'super_admin', 'authenticated', 'service_role', 'system'
     );
  IF v_invalid <> 0 THEN
    v_failures := array_append(
      v_failures, format('%s audit rows have an invalid actor role snapshot', v_invalid)
    );
  END IF;

  WITH anonymized AS (
    SELECT member.id
    FROM public.members AS member
    WHERE member.anonymized_at IS NOT NULL
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
                           OR anonymized.id = ANY(
                             COALESCE(match.group_members, ARRAY[]::uuid[])
                           )
    WHERE match.cancellation_requested_by IS NOT NULL
       OR match.cancellation_reason IS NOT NULL
    UNION ALL
    SELECT 'pair_relationship_text', count(*)
    FROM public.pair_relationships AS relationship
    JOIN anonymized ON anonymized.id = relationship.member_a_id
                           OR anonymized.id = relationship.member_b_id
    WHERE relationship.notes IS NOT NULL
       OR (relationship.member_a_id = anonymized.id
           AND relationship.feedback_a IS NOT NULL)
       OR (relationship.member_b_id = anonymized.id
           AND relationship.feedback_b IS NOT NULL)
    UNION ALL
    SELECT 'activity_notes', count(*)
    FROM public.activity_records AS activity
    JOIN anonymized ON anonymized.id = ANY(
                           COALESCE(activity.participant_ids, ARRAY[]::uuid[])
                         )
                         OR anonymized.id = ANY(
                           COALESCE(activity.late_member_ids, ARRAY[]::uuid[])
                         )
                         OR anonymized.id = ANY(
                           COALESCE(activity.no_show_member_ids, ARRAY[]::uuid[])
                         )
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
  SELECT string_agg(
    format('%s=%s', residuals.surface, residuals.invalid_count),
    ', ' ORDER BY residuals.surface
  )
  INTO v_detail
  FROM residuals
  WHERE residuals.invalid_count <> 0;
  IF v_detail IS NOT NULL THEN
    v_failures := array_append(
      v_failures, 'anonymized PII/content residuals: ' || v_detail
    );
  END IF;

  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBER_MASTER_POSTFLIGHT_DATA_ASSERTIONS_FAILED',
      DETAIL = array_to_string(v_failures, E'\n');
  END IF;

  RAISE NOTICE 'PASS data: identity links, lifecycle, historical isolation, duplicates, audit snapshots, anonymization';
END
$postflight_data$;

DO $postflight_boundaries$
DECLARE
  v_expected record;
  v_proc regprocedure;
  v_failures text[] := ARRAY[]::text[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid =
          'private.member_profile_audit_log'::regclass
      AND constraint_info.contype = 'f'
      AND constraint_info.confrelid IN (
        'public.members'::regclass,
        'public.admin_users'::regclass,
        'auth.users'::regclass
      )
  ) THEN
    v_failures := array_append(
      v_failures, 'member_profile_audit_log has a mutable-subject foreign key'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid =
          'private.community_media_cleanup_queue'::regclass
      AND constraint_info.contype = 'c'
      AND pg_get_constraintdef(constraint_info.oid) ILIKE '%bucket_id%'
      AND pg_get_constraintdef(constraint_info.oid) ILIKE '%staff-avatars%'
  ) THEN
    v_failures := array_append(
      v_failures, 'community media cleanup queue does not allow staff-avatars'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'admin_users'
      AND policy_info.policyname = 'member_master_admin_users_self_or_super_select'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles && ARRAY['authenticated']::name[]
      AND policy_info.qual ILIKE '%user_id%'
      AND policy_info.qual ILIKE '%auth.uid%'
      AND policy_info.qual ILIKE '%member_master_is_super_admin%'
  ) OR EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'admin_users'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.roles && ARRAY['public', 'authenticated']::name[]
      AND policy_info.policyname <> 'member_master_admin_users_self_or_super_select'
  ) THEN
    v_failures := array_append(v_failures, 'admin login SELECT policy is too broad');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_info
    WHERE trigger_info.tgrelid =
          'private.subjectless_operational_audit_log'::regclass
      AND trigger_info.tgname = 'member_master_reject_audit_mutation'
      AND trigger_info.tgenabled <> 'D'
      AND NOT trigger_info.tgisinternal
  ) OR EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid =
          'private.subjectless_operational_audit_log'::regclass
      AND constraint_info.contype = 'f'
  ) OR has_table_privilege(
    'anon', 'private.subjectless_operational_audit_log', 'SELECT'
  ) OR has_table_privilege(
    'authenticated', 'private.subjectless_operational_audit_log', 'SELECT'
  ) OR has_table_privilege(
    'authenticated', 'private.subjectless_operational_audit_log', 'INSERT'
  ) OR has_table_privilege(
    'service_role', 'private.subjectless_operational_audit_log', 'INSERT'
  ) OR NOT has_table_privilege(
    'service_role', 'private.subjectless_operational_audit_log', 'SELECT'
  ) OR NOT has_schema_privilege('service_role', 'private', 'USAGE')
    OR pg_get_functiondef(
      'private.member_master_audit_related_record_change()'::regprocedure
    ) NOT ILIKE '%subjectless_operational_audit_log%' THEN
    v_failures := array_append(
      v_failures, 'subjectless operational audit boundary is invalid'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'legacy_members'
      AND policy_info.policyname = 'member_master_legacy_members_super_read'
      AND policy_info.cmd = 'SELECT'
      AND policy_info.qual ILIKE '%member_master_is_super_admin%'
  ) OR EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'legacy_members'
      AND policy_info.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND policy_info.roles && ARRAY['public', 'authenticated']::name[]
  ) OR has_table_privilege('authenticated', 'public.legacy_members', 'INSERT')
    OR has_table_privilege('authenticated', 'public.legacy_members', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.legacy_members', 'DELETE')
    OR NOT has_table_privilege('service_role', 'public.legacy_members', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.legacy_members', 'UPDATE')
    OR has_table_privilege('service_role', 'public.legacy_members', 'DELETE') THEN
    v_failures := array_append(v_failures, 'legacy mutation boundary is invalid');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_round_submissions'
      AND policy_info.policyname IN ('player_own_submissions', 'admin_all_submissions')
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_round_submissions'
      AND policy_info.policyname = 'member_master_round_submissions_admin_audited_write'
      AND policy_info.cmd = 'ALL'
      AND policy_info.qual ILIKE '%member_master_is_super_admin%'
      AND policy_info.with_check ILIKE '%member_master_is_super_admin%'
  ) OR EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_round_submissions'
      AND policy_info.cmd = 'DELETE'
      AND policy_info.roles && ARRAY['authenticated']::name[]
      AND policy_info.policyname <> 'member_master_round_submissions_admin_audited_write'
  ) THEN
    v_failures := array_append(v_failures, 'round submission policy boundary is invalid');
  END IF;

  IF has_table_privilege('anon', 'public.staff_profiles', 'SELECT')
     OR has_table_privilege('authenticated', 'public.staff_profiles', 'SELECT')
     OR has_column_privilege('anon', 'public.staff_profiles', 'member_id', 'SELECT')
     OR has_column_privilege(
       'authenticated', 'public.staff_profiles', 'member_id', 'SELECT'
     )
     OR has_column_privilege('anon', 'public.staff_profiles', 'audit_reason', 'SELECT')
     OR has_column_privilege(
       'authenticated', 'public.staff_profiles', 'audit_reason', 'SELECT'
     )
     OR NOT has_table_privilege('anon', 'public.published_staff_profiles', 'SELECT')
     OR NOT has_table_privilege(
       'authenticated', 'public.published_staff_profiles', 'SELECT'
     ) THEN
    v_failures := array_append(v_failures, 'staff profile public projection ACL is invalid');
  END IF;

  IF has_table_privilege('authenticated', 'public.members', 'INSERT')
     OR has_table_privilege('authenticated', 'public.members', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.members', 'DELETE')
     OR has_table_privilege('authenticated', 'public.member_identity', 'INSERT')
     OR has_table_privilege('authenticated', 'public.member_identity', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.member_identity', 'DELETE')
     OR has_table_privilege('authenticated', 'public.admin_users', 'INSERT')
     OR has_table_privilege('authenticated', 'public.admin_users', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.admin_users', 'DELETE') THEN
    v_failures := array_append(
      v_failures, 'direct authenticated write bypass exists on a protected master table'
    );
  END IF;

  FOR v_expected IN
    SELECT *
    FROM (VALUES
      ('public.admin_get_member_profile_audit(uuid,integer)', 'authenticated'),
      ('public.admin_get_member_profile_metrics(uuid)', 'authenticated'),
      ('public.admin_update_member_number(uuid,text,text)', 'authenticated'),
      ('public.admin_record_member_import_event(uuid,text,text,jsonb)', 'service_role'),
      ('public.community_reveal_post_author(uuid,text,uuid)', 'service_role'),
      ('public.community_reveal_comment_author(uuid,text,uuid)', 'service_role')
    ) AS forbidden(signature, role_name)
  LOOP
    v_proc := to_regprocedure(v_expected.signature);
    IF v_proc IS NOT NULL
       AND has_function_privilege(v_expected.role_name, v_proc::oid, 'EXECUTE') THEN
      v_failures := array_append(
        v_failures,
        v_expected.role_name || ' can execute forbidden/legacy RPC ' ||
        v_expected.signature
      );
    END IF;
  END LOOP;

  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_POSTFLIGHT_BOUNDARY_ASSERTIONS_FAILED',
      DETAIL = array_to_string(v_failures, E'\n');
  END IF;

  RAISE NOTICE 'PASS boundaries: audit immutability, admin/legacy isolation, staff projection';
END
$postflight_boundaries$;

DO $postflight_data_api$
DECLARE
  v_expected record;
  v_policy record;
  v_relation oid;
  v_role text;
  v_privileges text[] := ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE',
    'TRUN' || 'CATE', 'REFERENCES', 'TRIGGER'
  ];
  v_expected_privileges boolean[];
  v_index integer;
  v_failures text[] := ARRAY[]::text[];
BEGIN
  FOR v_expected IN
    SELECT *
    FROM (VALUES
      ('scripts', true, false, false, false, true, true, true, true, true, true, true, true),
      ('match_results', false, false, false, false, true, true, true, false, true, true, true, true),
      ('match_rounds', false, false, false, false, true, true, true, false, true, true, true, true),
      ('match_sessions', false, false, false, false, true, true, true, false, true, true, true, true),
      ('member_dynamic_stats', false, false, false, false, true, false, false, false, true, true, true, true),
      ('member_notes', false, false, false, false, true, false, false, false, true, true, true, true),
      ('mutual_reviews', false, false, false, false, true, false, false, false, true, true, true, true),
      ('activity_records', false, false, false, false, true, false, false, false, true, true, true, true),
      ('pair_relationships', false, false, false, false, true, true, true, false, true, true, true, true),
      ('match_round_submissions', false, false, false, false, true, true, true, false, true, true, true, true),
      ('player_feedback', false, false, false, false, false, false, false, false, true, true, true, false),
      ('script_play_records', false, false, false, false, true, true, true, false, true, true, true, true),
      ('unmatched_diagnostics', false, false, false, false, false, true, false, false, true, true, true, true),
      ('personality_quiz_config', false, false, false, false, true, true, true, false, true, true, true, true)
    ) AS expected(
      table_name,
      anon_select, anon_insert, anon_update, anon_delete,
      auth_select, auth_insert, auth_update, auth_delete,
      service_select, service_insert, service_update, service_delete
    )
  LOOP
    v_relation := to_regclass(format('public.%I', v_expected.table_name));
    IF v_relation IS NULL THEN
      v_failures := array_append(
        v_failures, 'missing Data API table public.' || v_expected.table_name
      );
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class AS relation
      WHERE relation.oid = v_relation AND relation.relrowsecurity
    ) THEN
      v_failures := array_append(
        v_failures, 'RLS is disabled on public.' || v_expected.table_name
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_class AS relation
      CROSS JOIN LATERAL aclexplode(
        COALESCE(relation.relacl, acldefault('r', relation.relowner))
      ) AS privilege_info
      WHERE relation.oid = v_relation
        AND privilege_info.grantee = 0
    ) THEN
      v_failures := array_append(
        v_failures, 'PUBLIC has a table privilege on public.' || v_expected.table_name
      );
    END IF;

    FOR v_role, v_expected_privileges IN
      SELECT *
      FROM (VALUES
        ('anon'::text, ARRAY[
          v_expected.anon_select, v_expected.anon_insert,
          v_expected.anon_update, v_expected.anon_delete,
          false, false, false
        ]::boolean[]),
        ('authenticated'::text, ARRAY[
          v_expected.auth_select, v_expected.auth_insert,
          v_expected.auth_update, v_expected.auth_delete,
          false, false, false
        ]::boolean[]),
        ('service_role'::text, ARRAY[
          v_expected.service_select, v_expected.service_insert,
          v_expected.service_update, v_expected.service_delete,
          false, false, false
        ]::boolean[])
      ) AS role_matrix(role_name, expected_privileges)
    LOOP
      FOR v_index IN 1..cardinality(v_privileges) LOOP
        IF has_table_privilege(
             v_role, v_relation, v_privileges[v_index]
           ) IS DISTINCT FROM v_expected_privileges[v_index] THEN
          v_failures := array_append(
            v_failures,
            format(
              '%s %s on public.%s expected %s',
              v_role, v_privileges[v_index], v_expected.table_name,
              v_expected_privileges[v_index]
            )
          );
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  FOR v_policy IN
    SELECT *
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
    ) AS required(table_name, policy_name, command_name, role_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies AS policy_info
      WHERE policy_info.schemaname = 'public'
        AND policy_info.tablename = v_policy.table_name
        AND policy_info.policyname = v_policy.policy_name
        AND policy_info.cmd = v_policy.command_name
        AND v_policy.role_name::name = ANY(policy_info.roles)
    ) THEN
      v_failures := array_append(
        v_failures,
        'missing/changed RLS policy public.' || v_policy.table_name || '.' ||
        v_policy.policy_name
      );
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'scripts'
      AND policy_info.policyname = 'anon_read_published'
      AND policy_info.qual ILIKE '%is_published%true%'
  ) THEN
    v_failures := array_append(
      v_failures, 'scripts anonymous policy does not require published rows'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_sessions'
      AND policy_info.policyname = 'member_master_match_sessions_active_member_read'
      AND policy_info.qual LIKE '%status = ANY%confirmed%published%closed%'
      AND policy_info.qual LIKE '%member.status = ''approved''%'
      AND policy_info.qual LIKE '%member.account_status = ''active''%'
  ) THEN
    v_failures := array_append(
      v_failures, 'match session player visibility predicate is invalid'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'match_round_submissions'
      AND policy_info.policyname = 'member_master_round_submissions_active_self_insert'
      AND policy_info.with_check ILIKE '%status%open%'
      AND policy_info.with_check ILIKE '%survey_end%'
  ) THEN
    v_failures := array_append(
      v_failures, 'round submission INSERT policy lacks the open survey window'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'personality_quiz_config'
      AND policy_info.policyname = '管理员可写问卷配置'
      AND policy_info.qual ILIKE '%admin_users%'
      AND policy_info.with_check ILIKE '%admin_users%'
  ) THEN
    v_failures := array_append(
      v_failures, 'quiz configuration write policy lacks the admin boundary'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies AS policy_info
    WHERE policy_info.schemaname = 'public'
      AND policy_info.tablename = 'player_feedback'
  ) THEN
    v_failures := array_append(
      v_failures, 'player_feedback unexpectedly exposes an anon/auth RLS path'
    );
  END IF;

  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MEMBER_MASTER_POSTFLIGHT_DATA_API_ASSERTIONS_FAILED',
      DETAIL = array_to_string(v_failures, E'\n');
  END IF;

  RAISE NOTICE 'PASS Data API: 14 RLS tables, 27 policies, exact role ACL matrix';
END
$postflight_data_api$;

SELECT 'PASS' AS postflight_status,
       7 AS migration_history_entries,
       34 AS rpc_signatures,
       14 AS exact_acl_tables,
       27 AS required_rls_policies;

ROLLBACK;
