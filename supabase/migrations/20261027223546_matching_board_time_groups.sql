-- Manual multiplayer groups remain separate from the automatic single-pool policy.
-- No existing match, publication, questionnaire, or notification is rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));

-- Fail closed if another release has changed a function being replaced in full.
DO $dependency$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure) IS DISTINCT FROM 'e20b338b22334d28c27ee8cb56669a1b' THEN RAISE EXCEPTION 'MATCH_GROUP_DEPENDENCY_CHANGED: matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='matching_board.current_layout(uuid)'::regprocedure) IS DISTINCT FROM '3b1e613dfa7e59e5018729c437e9f940' THEN RAISE EXCEPTION 'MATCH_GROUP_DEPENDENCY_CHANGED: matching_board.current_layout(uuid)'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='matching_adjustment.revision(uuid)'::regprocedure) IS DISTINCT FROM '8cd6b0fd9fc70bc00157697c5ef8c393' THEN RAISE EXCEPTION 'MATCH_GROUP_DEPENDENCY_CHANGED: matching_adjustment.revision(uuid)'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='matching_board.erase_anonymized()'::regprocedure) IS DISTINCT FROM '97f7e2294290c2c92d99aad5e1d06efb' THEN RAISE EXCEPTION 'MATCH_GROUP_DEPENDENCY_CHANGED: matching_board.erase_anonymized()'; END IF;
END;
$dependency$;

-- Reuse every existing hard check on each row, then enforce cross-row uniqueness.
-- The old validator remains unchanged for the automatic and legacy manual routes.
CREATE FUNCTION matching_board.validate_group_rows(p_engine jsonb,p_rows jsonb)
RETURNS uuid[] LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE row jsonb; ids uuid[]; seen uuid[]:='{}';
BEGIN
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'MATCH_BOARD_OUTPUT_INVALID' USING ERRCODE='22023'; END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  ids:=matching_adjustment.validate_rows(p_engine,jsonb_build_array(row),true);
  IF seen&&ids THEN RAISE EXCEPTION 'MATCH_BOARD_COHORT_MISMATCH' USING ERRCODE='22023'; END IF;
  seen:=seen||ids;
 END LOOP;
 RETURN seen;
END;
$function$;

-- A waiting pool is not an actual result: 1-2 people may be saved, and removing
-- a person must not require complete gender preference satisfaction among those
-- still waiting. Ingress is checked by the server; shared time and relationship
-- vetoes remain authoritative here, regardless of pool size.
CREATE FUNCTION matching_board.validate_waiting_multi(p_engine jsonb,p_ids uuid[],p_slot text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE a jsonb; b jsonb; id uuid;
BEGIN
 IF cardinality(p_ids)=0 THEN RETURN; END IF;
 IF NOT matching_adjustment.valid_slot(p_engine,p_ids,p_slot) THEN RAISE EXCEPTION 'MATCH_BOARD_MULTI_TIME_INVALID' USING ERRCODE='PT409'; END IF;
 FOREACH id IN ARRAY p_ids LOOP
  SELECT c INTO a FROM jsonb_array_elements(p_engine->'candidates') c WHERE (c->>'submissionId')::uuid=id;
  IF a IS NULL OR a->>'gameTypePref'='双人' THEN RAISE EXCEPTION 'MATCH_BOARD_MULTI_CONSTRAINT' USING ERRCODE='PT409'; END IF;
  FOR b IN SELECT c FROM jsonb_array_elements(p_engine->'candidates') c WHERE (c->>'submissionId')::uuid=ANY(p_ids) AND (c->>'submissionId')::uuid<>id LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p_engine->'pairRelations','[]'::jsonb)) rel WHERE rel->1->>'status' IN('blacklist','cooldown')
    AND ((rel->1->>'playerA'=a->>'submissionId' AND rel->1->>'playerB'=b->>'submissionId') OR (rel->1->>'playerB'=a->>'submissionId' AND rel->1->>'playerA'=b->>'submissionId')))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(a->'tabooTags','[]'::jsonb)) taboo WHERE taboo=ANY(ARRAY(SELECT jsonb_array_elements_text(COALESCE(b->'interestTags','[]'::jsonb)||COALESCE(b->'socialTags','[]'::jsonb))))) THEN RAISE EXCEPTION 'MATCH_BOARD_MULTI_CONSTRAINT' USING ERRCODE='PT409'; END IF;
  END LOOP;
 END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION matching_board.current_layout(p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 WITH existing AS (SELECT COALESCE((SELECT layout FROM matching_board.state WHERE session_id=p_session_id),'{"waitingDuoIds":[],"brokenPairs":[]}'::jsonb) value),
 occupied AS (SELECT member_id FROM public.match_results r CROSS JOIN LATERAL unnest(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)) ids(member_id) WHERE r.session_id=p_session_id AND r.status<>'cancelled'),
 waiting AS (SELECT entries.item FROM existing,LATERAL jsonb_array_elements(existing.value->'waitingDuoIds') entries(item)
  WHERE NOT EXISTS(SELECT 1 FROM occupied WHERE member_id=(entries.item#>>'{}')::uuid)
  AND EXISTS(SELECT 1 FROM public.members m WHERE m.id=(entries.item#>>'{}')::uuid AND m.anonymized_at IS NULL)),
 multi_waiting AS (SELECT entries.item FROM existing,LATERAL jsonb_array_elements(COALESCE(existing.value->'waitingMultiIds','[]'::jsonb)) entries(item)
  WHERE existing.value->>'multiMode'='grouped' AND NOT EXISTS(SELECT 1 FROM occupied WHERE member_id=(entries.item#>>'{}')::uuid)
  AND EXISTS(SELECT 1 FROM public.members m WHERE m.id=(entries.item#>>'{}')::uuid AND m.anonymized_at IS NULL)),
 broken AS (SELECT b FROM existing,LATERAL jsonb_array_elements(existing.value->'brokenPairs') b
  WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'memberIds') id WHERE NOT EXISTS(SELECT 1 FROM waiting WHERE item=id)))
 SELECT jsonb_build_object('waitingDuoIds',COALESCE((SELECT jsonb_agg(item) FROM waiting),'[]'::jsonb),
  'brokenPairs',COALESCE((SELECT jsonb_agg(b) FROM broken),'[]'::jsonb))
  || CASE WHEN value->>'multiMode'='grouped' THEN jsonb_build_object('multiMode','grouped',
   'waitingMultiIds',COALESCE((SELECT jsonb_agg(item) FROM multi_waiting),'[]'::jsonb),
   'multiPoolSlot',CASE WHEN EXISTS(SELECT 1 FROM multi_waiting) THEN value->'multiPoolSlot' ELSE 'null'::jsonb END) ELSE '{}'::jsonb END FROM existing
$function$;

-- Include the layout in all revision-based workers and publication proofs, so a
-- prior legacy worker cannot recover across entry into manual grouping mode.
CREATE OR REPLACE FUNCTION matching_adjustment.revision(p_session_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT md5(jsonb_build_object('session',to_jsonb(s),
  'results',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r WHERE session_id=s.id),'[]'::jsonb),
  'diagnostics',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.unmatched_diagnostics d WHERE session_id=s.id),'[]'::jsonb),
  'member_locks',COALESCE((SELECT jsonb_agg(member_id ORDER BY member_id) FROM matching_board.member_locks WHERE session_id=s.id),'[]'::jsonb),
  'member_lock_revision',(SELECT count(*) FROM matching_board.member_lock_operations WHERE session_id=s.id),
  'board_layout',matching_board.current_layout(s.id))::text)
 FROM public.match_sessions s WHERE s.id=p_session_id
$function$;

CREATE OR REPLACE FUNCTION matching_board.save(p_session_id uuid,p_actor_admin_id uuid,p_operation_id uuid,p_reason text,p_expected_revision text,
 p_engine jsonb,p_keep_result_ids uuid[],p_rows jsonb,p_layout jsonb,p_unmatched_ids uuid[],p_request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_session public.match_sessions%ROWTYPE; v_round uuid; v_op matching_board.operations%ROWTYPE; v_capture jsonb; v_source jsonb;
 v_hash text; v_ids uuid[]; v_subjects uuid[]; v_eligible uuid[]; v_engine_ids uuid[]; v_keep_ids uuid[]; v_matched uuid[]; v_partition uuid[]; v_waiting uuid[]; v_broken uuid[]:='{}';
 v_grouped boolean; v_multi_waiting uuid[]; v_previous_waiting uuid[]; v_previous_slot text;
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
 v_grouped:=COALESCE(p_layout->>'multiMode','')='grouped';
 IF v_capture#>>'{layout,multiMode}'='grouped' AND NOT v_grouped THEN RAISE EXCEPTION 'MATCH_BOARD_GROUPED_REQUIRED' USING ERRCODE='PT409'; END IF;
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
 IF NOT v_grouped AND (SELECT count(*) FROM public.match_results WHERE id=ANY(p_keep_result_ids) AND member_b_id IS NULL)>1 THEN RAISE EXCEPTION 'MATCH_ADJUSTMENT_SECOND_MULTI_POOL' USING ERRCODE='PT409'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.match_results WHERE id=ANY(p_keep_result_ids) AND member_b_id IS NULL) INTO v_multi;
 v_matched:=v_keep_ids||CASE WHEN v_grouped THEN matching_board.validate_group_rows(p_engine,p_rows) ELSE matching_adjustment.validate_rows(p_engine,p_rows,NOT v_multi) END;
 IF NOT v_grouped AND EXISTS(SELECT 1 FROM public.match_results old_pool CROSS JOIN LATERAL jsonb_array_elements(p_rows) new_pool
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
 IF v_grouped THEN PERFORM matching_board.validate_group_rows(p_engine,v_keep_rows); ELSE PERFORM matching_adjustment.validate_rows(p_engine,v_keep_rows,true); END IF;
 v_partition:=v_matched||p_unmatched_ids;
 IF cardinality(v_partition)<>cardinality(v_ids) OR cardinality(v_partition)<>(SELECT count(DISTINCT id) FROM unnest(v_partition) ids(id))
  OR NOT v_partition @> v_ids OR NOT v_ids @> v_partition THEN RAISE EXCEPTION 'MATCH_BOARD_COHORT_MISMATCH' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_layout) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_layout) key WHERE key NOT IN('waitingDuoIds','brokenPairs','multiMode','waitingMultiIds','multiPoolSlot'))
  OR jsonb_typeof(p_layout->'waitingDuoIds') IS DISTINCT FROM 'array' OR jsonb_typeof(p_layout->'brokenPairs') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'MATCH_BOARD_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg(value::uuid),'{}') INTO v_waiting FROM jsonb_array_elements_text(p_layout->'waitingDuoIds');
 IF array_position(v_waiting,NULL) IS NOT NULL OR cardinality(v_waiting)<>(SELECT count(DISTINCT id) FROM unnest(v_waiting) ids(id)) OR NOT p_unmatched_ids @> v_waiting THEN RAISE EXCEPTION 'MATCH_BOARD_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
 IF v_grouped THEN
  IF jsonb_typeof(p_layout->'multiMode') IS DISTINCT FROM 'string' OR jsonb_typeof(p_layout->'waitingMultiIds') IS DISTINCT FROM 'array'
   OR NOT (p_layout ? 'multiPoolSlot') OR (p_layout->'multiPoolSlot'<>'null'::jsonb AND jsonb_typeof(p_layout->'multiPoolSlot') IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'MATCH_BOARD_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(array_agg(value::uuid),'{}') INTO v_multi_waiting FROM jsonb_array_elements_text(p_layout->'waitingMultiIds');
  IF array_position(v_multi_waiting,NULL) IS NOT NULL OR cardinality(v_multi_waiting)<>(SELECT count(DISTINCT id) FROM unnest(v_multi_waiting) ids(id))
   OR NOT p_unmatched_ids @> v_multi_waiting OR v_multi_waiting&&v_waiting THEN RAISE EXCEPTION 'MATCH_BOARD_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
  IF cardinality(v_multi_waiting)=0 AND p_layout->'multiPoolSlot'<>'null'::jsonb THEN RAISE EXCEPTION 'MATCH_BOARD_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM matching_board.validate_waiting_multi(p_engine,v_multi_waiting,p_layout->>'multiPoolSlot');
  IF v_capture#>>'{layout,multiMode}'='grouped' THEN
   SELECT COALESCE(array_agg(value::uuid),'{}') INTO v_previous_waiting FROM jsonb_array_elements_text(v_capture#>'{layout,waitingMultiIds}');
   v_previous_slot:=v_capture#>>'{layout,multiPoolSlot}';
  ELSE
   SELECT group_members,best_slot INTO v_previous_waiting,v_previous_slot FROM public.match_results WHERE session_id=p_session_id AND status<>'cancelled' AND member_b_id IS NULL LIMIT 1;
  END IF;
  IF v_previous_waiting&&v_multi_waiting AND replace(v_previous_slot,' ','_') IS DISTINCT FROM replace(p_layout->>'multiPoolSlot',' ','_') THEN RAISE EXCEPTION 'MATCH_BOARD_MULTI_TIME_CHANGED' USING ERRCODE='PT409'; END IF;
 ELSIF p_layout ?| ARRAY['multiMode','waitingMultiIds','multiPoolSlot'] THEN RAISE EXCEPTION 'MATCH_BOARD_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
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
 PERFORM matching_board.assert_member_locks(p_session_id);
 PERFORM matching_publication.assert_complete(p_session_id);
 v_revision:=matching_board.capture(p_session_id,p_actor_admin_id)->>'base_revision';
 INSERT INTO matching_board.operations(id,session_id,actor_admin_id,request_hash,payload_hash,base_revision,result_revision,member_ids,subject_ids,source,engine_input,result_ids,reason)
 VALUES(p_operation_id,p_session_id,p_actor_admin_id,p_request_hash,v_hash,p_expected_revision,v_revision,v_ids,matching_run.subject_ids(v_source),v_source,p_engine,p_keep_result_ids||v_result_ids,btrim(p_reason));
 RETURN matching_board.receipt(p_operation_id,p_actor_admin_id)||jsonb_build_object('already_applied',false);
END;
$function$;

CREATE FUNCTION matching_board.assert_groups_ready(p_session_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE layout jsonb:=matching_board.current_layout(p_session_id);
BEGIN
 IF layout->>'multiMode'='grouped' AND jsonb_array_length(layout->'waitingMultiIds')>0 THEN
  RAISE EXCEPTION 'MATCH_PUBLICATION_GROUPS_PENDING' USING ERRCODE='PT409';
 END IF;
END;
$function$;

-- Keep publication authorization, idempotent retries and delivery unchanged.
-- The early check gives useful feedback; the final one also prevents bypass via
-- another caller and runs while the publication locks are held.
DO $migration$
DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('matching_publication_preflight.capture(uuid,integer)'::regprocedure);
 anchor:=' PERFORM matching_publication.assert_complete(p_session_id);';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'MATCH_GROUP_PREFLIGHT_DEPENDENCY_CHANGED'; END IF;
 EXECUTE replace(definition,anchor,anchor||E'\n PERFORM matching_board.assert_groups_ready(p_session_id);');
 definition:=pg_get_functiondef('matching_publication.publish_session(uuid,integer,text)'::regprocedure);
 anchor:='  PERFORM matching_publication.assert_complete(p_session_id);';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'MATCH_GROUP_PUBLICATION_DEPENDENCY_CHANGED'; END IF;
 EXECUTE replace(definition,anchor,anchor||E'\n  PERFORM matching_board.assert_groups_ready(p_session_id);');
 -- Legacy manual pool/restore routes do not understand pending group membership.
 -- Existing history and successful retry receipts remain readable.
 definition:=pg_get_functiondef('matching_adjustment.preview(uuid,uuid,text,uuid[],uuid)'::regprocedure);
 anchor:=' PERFORM matching_run.require_server_admin(p_actor_admin_id);';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'MATCH_GROUP_PREVIEW_DEPENDENCY_CHANGED'; END IF;
 EXECUTE replace(definition,anchor,anchor||E'\n IF matching_board.current_layout(p_session_id)->>''multiMode''=''grouped'' THEN RAISE EXCEPTION ''MATCH_ADJUSTMENT_BOARD_GROUPED'' USING ERRCODE=''PT409''; END IF;');
 definition:=pg_get_functiondef('matching_adjustment.begin_operation(uuid,uuid,text,uuid[],uuid,uuid,text,text)'::regprocedure);
 anchor:='  IF v_op.status=''succeeded'' THEN RETURN matching_adjustment.receipt(v_op.id,p_actor_admin_id); END IF;';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'MATCH_GROUP_RECOVERY_DEPENDENCY_CHANGED'; END IF;
 EXECUTE replace(definition,anchor,anchor||E'\n  IF matching_board.current_layout(p_session_id)->>''multiMode''=''grouped'' THEN RAISE EXCEPTION ''MATCH_ADJUSTMENT_BOARD_GROUPED'' USING ERRCODE=''PT409''; END IF;');
END;
$migration$;

CREATE OR REPLACE FUNCTION matching_board.erase_anonymized()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN
  UPDATE matching_board.state s SET layout=s.layout||jsonb_build_object(
   'waitingDuoIds',COALESCE((SELECT jsonb_agg(id) FROM jsonb_array_elements(s.layout->'waitingDuoIds') id WHERE (id#>>'{}')::uuid<>NEW.id),'[]'::jsonb),
   'brokenPairs',COALESCE((SELECT jsonb_agg(pair) FROM jsonb_array_elements(s.layout->'brokenPairs') pair WHERE NOT pair->'memberIds' @> to_jsonb(ARRAY[NEW.id])),'[]'::jsonb))
   || CASE WHEN s.layout->>'multiMode'='grouped' THEN jsonb_build_object(
    'waitingMultiIds',COALESCE((SELECT jsonb_agg(id) FROM jsonb_array_elements(s.layout->'waitingMultiIds') id WHERE (id#>>'{}')::uuid<>NEW.id),'[]'::jsonb),
    'multiPoolSlot',CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements_text(s.layout->'waitingMultiIds') id WHERE id::uuid<>NEW.id) THEN s.layout->'multiPoolSlot' ELSE 'null'::jsonb END) ELSE '{}'::jsonb END,
   updated_at=clock_timestamp()
   WHERE s.layout->'waitingDuoIds' @> to_jsonb(ARRAY[NEW.id]) OR s.layout->'waitingMultiIds' @> to_jsonb(ARRAY[NEW.id]);
  UPDATE matching_board.operations SET member_ids='{}',subject_ids='{}',source=NULL,engine_input=NULL,reason='隐私处理已清除',payload_hash='privacy-redacted',request_hash='privacy-redacted',
   base_revision='privacy-redacted',result_revision='privacy-redacted',redacted_at=clock_timestamp() WHERE redacted_at IS NULL AND (NEW.id=ANY(subject_ids) OR NEW.id=ANY(member_ids));
 END IF;
 RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION matching_board.validate_group_rows(jsonb,jsonb),matching_board.validate_waiting_multi(jsonb,uuid[],text),matching_board.assert_groups_ready(uuid) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
