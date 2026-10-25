-- Installs a one-time, explicitly invoked cleanup. Installing this migration
-- never removes members, submissions, answers, plans or questionnaire templates.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));

CREATE FUNCTION private.legacy_matching_test_pool_ids() RETURNS uuid[]
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT ARRAY['01b128e9-1d03-48ef-a60b-cdabc2898a99','0c4a9448-93ab-414a-94cb-0b9ef567a74d','0ea256e9-0565-428e-b4e1-a82b06c1fb7c','0f43f571-bcf1-499c-abb7-91415ea212c8','33a2a6a9-1cd5-4334-b6cd-ab7512afd709','482592bb-963e-43bb-914e-c3374174280b','4b96a13a-f98f-4c3c-a154-0a40fd1bea02','5220aa53-10d6-42f8-b1a7-599d4605b95f','5affa2f3-2ecd-4bed-a3cd-35c41f2cf17d','62e75aa9-1b4b-48c6-bdd0-f24529bd3abb','7696a59d-3c03-4a3d-9fa4-ecdf07308056','7802a3e7-ae18-4102-9bba-5b02a034d531','8299e9db-6d25-479b-b9e8-92a0a1bc4e6d','83de0cb8-bd2b-4357-95a7-4d0a3381647b','91856004-dd68-4d21-b31c-847862204e7f','bba822ee-15a8-4358-abfe-5fa164dcffbe','bf1f86bd-ff7f-47f8-b061-8e67e8a1f0db','c3b52b08-f096-4531-9fd0-e85e3fb20e78','cc0d2a4a-bfd4-40d5-afba-b22f13332f43','d3d258e4-678e-4ec1-9c22-497110732a65','d438b666-cdbb-414b-bca2-620548be1f2a','dad32bdc-b8c0-4df7-ab23-75aad620bcb6','ebfd7045-ea29-4cb7-b891-0e74224da050','ef437640-a740-4f1f-84f8-798906c5c86b','f2e60bec-9bad-4656-92f4-4558f83a2702','f7ccf300-5506-445c-9452-17cae9bb12a9','fa3add34-c25b-4438-9c1e-27a67379e691']::uuid[]
$$;
REVOKE ALL ON FUNCTION private.legacy_matching_test_pool_ids() FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.legacy_test_pool_cleanup_receipts(
 import_receipt_id uuid PRIMARY KEY,
 actor_admin_id uuid NOT NULL,
 member_ids uuid[] NOT NULL CHECK(cardinality(member_ids)=27),
 retired_session_ids uuid[] NOT NULL,
 manifest_digest text NOT NULL,
 reason text NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.legacy_test_pool_cleanup_context(
 transaction_id bigint NOT NULL,
 backend_pid integer NOT NULL,
 member_ids uuid[] NOT NULL,
 session_ids uuid[] NOT NULL,
 PRIMARY KEY(transaction_id,backend_pid)
);
ALTER TABLE private.legacy_test_pool_cleanup_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.legacy_test_pool_cleanup_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.legacy_test_pool_cleanup_receipts,private.legacy_test_pool_cleanup_context FROM PUBLIC,anon,authenticated,service_role;

-- No general audit bypass: only UPDATE to this exact redacted representation,
-- for the fixed legacy test subjects, while the protected cleanup context exists.
-- IDs, timestamps, actor snapshots and action facts remain append-only.
CREATE OR REPLACE FUNCTION private.member_master_reject_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_SCHEMA='private'
   AND TG_TABLE_NAME IN('member_profile_audit_log','subjectless_operational_audit_log')
   AND EXISTS(SELECT 1 FROM private.legacy_test_pool_cleanup_context c
    WHERE c.transaction_id=txid_current() AND c.backend_pid=pg_backend_pid()
     AND c.member_ids=private.legacy_matching_test_pool_ids()
     AND CASE WHEN TG_TABLE_NAME='member_profile_audit_log'
       THEN (to_jsonb(OLD)->>'member_id_snapshot')::uuid=ANY(c.member_ids)
       ELSE (to_jsonb(OLD)->>'table_name')='match_sessions'
        AND (to_jsonb(OLD)->>'record_id_snapshot')=ANY(c.session_ids::text[]) END)
   AND (to_jsonb(NEW)-ARRAY['before_values','after_values','metadata','reason','changed_fields'])
    IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['before_values','after_values','metadata','reason','changed_fields'])
   AND to_jsonb(NEW)->'before_values'='{"test_data_removed":true}'::jsonb
   AND to_jsonb(NEW)->'after_values'='{"record_exists":false,"test_data_removed":true}'::jsonb
   AND to_jsonb(NEW)->'changed_fields'='["test_data_removed"]'::jsonb
   AND to_jsonb(NEW)->>'reason'='Retired legacy synthetic matching test data'
   AND (TG_TABLE_NAME='subjectless_operational_audit_log'
    OR to_jsonb(NEW)->'metadata'='{"test_pool_cleanup":true,"import_receipt_id":"986e22c9-12b8-402a-bee4-f3abeea37291"}'::jsonb) THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'MEMBER_MASTER_AUDIT_APPEND_ONLY' USING ERRCODE='55000';
END $$;

CREATE FUNCTION public.admin_cleanup_legacy_matching_test_pool(
 p_actor_admin_id uuid,p_expected_members jsonb,p_reason text,p_dry_run boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_round constant uuid:='b17e1e9b-72d7-4bbb-b3bb-17486f6eebda';
 v_import constant uuid:='986e22c9-12b8-402a-bee4-f3abeea37291';
 v_ids uuid[]:=private.legacy_matching_test_pool_ids();
 v_expected uuid[]; v_sessions uuid[]; v_fk record; v_count bigint; v_relations jsonb:='[]';
 v_summary jsonb; v_deleted integer; v_before_real jsonb; v_after_real jsonb;
 v_real constant uuid[]:=ARRAY['f049f125-e2c2-42ac-b0e7-096592c62d2b','0bbeda0f-6c5b-49d0-bf06-c792c9ed1665','9fc90347-548d-4999-b75a-d40c15e43716'];
BEGIN
 PERFORM matching_import.require_server_super_admin(p_actor_admin_id);
 IF p_dry_run IS NULL OR char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 4 AND 500
  OR jsonb_typeof(p_expected_members) IS DISTINCT FROM 'array' OR jsonb_array_length(p_expected_members)<>27 THEN
  RAISE EXCEPTION 'TEST_POOL_CLEANUP_ARGUMENTS_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT array_agg((e->>'id')::uuid ORDER BY (e->>'id')::uuid) INTO v_expected FROM jsonb_array_elements(p_expected_members)e;
 IF v_expected IS DISTINCT FROM v_ids THEN RAISE EXCEPTION 'TEST_POOL_CLEANUP_SUBJECT_MISMATCH' USING ERRCODE='PT409'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-run-job:'||v_round::text,0));
 IF EXISTS(SELECT 1 FROM private.legacy_test_pool_cleanup_receipts WHERE import_receipt_id=v_import) THEN
  RETURN jsonb_build_object('already_applied',true,'deleted_members',27,'round_id',v_round);
 END IF;
 PERFORM 1 FROM public.members WHERE id=ANY(v_ids||v_real) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.match_rounds WHERE id=v_round AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM matching_run.jobs WHERE round_id=v_round AND status='running') THEN
  RAISE EXCEPTION 'TEST_POOL_CLEANUP_ROUND_BUSY' USING ERRCODE='PT409';
 END IF;
 IF (SELECT count(*) FROM matching_import.identities WHERE created_by_request_id=v_import AND round_id=v_round AND member_id=ANY(v_ids))<>27
  OR (SELECT count(*) FROM matching_import.identities WHERE created_by_request_id=v_import)<>27
  OR (SELECT count(*) FROM public.members m JOIN public.member_identity i ON i.member_id=m.id
   JOIN jsonb_array_elements(p_expected_members) e ON (e->>'id')::uuid=m.id
   WHERE m.id=ANY(v_ids) AND m.record_scope='historical' AND m.record_source='import'
    AND m.account_status='unbound' AND m.user_id IS NULL AND m.anonymized_at IS NULL
    AND m.email IS NULL AND m.line_user_id IS NULL AND m.wechat_openid IS NULL
    AND m.member_number=e->>'member_number' AND m.member_number LIKE 'IMP-b17e1e9b-%'
    AND i.full_name=e->>'full_name')<>27 THEN
  RAISE EXCEPTION 'TEST_POOL_CLEANUP_MANIFEST_CHANGED' USING ERRCODE='PT409';
 END IF;
 IF EXISTS(SELECT 1 FROM public.match_round_submissions WHERE member_id=ANY(v_ids) AND round_id<>v_round)
  OR EXISTS(SELECT 1 FROM matching_run.subjects a JOIN matching_run.snapshots s ON s.id=a.snapshot_id WHERE a.member_id=ANY(v_ids) AND s.round_id<>v_round)
  OR EXISTS(SELECT 1 FROM matching_adjustment.subjects a JOIN matching_adjustment.operations o ON o.id=a.operation_id WHERE a.member_id=ANY(v_ids) AND o.round_id<>v_round)
  OR EXISTS(SELECT 1 FROM public.activity_records WHERE participant_ids&&v_ids OR late_member_ids&&v_ids OR no_show_member_ids&&v_ids)
  OR EXISTS(SELECT 1 FROM public.match_results WHERE matching_publication.member_ids(member_a_id,member_b_id,group_members)&&v_ids
    AND session_id IN(SELECT id FROM public.match_sessions WHERE round_id IS DISTINCT FROM v_round)) THEN
  RAISE EXCEPTION 'TEST_POOL_CLEANUP_OTHER_BUSINESS_USE' USING ERRCODE='PT409';
 END IF;
 SELECT COALESCE(array_agg(s.id ORDER BY s.id),'{}') INTO v_sessions FROM public.match_sessions s
 WHERE s.round_id=v_round AND (EXISTS(SELECT 1 FROM public.match_results r WHERE r.session_id=s.id AND matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)&&v_ids)
  OR EXISTS(SELECT 1 FROM matching_run.snapshots a JOIN matching_run.subjects b ON b.snapshot_id=a.id WHERE a.session_id=s.id AND b.member_id=ANY(v_ids)));
 PERFORM 1 FROM public.match_sessions WHERE id=ANY(v_sessions) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.match_sessions WHERE id=ANY(v_sessions) AND(status<>'draft' OR publication_version<>0 OR published_at IS NOT NULL))
  OR EXISTS(SELECT 1 FROM matching_publication.publications WHERE round_id=v_round)
  OR EXISTS(SELECT 1 FROM public.community_notifications WHERE recipient_member_id=ANY(v_ids)
   OR match_session_id=ANY(v_sessions)
   OR (round_id=v_round AND notification_type<>'matching_submitted'))
  OR EXISTS(SELECT 1 FROM matching_adjustment.operations WHERE session_id=ANY(v_sessions) AND status='running') THEN
  RAISE EXCEPTION 'TEST_POOL_CLEANUP_PUBLISHED_OR_BUSY' USING ERRCODE='PT409';
 END IF;
 -- Discover every member FK. Unexpected use, including future schema additions,
 -- aborts instead of silently cascading into unrelated product records.
 FOR v_fk IN SELECT n.nspname,c.relname,a.attname FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.conkey[1]
  WHERE k.contype='f' AND k.confrelid='public.members'::regclass AND cardinality(k.conkey)=1 LOOP
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I=ANY($1)',v_fk.nspname,v_fk.relname,v_fk.attname) INTO v_count USING v_ids;
  v_relations:=v_relations||jsonb_build_array(jsonb_build_object('table',v_fk.nspname||'.'||v_fk.relname,'column',v_fk.attname,'rows',v_count));
  IF v_count>0 AND (v_fk.nspname||'.'||v_fk.relname)<>ALL(ARRAY[
   'public.member_identity','public.member_language','public.member_interests','public.member_personality','public.member_boundaries',
   'public.personality_quiz_results','public.member_verification','public.interview_evaluations','public.member_dynamic_stats',
   'public.questionnaire_responses','public.questionnaire_assignments','public.match_round_submissions','public.match_results','public.unmatched_diagnostics',
   'private.member_profile_metrics','private.member_role_assignments','private.matching_legacy_supplementary_completions',
   'matching_import.identities','matching_run.subjects','matching_adjustment.subjects']) THEN
   RAISE EXCEPTION 'TEST_POOL_CLEANUP_UNEXPECTED_REFERENCE:%.%',v_fk.nspname,v_fk.relname USING ERRCODE='PT409';
  END IF;
 END LOOP;
 SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') INTO v_before_real FROM public.match_round_submissions s WHERE member_id=ANY(v_real);
 v_summary:=jsonb_build_object('round_id',v_round,'planned_member_deletions',27,'retired_session_ids',v_sessions,'relations',v_relations,'dry_run',p_dry_run);
 IF p_dry_run THEN RETURN v_summary; END IF;
 INSERT INTO private.legacy_test_pool_cleanup_context VALUES(txid_current(),pg_backend_pid(),v_ids,v_sessions);
 PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
 DELETE FROM public.match_sessions WHERE id=ANY(v_sessions);
 -- Session deletion cascades results, diagnostics, sealed source/engine inputs,
 -- hard-preflight proofs and manual-adjustment payloads; successful run receipts
 -- retain only their original session locator and counts, not raw inputs.
 DELETE FROM matching_run.snapshots s WHERE s.round_id=v_round AND EXISTS(
  SELECT 1 FROM matching_run.subjects u WHERE u.snapshot_id=s.id AND u.member_id=ANY(v_ids));
 DELETE FROM public.match_round_submissions WHERE round_id=v_round AND member_id=ANY(v_ids);
 DELETE FROM public.members WHERE id=ANY(v_ids);
 GET DIAGNOSTICS v_deleted=ROW_COUNT;
 IF v_deleted<>27 THEN RAISE EXCEPTION 'TEST_POOL_CLEANUP_DELETE_COUNT' USING ERRCODE='PT409'; END IF;
 UPDATE private.member_profile_audit_log SET before_values='{"test_data_removed":true}',after_values='{"record_exists":false,"test_data_removed":true}',
  changed_fields=ARRAY['test_data_removed'],reason='Retired legacy synthetic matching test data',
  metadata='{"test_pool_cleanup":true,"import_receipt_id":"986e22c9-12b8-402a-bee4-f3abeea37291"}'
 WHERE member_id_snapshot=ANY(v_ids);
 UPDATE private.subjectless_operational_audit_log SET before_values='{"test_data_removed":true}',after_values='{"record_exists":false,"test_data_removed":true}',
  changed_fields=ARRAY['test_data_removed'],reason='Retired legacy synthetic matching test data'
 WHERE table_name='match_sessions' AND record_id_snapshot=ANY(v_sessions::text[]);
 SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') INTO v_after_real FROM public.match_round_submissions s WHERE member_id=ANY(v_real);
 IF v_before_real IS DISTINCT FROM v_after_real OR EXISTS(SELECT 1 FROM public.members WHERE id=ANY(v_ids))
  OR EXISTS(SELECT 1 FROM matching_import.identities WHERE created_by_request_id=v_import AND member_id IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM public.match_rounds WHERE id=v_round AND deleted_at IS NULL) THEN
  RAISE EXCEPTION 'TEST_POOL_CLEANUP_POSTFLIGHT_FAILED' USING ERRCODE='PT409';
 END IF;
 INSERT INTO private.legacy_test_pool_cleanup_receipts(import_receipt_id,actor_admin_id,member_ids,retired_session_ids,manifest_digest,reason)
 VALUES(v_import,p_actor_admin_id,v_ids,v_sessions,md5(p_expected_members::text),btrim(p_reason));
 DELETE FROM private.legacy_test_pool_cleanup_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid();
 RETURN v_summary||jsonb_build_object('deleted_members',27,'dry_run',false,'already_applied',false);
END $$;
REVOKE ALL ON FUNCTION public.admin_cleanup_legacy_matching_test_pool(uuid,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_legacy_matching_test_pool(uuid,jsonb,text,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
