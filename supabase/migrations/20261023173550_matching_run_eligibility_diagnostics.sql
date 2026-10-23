-- Read-only eligibility summaries and frozen, evidence-based unmatched diagnostics.
-- No questionnaire, candidate rule, matching score or historical result is changed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));
DO $migration$
BEGIN
 IF md5((SELECT prosrc FROM pg_proc WHERE oid='matching_run.job_metadata(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '5aa20d577c08553a58afb381b421ab05'
 OR md5((SELECT prosrc FROM pg_proc WHERE oid='matching_run.complete_run(uuid,uuid,uuid,jsonb,uuid[])'::regprocedure)) IS DISTINCT FROM '98b3fe8e5d8f0ce03aef74b088d7d2d0' THEN
  RAISE EXCEPTION 'MATCH_RUN_DIAGNOSTIC_BASELINE_CHANGED';
 END IF;
END;
$migration$;

CREATE FUNCTION matching_run.eligibility_summary(p_source jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 SELECT CASE WHEN p_source IS NULL THEN NULL ELSE jsonb_build_object(
  'round_id',p_source#>'{round,id}',
  'submitted_count',jsonb_array_length(p_source->'submissions'),
  'eligible_count',(SELECT count(*) FROM jsonb_array_elements(p_source->'eligibility') e WHERE (e->>'eligible')::boolean),
  'excluded_count',(SELECT count(*) FROM jsonb_array_elements(p_source->'eligibility') e WHERE NOT (e->>'eligible')::boolean),
  'exclusion_summary',COALESCE((SELECT jsonb_agg(jsonb_build_object('reason',reason,'count',count) ORDER BY reason) FROM (
   SELECT reason,count(*) FROM jsonb_array_elements(p_source->'eligibility') e
   CROSS JOIN LATERAL jsonb_array_elements_text(e->'reasons') reason WHERE NOT (e->>'eligible')::boolean GROUP BY reason
  ) counts),'[]'::jsonb)
 ) END
$function$;

CREATE FUNCTION matching_run.preflight_eligibility(p_round_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 IF NOT EXISTS(SELECT 1 FROM public.match_rounds WHERE id=p_round_id AND purpose='matching' AND deleted_at IS NULL) THEN
  RAISE EXCEPTION 'MATCH_RUN_ROUND_UNAVAILABLE' USING ERRCODE='PT409';
 END IF;
 RETURN matching_run.eligibility_summary(matching_run.source(p_round_id))||jsonb_build_object('checked_at',statement_timestamp());
END;
$function$;

CREATE FUNCTION public.admin_get_matching_eligibility_summary(p_round_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT matching_run.preflight_eligibility(p_round_id,p_actor_admin_id)
$function$;

CREATE OR REPLACE FUNCTION matching_run.job_metadata(p_run_id uuid,p_viewer_admin_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT jsonb_build_object(
  'id',j.id,'round_id',j.round_id,'batch_number',j.batch_number,'actor_admin_id',j.actor_admin_id,
  'session_name',j.session_name,'reason',j.reason,'last_attempt_reason',j.last_attempt_reason,'status',j.status,'attempt',j.attempt,
  'created_at',j.created_at,'started_at',j.started_at,'updated_at',j.updated_at,'completed_at',j.completed_at,
  'lease_expires_at',j.lease_expires_at,'lease_expired',j.status='running' AND j.lease_expires_at<=clock_timestamp(),
  'captured_at',j.captured_at,'submitted_count',j.submitted_count,'eligible_count',j.eligible_count,'excluded_count',j.excluded_count,
  'counts_available',snap.id IS NOT NULL,
  'exclusion_summary',matching_run.eligibility_summary(snap.source)->'exclusion_summary',
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

CREATE OR REPLACE FUNCTION matching_run.complete_run_v2(p_run_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_rows jsonb,p_unmatched_ids uuid[],p_diagnostics jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_job matching_run.jobs%ROWTYPE; v_snapshot matching_run.snapshots%ROWTYPE; v_round public.match_rounds%ROWTYPE;
 v_session_id uuid; v_expected_status text; v_ids uuid[]; v_matched_ids uuid[]; v_partition uuid[]; v_row record; v_members uuid[]; v_total integer; v_matched integer; v_round_id uuid; v_diag jsonb; v_diag_ids uuid[]; v_key text; v_value numeric;
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
 -- Only persist diagnostics for exactly the frozen run's unmatched cohort.
 IF jsonb_typeof(p_diagnostics) IS DISTINCT FROM 'array' OR jsonb_array_length(p_diagnostics)<>cardinality(p_unmatched_ids) THEN
  RAISE EXCEPTION 'MATCH_RUN_DIAGNOSTICS_INVALID' USING ERRCODE='22023';
 END IF;
 v_diag_ids:='{}'::uuid[];
 FOR v_diag IN SELECT value FROM jsonb_array_elements(p_diagnostics) LOOP
  IF jsonb_typeof(v_diag) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_diag) key WHERE key NOT IN('member_id','reason','details'))
   OR jsonb_typeof(v_diag->'member_id') IS DISTINCT FROM 'string' OR (v_diag->>'member_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   OR jsonb_typeof(v_diag->'details') IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'MATCH_RUN_DIAGNOSTICS_INVALID' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_diag->'details') key WHERE key NOT IN('version','code','cohort_size','shared_time_peer_count','feasible_duo_count','multi_max_shared_peer_count','search_mode'))
   OR v_diag#>>'{details,version}' IS DISTINCT FROM 'matching_diagnostic:1'
   OR v_diag#>>'{details,code}' IS NULL OR v_diag#>>'{details,code}' NOT IN('no_common_time','no_feasible_combination','not_selected')
   OR v_diag->>'reason' IS DISTINCT FROM v_diag#>>'{details,code}'
   OR v_diag#>>'{details,search_mode}' IS DISTINCT FROM (CASE WHEN v_total<=18 THEN 'exhaustive' ELSE 'bounded' END) THEN
   RAISE EXCEPTION 'MATCH_RUN_DIAGNOSTICS_INVALID' USING ERRCODE='22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['cohort_size','shared_time_peer_count','feasible_duo_count','multi_max_shared_peer_count'] LOOP
   IF jsonb_typeof(v_diag->'details'->v_key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'MATCH_RUN_DIAGNOSTICS_INVALID' USING ERRCODE='22023'; END IF;
   v_value:=(v_diag->'details'->>v_key)::numeric;
   IF v_value<>trunc(v_value) OR (v_key='cohort_size' AND v_value<>v_total)
    OR (v_key<>'cohort_size' AND (v_value<0 OR v_value>=v_total)) THEN
    RAISE EXCEPTION 'MATCH_RUN_DIAGNOSTICS_INVALID' USING ERRCODE='22023';
   END IF;
  END LOOP;
  -- These counts are computed by the trusted server against the frozen cohort.
  -- Also reject internally contradictory explanations before any plan is saved.
  IF (v_diag#>>'{details,feasible_duo_count}')::integer>(v_diag#>>'{details,shared_time_peer_count}')::integer
   OR (v_diag#>>'{details,multi_max_shared_peer_count}')::integer>(v_diag#>>'{details,shared_time_peer_count}')::integer
   OR v_diag#>>'{details,code}' IS DISTINCT FROM (CASE
    WHEN (v_diag#>>'{details,shared_time_peer_count}')::integer=0 THEN 'no_common_time'
    WHEN (v_diag#>>'{details,feasible_duo_count}')::integer=0 AND (v_diag#>>'{details,multi_max_shared_peer_count}')::integer<2 THEN 'no_feasible_combination'
    ELSE 'not_selected' END) THEN
   RAISE EXCEPTION 'MATCH_RUN_DIAGNOSTICS_INVALID' USING ERRCODE='22023';
  END IF;
  v_diag_ids:=v_diag_ids||(v_diag->>'member_id')::uuid;
 END LOOP;
 IF cardinality(v_diag_ids)<>(SELECT count(DISTINCT id) FROM unnest(v_diag_ids) ids(id))
  OR NOT v_diag_ids @> p_unmatched_ids OR NOT p_unmatched_ids @> v_diag_ids THEN
  RAISE EXCEPTION 'MATCH_RUN_DIAGNOSTICS_COHORT_MISMATCH' USING ERRCODE='22023';
 END IF;

 PERFORM set_config('app.member_master_audit_reason',v_job.last_attempt_reason,true);
 INSERT INTO public.match_sessions(session_name,round_id,algorithm,config,input_snapshot_required,total_candidates,total_matched,total_unmatched,created_by,audit_reason)
 VALUES(v_job.session_name,v_job.round_id,'max_coverage_split',matching_run.public_config(v_snapshot.engine_input->'config'),true,v_total,v_matched,v_total-v_matched,p_actor_admin_id,v_job.last_attempt_reason)
 RETURNING id INTO v_session_id;
 PERFORM matching_run.seal(v_snapshot.id,v_session_id,p_actor_admin_id,v_snapshot.engine_input);
 INSERT INTO public.match_results(session_id,member_a_id,member_b_id,group_members,total_score,score_breakdown,rank,best_slot,audit_reason)
 SELECT v_session_id,member_a_id,member_b_id,group_members,total_score,score_breakdown,rank,best_slot,v_job.last_attempt_reason
 FROM jsonb_to_recordset(p_rows) AS output(member_a_id uuid,member_b_id uuid,group_members uuid[],total_score numeric,score_breakdown jsonb,rank integer,best_slot text);
 INSERT INTO public.unmatched_diagnostics(session_id,member_id,reason,details,audit_reason)
 SELECT v_session_id,(d->>'member_id')::uuid,d->>'reason',d->'details',v_job.last_attempt_reason FROM jsonb_array_elements(p_diagnostics) d;
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

CREATE FUNCTION public.admin_complete_matching_run_v2(p_run_id uuid,p_actor_admin_id uuid,p_lease_token uuid,p_rows jsonb,p_unmatched_ids uuid[],p_diagnostics jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT matching_run.complete_run_v2(p_run_id,p_actor_admin_id,p_lease_token,p_rows,p_unmatched_ids,p_diagnostics)
$function$;
REVOKE ALL ON FUNCTION matching_run.eligibility_summary(jsonb),matching_run.preflight_eligibility(uuid,uuid),matching_run.complete_run_v2(uuid,uuid,uuid,jsonb,uuid[],jsonb),public.admin_get_matching_eligibility_summary(uuid,uuid),public.admin_complete_matching_run_v2(uuid,uuid,uuid,jsonb,uuid[],jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION matching_run.preflight_eligibility(uuid,uuid),matching_run.complete_run_v2(uuid,uuid,uuid,jsonb,uuid[],jsonb),public.admin_get_matching_eligibility_summary(uuid,uuid),public.admin_complete_matching_run_v2(uuid,uuid,uuid,jsonb,uuid[],jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
