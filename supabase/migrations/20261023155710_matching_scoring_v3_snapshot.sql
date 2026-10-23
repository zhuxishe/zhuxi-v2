-- New runs freeze the published personality weights and valid pair reviews.
-- The old begin RPC and captured v2 input remain unchanged during deployment.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));

-- Refuse to replace an unexpected concurrent database implementation.
DO $migration$
BEGIN
 IF EXISTS(SELECT 1 FROM (VALUES
   ('matching_run.subject_ids(jsonb)','3c0962d6c362b4363c19d0e6bb642452'),
   ('matching_run.job_metadata(uuid,uuid)','be871ed1e46a4e4623bd75ee3fe12272'),
   ('matching_run.stage_run(uuid,uuid,uuid,jsonb)','e3211d1e91098dbc6069e3b797cccbcc'),
   ('matching_run.seal(uuid,uuid,uuid,jsonb)','49eeca80fbdd269f6b9b5df6e374cc49'),
   ('matching_run.complete_run(uuid,uuid,uuid,jsonb,uuid[])','2bd07bad94919d2be48becea4a3043e6')
  ) expected(signature,digest)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
  WHERE p.oid IS NULL OR md5(p.prosrc)<>expected.digest) THEN
  RAISE EXCEPTION 'MATCH_RUN_SCORING_BASELINE_CHANGED';
 END IF;
END;
$migration$;

-- Session config is participant-readable; raw directional reviews remain
-- only in the private snapshot. Existing score-column ACLs protect breakdowns.
-- This release depends on the established admin-only score columns. Abort
-- rather than making directional score details readable by participants.
DO $permissions$
BEGIN
 IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated')) roles(name)
  CROSS JOIN (VALUES('score_breakdown'),('total_score')) columns(name)
  WHERE has_column_privilege(roles.name,'public.match_results',columns.name,'SELECT')) THEN
  RAISE EXCEPTION 'MATCH_RUN_SCORE_PRIVACY_BASELINE_CHANGED';
 END IF;
END;
$permissions$;

CREATE FUNCTION matching_run.public_config(p_config jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 SELECT CASE WHEN jsonb_typeof(p_config->'scoringPolicy')='object'
  THEN jsonb_set(p_config,'{scoringPolicy}',(p_config->'scoringPolicy')-'activityFeedback')
  ELSE p_config END
$function$;

CREATE FUNCTION matching_run.supported_version(p_algorithm text,p_adapter integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 SELECT COALESCE((p_algorithm='max_coverage_split:2' AND p_adapter=1)
  OR (p_algorithm='max_coverage_split:3' AND p_adapter=2),false)
$function$;

CREATE FUNCTION matching_run.published_scoring_policy()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_id uuid; v_dimensions jsonb; v_weights jsonb:='{}'::jsonb;
 v_dimension text; v_weight numeric; v_sum numeric:=0;
BEGIN
 SELECT v.id,v.template#>'{quizConfig,dimensions}' INTO v_id,v_dimensions
 FROM public.questionnaire_templates t JOIN public.questionnaire_versions v
  ON v.id=t.published_version_id AND v.kind=t.kind WHERE t.kind='quiz';
 IF v_id IS NULL OR jsonb_typeof(v_dimensions) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'MATCH_RUN_SCORING_POLICY_INVALID' USING ERRCODE='22023';
 END IF;
 FOREACH v_dimension IN ARRAY ARRAY['E','A','O','C','N'] LOOP
  IF jsonb_typeof(v_dimensions#>ARRAY[v_dimension,'matchWeight']) IS DISTINCT FROM 'number' THEN
   RAISE EXCEPTION 'MATCH_RUN_SCORING_POLICY_INVALID' USING ERRCODE='22023';
  END IF;
  v_weight:=(v_dimensions#>>ARRAY[v_dimension,'matchWeight'])::numeric;
  IF v_weight<0 OR v_weight>1 THEN RAISE EXCEPTION 'MATCH_RUN_SCORING_POLICY_INVALID' USING ERRCODE='22023'; END IF;
  v_sum:=v_sum+v_weight;
  v_weights:=v_weights||jsonb_build_object(v_dimension,v_weight);
 END LOOP;
 IF abs(v_sum-1)>0.000001 THEN RAISE EXCEPTION 'MATCH_RUN_SCORING_POLICY_INVALID' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('version','weighted_feedback:1','quizVersionId',v_id,'dimensionWeights',v_weights);
END;
$function$;

-- STABLE functions and both materialized CTEs share the outer SQL statement's
-- snapshot. No review comments, reports, draft questionnaire or personal average
-- enters the scoring policy. Closed review windows remain usable history.
CREATE FUNCTION matching_run.source_v3(p_round_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 WITH original AS MATERIALIZED (SELECT matching_run.source(p_round_id) AS source),
 candidate_ids AS MATERIALIZED (
  SELECT (e->>'member_id')::uuid AS id FROM original,
   LATERAL jsonb_array_elements(source->'eligibility') e WHERE (e->>'eligible')::boolean
 ), policy AS MATERIALIZED (SELECT matching_run.published_scoring_policy() AS value),
 reviews AS MATERIALIZED (
  SELECT r.id,r.round_id,r.reviewer_id,r.reviewee_id,r.score,r.version
  FROM private.round_peer_reviews r
  JOIN private.round_peer_review_settings setting ON setting.round_id=r.round_id AND setting.roster_confirmed
  JOIN public.match_rounds review_round ON review_round.id=r.round_id AND review_round.deleted_at IS NULL
  JOIN private.round_peer_review_participants a ON a.round_id=r.round_id AND a.member_id=r.reviewer_id AND a.included
  JOIN private.round_peer_review_participants b ON b.round_id=r.round_id AND b.member_id=r.reviewee_id AND b.included
  JOIN public.members reviewer ON reviewer.id=r.reviewer_id AND reviewer.status='approved' AND reviewer.account_status='active'
   AND reviewer.membership_type='player' AND reviewer.record_scope='current' AND reviewer.anonymized_at IS NULL AND reviewer.user_id IS NOT NULL
  JOIN public.members reviewee ON reviewee.id=r.reviewee_id AND reviewee.status='approved' AND reviewee.account_status='active'
   AND reviewee.membership_type='player' AND reviewee.record_scope='current' AND reviewee.anonymized_at IS NULL AND reviewee.user_id IS NOT NULL
  WHERE r.valid AND r.score BETWEEN 1 AND 5 AND r.score*2=trunc(r.score*2) AND r.reviewer_id<>r.reviewee_id
   AND r.reviewer_id IN(SELECT id FROM candidate_ids) AND r.reviewee_id IN(SELECT id FROM candidate_ids)
   AND NOT EXISTS(SELECT 1 FROM public.match_round_submissions s WHERE s.round_id=r.round_id AND s.member_id IN(r.reviewer_id,r.reviewee_id) AND s.cancelled_at IS NOT NULL)
 )
 SELECT source||jsonb_build_object('algorithm_version','max_coverage_split:3','adapter_version',2,
  'scoring_policy',policy.value||jsonb_build_object('activityFeedback',
   COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY round_id,reviewer_id,reviewee_id,id) FROM reviews r),'[]'::jsonb)))
 FROM original CROSS JOIN policy
$function$;

CREATE FUNCTION matching_run.engine_matches_source(p_source jsonb,p_engine jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 SELECT CASE WHEN p_source->>'algorithm_version'='max_coverage_split:3' THEN
  COALESCE(p_source->'adapter_version'='2'::jsonb
   AND p_engine->>'algorithm_version'='max_coverage_split:3' AND p_engine->'adapter_version'='2'::jsonb
   AND p_engine#>'{config,scoringPolicy}'=p_source->'scoring_policy'
   AND p_engine#>'{config,weights}'='{"interest_overlap":25,"social_complement":0,"school_diversity":5,"compatibility_score":0,"repeat_penalty":15,"gameMode_match":10,"level_proximity":10,"personality_compatibility":25,"activity_feedback":10}'::jsonb,false)
 ELSE COALESCE(p_source->>'algorithm_version' IS NULL AND p_source->'adapter_version' IS NULL
  AND p_engine->>'algorithm_version' IN('max_coverage_split:1','max_coverage_split:2')
  AND p_engine->'adapter_version'='1'::jsonb AND NOT(p_engine->'config' ? 'scoringPolicy'),false) END
$function$;


CREATE OR REPLACE FUNCTION matching_run.subject_ids(p_source jsonb)
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
 UNION SELECT (s->>'reviewer_id')::uuid FROM jsonb_array_elements(COALESCE(p_source#>'{scoring_policy,activityFeedback}','[]'::jsonb)) s
 UNION SELECT (s->>'reviewee_id')::uuid FROM jsonb_array_elements(COALESCE(p_source#>'{scoring_policy,activityFeedback}','[]'::jsonb)) s
 ) ids WHERE id IS NOT NULL
$function$;

CREATE FUNCTION matching_run.capture_v3(p_round_id uuid,p_actor_admin_id uuid,p_reason text)
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
 v_source:=matching_run.source_v3(p_round_id);
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

CREATE FUNCTION matching_run.begin_run_v3(p_round_id uuid,p_request_id uuid,p_actor_admin_id uuid,p_session_name text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_job matching_run.jobs%ROWTYPE; v_peer matching_run.jobs%ROWTYPE; v_round public.match_rounds%ROWTYPE;
 v_snapshot matching_run.snapshots%ROWTYPE; v_capture jsonb; v_token uuid:=gen_random_uuid(); v_batch integer;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 IF p_request_id IS NULL OR char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 4 AND 500
  OR char_length(btrim(COALESCE(p_session_name,''))) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'MATCH_RUN_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 -- Serialize only short job transactions. Keep the row lock shared: player
 -- saves already lock member -> round, so round UPDATE -> member would deadlock.
 -- No lock is held while the application calculates the algorithm.
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-run-job:'||p_round_id::text,0));
 SELECT * INTO v_round FROM public.match_rounds WHERE id=p_round_id FOR SHARE;
 IF v_round.id IS NULL THEN RAISE EXCEPTION 'MATCH_RUN_ROUND_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
 SELECT * INTO v_job FROM matching_run.jobs WHERE id=p_request_id FOR UPDATE;
 IF v_job.id IS NOT NULL THEN
  IF v_job.round_id<>p_round_id OR v_job.actor_admin_id<>p_actor_admin_id THEN
   RAISE EXCEPTION 'MATCH_RUN_REQUEST_REUSED' USING ERRCODE='PT409';
  END IF;
  -- The success receipt precedes current round-state validation. In particular,
  -- a lost response after closed -> matched is a replay, not a new run.
  IF v_job.status IN('succeeded','abandoned') THEN
   RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'acquired',false,
    'already_applied',true,'session_id',v_job.session_id);
  END IF;
  IF v_job.status='failed' AND (v_job.snapshot_id IS NULL OR v_job.eligible_count<2) THEN
   RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'acquired',false,'failed',true,'already_applied',true);
  END IF;
  IF v_job.status='running' AND v_job.lease_expires_at>clock_timestamp() THEN
   RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'acquired',false,'busy',true,'already_applied',true);
  END IF;
 END IF;
 IF v_round.deleted_at IS NOT NULL OR v_round.purpose<>'matching' OR v_round.status NOT IN('open','closed')
  OR (v_round.status='open' AND (v_round.survey_start IS NULL OR v_round.survey_end IS NULL OR v_round.survey_start>=v_round.survey_end OR v_round.survey_start>clock_timestamp())) THEN
  RAISE EXCEPTION 'MATCH_RUN_ROUND_UNAVAILABLE' USING ERRCODE='PT409';
 END IF;
 SELECT * INTO v_peer FROM matching_run.jobs WHERE round_id=p_round_id AND status='running' AND id<>p_request_id LIMIT 1 FOR UPDATE;
 IF v_peer.id IS NOT NULL THEN
  RETURN jsonb_build_object('run',matching_run.job_metadata(v_peer.id,p_actor_admin_id),'acquired',false,'busy',true,'already_applied',false);
 END IF;
 IF v_job.id IS NULL THEN
  SELECT COALESCE(max(batch_number),0)+1 INTO v_batch FROM matching_run.jobs WHERE round_id=p_round_id;
  INSERT INTO matching_run.jobs(id,round_id,batch_number,actor_admin_id,session_name,reason,last_attempt_reason,status,lease_token,lease_expires_at,algorithm_version,adapter_version)
  VALUES(p_request_id,p_round_id,v_batch,p_actor_admin_id,btrim(p_session_name),btrim(p_reason),btrim(p_reason),'running',v_token,clock_timestamp()+interval '5 minutes','max_coverage_split:3',2)
  RETURNING * INTO v_job;
  BEGIN
   v_capture:=matching_run.capture_v3(p_round_id,p_actor_admin_id,btrim(p_reason));
  EXCEPTION WHEN OTHERS THEN
   -- Only this capture subtransaction is rolled back. No untrusted SQL error
   -- text is stored, and a failed capture cannot later pretend to reuse input.
   UPDATE matching_run.jobs SET status='failed',lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp(),completed_at=clock_timestamp(),
    error_code='INPUT_CAPTURE_FAILED',error_message='本批输入未能捕获，请作废本批后重新发起运行' WHERE id=v_job.id;
   RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'acquired',false,'failed',true,'already_applied',false);
  END;
  SELECT * INTO v_snapshot FROM matching_run.snapshots WHERE id=(v_capture->>'snapshot_id')::uuid;
  UPDATE matching_run.jobs SET snapshot_id=v_snapshot.id,captured_at=v_snapshot.captured_at,submitted_count=v_snapshot.submitted_count,
   eligible_count=v_snapshot.eligible_count,excluded_count=v_snapshot.excluded_count WHERE id=v_job.id RETURNING * INTO v_job;
 ELSE
  IF NOT matching_run.supported_version(v_job.algorithm_version,v_job.adapter_version) THEN
   RAISE EXCEPTION 'MATCH_RUN_VERSION_UNSUPPORTED' USING ERRCODE='PT409';
  END IF;
  -- Follow member -> snapshot ordering shared by sealing and erasure. A retry
  -- uses the original payload and must not reconstruct erased personal data.
  PERFORM 1 FROM public.members WHERE id IN(SELECT member_id FROM matching_run.subjects WHERE snapshot_id=v_job.snapshot_id) ORDER BY id FOR SHARE;
  SELECT * INTO v_snapshot FROM matching_run.snapshots WHERE id=v_job.snapshot_id FOR SHARE;
  IF v_snapshot.id IS NULL OR v_snapshot.source IS NULL OR v_snapshot.redacted_at IS NOT NULL OR v_snapshot.sealed_at IS NOT NULL THEN
   RAISE EXCEPTION 'MATCH_RUN_SNAPSHOT_UNAVAILABLE' USING ERRCODE='PT409';
  END IF;
  IF v_snapshot.eligible_count<2 THEN RAISE EXCEPTION 'MATCH_RUN_CANDIDATES_INSUFFICIENT' USING ERRCODE='PT409'; END IF;
  IF v_round.status IS DISTINCT FROM (v_snapshot.source->'round'->>'status')
   OR v_round.survey_start IS DISTINCT FROM (v_snapshot.source->'round'->>'survey_start')::timestamptz
   OR v_round.survey_end IS DISTINCT FROM (v_snapshot.source->'round'->>'survey_end')::timestamptz THEN
   RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409';
  END IF;
  UPDATE matching_run.jobs SET status='running',attempt=attempt+1,lease_token=v_token,lease_expires_at=clock_timestamp()+interval '5 minutes',
   started_at=clock_timestamp(),updated_at=clock_timestamp(),completed_at=NULL,error_code=NULL,error_message=NULL,last_attempt_reason=btrim(p_reason)
  WHERE id=v_job.id RETURNING * INTO v_job;
  v_capture:=jsonb_build_object('snapshot_id',v_snapshot.id,'captured_at',v_snapshot.captured_at,'source',v_snapshot.source);
 END IF;
 RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'acquired',true,'lease_token',v_token,
  'capture',v_capture,'engine_input',v_snapshot.engine_input,'already_applied',false);
END;
$function$;

CREATE OR REPLACE FUNCTION matching_run.job_metadata(p_run_id uuid,p_viewer_admin_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT jsonb_build_object(
  'id',j.id,'round_id',j.round_id,'batch_number',j.batch_number,'actor_admin_id',j.actor_admin_id,
  'session_name',j.session_name,'reason',j.reason,'last_attempt_reason',j.last_attempt_reason,'status',j.status,'attempt',j.attempt,
  'created_at',j.created_at,'started_at',j.started_at,'updated_at',j.updated_at,'completed_at',j.completed_at,
  'lease_expires_at',j.lease_expires_at,'lease_expired',j.status='running' AND j.lease_expires_at<=clock_timestamp(),
  'captured_at',j.captured_at,'submitted_count',j.submitted_count,'eligible_count',j.eligible_count,'excluded_count',j.excluded_count,
  'algorithm_version',j.algorithm_version,'adapter_version',j.adapter_version,
  'snapshot_status',CASE WHEN snap.id IS NULL THEN 'missing' WHEN snap.redacted_at IS NOT NULL THEN 'redacted' WHEN snap.sealed_at IS NOT NULL THEN 'sealed' WHEN snap.engine_input IS NOT NULL THEN 'staged' ELSE 'captured' END,
  'has_engine_input',snap.engine_input IS NOT NULL,
  'session_id',j.session_id,'original_session_id',j.original_session_id,
  'session_deleted',j.status='succeeded' AND j.session_id IS NULL,
  'session_status',session.status,'results_ready',session.results_ready,'publication_version',session.publication_version,
  'error_code',j.error_code,'error_message',j.error_message,
  'can_recover',j.actor_admin_id=p_viewer_admin_id AND (j.status='failed' OR (j.status='running' AND j.lease_expires_at<=clock_timestamp()))
   AND snap.id IS NOT NULL AND snap.redacted_at IS NULL AND snap.source IS NOT NULL
   AND snap.eligible_count>=2
   AND matching_run.supported_version(j.algorithm_version,j.adapter_version)
   AND r.deleted_at IS NULL AND r.purpose='matching' AND r.status IN('open','closed')
   AND r.status IS NOT DISTINCT FROM (snap.source->'round'->>'status')
   AND r.survey_start IS NOT DISTINCT FROM (snap.source->'round'->>'survey_start')::timestamptz
   AND r.survey_end IS NOT DISTINCT FROM (snap.source->'round'->>'survey_end')::timestamptz
   AND (r.status<>'open' OR (r.survey_start IS NOT NULL AND r.survey_end IS NOT NULL AND r.survey_start<r.survey_end AND r.survey_start<=clock_timestamp()))
   AND NOT EXISTS(SELECT 1 FROM matching_run.jobs peer WHERE peer.round_id=j.round_id AND peer.id<>j.id AND peer.status='running'),
  'can_abandon',(j.actor_admin_id=p_viewer_admin_id OR EXISTS(SELECT 1 FROM public.admin_users viewer WHERE viewer.id=p_viewer_admin_id AND viewer.role='super_admin'))
   AND (j.status='failed' OR (j.status='running' AND j.lease_expires_at<=clock_timestamp()))
 )
 FROM matching_run.jobs j LEFT JOIN matching_run.snapshots snap ON snap.id=j.snapshot_id
 LEFT JOIN public.match_sessions session ON session.id=j.session_id
 JOIN public.match_rounds r ON r.id=j.round_id WHERE j.id=p_run_id
$function$;

CREATE OR REPLACE FUNCTION matching_run.stage_run(p_run_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_engine_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_job matching_run.jobs%ROWTYPE; v_snapshot matching_run.snapshots%ROWTYPE; v_ids jsonb; v_candidate_ids jsonb; v_expected_map jsonb; v_round_id uuid;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 SELECT round_id INTO v_round_id FROM matching_run.jobs WHERE id=p_run_id;
 IF v_round_id IS NULL THEN RAISE EXCEPTION 'MATCH_RUN_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-run-job:'||v_round_id::text,0));
 SELECT * INTO v_job FROM matching_run.jobs WHERE id=p_run_id FOR UPDATE;
 IF v_job.id IS NULL OR v_job.actor_admin_id<>p_actor_admin_id THEN RAISE EXCEPTION 'MATCH_RUN_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 IF v_job.status<>'running' OR v_job.lease_token IS DISTINCT FROM p_lease_token OR v_job.lease_expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'MATCH_RUN_LEASE_STALE' USING ERRCODE='PT409';
 END IF;
 PERFORM 1 FROM public.members WHERE id IN(SELECT member_id FROM matching_run.subjects WHERE snapshot_id=v_job.snapshot_id) ORDER BY id FOR SHARE;
 SELECT * INTO v_snapshot FROM matching_run.snapshots WHERE id=v_job.snapshot_id FOR UPDATE;
 IF v_snapshot.id IS NULL OR v_snapshot.source IS NULL OR v_snapshot.redacted_at IS NOT NULL OR v_snapshot.sealed_at IS NOT NULL THEN
  RAISE EXCEPTION 'MATCH_RUN_SNAPSHOT_UNAVAILABLE' USING ERRCODE='PT409';
 END IF;
 IF jsonb_typeof(p_engine_input) IS DISTINCT FROM 'object' OR jsonb_typeof(p_engine_input->'candidates') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_engine_input->'pairRelations') IS DISTINCT FROM 'array' OR jsonb_typeof(p_engine_input->'idMap') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_engine_input->'config') IS DISTINCT FROM 'object'
  OR p_engine_input->>'algorithm_version' IS DISTINCT FROM v_job.algorithm_version OR p_engine_input->'adapter_version' IS DISTINCT FROM to_jsonb(v_job.adapter_version)
  OR NOT matching_run.supported_version(v_job.algorithm_version,v_job.adapter_version)
  OR NOT matching_run.engine_matches_source(v_snapshot.source,p_engine_input) OR v_snapshot.eligible_count<2
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_engine_input) key WHERE key NOT IN('candidates','pairRelations','idMap','config','algorithm_version','adapter_version')) THEN
  RAISE EXCEPTION 'MATCH_RUN_ENGINE_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT COALESCE(jsonb_agg(submission->'member_id' ORDER BY ord),'[]') INTO v_ids
 FROM jsonb_array_elements(v_snapshot.source->'submissions') WITH ORDINALITY entries(submission,ord)
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_snapshot.source->'eligibility') e WHERE e->>'member_id'=submission->>'member_id' AND (e->>'eligible')::boolean);
 SELECT COALESCE(jsonb_agg(c->'submissionId' ORDER BY ord),'[]') INTO v_candidate_ids FROM jsonb_array_elements(p_engine_input->'candidates') WITH ORDINALITY entries(c,ord);
 SELECT COALESCE(jsonb_agg(jsonb_build_array(id,id) ORDER BY ord),'[]') INTO v_expected_map FROM jsonb_array_elements(v_ids) WITH ORDINALITY entries(id,ord);
 IF v_ids IS DISTINCT FROM v_candidate_ids OR p_engine_input->'idMap' IS DISTINCT FROM v_expected_map THEN
  RAISE EXCEPTION 'MATCH_RUN_COHORT_MISMATCH' USING ERRCODE='22023';
 END IF;
 IF v_snapshot.engine_input IS NOT NULL THEN
  IF v_snapshot.engine_input IS DISTINCT FROM p_engine_input THEN RAISE EXCEPTION 'MATCH_RUN_ENGINE_INPUT_IMMUTABLE' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'staged',true,'already_applied',true);
 END IF;
 UPDATE matching_run.snapshots SET engine_input=p_engine_input,engine_digest=md5(p_engine_input::text) WHERE id=v_snapshot.id;
 UPDATE matching_run.jobs SET updated_at=clock_timestamp() WHERE id=v_job.id;
 RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'staged',true,'already_applied',false);
END;
$function$;

CREATE OR REPLACE FUNCTION matching_run.seal(p_snapshot_id uuid,p_session_id uuid,p_actor_admin_id uuid,p_engine_input jsonb)
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
  OR NOT matching_run.engine_matches_source(v_snapshot.source,p_engine_input)
  OR matching_run.public_config(p_engine_input->'config') IS DISTINCT FROM v_session.config OR v_session.algorithm<>'max_coverage_split'
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


CREATE OR REPLACE FUNCTION matching_run.complete_run(p_run_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_rows jsonb,p_unmatched_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_job matching_run.jobs%ROWTYPE; v_snapshot matching_run.snapshots%ROWTYPE; v_round public.match_rounds%ROWTYPE;
 v_session_id uuid; v_expected_status text; v_ids uuid[]; v_matched_ids uuid[]; v_partition uuid[]; v_row record; v_members uuid[]; v_total integer; v_matched integer; v_round_id uuid;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 SELECT round_id INTO v_round_id FROM matching_run.jobs WHERE id=p_run_id;
 IF v_round_id IS NULL THEN RAISE EXCEPTION 'MATCH_RUN_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-run-job:'||v_round_id::text,0));
 SELECT * INTO v_job FROM matching_run.jobs WHERE id=p_run_id;
 IF v_job.actor_admin_id<>p_actor_admin_id THEN RAISE EXCEPTION 'MATCH_RUN_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 IF v_job.status='succeeded' THEN
  RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'session_id',v_job.session_id,'results_ready',true,'already_applied',true);
 END IF;
 -- Match existing answer writers' member -> round ordering, and erasure's
 -- member -> snapshot ordering. The advisory lock excludes other job mutations.
 PERFORM 1 FROM public.members WHERE id IN(SELECT member_id FROM matching_run.subjects WHERE snapshot_id=v_job.snapshot_id) ORDER BY id FOR SHARE;
 SELECT * INTO v_round FROM public.match_rounds WHERE id=v_round_id FOR UPDATE;
 SELECT * INTO v_job FROM matching_run.jobs WHERE id=p_run_id FOR UPDATE;
 IF v_job.status<>'running' OR v_job.lease_token IS DISTINCT FROM p_lease_token OR v_job.lease_expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'MATCH_RUN_LEASE_STALE' USING ERRCODE='PT409';
 END IF;
 SELECT * INTO v_snapshot FROM matching_run.snapshots WHERE id=v_job.snapshot_id FOR UPDATE;
 IF v_snapshot.id IS NULL OR v_snapshot.source IS NULL OR v_snapshot.redacted_at IS NOT NULL OR v_snapshot.sealed_at IS NOT NULL OR v_snapshot.engine_input IS NULL THEN
  RAISE EXCEPTION 'MATCH_RUN_SNAPSHOT_UNAVAILABLE' USING ERRCODE='PT409';
 END IF;
 v_expected_status:=v_snapshot.source->'round'->>'status';
 -- Preserve the existing finalizer's round state and collection-window CAS.
 IF v_round.id IS NULL OR v_round.deleted_at IS NOT NULL OR v_round.purpose<>'matching' OR v_expected_status NOT IN('open','closed')
  OR v_expected_status IS NULL OR v_round.status<>v_expected_status
  OR v_round.survey_start IS DISTINCT FROM (v_snapshot.source->'round'->>'survey_start')::timestamptz
  OR v_round.survey_end IS DISTINCT FROM (v_snapshot.source->'round'->>'survey_end')::timestamptz
  OR (v_expected_status='open' AND (v_round.survey_start IS NULL OR v_round.survey_end IS NULL OR v_round.survey_start>=v_round.survey_end OR v_round.survey_start>clock_timestamp())) THEN
  RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409';
 END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR p_unmatched_ids IS NULL OR array_position(p_unmatched_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'MATCH_RUN_OUTPUT_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT array_agg((c->>'submissionId')::uuid ORDER BY ord) INTO v_ids FROM jsonb_array_elements(v_snapshot.engine_input->'candidates') WITH ORDINALITY entries(c,ord);
 v_total:=cardinality(v_ids);
 IF v_total IS DISTINCT FROM v_snapshot.eligible_count OR v_total<2 OR jsonb_array_length(p_rows)>v_total THEN
  RAISE EXCEPTION 'MATCH_RUN_OUTPUT_INVALID' USING ERRCODE='22023';
 END IF;
 v_matched_ids:='{}'::uuid[];
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(v_row.value) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_row.value) key WHERE key NOT IN('member_a_id','member_b_id','group_members','total_score','score_breakdown','rank','best_slot','game_type'))
   OR jsonb_typeof(v_row.value->'total_score') IS DISTINCT FROM 'number'
   OR NOT(v_row.value ? 'score_breakdown')
   OR jsonb_typeof(v_row.value->'score_breakdown') NOT IN('array','object','null')
   OR (v_row.value ? 'game_type' AND (jsonb_typeof(v_row.value->'game_type') IS DISTINCT FROM 'string'
    OR v_row.value->>'game_type' NOT IN('双人','双人(重逢)','双人(重复)','多人','多人(重复)')))
   OR jsonb_typeof(v_row.value->'rank') IS DISTINCT FROM 'number' OR (v_row.value->>'rank')::integer<1 THEN
   RAISE EXCEPTION 'MATCH_RUN_OUTPUT_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_row.value->>'member_a_id' IS NULL THEN RAISE EXCEPTION 'MATCH_RUN_OUTPUT_INVALID' USING ERRCODE='22023'; END IF;
  IF v_row.value->>'member_b_id' IS NOT NULL THEN
   IF jsonb_typeof(v_row.value->'score_breakdown') IS DISTINCT FROM 'array'
    OR v_row.value->>'member_a_id'=v_row.value->>'member_b_id'
    OR (jsonb_typeof(v_row.value->'group_members')='array' AND jsonb_array_length(v_row.value->'group_members')>0)
    OR (v_row.value->'group_members' IS NOT NULL AND v_row.value->'group_members'<>'null'::jsonb AND jsonb_typeof(v_row.value->'group_members')<>'array') THEN
    RAISE EXCEPTION 'MATCH_RUN_OUTPUT_INVALID' USING ERRCODE='22023';
   END IF;
   v_members:=ARRAY[(v_row.value->>'member_a_id')::uuid,(v_row.value->>'member_b_id')::uuid];
  ELSE
   -- Version 2 produced a null pool breakdown. Version 3 produces an explicit
   -- summary object; accepting it is part of saving the actual engine output.
   IF jsonb_typeof(v_row.value->'group_members') IS DISTINCT FROM 'array' OR jsonb_array_length(v_row.value->'group_members')<3
    OR (v_job.algorithm_version='max_coverage_split:2' AND jsonb_typeof(v_row.value->'score_breakdown') NOT IN('array','null'))
    OR (v_job.algorithm_version='max_coverage_split:3' AND (jsonb_typeof(v_row.value->'score_breakdown') IS DISTINCT FROM 'object'
     OR v_row.value#>>'{score_breakdown,kind}' IS DISTINCT FROM 'multi_pool'
     OR v_row.value#>>'{score_breakdown,version}' IS DISTINCT FROM 'weighted_feedback:1'
     OR jsonb_typeof(v_row.value#>'{score_breakdown,factors}') IS DISTINCT FROM 'array')) THEN
    RAISE EXCEPTION 'MATCH_RUN_OUTPUT_INVALID' USING ERRCODE='22023';
   END IF;
   SELECT array_agg(value::uuid) INTO v_members FROM jsonb_array_elements_text(v_row.value->'group_members');
   IF NOT (v_row.value->>'member_a_id')::uuid=ANY(v_members) OR array_position(v_members,NULL) IS NOT NULL
    OR cardinality(v_members)<>(SELECT count(DISTINCT id) FROM unnest(v_members) ids(id)) THEN
    RAISE EXCEPTION 'MATCH_RUN_OUTPUT_INVALID' USING ERRCODE='22023';
   END IF;
  END IF;
  v_matched_ids:=v_matched_ids||v_members;
 END LOOP;
 v_partition:=v_matched_ids||p_unmatched_ids;
 IF cardinality(v_partition)<>v_total OR cardinality(v_partition)<>(SELECT count(DISTINCT id) FROM unnest(v_partition) ids(id))
  OR NOT v_partition @> v_ids OR NOT v_ids @> v_partition THEN
  RAISE EXCEPTION 'MATCH_RUN_OUTPUT_COHORT_MISMATCH' USING ERRCODE='22023';
 END IF;
 v_matched:=cardinality(v_matched_ids);
 PERFORM set_config('app.member_master_audit_reason',v_job.last_attempt_reason,true);
 INSERT INTO public.match_sessions(session_name,round_id,algorithm,config,input_snapshot_required,total_candidates,total_matched,total_unmatched,created_by,audit_reason)
 VALUES(v_job.session_name,v_job.round_id,'max_coverage_split',matching_run.public_config(v_snapshot.engine_input->'config'),true,v_total,v_matched,v_total-v_matched,p_actor_admin_id,v_job.last_attempt_reason)
 RETURNING id INTO v_session_id;
 PERFORM matching_run.seal(v_snapshot.id,v_session_id,p_actor_admin_id,v_snapshot.engine_input);
 INSERT INTO public.match_results(session_id,member_a_id,member_b_id,group_members,total_score,score_breakdown,rank,best_slot,audit_reason)
 SELECT v_session_id,member_a_id,member_b_id,group_members,total_score,score_breakdown,rank,best_slot,v_job.last_attempt_reason
 FROM jsonb_to_recordset(p_rows) AS output(member_a_id uuid,member_b_id uuid,group_members uuid[],total_score numeric,score_breakdown jsonb,rank integer,best_slot text);
 INSERT INTO public.unmatched_diagnostics(session_id,member_id,reason,details,audit_reason)
 SELECT v_session_id,id,'unmatched_after_all_stages','{"stage":"overflow"}'::jsonb,v_job.last_attempt_reason FROM unnest(p_unmatched_ids) ids(id);
 PERFORM matching_run.assert_session_input(v_session_id);
 PERFORM matching_publication.assert_complete(v_session_id);
 INSERT INTO matching_publication.write_context VALUES(txid_current(),pg_backend_pid(),v_session_id,'finalize');
 UPDATE public.match_rounds SET status=CASE v_expected_status WHEN 'closed' THEN 'matched' ELSE 'open' END WHERE id=v_job.round_id;
 UPDATE public.match_sessions SET results_ready=true,audit_reason=v_job.last_attempt_reason WHERE id=v_session_id;
 DELETE FROM matching_publication.write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND session_id=v_session_id;
 UPDATE matching_run.jobs SET status='succeeded',session_id=v_session_id,original_session_id=v_session_id,
  lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp(),completed_at=clock_timestamp(),error_code=NULL,error_message=NULL
 WHERE id=v_job.id;
 RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'session_id',v_session_id,'results_ready',true,'already_applied',false);
END;
$function$;





CREATE FUNCTION public.admin_begin_matching_run_v3(p_round_id uuid,p_request_id uuid,p_actor_admin_id uuid,p_session_name text,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT matching_run.begin_run_v3(p_round_id,p_request_id,p_actor_admin_id,p_session_name,p_reason)
$function$;

REVOKE ALL ON FUNCTION matching_run.public_config(jsonb),matching_run.supported_version(text,integer),matching_run.published_scoring_policy(),matching_run.source_v3(uuid),matching_run.engine_matches_source(jsonb,jsonb),matching_run.capture_v3(uuid,uuid,text),matching_run.begin_run_v3(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION matching_run.begin_run_v3(uuid,uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_begin_matching_run_v3(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_begin_matching_run_v3(uuid,uuid,uuid,text,text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
