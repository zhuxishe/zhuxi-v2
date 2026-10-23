-- Versioned, server-only manual/pool adjustments. Existing round algorithms,
-- publication/cancellation rules, questionnaires and business rows are retained.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));
DO $preflight$
BEGIN
 IF md5((SELECT prosrc FROM pg_proc WHERE oid='matching_run.source_v3(uuid)'::regprocedure)) IS DISTINCT FROM '644b678b15db5217fc8bb58bdd329906'
 OR md5((SELECT prosrc FROM pg_proc WHERE oid='matching_publication.guard_result()'::regprocedure)) IS DISTINCT FROM '3275033363096308568233572dc21bd5'
 OR md5((SELECT prosrc FROM pg_proc WHERE oid='matching_run.erase_anonymized()'::regprocedure)) IS DISTINCT FROM '28a724d6309423925e9908de1c3f7436' THEN
  RAISE EXCEPTION 'MATCH_ADJUSTMENT_BASELINE_CHANGED';
 END IF;
END;
$preflight$;
CREATE SCHEMA matching_adjustment;
REVOKE ALL ON SCHEMA matching_adjustment FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA matching_adjustment TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA matching_adjustment REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE matching_adjustment.operations (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES public.match_sessions(id) ON DELETE CASCADE,
 round_id uuid NOT NULL REFERENCES public.match_rounds(id),
 actor_admin_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('manual','pool','restore','split')),
 status text NOT NULL CHECK(status IN('running','failed','succeeded')),
 attempt integer NOT NULL DEFAULT 1 CHECK(attempt>0),
 member_ids uuid[] NOT NULL,
 selected_member_ids uuid[] NOT NULL,
 result_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 captured_at timestamptz NOT NULL,
 lease_token uuid,
 lease_expires_at timestamptz,
 reason text NOT NULL,
 last_attempt_reason text NOT NULL,
 base_revision text NOT NULL,
 source jsonb,
 engine_input jsonb,
 result_snapshot jsonb,
 prior_diagnostics jsonb NOT NULL DEFAULT '[]',
 result_ids uuid[] NOT NULL DEFAULT '{}',
 submitted_count integer NOT NULL,
 eligible_count integer NOT NULL,
 excluded_count integer NOT NULL,
 exclusion_summary jsonb NOT NULL,
 has_existing_multi_pool boolean NOT NULL,
 redacted_at timestamptz,
 error_code text,
 CHECK(eligible_count+excluded_count=submitted_count),
 CHECK(submitted_count>=0 AND eligible_count>=0 AND excluded_count>=0),
 CHECK((status='running')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE UNIQUE INDEX matching_adjustment_one_worker ON matching_adjustment.operations(session_id) WHERE status='running';
CREATE INDEX matching_adjustment_session_history ON matching_adjustment.operations(session_id,created_at DESC,id);
CREATE TABLE matching_adjustment.subjects (
 operation_id uuid NOT NULL REFERENCES matching_adjustment.operations(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
 PRIMARY KEY(operation_id,member_id)
);
CREATE INDEX matching_adjustment_subject_member ON matching_adjustment.subjects(member_id,operation_id);
ALTER TABLE matching_adjustment.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_adjustment.subjects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA matching_adjustment FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION matching_adjustment.revision(p_session_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT md5(jsonb_build_object('session',to_jsonb(s),
  'results',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r WHERE session_id=s.id),'[]'::jsonb),
  'diagnostics',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.unmatched_diagnostics d WHERE session_id=s.id),'[]'::jsonb))::text)
 FROM public.match_sessions s WHERE s.id=p_session_id
$function$;

CREATE FUNCTION matching_adjustment.scoped_source(p_source jsonb,p_ids uuid[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 SELECT p_source||jsonb_build_object(
  'submissions',COALESCE((SELECT jsonb_agg(s ORDER BY ord) FROM jsonb_array_elements(p_source->'submissions') WITH ORDINALITY t(s,ord) WHERE (s->>'member_id')::uuid=ANY(p_ids)),'[]'::jsonb),
  'eligibility',COALESCE((SELECT jsonb_agg(e ORDER BY ord) FROM jsonb_array_elements(p_source->'eligibility') WITH ORDINALITY t(e,ord) WHERE (e->>'member_id')::uuid=ANY(p_ids)),'[]'::jsonb),
  'history_results',COALESCE((SELECT jsonb_agg(h ORDER BY ord) FROM jsonb_array_elements(p_source->'history_results') WITH ORDINALITY t(h,ord)
   WHERE matching_publication.member_ids((h->>'member_a_id')::uuid,(h->>'member_b_id')::uuid,ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(h->'group_members')='array' THEN h->'group_members' ELSE '[]'::jsonb END)))&&p_ids),'[]'::jsonb),
  'blacklist',COALESCE((SELECT jsonb_agg(b ORDER BY ord) FROM jsonb_array_elements(p_source->'blacklist') WITH ORDINALITY t(b,ord) WHERE (b->>'member_a_id')::uuid=ANY(p_ids) AND (b->>'member_b_id')::uuid=ANY(p_ids)),'[]'::jsonb),
  'feedbacks',COALESCE((SELECT jsonb_agg(f ORDER BY ord) FROM jsonb_array_elements(p_source->'feedbacks') WITH ORDINALITY t(f,ord) WHERE (f->>'reviewer_id')::uuid=ANY(p_ids) AND (f->>'reviewee_id')::uuid=ANY(p_ids)),'[]'::jsonb),
  'questionnaire_refs',COALESCE((SELECT jsonb_agg(q ORDER BY ord) FROM jsonb_array_elements(p_source->'questionnaire_refs') WITH ORDINALITY t(q,ord) WHERE (q->>'member_id')::uuid=ANY(p_ids)),'[]'::jsonb),
  'scoring_policy',(p_source->'scoring_policy')||jsonb_build_object('activityFeedback',COALESCE((SELECT jsonb_agg(f ORDER BY ord) FROM jsonb_array_elements(p_source#>'{scoring_policy,activityFeedback}') WITH ORDINALITY t(f,ord) WHERE (f->>'reviewer_id')::uuid=ANY(p_ids) AND (f->>'reviewee_id')::uuid=ANY(p_ids)),'[]'::jsonb)))
$function$;

-- Detect changed selected-member veto inputs without invalidating frozen scoring
-- for unrelated new registrations, personality weights or new peer feedback.
CREATE FUNCTION matching_adjustment.hard_signature(p_source jsonb,p_ids uuid[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 WITH selected AS (
  SELECT s FROM jsonb_array_elements(p_source->'submissions') s WHERE (s->>'member_id')::uuid=ANY(p_ids)
 ), rows AS (
  SELECT jsonb_build_object('id',s->'member_id','game_type_pref',s->'game_type_pref','gender_pref',s->'gender_pref','availability',s->'availability','interest_tags',s->'interest_tags',
   'import',jsonb_build_object('source',s#>'{import_metadata,source}','normalized_name',s#>'{import_metadata,normalized_name}',
    'gender',s#>'{import_metadata,legacy_profile,gender}','interest_tags',s#>'{import_metadata,legacy_profile,interest_tags}','social_tags',s#>'{import_metadata,legacy_profile,social_tags}','match_history',s#>'{import_metadata,legacy_profile,match_history}'),
   'identity',matching_run.pick(NULLIF(s#>'{member,member_identity}','null'::jsonb),ARRAY['full_name','nickname','gender','hobby_tags','personality_self_tags','taboo_tags']),
   'personality',matching_run.pick(NULLIF(s#>'{member,member_personality}','null'::jsonb),ARRAY['expression_style_tags','group_role_tags']),
   'interests',matching_run.pick(NULLIF(s#>'{member,member_interests}','null'::jsonb),ARRAY['scenario_mode_pref','scenario_theme_tags']),
   'boundaries',matching_run.pick(NULLIF(s#>'{member,member_boundaries}','null'::jsonb),ARRAY['taboo_tags','deal_breakers'])) item FROM selected
 ), history AS (
  SELECT h FROM jsonb_array_elements(p_source->'history_results') h
  WHERE matching_publication.member_ids((h->>'member_a_id')::uuid,(h->>'member_b_id')::uuid,ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(h->'group_members')='array' THEN h->'group_members' ELSE '[]'::jsonb END)))&&p_ids
 ), blacklist AS (
  SELECT matching_run.pick(b,ARRAY['member_a_id','member_b_id','status']) item FROM jsonb_array_elements(p_source->'blacklist') b WHERE (b->>'member_a_id')::uuid=ANY(p_ids) AND (b->>'member_b_id')::uuid=ANY(p_ids)
 ), feedback AS (
  SELECT f FROM jsonb_array_elements(p_source->'feedbacks') f WHERE (f->>'reviewer_id')::uuid=ANY(p_ids) AND (f->>'reviewee_id')::uuid=ANY(p_ids)
 )
 SELECT jsonb_build_object('members',COALESCE((SELECT jsonb_agg(item ORDER BY item::text) FROM rows),'[]'::jsonb),
  'history',COALESCE((SELECT jsonb_agg(h ORDER BY h::text) FROM history),'[]'::jsonb),
  'blacklist',COALESCE((SELECT jsonb_agg(item ORDER BY item::text) FROM blacklist),'[]'::jsonb),
  'feedback',COALESCE((SELECT jsonb_agg(f ORDER BY f::text) FROM feedback),'[]'::jsonb))
$function$;

CREATE FUNCTION matching_adjustment.preview(p_session_id uuid,p_actor_admin_id uuid,p_kind text,p_member_ids uuid[],p_result_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_session public.match_sessions%ROWTYPE; v_result public.match_results%ROWTYPE; v_source jsonb; v_ids uuid[]; v_active uuid[]; v_has_pool boolean; v_eligible integer; v_summary jsonb; v_excluded jsonb;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 IF p_kind IS NULL OR p_kind NOT IN('manual','pool','restore','split') OR p_member_ids IS NULL OR array_position(p_member_ids,NULL) IS NOT NULL OR cardinality(p_member_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_member_ids) t(id)) THEN
  RAISE EXCEPTION 'MATCH_ADJUSTMENT_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id;
 IF v_session.id IS NULL OR v_session.round_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.match_rounds WHERE id=v_session.round_id AND purpose='matching' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_SESSION_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
 IF v_session.status<>'draft' OR NOT v_session.results_ready THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_REQUIRES_DRAFT' USING ERRCODE='PT409'; END IF;
 SELECT COALESCE(array_agg(DISTINCT member_id),'{}'::uuid[]) INTO v_active FROM public.match_results r CROSS JOIN LATERAL unnest(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)) t(member_id) WHERE r.session_id=p_session_id AND r.status<>'cancelled';
 SELECT EXISTS(SELECT 1 FROM public.match_results r WHERE r.session_id=p_session_id AND r.status<>'cancelled' AND cardinality(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members))>2) INTO v_has_pool;
 IF p_kind IN('restore','split') THEN
  SELECT * INTO v_result FROM public.match_results WHERE id=p_result_id AND session_id=p_session_id;
  IF v_result.id IS NULL OR (p_kind='restore' AND v_result.status<>'cancelled') OR (p_kind='split' AND v_result.status NOT IN('draft','locked')) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_RESULT_CHANGED' USING ERRCODE='PT409'; END IF;
  v_ids:=matching_publication.member_ids(v_result.member_a_id,v_result.member_b_id,v_result.group_members);
 ELSIF p_result_id IS NOT NULL THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_INPUT_INVALID' USING ERRCODE='22023';
 ELSIF p_kind='pool' THEN
  SELECT COALESCE(array_agg(DISTINCT member_id ORDER BY member_id),'{}'::uuid[]) INTO v_ids FROM public.match_results r CROSS JOIN LATERAL unnest(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)) t(member_id) WHERE r.session_id=p_session_id AND r.status='cancelled' AND NOT member_id=ANY(v_active);
 ELSE v_ids:=p_member_ids;
 END IF;
 IF p_kind='split' THEN
  RETURN jsonb_build_object('capture',NULL,'selected_member_ids',v_ids,'has_existing_multi_pool',v_has_pool,'base_revision',matching_adjustment.revision(p_session_id),'summary',jsonb_build_object('submitted_count',cardinality(v_ids),'eligible_count',cardinality(v_ids),'excluded_count',0,'exclusion_summary','[]'::jsonb),'available_members','[]'::jsonb,'excluded_members','[]'::jsonb,'result_snapshot',to_jsonb(v_result));
 END IF;
 v_source:=matching_run.source_v3(v_session.round_id);
 IF p_kind='manual' AND cardinality(p_member_ids)=0 THEN
  SELECT COALESCE(array_agg((s->>'member_id')::uuid),'{}'::uuid[]) INTO v_ids FROM jsonb_array_elements(v_source->'submissions') s WHERE NOT (s->>'member_id')::uuid=ANY(v_active);
 END IF;
 IF p_kind IN('manual','restore') AND v_ids&&v_active THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_MEMBER_OCCUPIED' USING ERRCODE='PT409'; END IF;
 v_source:=matching_adjustment.scoped_source(v_source,v_ids);
 SELECT count(*) INTO v_eligible FROM jsonb_array_elements(v_source->'eligibility') e WHERE (e->>'eligible')::boolean;
 SELECT COALESCE(jsonb_agg(item),'[]'::jsonb) INTO v_excluded FROM (
  SELECT jsonb_build_object('id',e->'member_id','reasons',e->'reasons') item FROM jsonb_array_elements(v_source->'eligibility') e WHERE NOT (e->>'eligible')::boolean
  UNION ALL SELECT jsonb_build_object('id',id,'reasons',jsonb_build_array('missing_submission')) FROM unnest(v_ids) ids(id) WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_source->'submissions') s WHERE (s->>'member_id')::uuid=id)
 ) excluded;
 v_summary:=jsonb_build_object('submitted_count',cardinality(v_ids),'eligible_count',v_eligible,'excluded_count',cardinality(v_ids)-v_eligible,'exclusion_summary',COALESCE((SELECT jsonb_agg(jsonb_build_object('reason',reason,'count',n) ORDER BY reason) FROM (SELECT reason,count(*) n FROM jsonb_array_elements(v_excluded) e CROSS JOIN LATERAL jsonb_array_elements_text(e->'reasons') reason GROUP BY reason) reasons),'[]'::jsonb));
 RETURN jsonb_build_object('capture',jsonb_build_object('snapshot_id',gen_random_uuid(),'captured_at',statement_timestamp(),'source',v_source),'selected_member_ids',v_ids,'has_existing_multi_pool',v_has_pool,'base_revision',matching_adjustment.revision(p_session_id),'summary',v_summary,
  'available_members',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s->'member_id','name',COALESCE(NULLIF(s#>>'{member,member_identity,full_name}',''),NULLIF(s#>>'{member,member_identity,nickname}',''),'未知')) ORDER BY ord) FROM jsonb_array_elements(v_source->'submissions') WITH ORDINALITY t(s,ord) WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_source->'eligibility') e WHERE e->>'member_id'=s->>'member_id' AND (e->>'eligible')::boolean)),'[]'::jsonb),
  'excluded_members',v_excluded,'result_snapshot',CASE WHEN p_kind='restore' THEN to_jsonb(v_result) ELSE NULL END);
END;
$function$;

CREATE FUNCTION matching_adjustment.metadata(p_operation_id uuid,p_viewer uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT jsonb_build_object('id',o.id,'session_id',o.session_id,'round_id',o.round_id,'actor_admin_id',o.actor_admin_id,'kind',o.kind,'status',o.status,'attempt',o.attempt,
  'member_ids',o.member_ids,'selected_member_ids',o.selected_member_ids,'result_id',o.result_id,'created_at',o.created_at,'updated_at',o.updated_at,'captured_at',o.captured_at,
  'submitted_count',o.submitted_count,'eligible_count',o.eligible_count,'excluded_count',o.excluded_count,'exclusion_summary',CASE WHEN o.redacted_at IS NULL THEN o.exclusion_summary ELSE NULL END,
  'has_existing_multi_pool',o.has_existing_multi_pool,'base_revision',o.base_revision,'error_code',o.error_code,'reason',CASE WHEN o.redacted_at IS NULL THEN o.reason ELSE '隐私处理已清除' END,
  'can_recover',o.actor_admin_id=p_viewer AND o.redacted_at IS NULL AND (o.kind='split' OR o.source IS NOT NULL)
   AND (o.status='failed' OR (o.status='running' AND o.lease_expires_at<=clock_timestamp())) AND s.status='draft' AND s.results_ready
   AND matching_adjustment.revision(o.session_id)=o.base_revision
   AND (o.kind='split' OR o.eligible_count>=2)
   AND COALESCE(o.error_code,'') NOT IN('INPUT_INVALID','CANDIDATES_INSUFFICIENT','MEMBER_INELIGIBLE','MEMBER_OCCUPIED','CONSTRAINTS_FAILED','ORIGINAL_TIME_UNAVAILABLE','ADJUSTMENT_CHANGED','PRIVACY_REDACTED','VERSION_UNSUPPORTED')
   AND NOT EXISTS(SELECT 1 FROM matching_adjustment.operations peer WHERE peer.session_id=o.session_id AND peer.id<>o.id AND peer.status='running' AND peer.lease_expires_at>clock_timestamp()))
 FROM matching_adjustment.operations o JOIN public.match_sessions s ON s.id=o.session_id WHERE o.id=p_operation_id
$function$;

CREATE FUNCTION matching_adjustment.receipt(p_id uuid,p_actor uuid,p_acquired boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT jsonb_build_object('operation',matching_adjustment.metadata(o.id,p_actor),'acquired',p_acquired,
  'selected_member_ids',o.selected_member_ids,'has_existing_multi_pool',o.has_existing_multi_pool,
  'lease_token',CASE WHEN p_acquired THEN o.lease_token ELSE NULL END,
  'capture',CASE WHEN o.actor_admin_id=p_actor AND o.redacted_at IS NULL AND o.source IS NOT NULL THEN jsonb_build_object('snapshot_id',o.id,'captured_at',o.captured_at,'source',o.source) ELSE NULL END,
  'engine_input',CASE WHEN o.actor_admin_id=p_actor AND o.redacted_at IS NULL THEN o.engine_input ELSE NULL END,
  'result_snapshot',CASE WHEN o.actor_admin_id=p_actor AND o.redacted_at IS NULL THEN o.result_snapshot ELSE NULL END)
 FROM matching_adjustment.operations o WHERE o.id=p_id
$function$;

CREATE FUNCTION matching_adjustment.begin_operation(p_session_id uuid,p_actor_admin_id uuid,p_kind text,p_member_ids uuid[],p_result_id uuid,p_operation_id uuid,p_reason text,p_expected_revision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_op matching_adjustment.operations%ROWTYPE; v_preview jsonb; v_source jsonb; v_ids uuid[]; v_subjects uuid[]; v_at timestamptz:=clock_timestamp(); v_round uuid; v_revision text; v_token uuid:=gen_random_uuid();
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 IF p_operation_id IS NULL OR char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-adjustment:'||p_session_id::text,0));
 SELECT * INTO v_op FROM matching_adjustment.operations WHERE id=p_operation_id;
 IF v_op.id IS NOT NULL THEN
  IF v_op.session_id<>p_session_id OR v_op.actor_admin_id<>p_actor_admin_id OR v_op.kind IS DISTINCT FROM p_kind OR p_member_ids IS NULL OR cardinality(v_op.member_ids)<>cardinality(p_member_ids) OR NOT v_op.member_ids @> p_member_ids OR NOT p_member_ids @> v_op.member_ids OR v_op.result_id IS DISTINCT FROM p_result_id THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_REQUEST_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF v_op.status='succeeded' THEN RETURN matching_adjustment.receipt(v_op.id,p_actor_admin_id); END IF;
  IF v_op.status='running' AND v_op.lease_expires_at>clock_timestamp() THEN RETURN matching_adjustment.receipt(v_op.id,p_actor_admin_id); END IF;
  IF COALESCE(v_op.error_code,'') IN('INPUT_INVALID','CANDIDATES_INSUFFICIENT','MEMBER_INELIGIBLE','MEMBER_OCCUPIED','CONSTRAINTS_FAILED','ORIGINAL_TIME_UNAVAILABLE','ADJUSTMENT_CHANGED','PRIVACY_REDACTED','VERSION_UNSUPPORTED') THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_NOT_RECOVERABLE' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.members WHERE id IN(SELECT member_id FROM matching_adjustment.subjects WHERE operation_id=v_op.id) ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.match_rounds WHERE id=v_op.round_id FOR UPDATE;
  PERFORM 1 FROM public.match_sessions WHERE id=p_session_id FOR UPDATE;
  SELECT * INTO v_op FROM matching_adjustment.operations WHERE id=p_operation_id FOR UPDATE;
  IF v_op.redacted_at IS NOT NULL OR (v_op.kind<>'split' AND v_op.source IS NULL) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_REDACTED' USING ERRCODE='PT409'; END IF;
  IF matching_adjustment.revision(p_session_id) IS DISTINCT FROM v_op.base_revision OR NOT EXISTS(SELECT 1 FROM public.match_sessions WHERE id=p_session_id AND status='draft' AND results_ready) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_STALE' USING ERRCODE='PT409'; END IF;
 ELSE
  v_preview:=matching_adjustment.preview(p_session_id,p_actor_admin_id,p_kind,p_member_ids,p_result_id);
  IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_preview->>'base_revision' THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_STALE' USING ERRCODE='PT409'; END IF;
  SELECT round_id INTO v_round FROM public.match_sessions WHERE id=p_session_id;
  v_source:=v_preview#>'{capture,source}';
  SELECT COALESCE(array_agg(value::uuid),'{}'::uuid[]) INTO v_ids FROM jsonb_array_elements_text(v_preview->'selected_member_ids');
  v_subjects:=CASE WHEN p_kind='split' THEN v_ids ELSE matching_run.subject_ids(v_source) END;
  PERFORM 1 FROM public.members WHERE id=ANY(v_subjects) ORDER BY id FOR SHARE;
  IF p_kind<>'split' AND EXISTS(SELECT 1 FROM public.members WHERE id=ANY(v_subjects) AND anonymized_at>=v_at) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_REDACTED' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.match_rounds WHERE id=v_round FOR UPDATE;
  PERFORM 1 FROM public.match_sessions WHERE id=p_session_id FOR UPDATE;
  v_revision:=matching_adjustment.revision(p_session_id);
  IF v_revision IS DISTINCT FROM v_preview->>'base_revision' THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_STALE' USING ERRCODE='PT409'; END IF;
  IF p_kind IN('manual','restore') AND ((v_preview#>>'{summary,eligible_count}')::integer<>cardinality(v_ids) OR cardinality(v_ids)<2) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_MEMBER_INELIGIBLE' USING ERRCODE='PT409'; END IF;
  IF p_kind='pool' AND (v_preview#>>'{summary,eligible_count}')::integer<2 THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_CANDIDATES_INSUFFICIENT' USING ERRCODE='PT409'; END IF;
  IF p_kind IN('manual','restore') AND cardinality(v_ids)>2 AND (v_preview->>'has_existing_multi_pool')::boolean THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_SECOND_MULTI_POOL' USING ERRCODE='PT409'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM matching_adjustment.operations WHERE session_id=p_session_id AND id<>p_operation_id AND status='running' AND lease_expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_BUSY' USING ERRCODE='PT409'; END IF;
 UPDATE matching_adjustment.operations SET status='failed',lease_token=NULL,lease_expires_at=NULL,error_code='LEASE_EXPIRED',updated_at=clock_timestamp() WHERE session_id=p_session_id AND id<>p_operation_id AND status='running';
 IF v_op.id IS NOT NULL THEN
  UPDATE matching_adjustment.operations SET status='running',attempt=attempt+1,lease_token=v_token,lease_expires_at=clock_timestamp()+interval '5 minutes',last_attempt_reason=btrim(p_reason),updated_at=clock_timestamp(),error_code=NULL WHERE id=v_op.id;
 ELSE
  INSERT INTO matching_adjustment.operations(id,session_id,round_id,actor_admin_id,kind,status,member_ids,selected_member_ids,result_id,captured_at,lease_token,lease_expires_at,reason,last_attempt_reason,base_revision,source,result_snapshot,submitted_count,eligible_count,excluded_count,exclusion_summary,has_existing_multi_pool)
  VALUES(p_operation_id,p_session_id,v_round,p_actor_admin_id,p_kind,'running',p_member_ids,v_ids,p_result_id,v_at,v_token,clock_timestamp()+interval '5 minutes',btrim(p_reason),btrim(p_reason),v_revision,v_source,NULLIF(v_preview->'result_snapshot','null'::jsonb),(v_preview#>>'{summary,submitted_count}')::integer,(v_preview#>>'{summary,eligible_count}')::integer,(v_preview#>>'{summary,excluded_count}')::integer,v_preview#>'{summary,exclusion_summary}',(v_preview->>'has_existing_multi_pool')::boolean);
  INSERT INTO matching_adjustment.subjects(operation_id,member_id) SELECT p_operation_id,id FROM public.members WHERE id=ANY(v_subjects);
 END IF;
 RETURN matching_adjustment.receipt(p_operation_id,p_actor_admin_id,true);
END;
$function$;

CREATE FUNCTION matching_adjustment.stage(p_operation_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_engine jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_op matching_adjustment.operations%ROWTYPE; v_ids uuid[]; v_expected uuid[];
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 SELECT * INTO v_op FROM matching_adjustment.operations WHERE id=p_operation_id;
 IF v_op.id IS NULL OR v_op.actor_admin_id<>p_actor_admin_id THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-adjustment:'||v_op.session_id::text,0));
 PERFORM 1 FROM public.members WHERE id IN(SELECT member_id FROM matching_adjustment.subjects WHERE operation_id=v_op.id) ORDER BY id FOR SHARE;
 SELECT * INTO v_op FROM matching_adjustment.operations WHERE id=p_operation_id FOR UPDATE;
 IF v_op.status<>'running' OR v_op.lease_token IS DISTINCT FROM p_lease_token OR v_op.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_LEASE_STALE' USING ERRCODE='PT409'; END IF;
 IF v_op.redacted_at IS NOT NULL OR v_op.source IS NULL THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_REDACTED' USING ERRCODE='PT409'; END IF;
 IF jsonb_typeof(p_engine) IS DISTINCT FROM 'object' OR jsonb_typeof(p_engine->'candidates') IS DISTINCT FROM 'array' OR jsonb_typeof(p_engine->'idMap') IS DISTINCT FROM 'array' OR jsonb_typeof(p_engine->'pairRelations') IS DISTINCT FROM 'array' OR NOT matching_run.engine_matches_source(v_op.source,p_engine) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_ENGINE_INVALID' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg((e->>'member_id')::uuid ORDER BY ord),'{}'::uuid[]) INTO v_expected FROM jsonb_array_elements(v_op.source->'eligibility') WITH ORDINALITY t(e,ord) WHERE (e->>'eligible')::boolean;
 SELECT COALESCE(array_agg((c->>'submissionId')::uuid ORDER BY ord),'{}'::uuid[]) INTO v_ids FROM jsonb_array_elements(p_engine->'candidates') WITH ORDINALITY t(c,ord);
 IF v_ids IS DISTINCT FROM v_expected OR cardinality(v_ids)<>(SELECT count(DISTINCT id) FROM unnest(v_ids) t(id)) OR jsonb_array_length(p_engine->'idMap')<>cardinality(v_ids) OR (SELECT count(DISTINCT m->>0) FROM jsonb_array_elements(p_engine->'idMap') m)<>cardinality(v_ids) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_engine->'idMap') m WHERE jsonb_typeof(m) IS DISTINCT FROM 'array' OR jsonb_array_length(m)<>2 OR m->>0 IS DISTINCT FROM m->>1 OR NOT (m->>0)::uuid=ANY(v_ids)) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_COHORT_MISMATCH' USING ERRCODE='22023'; END IF;
 IF v_op.engine_input IS NOT NULL AND v_op.engine_input IS DISTINCT FROM p_engine THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_ENGINE_IMMUTABLE' USING ERRCODE='PT409'; END IF;
 UPDATE matching_adjustment.operations SET engine_input=p_engine,updated_at=clock_timestamp() WHERE id=p_operation_id;
 RETURN matching_adjustment.receipt(p_operation_id,p_actor_admin_id);
END;
$function$;

CREATE FUNCTION matching_adjustment.valid_slot(p_engine jsonb,p_ids uuid[],p_slot text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 SELECT p_slot IS NOT NULL AND cardinality(p_ids)>0 AND NOT EXISTS(
  SELECT 1 FROM unnest(p_ids) ids(id) WHERE NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_engine->'candidates') c CROSS JOIN LATERAL jsonb_each(c->'availability') a(date,slots)
   CROSS JOIN LATERAL jsonb_array_elements_text(a.slots) t(slot)
   WHERE (c->>'submissionId')::uuid=id AND a.date||'_'||t.slot=replace(p_slot,' ','_')))
$function$;

-- Defense at commit, not a second scoring/coverage algorithm. It validates the
-- chosen frozen candidates' final type, shared time and member hard constraints.
CREATE FUNCTION matching_adjustment.validate_rows(p_engine jsonb,p_rows jsonb,p_allow_multi boolean)
RETURNS uuid[] LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE r jsonb; v_ids uuid[]; v_seen uuid[]:='{}'; a jsonb; b jsonb; v_id uuid; v_pools integer:=0;
BEGIN
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_OUTPUT_INVALID' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(r) key WHERE key NOT IN('member_a_id','member_b_id','group_members','total_score','score_breakdown','rank','best_slot','game_type'))
   OR jsonb_typeof(r->'total_score') IS DISTINCT FROM 'number' OR jsonb_typeof(r->'rank') IS DISTINCT FROM 'number' OR (r->>'rank')::integer<1 THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_OUTPUT_INVALID' USING ERRCODE='22023'; END IF;
  IF r->>'member_b_id' IS NOT NULL THEN
   v_ids:=ARRAY[(r->>'member_a_id')::uuid,(r->>'member_b_id')::uuid];
   IF jsonb_typeof(r->'score_breakdown') IS DISTINCT FROM 'array' OR (r->'group_members' IS NOT NULL AND r->'group_members'<>'null'::jsonb AND r->'group_members'<>'[]'::jsonb) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_OUTPUT_INVALID' USING ERRCODE='22023'; END IF;
  ELSE
   v_pools:=v_pools+1;
   IF NOT p_allow_multi OR v_pools>1 THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_SECOND_MULTI_POOL' USING ERRCODE='PT409'; END IF;
   IF jsonb_typeof(r->'group_members') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'group_members')<3 OR jsonb_typeof(r->'score_breakdown') IS DISTINCT FROM 'object' OR r#>>'{score_breakdown,kind}' IS DISTINCT FROM 'multi_pool' OR r#>>'{score_breakdown,version}' IS DISTINCT FROM 'weighted_feedback:1' OR jsonb_typeof(r#>'{score_breakdown,factors}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_OUTPUT_INVALID' USING ERRCODE='22023'; END IF;
   SELECT array_agg(value::uuid) INTO v_ids FROM jsonb_array_elements_text(r->'group_members');
   IF NOT (r->>'member_a_id')::uuid=ANY(v_ids) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_OUTPUT_INVALID' USING ERRCODE='22023'; END IF;
  END IF;
  IF array_position(v_ids,NULL) IS NOT NULL OR cardinality(v_ids)<>(SELECT count(DISTINCT id) FROM unnest(v_ids) t(id)) OR v_seen&&v_ids THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_COHORT_MISMATCH' USING ERRCODE='22023'; END IF;
  IF NOT matching_adjustment.valid_slot(p_engine,v_ids,r->>'best_slot') THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_CONSTRAINT' USING ERRCODE='PT409'; END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
   SELECT c INTO a FROM jsonb_array_elements(p_engine->'candidates') c WHERE (c->>'submissionId')::uuid=v_id;
   IF a IS NULL THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_COHORT_MISMATCH' USING ERRCODE='22023'; END IF;
   IF (cardinality(v_ids)=2 AND a->>'gameTypePref'='多人') OR (cardinality(v_ids)>2 AND a->>'gameTypePref'='双人') THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_CONSTRAINT' USING ERRCODE='PT409'; END IF;
   IF COALESCE((p_engine#>>'{config,hardConstraints,enforceGender}')::boolean,true) AND COALESCE(NULLIF(a->>'genderPref',''),'都可以')<>'都可以' AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_engine->'candidates') c WHERE (c->>'submissionId')::uuid=ANY(v_ids) AND (c->>'submissionId')::uuid<>v_id AND (NULLIF(c->>'gender','') IS NULL OR c->>'gender'=a->>'genderPref')) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_CONSTRAINT' USING ERRCODE='PT409'; END IF;
   FOR b IN SELECT c FROM jsonb_array_elements(p_engine->'candidates') c WHERE (c->>'submissionId')::uuid=ANY(v_ids) AND (c->>'submissionId')::uuid<>v_id LOOP
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p_engine->'pairRelations','[]'::jsonb)) rel WHERE rel->1->>'status' IN('blacklist','cooldown') AND ((rel->1->>'playerA'=a->>'submissionId' AND rel->1->>'playerB'=b->>'submissionId') OR (rel->1->>'playerB'=a->>'submissionId' AND rel->1->>'playerA'=b->>'submissionId')))
     OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(a->'tabooTags','[]'::jsonb)) taboo WHERE taboo=ANY(ARRAY(SELECT jsonb_array_elements_text(COALESCE(b->'interestTags','[]'::jsonb)||COALESCE(b->'socialTags','[]'::jsonb))))) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_CONSTRAINT' USING ERRCODE='PT409'; END IF;
   END LOOP;
  END LOOP;
  v_seen:=v_seen||v_ids;
 END LOOP;
 RETURN v_seen;
END;
$function$;

CREATE FUNCTION matching_adjustment.complete(p_operation_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_rows jsonb,p_unmatched_ids uuid[],p_diagnostics jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_op matching_adjustment.operations%ROWTYPE; v_session public.match_sessions%ROWTYPE; v_current jsonb; v_expected uuid[]; v_matched uuid[]; v_partition uuid[]; v_occupied uuid[]; v_result uuid; v_result_ids uuid[]:='{}'; r jsonb; d jsonb; v_count integer; v_total integer; v_multi boolean; v_eligible_ids uuid[]; v_diag_ids uuid[]:='{}'; v_key text; v_value numeric;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 SELECT * INTO v_op FROM matching_adjustment.operations WHERE id=p_operation_id;
 IF v_op.id IS NULL OR v_op.actor_admin_id<>p_actor_admin_id THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-adjustment:'||v_op.session_id::text,0));
 IF v_op.status='succeeded' THEN RETURN matching_adjustment.receipt(v_op.id,p_actor_admin_id); END IF;
 PERFORM 1 FROM public.members WHERE id IN(SELECT member_id FROM matching_adjustment.subjects WHERE operation_id=v_op.id) ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.match_rounds WHERE id=v_op.round_id FOR UPDATE;
 SELECT * INTO v_session FROM public.match_sessions WHERE id=v_op.session_id FOR UPDATE;
 SELECT * INTO v_op FROM matching_adjustment.operations WHERE id=p_operation_id FOR UPDATE;
 IF v_op.status<>'running' OR v_op.lease_token IS DISTINCT FROM p_lease_token OR v_op.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_LEASE_STALE' USING ERRCODE='PT409'; END IF;
 IF v_op.redacted_at IS NOT NULL THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_REDACTED' USING ERRCODE='PT409'; END IF;
 IF v_session.status<>'draft' OR NOT v_session.results_ready OR matching_adjustment.revision(v_session.id) IS DISTINCT FROM v_op.base_revision OR NOT EXISTS(SELECT 1 FROM public.match_rounds WHERE id=v_op.round_id AND purpose='matching' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_STALE' USING ERRCODE='PT409'; END IF;
 IF v_op.kind='split' THEN
  IF p_rows<>'[]'::jsonb OR p_unmatched_ids<>'{}'::uuid[] OR p_diagnostics<>'[]'::jsonb THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_OUTPUT_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM set_config('app.member_master_audit_reason',v_op.last_attempt_reason,true);
  UPDATE public.match_results SET status='cancelled',audit_reason=v_op.last_attempt_reason WHERE id=v_op.result_id AND session_id=v_op.session_id AND status IN('draft','locked');
  IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_RESULT_CHANGED' USING ERRCODE='PT409'; END IF;
  v_result_ids:=ARRAY[v_op.result_id];
 ELSE
  IF v_op.source IS NULL OR v_op.engine_input IS NULL THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_ENGINE_INVALID' USING ERRCODE='PT409'; END IF;
  SELECT COALESCE(array_agg((c->>'submissionId')::uuid ORDER BY ord),'{}'::uuid[]) INTO v_expected FROM jsonb_array_elements(v_op.engine_input->'candidates') WITH ORDINALITY t(c,ord);
  v_current:=matching_run.source(v_op.round_id);
  SELECT COALESCE(array_agg((e->>'member_id')::uuid),'{}'::uuid[]) INTO v_eligible_ids FROM jsonb_array_elements(v_current->'eligibility') e WHERE (e->>'eligible')::boolean;
  IF NOT v_eligible_ids @> v_expected THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_MEMBER_INELIGIBLE' USING ERRCODE='PT409'; END IF;
  IF matching_adjustment.hard_signature(v_op.source,v_expected) IS DISTINCT FROM matching_adjustment.hard_signature(v_current,v_expected) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_STALE' USING ERRCODE='PT409'; END IF;
  SELECT COALESCE(array_agg(DISTINCT member_id),'{}'::uuid[]) INTO v_occupied FROM public.match_results result CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) t(member_id) WHERE result.session_id=v_op.session_id AND result.status<>'cancelled';
  IF v_expected&&v_occupied THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_MEMBER_OCCUPIED' USING ERRCODE='PT409'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.match_results result WHERE result.session_id=v_op.session_id AND result.status<>'cancelled' AND cardinality(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members))>2) INTO v_multi;
  v_matched:=matching_adjustment.validate_rows(v_op.engine_input,p_rows,NOT v_multi);
  IF p_unmatched_ids IS NULL OR array_position(p_unmatched_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_COHORT_MISMATCH' USING ERRCODE='22023'; END IF;
  v_partition:=v_matched||p_unmatched_ids;
  IF cardinality(v_partition)<>cardinality(v_expected) OR cardinality(v_partition)<>(SELECT count(DISTINCT id) FROM unnest(v_partition) t(id)) OR NOT v_partition @> v_expected OR NOT v_expected @> v_partition THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_COHORT_MISMATCH' USING ERRCODE='22023'; END IF;
  IF v_op.kind IN('manual','restore') AND (jsonb_array_length(p_rows)<>1 OR cardinality(p_unmatched_ids)<>0) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_OUTPUT_INVALID' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_diagnostics) IS DISTINCT FROM 'array' OR jsonb_array_length(p_diagnostics)<>cardinality(p_unmatched_ids) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_DIAGNOSTICS_INVALID' USING ERRCODE='22023'; END IF;
  FOR d IN SELECT value FROM jsonb_array_elements(p_diagnostics) LOOP
   IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(d) key WHERE key NOT IN('member_id','reason','details')) OR jsonb_typeof(d->'details') IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(d->'details') key WHERE key NOT IN('version','code','cohort_size','shared_time_peer_count','feasible_duo_count','multi_max_shared_peer_count','search_mode'))
    OR d#>>'{details,version}' IS DISTINCT FROM 'matching_diagnostic:1' OR d->>'reason' IS DISTINCT FROM d#>>'{details,code}' OR d#>>'{details,search_mode}' IS DISTINCT FROM (CASE WHEN cardinality(v_expected)<=18 THEN 'exhaustive' ELSE 'bounded' END) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_DIAGNOSTICS_INVALID' USING ERRCODE='22023'; END IF;
   FOREACH v_key IN ARRAY ARRAY['cohort_size','shared_time_peer_count','feasible_duo_count','multi_max_shared_peer_count'] LOOP
    IF jsonb_typeof(d->'details'->v_key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_DIAGNOSTICS_INVALID' USING ERRCODE='22023'; END IF;
    v_value:=(d->'details'->>v_key)::numeric;
    IF v_value<>trunc(v_value) OR (v_key='cohort_size' AND v_value<>cardinality(v_expected)) OR (v_key<>'cohort_size' AND (v_value<0 OR v_value>=cardinality(v_expected))) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_DIAGNOSTICS_INVALID' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF (d#>>'{details,feasible_duo_count}')::integer>(d#>>'{details,shared_time_peer_count}')::integer OR (d#>>'{details,multi_max_shared_peer_count}')::integer>(d#>>'{details,shared_time_peer_count}')::integer
    OR d#>>'{details,code}' IS DISTINCT FROM (CASE WHEN (d#>>'{details,shared_time_peer_count}')::integer=0 THEN 'no_common_time' WHEN (d#>>'{details,feasible_duo_count}')::integer=0 AND (d#>>'{details,multi_max_shared_peer_count}')::integer<2 THEN 'no_feasible_combination' ELSE 'not_selected' END) THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_DIAGNOSTICS_INVALID' USING ERRCODE='22023'; END IF;
   v_diag_ids:=v_diag_ids||(d->>'member_id')::uuid;
  END LOOP;
  IF cardinality(v_diag_ids)<>(SELECT count(DISTINCT id) FROM unnest(v_diag_ids) t(id)) OR NOT v_diag_ids @> p_unmatched_ids OR NOT p_unmatched_ids @> v_diag_ids THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_DIAGNOSTICS_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM set_config('app.member_master_audit_reason',v_op.last_attempt_reason,true);
  IF v_op.kind='restore' THEN
   IF NOT matching_adjustment.valid_slot(v_op.engine_input,v_expected,v_op.result_snapshot->>'best_slot') THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_ORIGINAL_TIME_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
   UPDATE public.match_results SET status='draft',locked_by=NULL,locked_at=NULL,audit_reason=v_op.last_attempt_reason WHERE id=v_op.result_id AND session_id=v_op.session_id AND status='cancelled';
   IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_RESULT_CHANGED' USING ERRCODE='PT409'; END IF;
   v_result_ids:=ARRAY[v_op.result_id];
  ELSE
   FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO public.match_results(session_id,member_a_id,member_b_id,group_members,total_score,score_breakdown,rank,best_slot,status,audit_reason)
    VALUES(v_op.session_id,(r->>'member_a_id')::uuid,(r->>'member_b_id')::uuid,CASE WHEN r->'group_members'='null'::jsonb OR r->'group_members' IS NULL THEN NULL ELSE ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(r->'group_members')) END,(r->>'total_score')::numeric,r->'score_breakdown',COALESCE((SELECT max(rank) FROM public.match_results WHERE session_id=v_op.session_id),0)+1,r->>'best_slot','draft',v_op.last_attempt_reason) RETURNING id INTO v_result;
    v_result_ids:=v_result_ids||v_result;
   END LOOP;
  END IF;
 END IF;
 -- Archive displaced diagnostics privately; current explanations represent this
 -- adjustment only. The original normal-run input and result scores are intact.
 UPDATE matching_adjustment.operations SET prior_diagnostics=COALESCE((SELECT jsonb_agg(to_jsonb(diag) ORDER BY diag.id) FROM public.unmatched_diagnostics diag WHERE diag.session_id=v_op.session_id AND diag.member_id=ANY(v_op.selected_member_ids)),'[]'::jsonb) WHERE id=v_op.id;
 DELETE FROM public.unmatched_diagnostics WHERE session_id=v_op.session_id AND member_id=ANY(v_op.selected_member_ids);
 IF v_op.kind='pool' THEN
  INSERT INTO public.unmatched_diagnostics(session_id,member_id,reason,details,audit_reason)
  SELECT v_op.session_id,(entry->>'member_id')::uuid,entry->>'reason',entry->'details',v_op.last_attempt_reason FROM jsonb_array_elements(p_diagnostics) entry;
 END IF;
 SELECT count(DISTINCT member_id) INTO v_total FROM (
  SELECT member_id FROM public.unmatched_diagnostics WHERE session_id=v_op.session_id
  UNION SELECT member_id FROM public.match_results result CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) t(member_id) WHERE result.session_id=v_op.session_id
 ) roster;
 SELECT count(DISTINCT member_id) INTO v_count FROM public.match_results result CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) t(member_id) WHERE result.session_id=v_op.session_id AND result.status<>'cancelled';
 UPDATE public.match_sessions SET total_candidates=v_total,total_matched=v_count,total_unmatched=GREATEST(v_total-v_count,0),audit_reason=v_op.last_attempt_reason WHERE id=v_op.session_id;
 PERFORM matching_publication.assert_complete(v_op.session_id);
 UPDATE matching_adjustment.operations SET status='succeeded',lease_token=NULL,lease_expires_at=NULL,result_ids=v_result_ids,error_code=NULL,updated_at=clock_timestamp() WHERE id=v_op.id;
 RETURN matching_adjustment.receipt(v_op.id,p_actor_admin_id);
END;
$function$;

CREATE FUNCTION matching_adjustment.fail(p_operation_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_error_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_op matching_adjustment.operations%ROWTYPE;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 SELECT * INTO v_op FROM matching_adjustment.operations WHERE id=p_operation_id;
 IF v_op.id IS NULL OR v_op.actor_admin_id<>p_actor_admin_id THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-adjustment:'||v_op.session_id::text,0));
 SELECT * INTO v_op FROM matching_adjustment.operations WHERE id=p_operation_id FOR UPDATE;
 IF v_op.status='succeeded' THEN RETURN matching_adjustment.receipt(v_op.id,p_actor_admin_id); END IF;
 IF v_op.status<>'running' OR v_op.lease_token IS DISTINCT FROM p_lease_token OR v_op.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_LEASE_STALE' USING ERRCODE='PT409'; END IF;
 UPDATE matching_adjustment.operations SET status='failed',lease_token=NULL,lease_expires_at=NULL,error_code=CASE WHEN p_error_code IN('INPUT_INVALID','CANDIDATES_INSUFFICIENT','MEMBER_INELIGIBLE','MEMBER_OCCUPIED','CONSTRAINTS_FAILED','ORIGINAL_TIME_UNAVAILABLE','ENGINE_FAILED','STAGE_FAILED','SAVE_FAILED','ADJUSTMENT_CHANGED','PRIVACY_REDACTED','VERSION_UNSUPPORTED') THEN p_error_code ELSE 'UNKNOWN' END,updated_at=clock_timestamp() WHERE id=v_op.id;
 RETURN matching_adjustment.receipt(v_op.id,p_actor_admin_id);
END;
$function$;

-- Raw source and scoring inputs remain private and follow existing erasure.
CREATE FUNCTION matching_adjustment.erase_anonymized()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN
  UPDATE matching_adjustment.operations o SET source=NULL,engine_input=NULL,result_snapshot=NULL,prior_diagnostics='[]'::jsonb,reason='隐私处理已清除',last_attempt_reason='隐私处理已清除',redacted_at=clock_timestamp()
   WHERE o.redacted_at IS NULL AND EXISTS(SELECT 1 FROM matching_adjustment.subjects s WHERE s.operation_id=o.id AND s.member_id=NEW.id);
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_adjustment_member_erasure AFTER UPDATE OF anonymized_at ON public.members FOR EACH ROW EXECUTE FUNCTION matching_adjustment.erase_anonymized();

-- Browser administrators must use checked server operations for result content.
-- Existing lock/unlock, publication/cancellation context, cascading draft
-- deletion and narrowly scoped privacy redaction retain their current paths.
CREATE FUNCTION matching_adjustment.guard_result_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_session uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.session_id ELSE NEW.session_id END;
BEGIN
 IF current_setting('role',true)='service_role' OR matching_publication.has_context(v_session) OR (TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.match_sessions WHERE id=v_session)) THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.session_id=NEW.session_id THEN
  IF (to_jsonb(NEW)-ARRAY['status','locked_by','locked_at','audit_reason']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','locked_by','locked_at','audit_reason'])
   AND ((OLD.status='draft' AND NEW.status='locked') OR (OLD.status='locked' AND NEW.status='draft')) THEN RETURN NEW; END IF;
  IF NEW.cancellation_requested_by IS NULL AND NEW.cancellation_reason IS NULL
   AND (to_jsonb(NEW)-ARRAY['cancellation_requested_by','cancellation_reason','audit_reason']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['cancellation_requested_by','cancellation_reason','audit_reason']) THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'MATCH_ADJUSTMENT_REQUIRES_RPC' USING ERRCODE='PT409';
END;
$function$;
CREATE TRIGGER matching_adjustment_result_write BEFORE INSERT OR UPDATE OR DELETE ON public.match_results FOR EACH ROW EXECUTE FUNCTION matching_adjustment.guard_result_write();
CREATE FUNCTION matching_adjustment.guard_diagnostic_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_session uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.session_id ELSE NEW.session_id END;
BEGIN
 IF current_setting('role',true)='service_role' OR matching_publication.has_context(v_session) OR (TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.match_sessions WHERE id=v_session)) THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.details='{}'::jsonb AND (to_jsonb(NEW)-ARRAY['details','audit_reason']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['details','audit_reason']) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'MATCH_ADJUSTMENT_REQUIRES_RPC' USING ERRCODE='PT409';
END;
$function$;
CREATE TRIGGER matching_adjustment_diagnostic_write BEFORE INSERT OR UPDATE OR DELETE ON public.unmatched_diagnostics FOR EACH ROW EXECUTE FUNCTION matching_adjustment.guard_diagnostic_write();

CREATE FUNCTION public.admin_preview_matching_adjustment(p_session_id uuid,p_actor_admin_id uuid,p_kind text,p_member_ids uuid[] DEFAULT '{}',p_result_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_adjustment.preview(p_session_id,p_actor_admin_id,p_kind,p_member_ids,p_result_id) $function$;
CREATE FUNCTION public.admin_begin_matching_adjustment(p_session_id uuid,p_actor_admin_id uuid,p_kind text,p_member_ids uuid[],p_result_id uuid,p_operation_id uuid,p_reason text,p_expected_revision text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_adjustment.begin_operation(p_session_id,p_actor_admin_id,p_kind,p_member_ids,p_result_id,p_operation_id,p_reason,p_expected_revision) $function$;
CREATE FUNCTION public.admin_stage_matching_adjustment(p_operation_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_engine jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_adjustment.stage(p_operation_id,p_actor_admin_id,p_lease_token,p_engine) $function$;
CREATE FUNCTION public.admin_complete_matching_adjustment(p_operation_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_rows jsonb,p_unmatched_ids uuid[],p_diagnostics jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_adjustment.complete(p_operation_id,p_actor_admin_id,p_lease_token,p_rows,p_unmatched_ids,p_diagnostics) $function$;
CREATE FUNCTION public.admin_fail_matching_adjustment(p_operation_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_error_code text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_adjustment.fail(p_operation_id,p_actor_admin_id,p_lease_token,p_error_code) $function$;
CREATE FUNCTION matching_adjustment.get_operation(p_operation_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 RETURN matching_adjustment.receipt(p_operation_id,p_actor_admin_id);
END;
$function$;
CREATE FUNCTION public.admin_get_matching_adjustment(p_operation_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_adjustment.get_operation(p_operation_id,p_actor_admin_id) $function$;
CREATE FUNCTION matching_adjustment.list_operations(p_session_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 RETURN COALESCE((SELECT jsonb_agg(matching_adjustment.metadata(o.id,p_actor_admin_id) ORDER BY o.created_at DESC,o.id) FROM matching_adjustment.operations o WHERE o.session_id=p_session_id),'[]'::jsonb);
END;
$function$;
CREATE FUNCTION public.admin_list_matching_adjustments(p_session_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_adjustment.list_operations(p_session_id,p_actor_admin_id) $function$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA matching_adjustment FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION matching_adjustment.preview(uuid,uuid,text,uuid[],uuid),matching_adjustment.begin_operation(uuid,uuid,text,uuid[],uuid,uuid,text,text),matching_adjustment.stage(uuid,uuid,uuid,jsonb),matching_adjustment.complete(uuid,uuid,uuid,jsonb,uuid[],jsonb),matching_adjustment.fail(uuid,uuid,uuid,text),matching_adjustment.get_operation(uuid,uuid),matching_adjustment.list_operations(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_preview_matching_adjustment(uuid,uuid,text,uuid[],uuid),public.admin_begin_matching_adjustment(uuid,uuid,text,uuid[],uuid,uuid,text,text),public.admin_stage_matching_adjustment(uuid,uuid,uuid,jsonb),public.admin_complete_matching_adjustment(uuid,uuid,uuid,jsonb,uuid[],jsonb),public.admin_fail_matching_adjustment(uuid,uuid,uuid,text),public.admin_get_matching_adjustment(uuid,uuid),public.admin_list_matching_adjustments(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_preview_matching_adjustment(uuid,uuid,text,uuid[],uuid),public.admin_begin_matching_adjustment(uuid,uuid,text,uuid[],uuid,uuid,text,text),public.admin_stage_matching_adjustment(uuid,uuid,uuid,jsonb),public.admin_complete_matching_adjustment(uuid,uuid,uuid,jsonb,uuid[],jsonb),public.admin_fail_matching_adjustment(uuid,uuid,uuid,text),public.admin_get_matching_adjustment(uuid,uuid),public.admin_list_matching_adjustments(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
