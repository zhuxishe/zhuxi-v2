-- A draft board is one atomic edit. Algorithm, scoring and publication remain unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));
CREATE SCHEMA matching_board;
REVOKE ALL ON SCHEMA matching_board FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA matching_board TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA matching_board REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE matching_board.state (
 session_id uuid PRIMARY KEY REFERENCES public.match_sessions(id) ON DELETE CASCADE,
 layout jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE matching_board.operations (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES public.match_sessions(id) ON DELETE CASCADE,
 actor_admin_id uuid NOT NULL,
 request_hash text NOT NULL,
 payload_hash text NOT NULL,
 base_revision text NOT NULL,
 result_revision text NOT NULL,
 member_ids uuid[] NOT NULL,
 subject_ids uuid[] NOT NULL,
 source jsonb,
 engine_input jsonb,
 result_ids uuid[] NOT NULL,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 redacted_at timestamptz
);
CREATE INDEX matching_board_operation_session ON matching_board.operations(session_id,created_at DESC);
CREATE INDEX matching_board_operation_members ON matching_board.operations USING gin(subject_ids);
ALTER TABLE matching_board.state ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_board.operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA matching_board FROM PUBLIC,anon,authenticated,service_role;

-- Original run candidates plus people explicitly added to this session by older
-- manual operations. A new submission alone never joins this board's cohort.
CREATE FUNCTION matching_board.cohort_ids(p_session_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT COALESCE(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) FROM (
  SELECT (c->>'submissionId')::uuid id FROM matching_run.snapshots s
   CROSS JOIN LATERAL jsonb_array_elements(s.engine_input->'candidates') c WHERE s.session_id=p_session_id
  UNION SELECT member_id FROM public.match_results r
   CROSS JOIN LATERAL unnest(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)) ids(member_id) WHERE r.session_id=p_session_id
  UNION SELECT member_id FROM public.unmatched_diagnostics WHERE session_id=p_session_id
 ) members WHERE id IS NOT NULL
$function$;

CREATE FUNCTION matching_board.current_layout(p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 WITH existing AS (SELECT COALESCE((SELECT layout FROM matching_board.state WHERE session_id=p_session_id),'{"waitingDuoIds":[],"brokenPairs":[]}'::jsonb) value),
 waiting AS (SELECT entries.item FROM existing,LATERAL jsonb_array_elements(existing.value->'waitingDuoIds') entries(item)
  WHERE NOT EXISTS(SELECT 1 FROM public.match_results r WHERE r.session_id=p_session_id AND r.status<>'cancelled'
   AND (entries.item#>>'{}')::uuid=ANY(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)))
  AND EXISTS(SELECT 1 FROM public.members m WHERE m.id=(entries.item#>>'{}')::uuid AND m.anonymized_at IS NULL)),
 broken AS (SELECT b FROM existing,LATERAL jsonb_array_elements(existing.value->'brokenPairs') b
  WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'memberIds') id WHERE NOT EXISTS(SELECT 1 FROM waiting WHERE item=id)))
 SELECT jsonb_build_object('waitingDuoIds',COALESCE((SELECT jsonb_agg(item) FROM waiting),'[]'::jsonb),
  'brokenPairs',COALESCE((SELECT jsonb_agg(b) FROM broken),'[]'::jsonb))
$function$;

-- STABLE gives source, results, layout and token the same SQL statement snapshot.
CREATE FUNCTION matching_board.capture(p_session_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_session public.match_sessions%ROWTYPE; v_ids uuid[]; v_source jsonb; v_layout jsonb; v_results jsonb; v_revision text;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id;
 IF v_session.id IS NULL OR v_session.round_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.match_rounds WHERE id=v_session.round_id AND purpose='matching' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'MATCH_BOARD_SESSION_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
 IF NOT v_session.results_ready THEN RAISE EXCEPTION 'MATCH_BOARD_REQUIRES_READY' USING ERRCODE='PT409'; END IF;
 v_ids:=matching_board.cohort_ids(p_session_id);
 v_source:=matching_adjustment.scoped_source(matching_run.source_v3(v_session.round_id),v_ids);
 v_layout:=matching_board.current_layout(p_session_id);
 SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.rank,r.id),'[]'::jsonb) INTO v_results FROM public.match_results r WHERE r.session_id=p_session_id AND r.status<>'cancelled';
 v_revision:=md5(jsonb_build_object('session',matching_adjustment.revision(p_session_id),'cohort',v_ids,'layout',v_layout,
  'source',v_source)::text);
 RETURN jsonb_build_object('session_id',p_session_id,'round_id',v_session.round_id,'session_status',v_session.status,
  'base_revision',v_revision,'cohort_member_ids',v_ids,'results',v_results,'layout',v_layout,'read_only',v_session.status<>'draft',
  'operations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'created_at',o.created_at,'member_count',cardinality(o.member_ids),'result_count',cardinality(o.result_ids)) ORDER BY o.created_at DESC,o.id)
   FROM (SELECT * FROM matching_board.operations WHERE session_id=p_session_id ORDER BY created_at DESC,id LIMIT 50) o),'[]'::jsonb),
  'capture',jsonb_build_object('snapshot_id',gen_random_uuid(),'captured_at',statement_timestamp(),'source',v_source));
END;
$function$;

CREATE FUNCTION matching_board.receipt(p_operation_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_op matching_board.operations%ROWTYPE;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 SELECT * INTO v_op FROM matching_board.operations WHERE id=p_operation_id AND actor_admin_id=p_actor_admin_id;
 IF v_op.id IS NULL THEN RETURN NULL; END IF;
 IF v_op.redacted_at IS NOT NULL THEN RAISE EXCEPTION 'MATCH_BOARD_REDACTED' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('session_id',v_op.session_id,'operation_id',v_op.id,'request_hash',v_op.request_hash,
  'already_applied',true,'base_revision',v_op.result_revision,'result_ids',v_op.result_ids);
END;
$function$;

CREATE FUNCTION matching_board.save(p_session_id uuid,p_actor_admin_id uuid,p_operation_id uuid,p_reason text,p_expected_revision text,
 p_engine jsonb,p_keep_result_ids uuid[],p_rows jsonb,p_layout jsonb,p_unmatched_ids uuid[],p_request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_session public.match_sessions%ROWTYPE; v_round uuid; v_op matching_board.operations%ROWTYPE; v_capture jsonb; v_source jsonb;
 v_hash text; v_ids uuid[]; v_subjects uuid[]; v_eligible uuid[]; v_engine_ids uuid[]; v_keep_ids uuid[]; v_matched uuid[]; v_partition uuid[]; v_waiting uuid[]; v_broken uuid[]:='{}';
 v_pair jsonb; v_keep_rows jsonb; v_pair_ids uuid[]; v_multi boolean; v_row jsonb; v_result uuid; v_result_ids uuid[]:='{}'; v_revision text;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 IF p_operation_id IS NULL OR char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 4 AND 500
  OR p_expected_revision IS NULL OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$'
  OR p_keep_result_ids IS NULL OR array_position(p_keep_result_ids,NULL) IS NOT NULL
  OR cardinality(p_keep_result_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_keep_result_ids) ids(id))
  OR p_unmatched_ids IS NULL OR array_position(p_unmatched_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'MATCH_BOARD_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 v_hash:=md5(jsonb_build_object('session',p_session_id,'actor',p_actor_admin_id,'reason',btrim(p_reason),'revision',p_expected_revision,
  'engine',p_engine,'keep',p_keep_result_ids,'rows',p_rows,'layout',p_layout,'unmatched',p_unmatched_ids,'request',p_request_hash)::text);
 -- This also serializes a repeated operation ID accidentally used on two boards.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('matching-board-operation:'||p_operation_id::text,0)) THEN RAISE EXCEPTION 'MATCH_BOARD_BUSY' USING ERRCODE='PT409'; END IF;
 SELECT * INTO v_op FROM matching_board.operations WHERE id=p_operation_id;
 IF v_op.id IS NOT NULL THEN
  IF v_op.actor_admin_id<>p_actor_admin_id OR v_op.session_id<>p_session_id OR v_op.payload_hash<>v_hash THEN RAISE EXCEPTION 'MATCH_BOARD_REQUEST_CONFLICT' USING ERRCODE='PT409'; END IF;
  RETURN matching_board.receipt(p_operation_id,p_actor_admin_id);
 END IF;
 SELECT round_id INTO v_round FROM public.match_sessions WHERE id=p_session_id;
 IF v_round IS NULL THEN RAISE EXCEPTION 'MATCH_BOARD_SESSION_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('matching-run-job:'||v_round::text,0))
  OR NOT pg_try_advisory_xact_lock(hashtextextended('matching-adjustment:'||p_session_id::text,0)) THEN RAISE EXCEPTION 'MATCH_BOARD_BUSY' USING ERRCODE='PT409'; END IF;
 v_ids:=matching_board.cohort_ids(p_session_id);
 v_capture:=matching_board.capture(p_session_id,p_actor_admin_id);
 v_subjects:=matching_run.subject_ids(v_capture#>'{capture,source}')||v_ids;
 BEGIN
  -- UPDATE conflicts with profile and relationship writers' canonical KEY SHARE
  -- locks; NOWAIT avoids reverse-order deadlocks with older admin operations.
  PERFORM 1 FROM public.members WHERE id=ANY(v_subjects) ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.match_rounds WHERE id=v_round FOR UPDATE NOWAIT;
  SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'MATCH_BOARD_BUSY' USING ERRCODE='PT409'; END;
 IF EXISTS(SELECT 1 FROM matching_adjustment.operations WHERE session_id=p_session_id AND status='running' AND lease_expires_at>clock_timestamp())
  OR EXISTS(SELECT 1 FROM matching_run.jobs WHERE round_id=v_round AND status='running' AND lease_expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'MATCH_BOARD_BUSY' USING ERRCODE='PT409'; END IF;
 IF v_session.status<>'draft' OR NOT v_session.results_ready THEN RAISE EXCEPTION 'MATCH_BOARD_REQUIRES_DRAFT' USING ERRCODE='PT409'; END IF;
 v_capture:=matching_board.capture(p_session_id,p_actor_admin_id);
 IF p_expected_revision IS DISTINCT FROM v_capture->>'base_revision' THEN RAISE EXCEPTION 'MATCH_BOARD_STALE' USING ERRCODE='PT409'; END IF;
 v_source:=v_capture#>'{capture,source}';
 v_ids:=matching_board.cohort_ids(p_session_id);
 IF jsonb_typeof(p_engine) IS DISTINCT FROM 'object' OR jsonb_typeof(p_engine->'candidates') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_engine->'idMap') IS DISTINCT FROM 'array' OR jsonb_typeof(p_engine->'pairRelations') IS DISTINCT FROM 'array'
  OR NOT matching_run.engine_matches_source(v_source,p_engine) THEN RAISE EXCEPTION 'MATCH_BOARD_ENGINE_INVALID' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg((e->>'member_id')::uuid ORDER BY ord),'{}') INTO v_eligible FROM jsonb_array_elements(v_source->'eligibility') WITH ORDINALITY t(e,ord) WHERE (e->>'eligible')::boolean;
 SELECT COALESCE(array_agg((c->>'submissionId')::uuid ORDER BY ord),'{}') INTO v_engine_ids FROM jsonb_array_elements(p_engine->'candidates') WITH ORDINALITY t(c,ord);
 IF v_engine_ids IS DISTINCT FROM v_eligible OR cardinality(v_engine_ids)<>(SELECT count(DISTINCT id) FROM unnest(v_engine_ids) ids(id))
  OR jsonb_array_length(p_engine->'idMap')<>cardinality(v_engine_ids)
  OR (SELECT count(DISTINCT m->>0) FROM jsonb_array_elements(p_engine->'idMap') m)<>cardinality(v_engine_ids)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_engine->'idMap') m WHERE jsonb_typeof(m) IS DISTINCT FROM 'array' OR jsonb_array_length(m)<>2 OR m->>0 IS DISTINCT FROM m->>1 OR NOT (m->>0)::uuid=ANY(v_engine_ids)) THEN RAISE EXCEPTION 'MATCH_BOARD_COHORT_MISMATCH' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_keep_result_ids) ids(id) WHERE NOT EXISTS(SELECT 1 FROM public.match_results r WHERE r.id=ids.id AND r.session_id=p_session_id AND r.status<>'cancelled')) THEN RAISE EXCEPTION 'MATCH_BOARD_RESULT_CHANGED' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM public.match_results WHERE session_id=p_session_id AND status='locked' AND NOT id=ANY(p_keep_result_ids)) THEN RAISE EXCEPTION 'MATCH_BOARD_LOCKED' USING ERRCODE='PT409'; END IF;
 SELECT COALESCE(array_agg(member_id),'{}') INTO v_keep_ids FROM public.match_results r CROSS JOIN LATERAL unnest(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)) ids(member_id) WHERE r.id=ANY(p_keep_result_ids);
 IF (SELECT count(*) FROM public.match_results WHERE id=ANY(p_keep_result_ids) AND member_b_id IS NULL)>1 THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_SECOND_MULTI_POOL' USING ERRCODE='PT409'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.match_results WHERE id=ANY(p_keep_result_ids) AND member_b_id IS NULL) INTO v_multi;
 v_matched:=v_keep_ids||matching_adjustment.validate_rows(p_engine,p_rows,NOT v_multi);
 IF EXISTS(SELECT 1 FROM public.match_results old_pool CROSS JOIN LATERAL jsonb_array_elements(p_rows) new_pool
  WHERE old_pool.session_id=p_session_id AND old_pool.status<>'cancelled' AND old_pool.member_b_id IS NULL AND new_pool->>'member_b_id' IS NULL
   AND old_pool.group_members&&ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(new_pool->'group_members'))
   AND replace(old_pool.best_slot,' ','_') IS DISTINCT FROM replace(new_pool->>'best_slot',' ','_')) THEN
  RAISE EXCEPTION 'MATCH_BOARD_MULTI_TIME_CHANGED' USING ERRCODE='PT409';
 END IF;
 IF NOT v_eligible @> v_matched THEN RAISE EXCEPTION 'MATCH_BOARD_MEMBER_INELIGIBLE' USING ERRCODE='PT409'; END IF;
 -- Validate preserved members and their original time against current hard
 -- rules without interpreting historical scores or updating their stored rows.
 SELECT COALESCE(jsonb_agg(jsonb_build_object('member_a_id',r.member_a_id,'member_b_id',r.member_b_id,'group_members',r.group_members,
  'best_slot',r.best_slot,'total_score',0,'rank',1,'score_breakdown',CASE WHEN r.member_b_id IS NOT NULL THEN '[]'::jsonb
   ELSE '{"kind":"multi_pool","version":"weighted_feedback:1","factors":[]}'::jsonb END) ORDER BY r.id),'[]'::jsonb)
 INTO v_keep_rows FROM public.match_results r WHERE id=ANY(p_keep_result_ids);
 PERFORM matching_adjustment.validate_rows(p_engine,v_keep_rows,true);
 v_partition:=v_matched||p_unmatched_ids;
 IF cardinality(v_partition)<>cardinality(v_ids) OR cardinality(v_partition)<>(SELECT count(DISTINCT id) FROM unnest(v_partition) ids(id))
  OR NOT v_partition @> v_ids OR NOT v_ids @> v_partition THEN RAISE EXCEPTION 'MATCH_BOARD_COHORT_MISMATCH' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_layout) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_layout) key WHERE key NOT IN('waitingDuoIds','brokenPairs'))
  OR jsonb_typeof(p_layout->'waitingDuoIds') IS DISTINCT FROM 'array' OR jsonb_typeof(p_layout->'brokenPairs') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'MATCH_BOARD_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg(value::uuid),'{}') INTO v_waiting FROM jsonb_array_elements_text(p_layout->'waitingDuoIds');
 IF array_position(v_waiting,NULL) IS NOT NULL OR cardinality(v_waiting)<>(SELECT count(DISTINCT id) FROM unnest(v_waiting) ids(id)) OR NOT p_unmatched_ids @> v_waiting THEN RAISE EXCEPTION 'MATCH_BOARD_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
 FOR v_pair IN SELECT value FROM jsonb_array_elements(p_layout->'brokenPairs') LOOP
  IF jsonb_typeof(v_pair) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_pair) key WHERE key NOT IN('key','memberIds'))
   OR (v_pair ? 'key' AND (jsonb_typeof(v_pair->'key') IS DISTINCT FROM 'string' OR char_length(v_pair->>'key')>200))
   OR jsonb_typeof(v_pair->'memberIds') IS DISTINCT FROM 'array' OR jsonb_array_length(v_pair->'memberIds')<>2 THEN RAISE EXCEPTION 'MATCH_BOARD_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT array_agg(value::uuid) INTO v_pair_ids FROM jsonb_array_elements_text(v_pair->'memberIds');
  IF array_position(v_pair_ids,NULL) IS NOT NULL OR v_pair_ids[1]=v_pair_ids[2] OR NOT v_waiting @> v_pair_ids OR v_broken&&v_pair_ids THEN RAISE EXCEPTION 'MATCH_BOARD_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
  v_broken:=v_broken||v_pair_ids;
 END LOOP;
 PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
 UPDATE public.match_results SET status='cancelled',audit_reason=btrim(p_reason)
  WHERE session_id=p_session_id AND status<>'cancelled' AND NOT id=ANY(p_keep_result_ids);
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  INSERT INTO public.match_results(session_id,member_a_id,member_b_id,group_members,total_score,score_breakdown,rank,best_slot,status,audit_reason)
  VALUES(p_session_id,(v_row->>'member_a_id')::uuid,(v_row->>'member_b_id')::uuid,
   CASE WHEN v_row->'group_members' IS NULL OR v_row->'group_members'='null'::jsonb THEN NULL ELSE ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_row->'group_members')) END,
   (v_row->>'total_score')::numeric,v_row->'score_breakdown',COALESCE((SELECT max(rank) FROM public.match_results WHERE session_id=p_session_id),0)+1,v_row->>'best_slot','draft',btrim(p_reason)) RETURNING id INTO v_result;
  v_result_ids:=v_result_ids||v_result;
 END LOOP;
 -- Preserve explanations for untouched unmatched members. New manual unmatches
 -- receive an honest manual-adjustment reason, never an invented algorithm cause.
 DELETE FROM public.unmatched_diagnostics WHERE session_id=p_session_id AND NOT member_id=ANY(p_unmatched_ids);
 INSERT INTO public.unmatched_diagnostics(session_id,member_id,reason,details,audit_reason)
 SELECT p_session_id,id,'unmatched_after_all_stages','{"stage":"manual_board"}'::jsonb,btrim(p_reason) FROM unnest(p_unmatched_ids) ids(id)
 WHERE NOT EXISTS(SELECT 1 FROM public.unmatched_diagnostics d WHERE d.session_id=p_session_id AND d.member_id=ids.id);
 UPDATE public.match_sessions SET total_candidates=cardinality(v_ids),total_matched=cardinality(v_matched),total_unmatched=cardinality(p_unmatched_ids),audit_reason=btrim(p_reason) WHERE id=p_session_id;
 INSERT INTO matching_board.state(session_id,layout) VALUES(p_session_id,p_layout) ON CONFLICT(session_id) DO UPDATE SET layout=excluded.layout,updated_at=clock_timestamp();
 PERFORM matching_publication.assert_complete(p_session_id);
 v_revision:=matching_board.capture(p_session_id,p_actor_admin_id)->>'base_revision';
 INSERT INTO matching_board.operations(id,session_id,actor_admin_id,request_hash,payload_hash,base_revision,result_revision,member_ids,subject_ids,source,engine_input,result_ids,reason)
 VALUES(p_operation_id,p_session_id,p_actor_admin_id,p_request_hash,v_hash,p_expected_revision,v_revision,v_ids,matching_run.subject_ids(v_source),v_source,p_engine,p_keep_result_ids||v_result_ids,btrim(p_reason));
 RETURN matching_board.receipt(p_operation_id,p_actor_admin_id)||jsonb_build_object('already_applied',false);
END;
$function$;

CREATE FUNCTION matching_board.erase_anonymized()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN
  UPDATE matching_board.state s SET layout='{"waitingDuoIds":[],"brokenPairs":[]}'::jsonb,updated_at=clock_timestamp()
   WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(s.layout->'waitingDuoIds') id WHERE id::uuid=NEW.id);
  UPDATE matching_board.operations SET member_ids='{}',subject_ids='{}',source=NULL,engine_input=NULL,reason='隐私处理已清除',payload_hash='privacy-redacted',request_hash='privacy-redacted',
   base_revision='privacy-redacted',result_revision='privacy-redacted',redacted_at=clock_timestamp() WHERE redacted_at IS NULL AND (NEW.id=ANY(subject_ids) OR NEW.id=ANY(member_ids));
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_board_member_erasure AFTER UPDATE OF anonymized_at ON public.members FOR EACH ROW EXECUTE FUNCTION matching_board.erase_anonymized();
CREATE FUNCTION public.admin_get_matching_board(p_session_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_board.capture(p_session_id,p_actor_admin_id) $function$;
CREATE FUNCTION public.admin_get_matching_board_operation(p_operation_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_board.receipt(p_operation_id,p_actor_admin_id) $function$;
CREATE FUNCTION public.admin_save_matching_board(p_session_id uuid,p_actor_admin_id uuid,p_operation_id uuid,p_reason text,p_expected_revision text,
 p_engine jsonb,p_keep_result_ids uuid[],p_rows jsonb,p_layout jsonb,p_unmatched_ids uuid[],p_request_hash text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_board.save(p_session_id,p_actor_admin_id,p_operation_id,p_reason,p_expected_revision,p_engine,p_keep_result_ids,p_rows,p_layout,p_unmatched_ids,p_request_hash) $function$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA matching_board FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION matching_board.capture(uuid,uuid),matching_board.receipt(uuid,uuid),matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_get_matching_board(uuid,uuid),public.admin_get_matching_board_operation(uuid,uuid),public.admin_save_matching_board(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_matching_board(uuid,uuid),public.admin_get_matching_board_operation(uuid,uuid),public.admin_save_matching_board(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
