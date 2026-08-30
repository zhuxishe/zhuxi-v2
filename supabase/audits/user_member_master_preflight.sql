-- User/member master migration preflight (read-only)
--
-- Run in the Zhuxishe Supabase SQL editor immediately before applying
-- 20260829175645_user_member_master_v1.sql. Save the complete result set.
-- This report intentionally never links or merges records.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

-- 1. Population reconciliation.
SELECT 'population' AS section,
       (SELECT count(*) FROM auth.users) AS auth_users,
       (SELECT count(*) FROM public.members) AS member_records,
       (SELECT count(*) FROM public.members WHERE user_id IS NOT NULL) AS linked_members,
       (SELECT count(*) FROM public.members WHERE user_id IS NULL) AS accountless_members,
       (SELECT count(*) FROM public.member_identity) AS identity_records;

SELECT 'legacy_population' AS section,
       count(*) AS legacy_records,
       count(*) FILTER (WHERE claimed_by IS NOT NULL) AS linked_legacy_records,
       count(*) FILTER (WHERE claimed_by IS NULL) AS unlinked_legacy_records,
       count(*) FILTER (WHERE claim_status = 'pending') AS pending_claims
FROM public.legacy_members;

SELECT 'legacy_claimed_by_missing_member' AS issue,
       legacy.id AS legacy_record_id,
       legacy.member_no,
       legacy.claim_status,
       legacy.claimed_by
FROM public.legacy_members AS legacy
LEFT JOIN public.members AS member ON member.id = legacy.claimed_by
WHERE legacy.claimed_by IS NOT NULL
  AND member.id IS NULL
ORDER BY legacy.created_at, legacy.id;

SELECT 'multiple_legacy_records_same_member' AS issue,
       claimed_by AS member_id,
       count(*) AS legacy_record_count,
       array_agg(id ORDER BY created_at, id) AS legacy_record_ids
FROM public.legacy_members
WHERE claimed_by IS NOT NULL
GROUP BY claimed_by
HAVING count(*) > 1
ORDER BY legacy_record_count DESC, member_id;

SELECT 'auth_without_member' AS issue,
       u.id AS auth_user_id,
       lower(u.email) AS normalized_email,
       u.created_at,
       u.last_sign_in_at
FROM auth.users AS u
LEFT JOIN public.members AS m ON m.user_id = u.id
WHERE m.id IS NULL
ORDER BY u.created_at, u.id;

SELECT 'member_without_auth_link' AS issue,
       m.id AS member_id,
       m.member_number,
       lower(m.email) AS normalized_email,
       m.status,
       m.created_at,
       CASE
         WHEN m.member_number LIKE 'IMP-%' THEN 'import'
         WHEN m.line_user_id IS NOT NULL THEN 'line'
         ELSE 'legacy_or_admin'
       END AS inferred_source
FROM public.members AS m
WHERE m.user_id IS NULL
ORDER BY m.created_at, m.id;

-- 2. Candidate-only identity matches. Every result requires manual review.
SELECT 'unbound_member_auth_email_candidate' AS issue,
       m.id AS member_id,
       u.id AS auth_user_id,
       lower(m.email) AS normalized_email,
       m.created_at AS member_created_at,
       u.created_at AS auth_created_at
FROM public.members AS m
JOIN auth.users AS u
  ON lower(btrim(m.email)) = lower(btrim(u.email))
WHERE m.user_id IS NULL
  AND m.email IS NOT NULL
  AND u.email IS NOT NULL
ORDER BY normalized_email, member_id, auth_user_id;

SELECT 'duplicate_normalized_member_email' AS issue,
       lower(btrim(email)) AS normalized_email,
       count(*) AS member_count,
       array_agg(id ORDER BY created_at, id) AS member_ids
FROM public.members
WHERE email IS NOT NULL AND btrim(email) <> ''
GROUP BY lower(btrim(email))
HAVING count(*) > 1
ORDER BY member_count DESC, normalized_email;

SELECT 'duplicate_normalized_auth_email' AS issue,
       lower(btrim(email)) AS normalized_email,
       count(*) AS auth_count,
       array_agg(id ORDER BY created_at, id) AS auth_user_ids
FROM auth.users
WHERE email IS NOT NULL AND btrim(email) <> ''
GROUP BY lower(btrim(email))
HAVING count(*) > 1
ORDER BY auth_count DESC, normalized_email;

-- 3. Profile completeness and current approval distribution.
SELECT m.status,
       count(*) AS total,
       count(*) FILTER (WHERE m.user_id IS NOT NULL) AS linked,
       count(*) FILTER (WHERE i.member_id IS NULL) AS missing_identity
FROM public.members AS m
LEFT JOIN public.member_identity AS i ON i.member_id = m.id
GROUP BY m.status
ORDER BY m.status;

SELECT 'identity_missing' AS issue,
       m.id AS member_id,
       m.user_id AS auth_user_id,
       m.member_number,
       m.status,
       m.created_at
FROM public.members AS m
LEFT JOIN public.member_identity AS i ON i.member_id = m.id
WHERE i.member_id IS NULL
ORDER BY m.created_at, m.id;

-- 4. Invalid references, including UUID arrays that PostgreSQL FKs cannot cover.
WITH invalid_references AS (
  SELECT 'match_results.member_a_id' AS reference_path, count(*) AS invalid_count
  FROM public.match_results r LEFT JOIN public.members m ON m.id = r.member_a_id
  WHERE m.id IS NULL
  UNION ALL
  SELECT 'match_results.member_b_id', count(*)
  FROM public.match_results r LEFT JOIN public.members m ON m.id = r.member_b_id
  WHERE r.member_b_id IS NOT NULL AND m.id IS NULL
  UNION ALL
  SELECT 'match_results.group_members[]', count(*)
  FROM public.match_results r
  CROSS JOIN LATERAL unnest(coalesce(r.group_members, '{}'::uuid[])) AS gm(member_id)
  LEFT JOIN public.members m ON m.id = gm.member_id
  WHERE m.id IS NULL
  UNION ALL
  SELECT 'pair_relationships.member_a_id', count(*)
  FROM public.pair_relationships r LEFT JOIN public.members m ON m.id = r.member_a_id
  WHERE m.id IS NULL
  UNION ALL
  SELECT 'pair_relationships.member_b_id', count(*)
  FROM public.pair_relationships r LEFT JOIN public.members m ON m.id = r.member_b_id
  WHERE m.id IS NULL
  UNION ALL
  SELECT 'mutual_reviews.reviewer_id', count(*)
  FROM public.mutual_reviews r LEFT JOIN public.members m ON m.id = r.reviewer_id
  WHERE m.id IS NULL
  UNION ALL
  SELECT 'mutual_reviews.reviewee_id', count(*)
  FROM public.mutual_reviews r LEFT JOIN public.members m ON m.id = r.reviewee_id
  WHERE m.id IS NULL
  UNION ALL
  SELECT 'activity_records.participant_ids[]', count(*)
  FROM public.activity_records a
  CROSS JOIN LATERAL unnest(coalesce(a.participant_ids, '{}'::uuid[])) AS p(member_id)
  LEFT JOIN public.members m ON m.id = p.member_id
  WHERE m.id IS NULL
  UNION ALL
  SELECT 'player_feedback.member_id', count(*)
  FROM public.player_feedback f LEFT JOIN public.members m ON m.id = f.member_id
  WHERE m.id IS NULL
)
SELECT * FROM invalid_references ORDER BY reference_path;

-- 5. Review-integrity candidates. These are reported, never auto-deleted.
SELECT 'self_review' AS issue, count(*) AS candidate_count
FROM public.mutual_reviews
WHERE reviewer_id = reviewee_id
UNION ALL
SELECT 'review_participant_mismatch', count(*)
FROM public.mutual_reviews AS r
JOIN public.activity_records AS a ON a.id = r.activity_id
WHERE NOT (r.reviewer_id = ANY(a.participant_ids))
   OR NOT (r.reviewee_id = ANY(a.participant_ids));

-- 6. Snapshot the currently effective client grants and RLS policies.
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema IN ('public', 'private')
  AND table_name IN ('members', 'member_identity', 'legacy_members', 'mutual_reviews')
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_schema, table_name, grantee, privilege_type;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('members', 'member_identity', 'legacy_members', 'mutual_reviews')
ORDER BY tablename, policyname;

ROLLBACK;
