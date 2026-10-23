-- Capture the actual inputs used by a round run. Scoring, collection windows,
-- import/reopen rules and same-round publication uniqueness are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));

CREATE SCHEMA matching_run;
REVOKE ALL ON SCHEMA matching_run FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA matching_run TO authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA matching_run REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER TABLE public.match_sessions ADD COLUMN input_snapshot_required boolean NOT NULL DEFAULT false;
CREATE TABLE matching_run.snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 round_id uuid NOT NULL REFERENCES public.match_rounds(id),
 actor_admin_id uuid NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 sealed_at timestamptz,
 session_id uuid UNIQUE REFERENCES public.match_sessions(id) ON DELETE CASCADE,
 source jsonb,
 engine_input jsonb,
 submitted_count integer NOT NULL CHECK(submitted_count>=0),
 eligible_count integer NOT NULL CHECK(eligible_count>=0),
 excluded_count integer NOT NULL CHECK(excluded_count>=0),
 source_digest text NOT NULL,
 engine_digest text,
 redacted_at timestamptz,
 reason text NOT NULL,
 CHECK(eligible_count+excluded_count=submitted_count),
 CHECK((sealed_at IS NULL)=(session_id IS NULL)),
 CHECK((redacted_at IS NOT NULL) OR source IS NOT NULL)
);
CREATE TABLE matching_run.subjects (
 snapshot_id uuid NOT NULL REFERENCES matching_run.snapshots(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
 PRIMARY KEY(snapshot_id,member_id)
);
CREATE INDEX matching_run_subject_member_idx ON matching_run.subjects(member_id,snapshot_id);
ALTER TABLE matching_run.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_run.subjects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA matching_run FROM PUBLIC,anon,authenticated,service_role;

-- The database role, never a caller-provided JWT field, identifies the trusted
-- server. Browser users cannot supply snapshots or read their sensitive payload.
CREATE FUNCTION matching_run.require_server_admin(p_actor_admin_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role'
   OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor_admin_id AND user_id IS NOT NULL) THEN
   RAISE EXCEPTION 'MATCH_RUN_SERVER_ADMIN_REQUIRED' USING ERRCODE='42501';
 END IF;
END;
$function$;
CREATE FUNCTION matching_run.pick(p_row jsonb,p_keys text[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 SELECT CASE WHEN p_row IS NULL THEN NULL ELSE COALESCE((SELECT jsonb_object_agg(key,value) FROM jsonb_each(p_row) WHERE key=ANY(p_keys)),'{}'::jsonb) END
$function$;

-- This read-only statement shares one SQL snapshot for all source relations.
-- Canonical member locks held by capture serialize questionnaire saves/erasure.
CREATE FUNCTION matching_run.source(p_round_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 WITH submissions AS MATERIALIZED (
 SELECT s.*,to_jsonb(m) AS member_record,
  private.member_matching_readiness(m.id) AS readiness,
  jsonb_typeof(s.import_metadata)='object' AND char_length(btrim(COALESCE(s.import_metadata->>'normalized_name','')))>0
   AND s.import_metadata->>'source'='current' AND s.import_metadata->>'matched_member_id'=m.id::text AS current_import,
  jsonb_typeof(s.import_metadata)='object' AND char_length(btrim(COALESCE(s.import_metadata->>'normalized_name','')))>0
   AND s.import_metadata->>'source' IN ('temp','legacy-temp') AND m.record_source='import'
   AND m.account_status='unbound' AND m.user_id IS NULL AND m.record_scope IN ('current','historical')
   AND m.member_number LIKE 'IMP-'||left(p_round_id::text,8)||'-%' AS offline_import,
  jsonb_build_object('id',m.id,'status',m.status,'account_status',m.account_status,'membership_type',m.membership_type,
    'record_scope',m.record_scope,'user_id',m.user_id,'anonymized_at',m.anonymized_at,'record_source',m.record_source,
    'member_number',m.member_number,'attractiveness_score',m.attractiveness_score,
    'member_identity',(SELECT matching_run.pick(to_jsonb(i),ARRAY['full_name','nickname','gender','school_name','hobby_tags','personality_self_tags','taboo_tags','current_city','updated_at']) FROM public.member_identity i WHERE i.member_id=m.id),
    'member_personality',(SELECT matching_run.pick(to_jsonb(i),ARRAY['warmup_speed','expression_style_tags','group_role_tags','updated_at']) FROM public.member_personality i WHERE i.member_id=m.id),
    'member_interests',(SELECT matching_run.pick(to_jsonb(i),ARRAY['scenario_mode_pref','scenario_theme_tags','accept_beginners','accept_cross_school','activity_area','updated_at']) FROM public.member_interests i WHERE i.member_id=m.id),
    'member_language',(SELECT matching_run.pick(to_jsonb(i),ARRAY['communication_language_pref','japanese_level','updated_at']) FROM public.member_language i WHERE i.member_id=m.id),
    'member_boundaries',(SELECT matching_run.pick(to_jsonb(i),ARRAY['taboo_tags','deal_breakers','updated_at']) FROM public.member_boundaries i WHERE i.member_id=m.id),
    'member_dynamic_stats',(SELECT matching_run.pick(to_jsonb(i),ARRAY['activity_count','reliability_score','updated_at']) FROM public.member_dynamic_stats i WHERE i.member_id=m.id),
    'personality_quiz_results',COALESCE((SELECT jsonb_agg(matching_run.pick(to_jsonb(q),ARRAY['score_e','score_a','score_o','score_c','score_n','completed_at','updated_at'])) FROM public.personality_quiz_results q WHERE q.member_id=m.id),'[]'::jsonb)
  ) AS profile
 FROM public.match_round_submissions s JOIN public.members m ON m.id=s.member_id WHERE s.round_id=p_round_id
 ), eligibility AS MATERIALIZED (
 SELECT s.*,array_remove(ARRAY[
  CASE WHEN s.cancelled_at IS NOT NULL THEN 'cancelled' END,
  CASE WHEN member_record->>'status' IS DISTINCT FROM 'approved' THEN 'member_not_approved' END,
  CASE WHEN member_record->>'anonymized_at' IS NOT NULL THEN 'anonymized' END,
  CASE WHEN member_record->>'membership_type' IS DISTINCT FROM 'player' THEN 'not_player' END,
  CASE WHEN member_record->>'account_status' IS DISTINCT FROM 'active' AND NOT COALESCE(offline_import,false) THEN 'account_unavailable' END,
  CASE WHEN member_record->>'record_scope' IS DISTINCT FROM 'current' AND NOT COALESCE(offline_import,false) THEN 'not_current' END,
  CASE WHEN member_record->>'user_id' IS NULL AND NOT COALESCE(offline_import,false) THEN 'unbound' END,
  CASE WHEN jsonb_array_length(readiness->'missing')>0 AND NOT(COALESCE(current_import,false) OR COALESCE(offline_import,false)) THEN 'profile_incomplete' END
 ],NULL) AS reasons
 FROM submissions s
 ), member_ids AS (SELECT member_id FROM eligibility), history AS MATERIALIZED (
 SELECT r.id,r.member_a_id,r.member_b_id,r.group_members,r.session_id,r.created_at,r.publication_version,session.publication_version AS session_publication_version,session.published_at AS session_published_at FROM public.match_results r
 JOIN public.match_sessions session ON session.id=r.session_id
 WHERE r.status='confirmed' AND session.status='confirmed'
 AND (r.member_a_id IN(SELECT member_id FROM member_ids) OR r.member_b_id IN(SELECT member_id FROM member_ids)
   OR r.group_members && ARRAY(SELECT member_id FROM member_ids))
 )
 SELECT jsonb_build_object(
 'round',(SELECT to_jsonb(r) FROM public.match_rounds r WHERE r.id=p_round_id),
 'submissions',COALESCE((SELECT jsonb_agg((to_jsonb(s)-ARRAY['member_record','readiness','current_import','offline_import','profile'])||jsonb_build_object('member',s.profile) ORDER BY s.created_at DESC) FROM submissions s),'[]'::jsonb),
 'eligibility',COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id',member_id,'eligible',cardinality(reasons)=0,'reasons',reasons,'readiness',readiness,'import_exempt',COALESCE(current_import,false) OR COALESCE(offline_import,false)) ORDER BY created_at DESC) FROM eligibility),'[]'::jsonb),
 'history_results',COALESCE((SELECT jsonb_agg(to_jsonb(h)) FROM history h),'[]'::jsonb),
 'blacklist',COALESCE((SELECT jsonb_agg(jsonb_build_object('member_a_id',p.member_a_id,'member_b_id',p.member_b_id,'notes',p.notes,'status',p.status,'updated_at',to_jsonb(p)->'updated_at')) FROM public.pair_relationships p WHERE p.status='blacklist' AND (p.member_a_id IN(SELECT member_id FROM member_ids) OR p.member_b_id IN(SELECT member_id FROM member_ids))),'[]'::jsonb),
 'feedbacks',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'reviewer_id',r.reviewer_id,'reviewee_id',r.reviewee_id,'overall_score',r.overall_score,'match_result_id',r.match_result_id,'match_publication_version',r.match_publication_version,'created_at',to_jsonb(r)->'created_at')) FROM public.mutual_reviews r WHERE r.reviewer_id IN(SELECT member_id FROM member_ids) OR r.reviewee_id IN(SELECT member_id FROM member_ids)),'[]'::jsonb),
 'questionnaire_refs',COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id',r.member_id,'kind',r.kind,'version_id',r.version_id,'response_id',r.id,'revision',r.revision,'completed_at',r.completed_at,'updated_at',r.updated_at,'assigned',a.response_id=r.id,'version_number',v.version,'template_digest',md5(v.template::text))) FROM public.questionnaire_responses r LEFT JOIN public.questionnaire_assignments a ON a.member_id=r.member_id AND a.kind=r.kind JOIN public.questionnaire_versions v ON v.id=r.version_id WHERE r.member_id IN(SELECT member_id FROM member_ids) AND r.kind IN('supplementary','personality','quiz')),'[]'::jsonb)
 )
$function$;

CREATE FUNCTION matching_run.subject_ids(p_source jsonb)
RETURNS uuid[] LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 SELECT COALESCE(array_agg(DISTINCT id),'{}'::uuid[]) FROM (
 SELECT (s->>'member_id')::uuid AS id FROM jsonb_array_elements(p_source->'submissions') s
 UNION SELECT (s->>'member_a_id')::uuid FROM jsonb_array_elements(p_source->'history_results') s
 UNION SELECT (s->>'member_b_id')::uuid FROM jsonb_array_elements(p_source->'history_results') s
 UNION SELECT ids.value::uuid FROM jsonb_array_elements(p_source->'history_results') s CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(s->'group_members')='array' THEN s->'group_members' ELSE '[]'::jsonb END) ids(value)
 UNION SELECT (s->>'member_a_id')::uuid FROM jsonb_array_elements(p_source->'blacklist') s
 UNION SELECT (s->>'member_b_id')::uuid FROM jsonb_array_elements(p_source->'blacklist') s
 UNION SELECT (s->>'reviewer_id')::uuid FROM jsonb_array_elements(p_source->'feedbacks') s
 UNION SELECT (s->>'reviewee_id')::uuid FROM jsonb_array_elements(p_source->'feedbacks') s
 ) ids WHERE id IS NOT NULL
$function$;

CREATE FUNCTION matching_run.capture(p_round_id uuid,p_actor_admin_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_round public.match_rounds%ROWTYPE; v_source jsonb; v_id uuid; v_at timestamptz:=clock_timestamp(); v_eligible integer; v_submitted integer; v_subjects uuid[];
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 IF char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'MATCH_RUN_REASON_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_round FROM public.match_rounds WHERE id=p_round_id FOR SHARE;
 IF v_round.id IS NULL OR v_round.deleted_at IS NOT NULL OR v_round.purpose<>'matching'
  OR v_round.status NOT IN('open','closed') OR (v_round.status='open' AND (v_round.survey_start IS NULL OR v_round.survey_end IS NULL OR v_round.survey_start>=v_round.survey_end OR v_round.survey_start>clock_timestamp())) THEN
  RAISE EXCEPTION 'MATCH_RUN_ROUND_UNAVAILABLE' USING ERRCODE='PT409';
 END IF;
 PERFORM 1 FROM public.members m WHERE m.id IN(SELECT member_id FROM public.match_round_submissions WHERE round_id=p_round_id) ORDER BY m.id FOR SHARE;
 v_source:=matching_run.source(p_round_id);
 v_subjects:=matching_run.subject_ids(v_source);
 PERFORM 1 FROM public.members WHERE id=ANY(v_subjects) ORDER BY id FOR SHARE;
 IF EXISTS(SELECT 1 FROM public.members WHERE id=ANY(v_subjects) AND anonymized_at>=v_at) THEN
  RAISE EXCEPTION 'MATCH_RUN_PRIVACY_CHANGED' USING ERRCODE='PT409';
 END IF;
 v_submitted:=jsonb_array_length(v_source->'submissions');
 SELECT count(*) INTO v_eligible FROM jsonb_array_elements(v_source->'eligibility') e WHERE (e->>'eligible')::boolean;
 INSERT INTO matching_run.snapshots(round_id,actor_admin_id,captured_at,source,submitted_count,eligible_count,excluded_count,source_digest,reason)
 VALUES(p_round_id,p_actor_admin_id,v_at,v_source,v_submitted,v_eligible,v_submitted-v_eligible,md5(v_source::text),btrim(p_reason)) RETURNING id INTO v_id;
 INSERT INTO matching_run.subjects(snapshot_id,member_id) SELECT v_id,id FROM public.members WHERE id=ANY(v_subjects);
 RETURN jsonb_build_object('snapshot_id',v_id,'captured_at',v_at,'source',v_source);
END;
$function$;

CREATE FUNCTION matching_run.metadata(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' AND ((SELECT auth.uid()) IS NULL OR NOT public.is_admin()) THEN RAISE EXCEPTION 'MATCH_RUN_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_build_object('snapshot_id',id,'captured_at',captured_at,'sealed_at',sealed_at,'submitted_count',submitted_count,'eligible_count',eligible_count,'excluded_count',excluded_count,'source_digest',source_digest,'engine_digest',engine_digest,'redacted_at',redacted_at,'algorithm_version',CASE WHEN redacted_at IS NULL THEN engine_input->>'algorithm_version' ELSE NULL END,'legacy',false,'status',CASE WHEN redacted_at IS NOT NULL THEN 'redacted' ELSE 'sealed' END) FROM matching_run.snapshots WHERE session_id=p_session_id),jsonb_build_object('legacy',true,'status','legacy'));
END;
$function$;
CREATE FUNCTION matching_run.seal(p_snapshot_id uuid,p_session_id uuid,p_actor_admin_id uuid,p_engine_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_snapshot matching_run.snapshots%ROWTYPE; v_session public.match_sessions%ROWTYPE; v_ids jsonb; v_candidate_ids jsonb; v_map jsonb; v_expected_map jsonb;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 -- Match erasure's member -> snapshot lock ordering. No payload can be recreated
 -- after privacy erasure, even when calculation finished using an old response.
 PERFORM 1 FROM public.members WHERE id IN(SELECT member_id FROM matching_run.subjects WHERE snapshot_id=p_snapshot_id) ORDER BY id FOR SHARE;
 SELECT * INTO v_snapshot FROM matching_run.snapshots WHERE id=p_snapshot_id FOR UPDATE;
 SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id FOR UPDATE;
 IF v_snapshot.id IS NULL OR v_snapshot.actor_admin_id<>p_actor_admin_id OR v_snapshot.sealed_at IS NOT NULL OR v_snapshot.redacted_at IS NOT NULL
  OR v_session.id IS NULL OR v_session.created_by IS DISTINCT FROM p_actor_admin_id OR v_session.round_id IS DISTINCT FROM v_snapshot.round_id
  OR v_session.status<>'draft' OR v_session.results_ready OR NOT v_session.input_snapshot_required THEN
  RAISE EXCEPTION 'MATCH_RUN_SNAPSHOT_UNAVAILABLE' USING ERRCODE='PT409';
 END IF;
 IF jsonb_typeof(p_engine_input) IS DISTINCT FROM 'object' OR jsonb_typeof(p_engine_input->'candidates') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_engine_input->'pairRelations') IS DISTINCT FROM 'array' OR jsonb_typeof(p_engine_input->'idMap') IS DISTINCT FROM 'array'
  OR p_engine_input->>'algorithm_version' IS DISTINCT FROM 'max_coverage_split:1' OR p_engine_input->'adapter_version' IS DISTINCT FROM '1'::jsonb
  OR p_engine_input->'config' IS DISTINCT FROM v_session.config OR v_session.algorithm<>'max_coverage_split'
  OR v_snapshot.eligible_count<2 OR v_session.total_candidates<>v_snapshot.eligible_count
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_engine_input) key WHERE key NOT IN('candidates','pairRelations','idMap','config','algorithm_version','adapter_version')) THEN
  RAISE EXCEPTION 'MATCH_RUN_ENGINE_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT COALESCE(jsonb_agg(submission->'member_id' ORDER BY ord),'[]') INTO v_ids FROM jsonb_array_elements(v_snapshot.source->'submissions') WITH ORDINALITY entries(submission,ord) WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_snapshot.source->'eligibility') e WHERE e->>'member_id'=submission->>'member_id' AND (e->>'eligible')::boolean);
 SELECT COALESCE(jsonb_agg(c->'submissionId' ORDER BY ord),'[]') INTO v_candidate_ids FROM jsonb_array_elements(p_engine_input->'candidates') WITH ORDINALITY entries(c,ord);
 SELECT COALESCE(jsonb_agg(jsonb_build_array(id,id) ORDER BY ord),'[]') INTO v_expected_map FROM jsonb_array_elements(v_ids) WITH ORDINALITY entries(id,ord);
 v_map:=p_engine_input->'idMap';
 IF v_ids IS DISTINCT FROM v_candidate_ids OR v_map IS DISTINCT FROM v_expected_map THEN
  RAISE EXCEPTION 'MATCH_RUN_COHORT_MISMATCH' USING ERRCODE='22023';
 END IF;
 UPDATE matching_run.snapshots SET session_id=p_session_id,sealed_at=clock_timestamp(),engine_input=p_engine_input,engine_digest=md5(p_engine_input::text) WHERE id=p_snapshot_id;
 RETURN matching_run.metadata(p_session_id)||jsonb_build_object('status','sealed');
END;
$function$;
CREATE FUNCTION matching_run.discard(p_snapshot_id uuid,p_actor_admin_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 DELETE FROM matching_run.snapshots WHERE id=p_snapshot_id AND actor_admin_id=p_actor_admin_id AND sealed_at IS NULL;
 RETURN FOUND;
END;
$function$;
CREATE FUNCTION matching_run.read(p_session_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_payload jsonb;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 SELECT matching_run.metadata(p_session_id)||jsonb_build_object('source',source,'engine_input',engine_input) INTO v_payload FROM matching_run.snapshots WHERE session_id=p_session_id;
 RETURN COALESCE(v_payload,jsonb_build_object('legacy',true,'status','legacy'));
END;
$function$;
CREATE FUNCTION matching_run.assert_session_input(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM public.match_sessions WHERE id=p_session_id AND input_snapshot_required)
  AND NOT EXISTS(SELECT 1 FROM matching_run.snapshots WHERE session_id=p_session_id AND sealed_at IS NOT NULL AND redacted_at IS NULL AND engine_input IS NOT NULL) THEN
  RAISE EXCEPTION 'MATCH_RUN_INPUT_NOT_SEALED' USING ERRCODE='PT409';
 END IF;
END;
$function$;
CREATE FUNCTION matching_run.guard_session_input()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.algorithm='max_coverage_split' AND NEW.round_id IS NOT NULL THEN NEW.input_snapshot_required:=true; END IF;
 ELSE
  IF OLD.input_snapshot_required AND NOT NEW.input_snapshot_required THEN
   RAISE EXCEPTION 'MATCH_RUN_INPUT_MARKER_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  -- Creating a manual/unattached row first cannot bypass the new-run marker.
  -- Existing legacy max_coverage_split rows keep their historical fallback
  -- during ordinary summary updates; only an actual transition enters it.
  IF NEW.algorithm='max_coverage_split' AND NEW.round_id IS NOT NULL
   AND (OLD.algorithm IS DISTINCT FROM 'max_coverage_split' OR OLD.round_id IS NULL) THEN
   NEW.input_snapshot_required:=true;
  ELSIF NEW.input_snapshot_required IS DISTINCT FROM OLD.input_snapshot_required THEN
   RAISE EXCEPTION 'MATCH_RUN_INPUT_MARKER_IMMUTABLE' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_run_session_input BEFORE INSERT OR UPDATE ON public.match_sessions FOR EACH ROW EXECUTE FUNCTION matching_run.guard_session_input();
-- Only extend the existing atomic completion transaction. No round-state,
-- duplicate publication, scoring or imported-submission behavior changes.
DO $migration$
DECLARE definition text:=pg_get_functiondef('matching_publication.finalize_session(uuid,uuid,text,timestamptz,timestamptz,text)'::regprocedure);
 needle text:='  IF p_expected_status NOT IN';
BEGIN
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'MATCH_RUN_FINALIZER_BASELINE_MISMATCH'; END IF;
 EXECUTE replace(definition,needle,E'  PERFORM matching_run.assert_session_input(p_session_id);\n'||needle);
END;
$migration$;

CREATE FUNCTION matching_run.erase_anonymized()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN
  UPDATE matching_run.snapshots s SET source=NULL,engine_input=NULL,redacted_at=clock_timestamp()
   WHERE s.redacted_at IS NULL AND EXISTS(SELECT 1 FROM matching_run.subjects subject WHERE subject.snapshot_id=s.id AND subject.member_id=NEW.id);
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_run_member_erasure AFTER UPDATE OF anonymized_at ON public.members FOR EACH ROW EXECUTE FUNCTION matching_run.erase_anonymized();

CREATE FUNCTION public.admin_capture_matching_input(p_round_id uuid,p_actor_admin_id uuid,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_run.capture(p_round_id,p_actor_admin_id,p_reason) $function$;
CREATE FUNCTION public.admin_seal_matching_input(p_snapshot_id uuid,p_session_id uuid,p_actor_admin_id uuid,p_engine_input jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_run.seal(p_snapshot_id,p_session_id,p_actor_admin_id,p_engine_input) $function$;
CREATE FUNCTION public.admin_discard_matching_input(p_snapshot_id uuid,p_actor_admin_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_run.discard(p_snapshot_id,p_actor_admin_id) $function$;
CREATE FUNCTION public.admin_read_matching_input(p_session_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_run.read(p_session_id,p_actor_admin_id) $function$;
CREATE FUNCTION public.admin_get_matching_input_metadata(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'MATCH_RUN_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN matching_run.metadata(p_session_id);
END;
$function$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA matching_run FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION matching_run.capture(uuid,uuid,text),matching_run.seal(uuid,uuid,uuid,jsonb),matching_run.discard(uuid,uuid),matching_run.read(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION matching_run.metadata(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_capture_matching_input(uuid,uuid,text),public.admin_seal_matching_input(uuid,uuid,uuid,jsonb),public.admin_discard_matching_input(uuid,uuid),public.admin_read_matching_input(uuid,uuid),public.admin_get_matching_input_metadata(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_capture_matching_input(uuid,uuid,text),public.admin_seal_matching_input(uuid,uuid,uuid,jsonb),public.admin_discard_matching_input(uuid,uuid),public.admin_read_matching_input(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_matching_input_metadata(uuid) TO authenticated;
COMMIT;
