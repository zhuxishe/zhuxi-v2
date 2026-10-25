-- Read-only, privileged postflight. Returns only aggregate test-pool facts,
-- hashes/locators and no credentials or real questionnaire answer payloads.
WITH accounts AS (
 SELECT a.*,m.member_number,m.is_test,m.status,m.account_status,m.record_scope,m.membership_type,m.anonymized_at,
   u.email AS auth_email,u.email_confirmed_at
 FROM private.test_accounts a JOIN public.members m ON m.id=a.member_id LEFT JOIN auth.users u ON u.id=a.user_id
 WHERE a.batch='tst-pool-20261025-v1'
), submissions AS (
 SELECT s.* FROM public.match_round_submissions s
 WHERE s.round_id='b17e1e9b-72d7-4bbb-b3bb-17486f6eebda'
), old_ids AS (SELECT unnest(private.legacy_matching_test_pool_ids()) id)
SELECT jsonb_build_object(
 'checked_at',clock_timestamp(),
 'accounts',jsonb_build_object(
  'total',(SELECT count(*) FROM accounts),
  'codes',(SELECT jsonb_agg(code ORDER BY code) FROM accounts),
  'active_players',(SELECT count(*) FROM accounts WHERE is_test AND status='approved' AND account_status='active' AND record_scope='current' AND membership_type='player' AND anonymized_at IS NULL),
  'confirmed_auth',(SELECT count(*) FROM accounts WHERE email_confirmed_at IS NOT NULL AND auth_email='zhuxi-tst-'||substring(code FROM 5)||'@example.invalid'),
  'completed_questionnaires',(SELECT count(*) FROM public.questionnaire_assignments a JOIN public.questionnaire_responses r ON r.id=a.response_id WHERE a.member_id IN(SELECT member_id FROM accounts) AND r.completed_at IS NOT NULL),
  'readiness',(SELECT jsonb_agg(jsonb_build_object('code',a.code,'readiness',private.member_matching_readiness(a.member_id)) ORDER BY a.code) FROM accounts a)),
 'round',jsonb_build_object(
  'is_test',(SELECT is_test FROM public.match_rounds WHERE id='b17e1e9b-72d7-4bbb-b3bb-17486f6eebda' AND deleted_at IS NULL),
  'allowlist',(SELECT count(*) FROM private.test_round_members WHERE round_id='b17e1e9b-72d7-4bbb-b3bb-17486f6eebda'),
  'submissions',(SELECT count(*) FROM submissions WHERE cancelled_at IS NULL),
  'test_submissions',(SELECT count(*) FROM submissions WHERE cancelled_at IS NULL AND member_id IN(SELECT member_id FROM accounts)),
  'real_submissions',(SELECT count(*) FROM submissions WHERE cancelled_at IS NULL AND member_id IN('f049f125-e2c2-42ac-b0e7-096592c62d2b','0bbeda0f-6c5b-49d0-bf06-c792c9ed1665','9fc90347-548d-4999-b75a-d40c15e43716','a93fae7f-693b-4d6e-acd2-59e238cb0787','d9ba69fd-0039-4fcc-9002-591c3910feda','a43d5d7c-23e1-4a60-ac80-d94e516af186')),
  'test_date_range',(SELECT jsonb_build_object('min',min((SELECT count(*) FROM jsonb_object_keys(s.availability))),'max',max((SELECT count(*) FROM jsonb_object_keys(s.availability)))) FROM submissions s WHERE s.member_id IN(SELECT member_id FROM accounts)),
  'publications',(SELECT count(*) FROM matching_publication.publications WHERE round_id='b17e1e9b-72d7-4bbb-b3bb-17486f6eebda'),
  'notifications',(SELECT count(*) FROM public.community_notifications WHERE round_id='b17e1e9b-72d7-4bbb-b3bb-17486f6eebda')),
 'legacy_deleted',jsonb_build_object(
  'members_left',(SELECT count(*) FROM public.members WHERE id IN(SELECT id FROM old_ids)),
  'submissions_left',(SELECT count(*) FROM public.match_round_submissions WHERE member_id IN(SELECT id FROM old_ids)),
  'questionnaire_responses_left',(SELECT count(*) FROM public.questionnaire_responses WHERE member_id IN(SELECT id FROM old_ids)),
  'bound_import_identities_left',(SELECT count(*) FROM matching_import.identities WHERE created_by_request_id='986e22c9-12b8-402a-bee4-f3abeea37291' AND member_id IS NOT NULL),
  'tombstones',(SELECT count(*) FROM matching_import.identities WHERE created_by_request_id='986e22c9-12b8-402a-bee4-f3abeea37291' AND member_id IS NULL),
  'unredacted_member_audits',(SELECT count(*) FROM private.member_profile_audit_log WHERE member_id_snapshot IN(SELECT id FROM old_ids) AND metadata IS DISTINCT FROM '{"test_pool_cleanup":true,"import_receipt_id":"986e22c9-12b8-402a-bee4-f3abeea37291"}'::jsonb),
  'cleanup_receipt',(SELECT to_jsonb(r) FROM private.legacy_test_pool_cleanup_receipts r WHERE import_receipt_id='986e22c9-12b8-402a-bee4-f3abeea37291')),
 'formal_sequence',(SELECT jsonb_build_object('last_value',last_value,'is_called',is_called) FROM private.member_number_sequence),
 'formal_member_count',(SELECT count(*) FROM public.members WHERE record_scope='current' AND NOT is_test),
 'new_sessions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'total_candidates',total_candidates,'total_matched',total_matched,'total_unmatched',total_unmatched,'publication_version',publication_version) ORDER BY created_at)
  FROM public.match_sessions WHERE round_id='b17e1e9b-72d7-4bbb-b3bb-17486f6eebda'),'[]'::jsonb)
) AS postflight;
