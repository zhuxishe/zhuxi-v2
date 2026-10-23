-- Scope live cancellation state to its publication. No existing business row,
-- matching rule, questionnaire, publication roster or notification is rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration', 0));

-- Fail closed if a concurrent release changed the established publication or
-- audit boundary. These hashes were checked against the actual SQL catalog.
DO $preflight$
DECLARE v_target record;
BEGIN
  FOR v_target IN SELECT * FROM (VALUES
    ('matching_publication.guard_result()','260b9ce7316e6164b0990d93993b7297'),
    ('matching_publication.unpublish_session(uuid,integer,text)','1b8e0f9a1e3637cf38d5ec872dfc0966'),
    ('matching_publication.review_cancellation(uuid,integer,timestamptz,text,boolean)','541332d13f858fb731091882b71c75a0'),
    ('matching_publication.request_cancellation(uuid,text,integer)','e623db3cf1fd9e630b8702a5b9ed2ac6'),
    ('private.member_master_audit_related_record_change()','90b06bfd0ff34935bf5e8d06222a2508')
  ) expected(signature,definition_hash) LOOP
    IF to_regprocedure(v_target.signature) IS NULL OR
       md5(pg_get_functiondef(to_regprocedure(v_target.signature))) IS DISTINCT FROM v_target.definition_hash THEN
      RAISE EXCEPTION 'MATCH_CANCELLATION_MIGRATION_DEPENDENCY_CHANGED: %',v_target.signature;
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.match_results'::regclass
    AND tgname='member_master_audit_related_change' AND tgenabled IN('O','A')
    AND tgfoid='private.member_master_audit_related_record_change()'::regprocedure
    AND NOT tgisinternal AND tgtype & 2 = 0) THEN
    RAISE EXCEPTION 'MATCH_CANCELLATION_MIGRATION_AUDIT_REQUIRED';
  END IF;
END;
$preflight$;

ALTER TABLE public.match_results ADD COLUMN cancellation_publication_version integer
  CHECK (cancellation_publication_version > 0);
REVOKE SELECT (cancellation_publication_version) ON public.match_results FROM PUBLIC,anon;
GRANT SELECT (cancellation_publication_version) ON public.match_results TO authenticated;
COMMENT ON COLUMN public.match_results.cancellation_publication_version IS
  'Publication owning the current cancellation request; NULL after withdrawal or draft restoration. Prior state remains in private member audit.';

CREATE OR REPLACE FUNCTION matching_publication.guard_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_id uuid; v_session public.match_sessions%ROWTYPE;
BEGIN
  -- NOWAIT avoids a result-row -> session-row / publisher session -> result
  -- deadlock. A racing editor keeps its local input and can retry after refresh.
  FOR v_id IN SELECT DISTINCT id FROM unnest(CASE WHEN TG_OP='INSERT' THEN ARRAY[NEW.session_id] WHEN TG_OP='DELETE' THEN ARRAY[OLD.session_id] ELSE ARRAY[OLD.session_id,NEW.session_id] END) AS t(id) ORDER BY id LOOP
    BEGIN SELECT * INTO v_session FROM public.match_sessions WHERE id=v_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'MATCH_PUBLICATION_BUSY' USING ERRCODE='PT409'; END;
    IF FOUND AND v_session.status <> 'draft' AND NOT matching_publication.has_context(v_id) THEN
      IF TG_OP='UPDATE' AND OLD.session_id=NEW.session_id
        AND NEW.cancellation_requested_by IS NULL AND NEW.cancellation_reason IS NULL
        AND (to_jsonb(NEW)-ARRAY['audit_reason','cancellation_requested_by','cancellation_reason'])
          IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['audit_reason','cancellation_requested_by','cancellation_reason']) THEN
        -- The existing privacy scrub clears only these two authored fields.
        -- All request/approval metadata writes require their versioned RPC.
        NULL;
      ELSE RAISE EXCEPTION 'MATCH_PUBLICATION_REQUIRES_WITHDRAWAL' USING ERRCODE='PT409'; END IF;
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NOT matching_publication.has_context(NEW.session_id) THEN
    IF TG_OP='INSERT' AND (NEW.status NOT IN ('draft','locked','cancelled') OR NEW.publication_version<>0) THEN
      RAISE EXCEPTION 'MATCH_PUBLICATION_REQUIRES_RPC' USING ERRCODE='PT409';
    ELSIF TG_OP='UPDATE' THEN
      IF NEW.publication_version IS DISTINCT FROM OLD.publication_version OR (NEW.status='confirmed' AND OLD.status<>'confirmed') THEN
        RAISE EXCEPTION 'MATCH_PUBLICATION_REQUIRES_RPC' USING ERRCODE='PT409';
      END IF;
      IF NEW.status IN ('draft','locked') THEN NEW.publication_version:=0; END IF;
    END IF;
  END IF;
  -- A restored draft is a new editable plan, never an approval carried forward
  -- from the withdrawn publication. The existing AFTER audit trigger captures
  -- the old request and decision before this row replaces them.
  IF NEW.status IN ('draft','locked') AND
     (TG_OP='INSERT' OR OLD.status NOT IN ('draft','locked') OR OLD.publication_version>0) THEN
    NEW.cancellation_publication_version:=NULL;
    NEW.cancellation_requested_by:=NULL; NEW.cancellation_reason:=NULL;
    NEW.cancellation_requested_at:=NULL; NEW.cancellation_status:=NULL;
    NEW.cancellation_reviewed_by:=NULL; NEW.cancellation_reviewed_at:=NULL;
  END IF;
  IF NOT matching_publication.has_context(NEW.session_id) AND
     ((TG_OP='INSERT' AND NEW.cancellation_publication_version IS NOT NULL) OR
      (TG_OP='UPDATE' AND NEW.cancellation_publication_version IS DISTINCT FROM OLD.cancellation_publication_version
       AND NEW.cancellation_publication_version IS NOT NULL)) THEN
    RAISE EXCEPTION 'MATCH_PUBLICATION_REQUIRES_RPC' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION matching_publication.unpublish_session(p_session_id uuid,p_expected_publication_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid:=matching_publication.require_admin(p_reason); v_session public.match_sessions%ROWTYPE; v_pub matching_publication.publications%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id;
  IF NOT FOUND OR v_session.round_id IS NULL THEN RAISE EXCEPTION 'MATCH_PUBLICATION_NOT_FOUND' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.match_rounds WHERE id=v_session.round_id FOR UPDATE;
  SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id FOR UPDATE;
  IF p_expected_publication_version IS NULL OR v_session.publication_version<>p_expected_publication_version OR v_session.publication_version=0 THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  SELECT * INTO v_pub FROM matching_publication.publications WHERE session_id=p_session_id AND version=v_session.publication_version FOR UPDATE;
  IF v_session.status='draft' AND v_pub.withdrawn_at IS NOT NULL THEN RETURN jsonb_build_object('session_id',p_session_id,'round_id',v_session.round_id,'publication_version',v_session.publication_version,'published',false,'already_applied',true); END IF;
  IF v_session.status<>'confirmed' OR v_pub.id IS NULL THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.members WHERE id IN (SELECT member_id FROM matching_publication.roster WHERE publication_id=v_pub.id) ORDER BY id FOR SHARE;
  INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),p_session_id,'unpublish');
  PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
  UPDATE matching_publication.publications SET withdrawn_at=clock_timestamp() WHERE id=v_pub.id;
  DELETE FROM matching_publication.active_assignments WHERE publication_id=v_pub.id;
  -- Clear live cancellation state for this withdrawn version. Both pending
  -- requests and completed decisions remain in the established private member
  -- audit log, but cannot be approved/displayed as part of a later publication.
  UPDATE public.match_results SET
    status=CASE WHEN status='confirmed' THEN 'draft' ELSE status END,
    publication_version=CASE WHEN status='confirmed' THEN 0 ELSE publication_version END,
    cancellation_publication_version=NULL,cancellation_requested_by=NULL,cancellation_reason=NULL,
    cancellation_requested_at=NULL,cancellation_status=NULL,
    cancellation_reviewed_by=NULL,cancellation_reviewed_at=NULL,audit_reason=btrim(p_reason)
  WHERE session_id=p_session_id AND (status='confirmed' OR cancellation_status IS NOT NULL
    OR cancellation_publication_version IS NOT NULL OR cancellation_requested_at IS NOT NULL
    OR cancellation_requested_by IS NOT NULL OR cancellation_reason IS NOT NULL
    OR cancellation_reviewed_by IS NOT NULL OR cancellation_reviewed_at IS NOT NULL);
  UPDATE public.match_sessions SET status='draft',audit_reason=btrim(p_reason) WHERE id=p_session_id;
  UPDATE public.community_notifications SET read_at=COALESCE(read_at,clock_timestamp()),expires_at=LEAST(expires_at,clock_timestamp()) WHERE match_publication_id=v_pub.id;
  INSERT INTO public.community_notifications(recipient_member_id,notification_type,round_id,match_publication_id,match_session_id,publication_version,title_zh,title_ja,body_zh,body_ja)
    SELECT roster.member_id,'matching_withdrawn',v_session.round_id,v_pub.id,p_session_id,v_pub.version,'匹配结果已撤回','マッチング結果が取り下げられました','「'||v_pub.round_name||'」的本批结果已撤回，请等待重新发布。','「'||v_pub.round_name||'」の結果が取り下げられました。再公開をお待ちください。'
    FROM matching_publication.roster roster JOIN public.members member ON member.id=roster.member_id WHERE roster.publication_id=v_pub.id AND roster.outcome<>'cancelled' AND member.account_status='active' AND member.status='approved' AND member.anonymized_at IS NULL AND member.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM matching_publication.active_assignments assignment WHERE assignment.round_id=v_session.round_id AND assignment.member_id=roster.member_id);
  DELETE FROM matching_publication.write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND session_id=p_session_id;
  RETURN jsonb_build_object('session_id',p_session_id,'round_id',v_session.round_id,'publication_version',v_session.publication_version,'published',false,'already_applied',false);
END;
$function$;

CREATE OR REPLACE FUNCTION matching_publication.review_cancellation(p_result_id uuid,p_expected_publication_version integer,p_expected_requested_at timestamptz,p_reason text,p_approve boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid:=matching_publication.require_admin(p_reason); v_result public.match_results%ROWTYPE; v_session public.match_sessions%ROWTYPE; v_pub matching_publication.publications%ROWTYPE; v_members uuid[]; v_matched integer;
BEGIN
  SELECT * INTO v_result FROM public.match_results WHERE id=p_result_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_PUBLICATION_NOT_FOUND' USING ERRCODE='PT409'; END IF;
  SELECT * INTO v_session FROM public.match_sessions WHERE id=v_result.session_id;
  PERFORM 1 FROM public.match_rounds WHERE id=v_session.round_id FOR UPDATE;
  SELECT * INTO v_session FROM public.match_sessions WHERE id=v_result.session_id FOR UPDATE;
  SELECT * INTO v_result FROM public.match_results WHERE id=p_result_id FOR UPDATE;
  IF p_expected_publication_version IS NULL OR p_expected_publication_version<>v_session.publication_version THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  IF v_session.status<>'confirmed' OR v_result.publication_version<>v_session.publication_version
     OR v_result.cancellation_publication_version IS DISTINCT FROM p_expected_publication_version
     OR NOT EXISTS(SELECT 1 FROM matching_publication.publications publication
       WHERE publication.session_id=v_session.id AND publication.version=p_expected_publication_version
         AND publication.withdrawn_at IS NULL) THEN
    RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409';
  END IF;
  IF p_expected_requested_at IS NULL OR p_expected_requested_at IS DISTINCT FROM v_result.cancellation_requested_at THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  IF v_result.cancellation_status=(CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END) THEN
    RETURN jsonb_build_object('result_id',p_result_id,'session_id',v_session.id,'round_id',v_session.round_id,'already_applied',true);
  END IF;
  IF v_result.status<>'confirmed' OR v_result.cancellation_status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'MATCH_PUBLICATION_CANCELLATION_NOT_PENDING' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.members WHERE id=ANY(matching_publication.member_ids(v_result.member_a_id,v_result.member_b_id,v_result.group_members)) ORDER BY id FOR SHARE;
  INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),v_session.id,'cancellation');
  PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
  UPDATE public.match_results SET status=CASE WHEN p_approve THEN 'cancelled' ELSE status END,cancellation_status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    cancellation_reviewed_by=v_admin,cancellation_reviewed_at=clock_timestamp(),audit_reason=btrim(p_reason) WHERE id=p_result_id;
  IF p_approve THEN
    DELETE FROM matching_publication.active_assignments WHERE result_id=p_result_id;
    UPDATE matching_publication.roster SET outcome='cancelled' WHERE result_id=p_result_id AND publication_id IN (SELECT id FROM matching_publication.publications WHERE session_id=v_session.id AND version=v_result.publication_version AND withdrawn_at IS NULL);
    SELECT * INTO v_pub FROM matching_publication.publications WHERE session_id=v_session.id AND version=v_result.publication_version AND withdrawn_at IS NULL;
    IF v_session.status='confirmed' AND v_pub.id IS NOT NULL AND v_result.publication_version=v_session.publication_version THEN
      UPDATE public.community_notifications SET read_at=COALESCE(read_at,clock_timestamp()),expires_at=LEAST(expires_at,clock_timestamp()) WHERE match_publication_id=v_pub.id AND match_result_id=p_result_id;
      INSERT INTO public.community_notifications(recipient_member_id,notification_type,round_id,match_publication_id,match_session_id,match_result_id,publication_version,title_zh,title_ja,body_zh,body_ja)
        SELECT roster.member_id,'matching_cancelled',v_session.round_id,v_pub.id,v_session.id,p_result_id,v_pub.version,'本组匹配已取消','このグループのマッチングはキャンセルされました','「'||v_pub.round_name||'」的本组匹配已取消，可在参与记录中查看。','「'||v_pub.round_name||'」のこのグループのマッチングがキャンセルされました。参加履歴から確認できます。'
        FROM matching_publication.roster roster JOIN public.members member ON member.id=roster.member_id WHERE roster.publication_id=v_pub.id AND roster.result_id=p_result_id AND member.account_status='active' AND member.status='approved' AND member.anonymized_at IS NULL AND member.user_id IS NOT NULL;
    END IF;
    SELECT count(DISTINCT member_id) INTO v_matched FROM public.match_results result CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) ids(member_id) WHERE result.session_id=v_session.id AND result.status<>'cancelled';
    UPDATE public.match_sessions SET total_matched=v_matched,total_unmatched=GREATEST(total_candidates-v_matched,0),audit_reason=btrim(p_reason) WHERE id=v_session.id;
  END IF;
  DELETE FROM matching_publication.write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND session_id=v_session.id;
  RETURN jsonb_build_object('result_id',p_result_id,'session_id',v_session.id,'round_id',v_session.round_id,'already_applied',false);
END;
$function$;

CREATE OR REPLACE FUNCTION matching_publication.request_cancellation(p_result_id uuid,p_reason text,p_expected_publication_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_member uuid; v_result public.match_results%ROWTYPE; v_session public.match_sessions%ROWTYPE; v_reason text:=NULLIF(btrim(p_reason),'');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'MEMBER_MASTER_ACTIVE_MEMBER_REQUIRED' USING ERRCODE='42501'; END IF;
  v_member:=private.profile_current_approved_member_id();
  IF v_member IS NULL THEN RAISE EXCEPTION 'MEMBER_MASTER_ACTIVE_MEMBER_REQUIRED' USING ERRCODE='42501'; END IF;
  IF char_length(COALESCE(v_reason,''))>500 THEN RAISE EXCEPTION 'MEMBER_MASTER_PAYLOAD_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_result FROM public.match_results WHERE id=p_result_id;
  IF NOT FOUND OR NOT v_member=ANY(matching_publication.member_ids(v_result.member_a_id,v_result.member_b_id,v_result.group_members)) THEN RAISE EXCEPTION 'MEMBER_MASTER_MATCH_PARTICIPANT_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_session FROM public.match_sessions WHERE id=v_result.session_id;
  PERFORM 1 FROM public.match_rounds WHERE id=v_session.round_id FOR UPDATE;
  SELECT * INTO v_session FROM public.match_sessions WHERE id=v_result.session_id FOR UPDATE;
  SELECT * INTO v_result FROM public.match_results WHERE id=p_result_id FOR UPDATE;
  IF p_expected_publication_version IS NULL OR v_session.publication_version<>p_expected_publication_version THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  IF v_session.status<>'confirmed' OR v_result.status<>'confirmed' OR v_result.publication_version<>v_session.publication_version THEN RAISE EXCEPTION 'MATCH_PUBLICATION_NOT_PUBLISHED' USING ERRCODE='PT409'; END IF;
  IF NOT v_member=ANY(matching_publication.member_ids(v_result.member_a_id,v_result.member_b_id,v_result.group_members)) THEN RAISE EXCEPTION 'MEMBER_MASTER_MATCH_PARTICIPANT_REQUIRED' USING ERRCODE='42501'; END IF;
  IF v_result.cancellation_status='pending' THEN RAISE EXCEPTION 'MEMBER_MASTER_CANCELLATION_ALREADY_PENDING' USING ERRCODE='55000'; END IF;
  PERFORM set_config('app.member_master_audit_reason',COALESCE(v_reason,'Player cancellation request'),true);
  INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),v_session.id,'request_cancellation');
  UPDATE public.match_results SET cancellation_publication_version=v_session.publication_version,cancellation_reviewed_by=NULL,cancellation_reviewed_at=NULL,cancellation_requested_by=v_member,cancellation_reason=v_reason,cancellation_requested_at=clock_timestamp(),cancellation_status='pending' WHERE id=p_result_id;
  DELETE FROM matching_publication.write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND session_id=v_session.id;
  RETURN jsonb_build_object('match_result_id',p_result_id,'member_id',v_member,'cancellation_status','pending');
END;
$function$;

-- Replacing bodies preserves existing ACLs; keep every implementation closed
-- to public/anon/service roles and the trigger implementation closed to clients.
REVOKE ALL ON FUNCTION matching_publication.guard_result() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION matching_publication.unpublish_session(uuid,integer,text),
 matching_publication.review_cancellation(uuid,integer,timestamptz,text,boolean),
 matching_publication.request_cancellation(uuid,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION matching_publication.unpublish_session(uuid,integer,text),
 matching_publication.review_cancellation(uuid,integer,timestamptz,text,boolean),
 matching_publication.request_cancellation(uuid,text,integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
