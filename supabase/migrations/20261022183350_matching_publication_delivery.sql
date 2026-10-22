-- Publishing is a separate, versioned transaction. Collection windows, questions,
-- candidate selection and matching algorithms are intentionally unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration', 0));

CREATE SCHEMA matching_publication;
REVOKE ALL ON SCHEMA matching_publication FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA matching_publication TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA matching_publication REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER TABLE public.match_sessions ADD COLUMN publication_version integer NOT NULL DEFAULT 0 CHECK (publication_version >= 0), ADD COLUMN published_at timestamptz;
-- Existing rows were created by the pre-marker flow; give them a compatibility
-- marker with DDL only (never update anonymized subjects). Every publish still
-- validates their actual roster/totals and account eligibility. New runs start false.
ALTER TABLE public.match_sessions ADD COLUMN results_ready boolean NOT NULL DEFAULT true;
ALTER TABLE public.match_sessions ALTER COLUMN results_ready SET DEFAULT false;
ALTER TABLE public.match_results ADD COLUMN publication_version integer NOT NULL DEFAULT 0 CHECK (publication_version >= 0);
ALTER TABLE public.mutual_reviews ADD COLUMN match_publication_version integer;

-- Version provenance intentionally survives deletion of a withdrawn draft.
-- Stable UUID locators are not cascading FKs to editable draft structures.
CREATE TABLE matching_publication.publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  round_id uuid NOT NULL REFERENCES public.match_rounds(id),
  version integer NOT NULL CHECK (version > 0),
  round_name text NOT NULL,
  session_name text,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  withdrawn_at timestamptz,
  actor_admin_id uuid,
  reason text NOT NULL,
  UNIQUE(session_id,version)
);
CREATE TABLE matching_publication.roster (
  publication_id uuid NOT NULL REFERENCES matching_publication.publications(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  result_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('matched','unmatched','cancelled')),
  PRIMARY KEY(publication_id,member_id),
  CHECK ((outcome = 'unmatched') = (result_id IS NULL))
);
CREATE INDEX matching_publication_roster_member_idx ON matching_publication.roster(member_id,publication_id);
CREATE TABLE matching_publication.active_assignments (
  round_id uuid NOT NULL REFERENCES public.match_rounds(id),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  publication_id uuid NOT NULL REFERENCES matching_publication.publications(id) ON DELETE CASCADE,
  result_id uuid NOT NULL REFERENCES public.match_results(id) ON DELETE CASCADE,
  PRIMARY KEY(round_id,member_id)
);
-- A protected row, rather than a caller-controlled GUC, authorizes structural
-- changes within the trusted transaction. Only the non-exposed RPCs can write it.
CREATE TABLE matching_publication.write_context (
  transaction_id bigint NOT NULL,
  backend_pid integer NOT NULL,
  session_id uuid NOT NULL,
  operation text NOT NULL,
  PRIMARY KEY(transaction_id,backend_pid,session_id)
);
ALTER TABLE matching_publication.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_publication.roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_publication.active_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_publication.write_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA matching_publication FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.community_notifications
  ADD COLUMN match_publication_id uuid REFERENCES matching_publication.publications(id) ON DELETE CASCADE,
  ADD COLUMN match_session_id uuid,
  ADD COLUMN match_result_id uuid,
  ADD COLUMN publication_version integer;
ALTER TABLE public.community_notifications DROP CONSTRAINT community_notifications_notification_type_check,
  ADD CONSTRAINT community_notifications_notification_type_check CHECK (notification_type IN (
    'like','comment_like','comment','reply','announcement','report_resolved','content_hidden','content_deleted',
    'warning','mute','permanent_ban','registration_submitted','matching_submitted','birthday_completion',
    'matching_published','matching_unmatched','matching_withdrawn','matching_cancelled'
  ));
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_matching_reference_check CHECK (
  notification_type NOT IN ('matching_published','matching_unmatched','matching_withdrawn','matching_cancelled')
  OR (match_publication_id IS NOT NULL AND match_session_id IS NOT NULL AND publication_version > 0)
);
CREATE UNIQUE INDEX community_notifications_matching_delivery_idx ON public.community_notifications
  (recipient_member_id,match_publication_id,notification_type,COALESCE(match_result_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE match_publication_id IS NOT NULL;

CREATE FUNCTION matching_publication.require_admin(p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'MATCH_PUBLICATION_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  v_admin := private.member_master_current_admin_id();
  IF v_admin IS NULL THEN RAISE EXCEPTION 'MATCH_PUBLICATION_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  IF char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 4 AND 500 THEN
    RAISE EXCEPTION 'MATCH_PUBLICATION_REASON_INVALID' USING ERRCODE='22023';
  END IF;
  RETURN v_admin;
END;
$function$;
CREATE FUNCTION matching_publication.has_context(p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (SELECT 1 FROM matching_publication.write_context
    WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND session_id=p_session_id);
$function$;
CREATE FUNCTION matching_publication.member_ids(p_a uuid,p_b uuid,p_group uuid[])
RETURNS uuid[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT COALESCE(array_agg(DISTINCT member_id ORDER BY member_id),'{}'::uuid[]) FROM unnest(array_remove(ARRAY[p_a,p_b]||COALESCE(p_group,'{}'::uuid[]),NULL)) AS ids(member_id);
$function$;

CREATE FUNCTION matching_publication.guard_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.publication_version <> 0 OR NEW.published_at IS NOT NULL OR NEW.results_ready THEN
      RAISE EXCEPTION 'MATCH_PUBLICATION_REQUIRES_RPC' USING ERRCODE='PT409';
    END IF;
    RETURN NEW;
  END IF;
  IF matching_publication.has_context(OLD.id) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'MATCH_PUBLICATION_REQUIRES_WITHDRAWAL' USING ERRCODE='PT409'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.results_ready IS DISTINCT FROM OLD.results_ready OR NEW.publication_version IS DISTINCT FROM OLD.publication_version OR NEW.published_at IS DISTINCT FROM OLD.published_at
    OR (NEW.status IS DISTINCT FROM OLD.status AND (NEW.status <> 'draft' OR OLD.status <> 'draft'))
    OR (OLD.publication_version>0 AND NEW.round_id IS DISTINCT FROM OLD.round_id)
    OR (OLD.status <> 'draft' AND (to_jsonb(NEW)-'audit_reason') IS DISTINCT FROM (to_jsonb(OLD)-'audit_reason')) THEN
    RAISE EXCEPTION 'MATCH_PUBLICATION_REQUIRES_WITHDRAWAL' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_publication_guard_session BEFORE INSERT OR UPDATE OR DELETE ON public.match_sessions
  FOR EACH ROW EXECUTE FUNCTION matching_publication.guard_session();

CREATE FUNCTION matching_publication.guard_result()
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
  RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_publication_guard_result BEFORE INSERT OR UPDATE OR DELETE ON public.match_results
  FOR EACH ROW EXECUTE FUNCTION matching_publication.guard_result();

CREATE FUNCTION matching_publication.guard_diagnostic()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_id uuid; v_status text;
BEGIN
  FOR v_id IN SELECT DISTINCT id FROM unnest(CASE WHEN TG_OP='INSERT' THEN ARRAY[NEW.session_id] WHEN TG_OP='DELETE' THEN ARRAY[OLD.session_id] ELSE ARRAY[OLD.session_id,NEW.session_id] END) AS t(id) ORDER BY id LOOP
    BEGIN SELECT status INTO v_status FROM public.match_sessions WHERE id=v_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'MATCH_PUBLICATION_BUSY' USING ERRCODE='PT409'; END;
    IF FOUND AND v_status<>'draft' AND NOT matching_publication.has_context(v_id) THEN
      RAISE EXCEPTION 'MATCH_PUBLICATION_REQUIRES_WITHDRAWAL' USING ERRCODE='PT409';
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_publication_guard_diagnostic BEFORE INSERT OR UPDATE OR DELETE ON public.unmatched_diagnostics
  FOR EACH ROW EXECUTE FUNCTION matching_publication.guard_diagnostic();

CREATE FUNCTION matching_publication.assert_complete(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_session public.match_sessions%ROWTYPE; v_candidates integer; v_matched integer;
BEGIN
  SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id;
  SELECT count(DISTINCT member_id) INTO v_candidates FROM (
    SELECT member_id FROM public.unmatched_diagnostics WHERE session_id=p_session_id
    UNION SELECT member_id FROM public.match_results result CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) ids(member_id) WHERE result.session_id=p_session_id
  ) roster;
  SELECT count(DISTINCT member_id) INTO v_matched FROM public.match_results result CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) ids(member_id) WHERE result.session_id=p_session_id AND result.status<>'cancelled';
  IF v_candidates<2 OR v_candidates<>v_session.total_candidates OR v_matched<>v_session.total_matched OR GREATEST(v_candidates-v_matched,0)<>v_session.total_unmatched THEN
    RAISE EXCEPTION 'MATCH_PUBLICATION_INCOMPLETE' USING ERRCODE='PT409';
  END IF;
END;
$function$;

CREATE FUNCTION matching_publication.finalize_session(p_session_id uuid,p_round_id uuid,p_expected_status text,p_survey_start timestamptz,p_survey_end timestamptz,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid:=matching_publication.require_admin(p_reason); v_session public.match_sessions%ROWTYPE; v_round public.match_rounds%ROWTYPE;
BEGIN
  SELECT * INTO v_round FROM public.match_rounds WHERE id=p_round_id FOR UPDATE;
  SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id FOR UPDATE;
  IF v_session.id IS NULL OR v_session.round_id IS DISTINCT FROM p_round_id OR v_session.created_by IS DISTINCT FROM v_admin
    OR v_round.id IS NULL OR v_round.purpose<>'matching' OR v_round.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  IF p_expected_status NOT IN ('open','closed') OR p_expected_status IS NULL OR v_session.status<>'draft'
    OR v_round.survey_start IS DISTINCT FROM p_survey_start OR v_round.survey_end IS DISTINCT FROM p_survey_end THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  IF v_session.results_ready AND v_round.status=(CASE p_expected_status WHEN 'closed' THEN 'matched' ELSE 'open' END) THEN
    RETURN jsonb_build_object('session_id',p_session_id,'round_id',p_round_id,'results_ready',true,'already_applied',true);
  END IF;
  IF v_round.status<>p_expected_status OR (p_expected_status='open' AND (v_round.survey_start IS NULL OR v_round.survey_end IS NULL OR v_round.survey_start>=v_round.survey_end OR v_round.survey_start>clock_timestamp())) THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  PERFORM matching_publication.assert_complete(p_session_id);
  INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),p_session_id,'finalize');
  PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
  UPDATE public.match_rounds SET status=CASE p_expected_status WHEN 'closed' THEN 'matched' ELSE 'open' END WHERE id=p_round_id;
  UPDATE public.match_sessions SET results_ready=true,audit_reason=btrim(p_reason) WHERE id=p_session_id;
  DELETE FROM matching_publication.write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND session_id=p_session_id;
  RETURN jsonb_build_object('session_id',p_session_id,'round_id',p_round_id,'results_ready',true,'already_applied',false);
END;
$function$;

CREATE FUNCTION matching_publication.publish_session(p_session_id uuid,p_expected_publication_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid:=matching_publication.require_admin(p_reason); v_session public.match_sessions%ROWTYPE; v_round public.match_rounds%ROWTYPE; v_pub matching_publication.publications%ROWTYPE; v_result public.match_results%ROWTYPE; v_members uuid[]; v_seen uuid[]:='{}'; v_id uuid; v_count integer:=0; v_unmatched integer:=0;
BEGIN
  SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id;
  IF NOT FOUND OR v_session.round_id IS NULL THEN RAISE EXCEPTION 'MATCH_PUBLICATION_NOT_FOUND' USING ERRCODE='PT409'; END IF;
  SELECT * INTO v_round FROM public.match_rounds WHERE id=v_session.round_id FOR UPDATE;
  SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id FOR UPDATE;
  IF v_round.deleted_at IS NOT NULL OR v_round.purpose<>'matching' THEN RAISE EXCEPTION 'MATCH_PUBLICATION_READ_ONLY' USING ERRCODE='PT409'; END IF;
  IF p_expected_publication_version IS NULL OR p_expected_publication_version<0 THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  IF v_session.status='confirmed' AND v_session.publication_version=p_expected_publication_version+1 THEN
    SELECT * INTO v_pub FROM matching_publication.publications WHERE session_id=p_session_id AND version=v_session.publication_version AND withdrawn_at IS NULL;
    RETURN jsonb_build_object('session_id',p_session_id,'round_id',v_session.round_id,'publication_id',v_pub.id,'publication_version',v_session.publication_version,'published',true,'already_applied',true);
  END IF;
  IF v_session.status<>'draft' OR v_session.publication_version<>p_expected_publication_version THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  IF NOT v_session.results_ready THEN RAISE EXCEPTION 'MATCH_PUBLICATION_INCOMPLETE' USING ERRCODE='PT409'; END IF;
  PERFORM matching_publication.assert_complete(p_session_id);
  FOR v_result IN SELECT * FROM public.match_results WHERE session_id=p_session_id AND status<>'cancelled' ORDER BY id LOOP
    v_members:=matching_publication.member_ids(v_result.member_a_id,v_result.member_b_id,v_result.group_members);
    IF cardinality(v_members)<2 OR v_result.status NOT IN ('draft','locked') THEN RAISE EXCEPTION 'MATCH_PUBLICATION_INVALID_RESULT' USING ERRCODE='PT409'; END IF;
    IF v_seen && v_members THEN RAISE EXCEPTION 'MATCH_PUBLICATION_CONFLICT' USING ERRCODE='PT409'; END IF;
    v_seen:=v_seen||v_members;
  END LOOP;
  PERFORM 1 FROM public.members WHERE id IN (SELECT member_id FROM public.unmatched_diagnostics WHERE session_id=p_session_id UNION SELECT member_id FROM public.match_results result CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) ids(member_id) WHERE result.session_id=p_session_id) ORDER BY id FOR SHARE;
  -- Lock each canonical member in stable order: lifecycle erasure cannot race a
  -- successful validation and restore a notification after the privacy scrub.
  FOR v_id IN SELECT unnest(v_seen) ORDER BY 1 LOOP
    PERFORM 1 FROM public.members WHERE id=v_id AND status='approved' AND account_status='active' AND anonymized_at IS NULL AND user_id IS NOT NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_PUBLICATION_INVALID_MEMBER' USING ERRCODE='PT409'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM matching_publication.active_assignments WHERE round_id=v_session.round_id AND member_id=ANY(v_seen)) THEN
    RAISE EXCEPTION 'MATCH_PUBLICATION_CONFLICT' USING ERRCODE='PT409';
  END IF;
  INSERT INTO matching_publication.publications(session_id,round_id,version,round_name,session_name,actor_admin_id,reason)
    VALUES(p_session_id,v_session.round_id,v_session.publication_version+1,v_round.round_name,v_session.session_name,v_admin,btrim(p_reason)) RETURNING * INTO v_pub;
  INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),p_session_id,'publish');
  PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
  UPDATE public.match_results SET status='confirmed',publication_version=v_pub.version,audit_reason=btrim(p_reason) WHERE session_id=p_session_id AND status IN ('draft','locked');
  INSERT INTO matching_publication.roster(publication_id,member_id,result_id,outcome)
    SELECT v_pub.id,member_id,result.id,'matched' FROM public.match_results result CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) ids(member_id) WHERE result.session_id=p_session_id AND result.status='confirmed';
  INSERT INTO matching_publication.roster(publication_id,member_id,outcome)
    SELECT DISTINCT v_pub.id,candidate.member_id,'unmatched' FROM (
      SELECT member_id FROM public.unmatched_diagnostics WHERE session_id=p_session_id
      UNION SELECT member_id FROM public.match_results result CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) ids(member_id) WHERE result.session_id=p_session_id
    ) candidate WHERE NOT candidate.member_id=ANY(v_seen);
  UPDATE matching_publication.roster roster SET outcome='cancelled',result_id=prior.id
    FROM public.match_results prior WHERE roster.publication_id=v_pub.id AND roster.outcome='unmatched' AND prior.session_id=p_session_id AND prior.status='cancelled' AND prior.publication_version>0 AND roster.member_id=ANY(matching_publication.member_ids(prior.member_a_id,prior.member_b_id,prior.group_members));
  INSERT INTO matching_publication.active_assignments(round_id,member_id,publication_id,result_id)
    SELECT v_round.id,member_id,v_pub.id,result_id FROM matching_publication.roster WHERE publication_id=v_pub.id AND outcome='matched';
  SELECT count(*) FILTER(WHERE outcome='matched'),count(*) FILTER(WHERE outcome<>'matched') INTO v_count,v_unmatched FROM matching_publication.roster WHERE publication_id=v_pub.id;
  UPDATE public.match_sessions SET status='confirmed',publication_version=v_pub.version,published_at=v_pub.published_at,total_candidates=v_count+v_unmatched,total_matched=v_count,total_unmatched=v_unmatched,audit_reason=btrim(p_reason) WHERE id=p_session_id;
  UPDATE public.community_notifications SET read_at=COALESCE(read_at,clock_timestamp()),expires_at=LEAST(expires_at,clock_timestamp()) WHERE match_session_id=p_session_id AND publication_version<v_pub.version;
  INSERT INTO public.community_notifications(recipient_member_id,notification_type,round_id,match_publication_id,match_session_id,match_result_id,publication_version,title_zh,title_ja,body_zh,body_ja)
    SELECT roster.member_id,CASE outcome WHEN 'matched' THEN 'matching_published' ELSE 'matching_unmatched' END,v_round.id,v_pub.id,p_session_id,result_id,v_pub.version,
      CASE outcome WHEN 'matched' THEN '匹配结果已发布' ELSE '本批暂未匹配' END,CASE outcome WHEN 'matched' THEN 'マッチング結果が公開されました' ELSE '今回のマッチング結果' END,
      CASE outcome WHEN 'matched' THEN '「'||v_round.round_name||'」的匹配结果已发布，请查看搭档与共同时间。' ELSE '「'||v_round.round_name||'」本批暂未匹配，可在参与记录中查看状态。' END,
      CASE outcome WHEN 'matched' THEN '「'||v_round.round_name||'」の相手と共通の時間を参加履歴から確認できます。' ELSE '「'||v_round.round_name||'」は今回マッチングが成立しませんでした。参加履歴から確認できます。' END
    FROM matching_publication.roster roster JOIN public.members member ON member.id=roster.member_id WHERE roster.publication_id=v_pub.id AND roster.outcome IN ('matched','unmatched') AND member.account_status='active' AND member.status='approved' AND member.anonymized_at IS NULL AND member.user_id IS NOT NULL
      AND (roster.outcome='matched' OR NOT EXISTS(SELECT 1 FROM matching_publication.active_assignments assignment WHERE assignment.round_id=v_round.id AND assignment.member_id=roster.member_id));
  DELETE FROM matching_publication.write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND session_id=p_session_id;
  RETURN jsonb_build_object('session_id',p_session_id,'round_id',v_session.round_id,'publication_id',v_pub.id,'publication_version',v_pub.version,'published',true,'already_applied',false);
END;
$function$;

CREATE FUNCTION matching_publication.unpublish_session(p_session_id uuid,p_expected_publication_version integer,p_reason text)
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
  UPDATE public.match_results SET status='draft',publication_version=0,audit_reason=btrim(p_reason) WHERE session_id=p_session_id AND status='confirmed';
  UPDATE public.match_sessions SET status='draft',audit_reason=btrim(p_reason) WHERE id=p_session_id;
  UPDATE public.community_notifications SET read_at=COALESCE(read_at,clock_timestamp()),expires_at=LEAST(expires_at,clock_timestamp()) WHERE match_publication_id=v_pub.id;
  INSERT INTO public.community_notifications(recipient_member_id,notification_type,round_id,match_publication_id,match_session_id,publication_version,title_zh,title_ja,body_zh,body_ja)
    SELECT roster.member_id,'matching_withdrawn',v_session.round_id,v_pub.id,p_session_id,v_pub.version,'匹配结果已撤回','マッチング結果が取り下げられました','「'||v_pub.round_name||'」的本批结果已撤回，请等待重新发布。','「'||v_pub.round_name||'」の結果が取り下げられました。再公開をお待ちください。'
    FROM matching_publication.roster roster JOIN public.members member ON member.id=roster.member_id WHERE roster.publication_id=v_pub.id AND roster.outcome<>'cancelled' AND member.account_status='active' AND member.status='approved' AND member.anonymized_at IS NULL AND member.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM matching_publication.active_assignments assignment WHERE assignment.round_id=v_session.round_id AND assignment.member_id=roster.member_id);
  DELETE FROM matching_publication.write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND session_id=p_session_id;
  RETURN jsonb_build_object('session_id',p_session_id,'round_id',v_session.round_id,'publication_version',v_session.publication_version,'published',false,'already_applied',false);
END;
$function$;

CREATE FUNCTION matching_publication.delete_draft(p_session_id uuid,p_expected_publication_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid:=matching_publication.require_admin(p_reason); v_session public.match_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('session_id',p_session_id,'deleted',true,'already_applied',true); END IF;
  IF v_session.round_id IS NULL THEN RAISE EXCEPTION 'MATCH_PUBLICATION_READ_ONLY' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.match_rounds WHERE id=v_session.round_id FOR UPDATE;
  SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id FOR UPDATE;
  IF v_session.status<>'draft' THEN RAISE EXCEPTION 'MATCH_PUBLICATION_REQUIRES_WITHDRAWAL' USING ERRCODE='PT409'; END IF;
  IF p_expected_publication_version IS NULL OR v_session.publication_version<>p_expected_publication_version THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
  DELETE FROM public.match_sessions WHERE id=p_session_id;
  -- An open round continues collecting. A matched round is reset only when no
  -- other session survives, so deleting an older draft cannot reopen its peer.
  UPDATE public.match_rounds SET status='closed' WHERE id=v_session.round_id AND status='matched' AND NOT EXISTS(SELECT 1 FROM public.match_sessions WHERE round_id=v_session.round_id);
  RETURN jsonb_build_object('session_id',p_session_id,'round_id',v_session.round_id,'deleted',true,'already_applied',false);
END;
$function$;

CREATE FUNCTION matching_publication.review_cancellation(p_result_id uuid,p_expected_publication_version integer,p_expected_requested_at timestamptz,p_reason text,p_approve boolean)
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
  IF p_expected_requested_at IS NULL OR p_expected_requested_at IS DISTINCT FROM v_result.cancellation_requested_at THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
  IF v_result.cancellation_status=(CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END) THEN
    RETURN jsonb_build_object('result_id',p_result_id,'session_id',v_session.id,'round_id',v_session.round_id,'already_applied',true);
  END IF;
  IF v_result.cancellation_status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'MATCH_PUBLICATION_CANCELLATION_NOT_PENDING' USING ERRCODE='PT409'; END IF;
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

CREATE FUNCTION matching_publication.request_cancellation(p_result_id uuid,p_reason text,p_expected_publication_version integer)
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
  UPDATE public.match_results SET cancellation_requested_by=v_member,cancellation_reason=v_reason,cancellation_requested_at=clock_timestamp(),cancellation_status='pending' WHERE id=p_result_id;
  DELETE FROM matching_publication.write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND session_id=v_session.id;
  RETURN jsonb_build_object('match_result_id',p_result_id,'member_id',v_member,'cancellation_status','pending');
END;
$function$;

CREATE FUNCTION matching_publication.can_read_result(p_result_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.match_results result JOIN public.match_sessions session ON session.id=result.session_id
    JOIN public.members member ON member.id=ANY(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members))
    WHERE result.id=p_result_id AND member.user_id=(SELECT auth.uid()) AND member.status='approved' AND member.account_status='active' AND member.anonymized_at IS NULL
      AND session.status='confirmed' AND result.publication_version>0 AND (result.status='cancelled' OR (result.status='confirmed' AND result.publication_version=session.publication_version))
  );
$function$;
DROP POLICY member_master_match_results_active_self_read ON public.match_results;
CREATE POLICY member_master_match_results_active_self_read ON public.match_results FOR SELECT TO authenticated
  USING (matching_publication.can_read_result(id));
DROP POLICY member_master_match_sessions_active_member_read ON public.match_sessions;
CREATE POLICY member_master_match_sessions_active_member_read ON public.match_sessions FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR (status='confirmed' AND publication_version>0 AND EXISTS(SELECT 1 FROM public.members member WHERE member.user_id=(SELECT auth.uid()) AND member.status='approved' AND member.account_status='active' AND member.anonymized_at IS NULL)));

-- The old review path must not allow a participant to write against a withdrawn
-- result, or race a withdrawal after a frontend visibility check.
CREATE FUNCTION matching_publication.guard_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_result public.match_results%ROWTYPE; v_session public.match_sessions%ROWTYPE;
BEGIN
  IF NEW.match_result_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_result FROM public.match_results WHERE id=NEW.match_result_id;
  BEGIN SELECT * INTO v_session FROM public.match_sessions WHERE id=v_result.session_id FOR SHARE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'MATCH_PUBLICATION_BUSY' USING ERRCODE='PT409'; END;
  SELECT * INTO v_result FROM public.match_results WHERE id=NEW.match_result_id;
  IF v_result.session_id IS DISTINCT FROM v_session.id OR NEW.match_publication_version IS NULL OR NEW.match_publication_version<>v_session.publication_version OR v_session.status IS DISTINCT FROM 'confirmed' OR v_result.status IS DISTINCT FROM 'confirmed' OR v_result.publication_version<>v_session.publication_version
    OR NOT NEW.reviewer_id=ANY(matching_publication.member_ids(v_result.member_a_id,v_result.member_b_id,v_result.group_members))
    OR NOT NEW.reviewee_id=ANY(matching_publication.member_ids(v_result.member_a_id,v_result.member_b_id,v_result.group_members)) THEN
    RAISE EXCEPTION 'MATCH_PUBLICATION_NOT_PUBLISHED' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_publication_guard_review BEFORE INSERT ON public.mutual_reviews FOR EACH ROW EXECUTE FUNCTION matching_publication.guard_review();

CREATE FUNCTION matching_publication.my_outcomes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_member uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'MEMBER_MASTER_ACTIVE_MEMBER_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_member FROM public.members WHERE user_id=(SELECT auth.uid()) AND status='approved' AND account_status='active' AND anonymized_at IS NULL;
  IF v_member IS NULL THEN RAISE EXCEPTION 'MEMBER_MASTER_ACTIVE_MEMBER_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(item ORDER BY sort_at DESC,round_id) FROM (
    SELECT round.id AS round_id,COALESCE(chosen.published_at,submission.created_at,round.created_at) AS sort_at,
      jsonb_build_object('round_id',round.id,'round_name',COALESCE(chosen.round_name,round.round_name),'session_id',chosen.session_id,'session_name',chosen.session_name,
        'publication_version',chosen.version,'published_at',chosen.published_at,'status',COALESCE(chosen.outcome,'waiting'),'result_id',chosen.result_id) AS item
    FROM public.match_rounds round
    LEFT JOIN public.match_round_submissions submission ON submission.round_id=round.id AND submission.member_id=v_member AND submission.cancelled_at IS NULL
    LEFT JOIN LATERAL (
      SELECT publication.session_id,publication.session_name,publication.round_name,publication.version,publication.published_at,roster.result_id,
        CASE WHEN assignment.member_id IS NOT NULL THEN 'matched' WHEN publication.withdrawn_at IS NOT NULL THEN 'withdrawn' ELSE roster.outcome END AS outcome
      FROM matching_publication.roster roster JOIN matching_publication.publications publication ON publication.id=roster.publication_id
      LEFT JOIN matching_publication.active_assignments assignment ON assignment.publication_id=publication.id AND assignment.member_id=roster.member_id AND assignment.result_id=roster.result_id
      WHERE roster.member_id=v_member AND publication.round_id=round.id
      ORDER BY (assignment.member_id IS NOT NULL) DESC,publication.published_at DESC,publication.version DESC LIMIT 1
    ) chosen ON true
    WHERE round.purpose='matching' AND round.deleted_at IS NULL AND (submission.id IS NOT NULL OR chosen.session_id IS NOT NULL)
  ) outcomes),'[]'::jsonb);
END;
$function$;

-- Existing published data receives version/provenance markers without sending
-- retroactive notices. Conflicting existing assignments abort the migration.
DO $backfill$
DECLARE v_session public.match_sessions%ROWTYPE; v_pub matching_publication.publications%ROWTYPE;
BEGIN
  FOR v_session IN SELECT * FROM public.match_sessions WHERE status IN ('confirmed','published') AND round_id IS NOT NULL ORDER BY created_at,id LOOP
    INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),v_session.id,'backfill');
    INSERT INTO matching_publication.publications(session_id,round_id,version,round_name,session_name,published_at,reason)
      SELECT v_session.id,v_session.round_id,1,round_name,v_session.session_name,v_session.created_at,'Existing published matching provenance' FROM public.match_rounds WHERE id=v_session.round_id RETURNING * INTO v_pub;
    UPDATE public.match_sessions SET status='confirmed',publication_version=1,published_at=v_pub.published_at WHERE id=v_session.id;
    UPDATE public.match_results SET publication_version=1 WHERE session_id=v_session.id AND status IN ('confirmed','cancelled');
    INSERT INTO matching_publication.roster(publication_id,member_id,result_id,outcome)
      SELECT v_pub.id,member_id,result.id,CASE result.status WHEN 'cancelled' THEN 'cancelled' ELSE 'matched' END FROM public.match_results result CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) ids(member_id) WHERE result.session_id=v_session.id AND result.status IN ('confirmed','cancelled')
      ORDER BY (result.status='confirmed') DESC,result.id,member_id
      ON CONFLICT (publication_id,member_id) DO NOTHING;
    INSERT INTO matching_publication.active_assignments(round_id,member_id,publication_id,result_id)
      SELECT v_session.round_id,member_id,v_pub.id,result.id FROM public.match_results result CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) ids(member_id) WHERE result.session_id=v_session.id AND result.status='confirmed';
    INSERT INTO matching_publication.roster(publication_id,member_id,outcome)
      SELECT DISTINCT v_pub.id,member_id,'unmatched' FROM public.unmatched_diagnostics WHERE session_id=v_session.id ON CONFLICT DO NOTHING;
    DELETE FROM matching_publication.write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND session_id=v_session.id;
  END LOOP;
END;
$backfill$;

CREATE FUNCTION public.admin_finalize_matching_session(p_session_id uuid,p_round_id uuid,p_expected_status text,p_survey_start timestamptz,p_survey_end timestamptz,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$ SELECT matching_publication.finalize_session(p_session_id,p_round_id,p_expected_status,p_survey_start,p_survey_end,p_reason) $function$;
CREATE FUNCTION public.admin_publish_match_session(p_session_id uuid,p_expected_publication_version integer,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$ SELECT matching_publication.publish_session(p_session_id,p_expected_publication_version,p_reason) $function$;
CREATE FUNCTION public.admin_unpublish_match_session(p_session_id uuid,p_expected_publication_version integer,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$ SELECT matching_publication.unpublish_session(p_session_id,p_expected_publication_version,p_reason) $function$;
CREATE FUNCTION public.admin_delete_match_session_draft(p_session_id uuid,p_expected_publication_version integer,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$ SELECT matching_publication.delete_draft(p_session_id,p_expected_publication_version,p_reason) $function$;
CREATE FUNCTION public.admin_approve_matching_cancellation(p_result_id uuid,p_expected_publication_version integer,p_expected_requested_at timestamptz,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$ SELECT matching_publication.review_cancellation(p_result_id,p_expected_publication_version,p_expected_requested_at,p_reason,true) $function$;
CREATE FUNCTION public.admin_reject_matching_cancellation(p_result_id uuid,p_expected_publication_version integer,p_expected_requested_at timestamptz,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$ SELECT matching_publication.review_cancellation(p_result_id,p_expected_publication_version,p_expected_requested_at,p_reason,false) $function$;
-- Retain the two-argument overload as an explicit stale-client rejection rather
-- than silently applying an old cancellation form to a newly published version.
CREATE OR REPLACE FUNCTION public.request_my_match_cancellation(p_result_id uuid,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END;
$function$;
CREATE FUNCTION public.request_my_match_cancellation(p_result_id uuid,p_reason text,p_expected_publication_version integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$ SELECT matching_publication.request_cancellation(p_result_id,p_reason,p_expected_publication_version) $function$;
CREATE FUNCTION public.get_my_matching_publications()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$ SELECT matching_publication.my_outcomes() $function$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA matching_publication FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION matching_publication.finalize_session(uuid,uuid,text,timestamptz,timestamptz,text),matching_publication.publish_session(uuid,integer,text),matching_publication.unpublish_session(uuid,integer,text),matching_publication.delete_draft(uuid,integer,text),matching_publication.review_cancellation(uuid,integer,timestamptz,text,boolean),matching_publication.request_cancellation(uuid,text,integer),matching_publication.my_outcomes(),matching_publication.can_read_result(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_finalize_matching_session(uuid,uuid,text,timestamptz,timestamptz,text),public.admin_publish_match_session(uuid,integer,text),public.admin_unpublish_match_session(uuid,integer,text),public.admin_delete_match_session_draft(uuid,integer,text),public.admin_approve_matching_cancellation(uuid,integer,timestamptz,text),public.admin_reject_matching_cancellation(uuid,integer,timestamptz,text),public.request_my_match_cancellation(uuid,text,integer),public.get_my_matching_publications() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_finalize_matching_session(uuid,uuid,text,timestamptz,timestamptz,text),public.admin_publish_match_session(uuid,integer,text),public.admin_unpublish_match_session(uuid,integer,text),public.admin_delete_match_session_draft(uuid,integer,text),public.admin_approve_matching_cancellation(uuid,integer,timestamptz,text),public.admin_reject_matching_cancellation(uuid,integer,timestamptz,text),public.request_my_match_cancellation(uuid,text,integer),public.get_my_matching_publications() TO authenticated;
COMMIT;
