-- Durable, idempotent round runs. Collection, eligibility, scoring, reopening,
-- import, local rematch and publication rules are deliberately unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));

CREATE TABLE matching_run.jobs (
 id uuid PRIMARY KEY,
 round_id uuid NOT NULL REFERENCES public.match_rounds(id),
 batch_number integer NOT NULL CHECK(batch_number>0),
 actor_admin_id uuid NOT NULL,
 session_name text NOT NULL,
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 4 AND 500),
 last_attempt_reason text NOT NULL CHECK(char_length(btrim(last_attempt_reason)) BETWEEN 4 AND 500),
 status text NOT NULL CHECK(status IN('running','succeeded','failed','abandoned')),
 attempt integer NOT NULL DEFAULT 1 CHECK(attempt>0),
 lease_token uuid,
 lease_expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 snapshot_id uuid UNIQUE REFERENCES matching_run.snapshots(id) ON DELETE SET NULL,
 session_id uuid UNIQUE REFERENCES public.match_sessions(id) ON DELETE SET NULL,
 -- Keep a historical locator after the existing explicit draft deletion flow.
 -- Replaying that successful request must never recreate the deleted result.
 original_session_id uuid,
 captured_at timestamptz,
 submitted_count integer,
 eligible_count integer,
 excluded_count integer,
 algorithm_version text NOT NULL DEFAULT 'max_coverage_split:2',
 adapter_version integer NOT NULL DEFAULT 1,
 error_code text,
 error_message text,
 UNIQUE(round_id,batch_number),
 CHECK((status='running')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
 CHECK(status<>'succeeded' OR original_session_id IS NOT NULL)
);
CREATE UNIQUE INDEX matching_run_one_running_round_idx ON matching_run.jobs(round_id) WHERE status='running';
ALTER TABLE matching_run.jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE matching_run.jobs FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE matching_run.events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES matching_run.jobs(id),
 actor_admin_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type='abandoned'),
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 4 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX matching_run_events_run_idx ON matching_run.events(run_id,id);
ALTER TABLE matching_run.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE matching_run.events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE matching_run.events_id_seq FROM PUBLIC,anon,authenticated,service_role;

-- No raw inputs, engine data, tokens or server error details leave this helper.
CREATE FUNCTION matching_run.job_metadata(p_run_id uuid,p_viewer_admin_id uuid)
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
   AND j.algorithm_version='max_coverage_split:2' AND j.adapter_version=1
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

CREATE FUNCTION matching_run.begin_run(p_round_id uuid,p_request_id uuid,p_actor_admin_id uuid,p_session_name text,p_reason text)
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
  INSERT INTO matching_run.jobs(id,round_id,batch_number,actor_admin_id,session_name,reason,last_attempt_reason,status,lease_token,lease_expires_at)
  VALUES(p_request_id,p_round_id,v_batch,p_actor_admin_id,btrim(p_session_name),btrim(p_reason),btrim(p_reason),'running',v_token,clock_timestamp()+interval '5 minutes')
  RETURNING * INTO v_job;
  BEGIN
   v_capture:=matching_run.capture(p_round_id,p_actor_admin_id,btrim(p_reason));
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
  IF v_job.algorithm_version<>'max_coverage_split:2' OR v_job.adapter_version<>1 THEN
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

CREATE FUNCTION matching_run.stage_run(p_run_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_engine_input jsonb)
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
  OR v_job.algorithm_version<>'max_coverage_split:2' OR v_job.adapter_version<>1 OR v_snapshot.eligible_count<2
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

CREATE FUNCTION matching_run.complete_run(p_run_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_rows jsonb,p_unmatched_ids uuid[])
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
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_row.value) key WHERE key NOT IN('member_a_id','member_b_id','group_members','total_score','score_breakdown','rank','best_slot'))
   OR jsonb_typeof(v_row.value->'total_score') IS DISTINCT FROM 'number'
   OR jsonb_typeof(v_row.value->'score_breakdown') IS DISTINCT FROM 'array'
   OR jsonb_typeof(v_row.value->'rank') IS DISTINCT FROM 'number' OR (v_row.value->>'rank')::integer<1 THEN
   RAISE EXCEPTION 'MATCH_RUN_OUTPUT_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_row.value->>'member_a_id' IS NULL THEN RAISE EXCEPTION 'MATCH_RUN_OUTPUT_INVALID' USING ERRCODE='22023'; END IF;
  IF v_row.value->>'member_b_id' IS NOT NULL THEN
   IF v_row.value->>'member_a_id'=v_row.value->>'member_b_id'
    OR (jsonb_typeof(v_row.value->'group_members')='array' AND jsonb_array_length(v_row.value->'group_members')>0)
    OR (v_row.value->'group_members' IS NOT NULL AND v_row.value->'group_members'<>'null'::jsonb AND jsonb_typeof(v_row.value->'group_members')<>'array') THEN
    RAISE EXCEPTION 'MATCH_RUN_OUTPUT_INVALID' USING ERRCODE='22023';
   END IF;
   v_members:=ARRAY[(v_row.value->>'member_a_id')::uuid,(v_row.value->>'member_b_id')::uuid];
  ELSE
   IF jsonb_typeof(v_row.value->'group_members') IS DISTINCT FROM 'array' OR jsonb_array_length(v_row.value->'group_members')<3 THEN
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
 VALUES(v_job.session_name,v_job.round_id,'max_coverage_split',v_snapshot.engine_input->'config',true,v_total,v_matched,v_total-v_matched,p_actor_admin_id,v_job.last_attempt_reason)
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

CREATE FUNCTION matching_run.fail_run(p_run_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_error_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_job matching_run.jobs%ROWTYPE; v_code text; v_round_id uuid;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 SELECT round_id INTO v_round_id FROM matching_run.jobs WHERE id=p_run_id;
 IF v_round_id IS NULL THEN RAISE EXCEPTION 'MATCH_RUN_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-run-job:'||v_round_id::text,0));
 SELECT * INTO v_job FROM matching_run.jobs WHERE id=p_run_id FOR UPDATE;
 IF v_job.id IS NULL OR v_job.actor_admin_id<>p_actor_admin_id THEN RAISE EXCEPTION 'MATCH_RUN_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 -- Never let an error handler for a lost response downgrade a committed run.
 IF v_job.status='succeeded' THEN
  RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'failed',false,'already_applied',true,'session_id',v_job.session_id);
 END IF;
 IF v_job.status='failed' THEN RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'failed',true,'already_applied',true); END IF;
 IF v_job.status<>'running' OR v_job.lease_token IS DISTINCT FROM p_lease_token THEN
  RAISE EXCEPTION 'MATCH_RUN_LEASE_STALE' USING ERRCODE='PT409';
 END IF;
 v_code:=CASE WHEN p_error_code IN('INPUT_INVALID','CANDIDATES_INSUFFICIENT','ENGINE_FAILED','STAGE_FAILED','SAVE_FAILED','ROUND_CHANGED','PRIVACY_REDACTED','VERSION_UNSUPPORTED') THEN p_error_code ELSE 'UNKNOWN' END;
 UPDATE matching_run.jobs SET status='failed',lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp(),completed_at=clock_timestamp(),error_code=v_code,
  error_message=CASE v_code
   WHEN 'INPUT_INVALID' THEN '原批次输入无法读取或校验未通过'
   WHEN 'CANDIDATES_INSUFFICIENT' THEN '原批次符合资格的候选人数不足'
   WHEN 'ENGINE_FAILED' THEN '算法计算未完成'
   WHEN 'STAGE_FAILED' THEN '原批次算法输入保存未完成'
   WHEN 'SAVE_FAILED' THEN '匹配结果保存未完成'
   WHEN 'ROUND_CHANGED' THEN '轮次状态或收集时间已改变'
   WHEN 'PRIVACY_REDACTED' THEN '原批次输入已按成员隐私要求清除'
   WHEN 'VERSION_UNSUPPORTED' THEN '当前程序不支持恢复原算法版本'
   ELSE '运行未完成，请检查批次状态后恢复' END
 WHERE id=v_job.id;
 RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,p_actor_admin_id),'failed',true,'already_applied',false);
END;
$function$;

CREATE FUNCTION matching_run.abandon_run(p_run_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_admin uuid:=matching_publication.require_admin(p_reason); v_job matching_run.jobs%ROWTYPE; v_round_id uuid;
BEGIN
 SELECT round_id INTO v_round_id FROM matching_run.jobs WHERE id=p_run_id;
 IF v_round_id IS NULL THEN RAISE EXCEPTION 'MATCH_RUN_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-run-job:'||v_round_id::text,0));
 SELECT * INTO v_job FROM matching_run.jobs WHERE id=p_run_id FOR UPDATE;
 IF v_job.actor_admin_id<>v_admin AND NOT private.member_master_is_super_admin() THEN
  RAISE EXCEPTION 'MATCH_RUN_OWNER_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF v_job.status='abandoned' THEN RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,v_admin),'abandoned',true,'already_applied',true); END IF;
 IF v_job.status='succeeded' OR (v_job.status='running' AND v_job.lease_expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'MATCH_RUN_CANNOT_ABANDON' USING ERRCODE='PT409';
 END IF;
 UPDATE matching_run.jobs SET status='abandoned',lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp(),completed_at=clock_timestamp()
 WHERE id=v_job.id;
 -- The reason remains part of the durable run record without altering the
 -- original calculation reason or duplicating any participant input.
 INSERT INTO matching_run.events(run_id,actor_admin_id,event_type,reason) VALUES(v_job.id,v_admin,'abandoned',btrim(p_reason));
 RETURN jsonb_build_object('run',matching_run.job_metadata(v_job.id,v_admin),'abandoned',true,'already_applied',false);
END;
$function$;

CREATE FUNCTION matching_run.list_round_runs(p_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_admin uuid;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'MATCH_RUN_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 v_admin:=private.member_master_current_admin_id();
 IF v_admin IS NULL THEN RAISE EXCEPTION 'MATCH_RUN_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(matching_run.job_metadata(id,v_admin) ORDER BY batch_number DESC) FROM matching_run.jobs WHERE round_id=p_round_id),'[]'::jsonb);
END;
$function$;

CREATE FUNCTION matching_run.get_run(p_run_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_owner uuid;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 SELECT actor_admin_id INTO v_owner FROM matching_run.jobs WHERE id=p_run_id;
 IF v_owner IS NULL OR v_owner<>p_actor_admin_id THEN RAISE EXCEPTION 'MATCH_RUN_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('run',matching_run.job_metadata(p_run_id,p_actor_admin_id));
END;
$function$;

CREATE FUNCTION public.admin_begin_matching_run(p_round_id uuid,p_request_id uuid,p_actor_admin_id uuid,p_session_name text,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_run.begin_run(p_round_id,p_request_id,p_actor_admin_id,p_session_name,p_reason) $function$;
CREATE FUNCTION public.admin_stage_matching_run(p_run_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_engine_input jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_run.stage_run(p_run_id,p_actor_admin_id,p_lease_token,p_engine_input) $function$;
CREATE FUNCTION public.admin_complete_matching_run(p_run_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_rows jsonb,p_unmatched_ids uuid[])
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_run.complete_run(p_run_id,p_actor_admin_id,p_lease_token,p_rows,p_unmatched_ids) $function$;
CREATE FUNCTION public.admin_fail_matching_run(p_run_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_error_code text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_run.fail_run(p_run_id,p_actor_admin_id,p_lease_token,p_error_code) $function$;
CREATE FUNCTION public.admin_abandon_matching_run(p_run_id uuid,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_run.abandon_run(p_run_id,p_reason) $function$;
CREATE FUNCTION public.admin_list_round_matching_runs(p_round_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_run.list_round_runs(p_round_id) $function$;
CREATE FUNCTION public.admin_get_matching_run(p_run_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_run.get_run(p_run_id,p_actor_admin_id) $function$;

REVOKE ALL ON FUNCTION matching_run.job_metadata(uuid,uuid),matching_run.begin_run(uuid,uuid,uuid,text,text),matching_run.stage_run(uuid,uuid,uuid,jsonb),matching_run.complete_run(uuid,uuid,uuid,jsonb,uuid[]),matching_run.fail_run(uuid,uuid,uuid,text),matching_run.abandon_run(uuid,text),matching_run.list_round_runs(uuid),matching_run.get_run(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION matching_run.begin_run(uuid,uuid,uuid,text,text),matching_run.stage_run(uuid,uuid,uuid,jsonb),matching_run.complete_run(uuid,uuid,uuid,jsonb,uuid[]),matching_run.fail_run(uuid,uuid,uuid,text),matching_run.get_run(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION matching_run.abandon_run(uuid,text),matching_run.list_round_runs(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_begin_matching_run(uuid,uuid,uuid,text,text),public.admin_stage_matching_run(uuid,uuid,uuid,jsonb),public.admin_complete_matching_run(uuid,uuid,uuid,jsonb,uuid[]),public.admin_fail_matching_run(uuid,uuid,uuid,text),public.admin_abandon_matching_run(uuid,text),public.admin_list_round_matching_runs(uuid),public.admin_get_matching_run(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_begin_matching_run(uuid,uuid,uuid,text,text),public.admin_stage_matching_run(uuid,uuid,uuid,jsonb),public.admin_complete_matching_run(uuid,uuid,uuid,jsonb,uuid[]),public.admin_fail_matching_run(uuid,uuid,uuid,text),public.admin_get_matching_run(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_abandon_matching_run(uuid,text),public.admin_list_round_matching_runs(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
