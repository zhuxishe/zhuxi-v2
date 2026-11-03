-- Manual groups and an optional public-facing unmatched message. This migration
-- changes schema/functions only: no round, answer, result, board state,
-- publication, assignment, or notification is updated or backfilled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));

DO $dependency$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='matching_board.validate_small_groups(jsonb,jsonb,jsonb,jsonb)'::regprocedure) IS DISTINCT FROM '2e9f085567c84b9c6bcdfe59a09d0d7e' THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_DEPENDENCY_CHANGED: validate_small_groups'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='matching_board.validate_waiting_multi(jsonb,uuid[],text)'::regprocedure) IS DISTINCT FROM '1c423e8655b5e7b11966bd5f42d8e92f' THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_DEPENDENCY_CHANGED: validate_waiting_multi'; END IF;
END;
$dependency$;

ALTER TABLE matching_publication.publications ADD COLUMN unmatched_message text
 CHECK (unmatched_message IS NULL OR char_length(unmatched_message)<=300);

-- ECMAScript String.trim whitespace, matching the application helper exactly.
CREATE FUNCTION matching_board.normalize_unmatched_message(p_message text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT NULLIF(btrim(p_message,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'')
$function$;

CREATE FUNCTION matching_board.validate_layout_extras(p_layout jsonb,p_previous_layout jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $function$
BEGIN
 IF matching_board.normalize_unmatched_message(p_previous_layout->>'unmatchedMessage') IS NOT NULL
  AND NOT (p_layout ? 'unmatchedMessage') THEN
  RAISE EXCEPTION 'MATCH_BOARD_UNMATCHED_MESSAGE_REQUIRED' USING ERRCODE='PT409';
 END IF;
 IF p_layout ? 'unmatchedMessage' AND (jsonb_typeof(p_layout->'unmatchedMessage') IS DISTINCT FROM 'string'
  OR char_length(matching_board.normalize_unmatched_message(p_layout->>'unmatchedMessage'))>300) THEN
  RAISE EXCEPTION 'MATCH_BOARD_UNMATCHED_MESSAGE_INVALID' USING ERRCODE='22023';
 END IF;
END;
$function$;

-- Both sets are explicit classifications, never inferred from result size.
-- Only an exact, manually adjusted small-group marker allows a 3+ group outside
-- the automatic recommendation range. All normal result constraints stay intact.
CREATE OR REPLACE FUNCTION matching_board.validate_small_groups(p_layout jsonb,p_rows jsonb,p_previous_layout jsonb,p_keep_rows jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $function$
DECLARE groups jsonb:=COALESCE(p_layout->'smallGroupMemberIds','[]'::jsonb);
 manual_groups jsonb:=COALESCE(p_layout->'manualSmallGroupMemberIds','[]'::jsonb);
 item jsonb; row jsonb; ids uuid[]; seen uuid[]:='{}'; manual_seen uuid[]:='{}'; row_ids uuid[]; is_manual boolean;
BEGIN
 IF jsonb_array_length(COALESCE(p_previous_layout->'smallGroupMemberIds','[]'::jsonb))>0
  AND NOT (p_layout ? 'smallGroupMemberIds') THEN
  RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_REQUIRED' USING ERRCODE='PT409';
 END IF;
 IF jsonb_array_length(COALESCE(p_previous_layout->'manualSmallGroupMemberIds','[]'::jsonb))>0
  AND NOT (p_layout ? 'manualSmallGroupMemberIds') THEN
  RAISE EXCEPTION 'MATCH_BOARD_MANUAL_GROUP_REQUIRED' USING ERRCODE='PT409';
 END IF;
 IF jsonb_typeof(groups) IS DISTINCT FROM 'array' OR jsonb_array_length(groups)>5000
  OR jsonb_typeof(manual_groups) IS DISTINCT FROM 'array' OR jsonb_array_length(manual_groups)>5000
  OR ((p_layout ? 'smallGroupMemberIds' OR p_layout ? 'manualSmallGroupMemberIds') AND p_layout->>'multiMode' IS DISTINCT FROM 'grouped') THEN
  RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_LAYOUT_INVALID' USING ERRCODE='22023';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(manual_groups) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(item) NOT BETWEEN 3 AND 10000
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(item) member WHERE jsonb_typeof(member) IS DISTINCT FROM 'string') THEN
   RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_LAYOUT_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(item);
  IF cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) members(id)) OR manual_seen&&ids THEN
   RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_LAYOUT_INVALID' USING ERRCODE='22023';
  END IF;
  manual_seen:=manual_seen||ids;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(groups) small_group
   WHERE jsonb_typeof(small_group)='array'
    AND ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(small_group)) @> ids
    AND ids @> ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(small_group))) THEN
   RAISE EXCEPTION 'MATCH_BOARD_MANUAL_GROUP_OUTPUT_MISMATCH' USING ERRCODE='22023';
  END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(groups) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(item) NOT BETWEEN 3 AND 10000 THEN RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_SIZE' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(item) member WHERE jsonb_typeof(member) IS DISTINCT FROM 'string') THEN
   RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_LAYOUT_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(item);
  IF cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) members(id)) OR seen&&ids THEN
   RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_LAYOUT_INVALID' USING ERRCODE='22023';
  END IF;
  seen:=seen||ids;
  SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(manual_groups) manual_group
   WHERE ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(manual_group)) @> ids
    AND ids @> ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(manual_group))) INTO is_manual;
  IF NOT is_manual AND cardinality(ids) NOT BETWEEN 4 AND 6 THEN RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_SIZE' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_rows) r
   WHERE r->>'member_b_id' IS NULL AND jsonb_typeof(r->'group_members')='array'
    AND ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(r->'group_members')) @> ids
    AND ids @> ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(r->'group_members')))<>1 THEN
   RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_OUTPUT_MISMATCH' USING ERRCODE='22023';
  END IF;
 END LOOP;
 FOR row IN SELECT value FROM jsonb_array_elements(p_keep_rows) WHERE value->>'member_b_id' IS NULL LOOP
  SELECT array_agg(value::uuid) INTO row_ids FROM jsonb_array_elements_text(row->'group_members');
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p_previous_layout->'smallGroupMemberIds','[]'::jsonb)) old_group
   WHERE ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(old_group)) @> row_ids
    AND row_ids @> ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(old_group)))
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(groups) new_group
    WHERE ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(new_group)) @> row_ids
     AND row_ids @> ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(new_group))) THEN
   RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_REQUIRED' USING ERRCODE='PT409';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p_previous_layout->'manualSmallGroupMemberIds','[]'::jsonb)) old_group
   WHERE ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(old_group)) @> row_ids
    AND row_ids @> ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(old_group)))
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(manual_groups) new_group
    WHERE ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(new_group)) @> row_ids
     AND row_ids @> ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(new_group))) THEN
   RAISE EXCEPTION 'MATCH_BOARD_MANUAL_GROUP_REQUIRED' USING ERRCODE='PT409';
  END IF;
 END LOOP;
END;
$function$;

CREATE FUNCTION matching_board.active_manual_small_groups(p_session_id uuid,p_layout jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT COALESCE(jsonb_agg(item ORDER BY ord),'[]'::jsonb)
 FROM jsonb_array_elements(COALESCE(p_layout->'manualSmallGroupMemberIds','[]'::jsonb)) WITH ORDINALITY entries(item,ord)
 WHERE EXISTS(SELECT 1 FROM public.match_results r WHERE r.session_id=p_session_id AND r.status<>'cancelled'
  AND r.member_b_id IS NULL
  AND r.group_members @> ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(item))
  AND ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(item)) @> r.group_members)
$function$;

-- Plan exactly the recipients whose final roster outcome is unmatched and who
-- would receive its notification. Historic published cancellations retain their
-- separate outcome; inactive/unbound members and other active assignments are
-- excluded. Only IDs are projected through the existing administrator capture.
CREATE FUNCTION matching_board.unmatched_message_recipient_ids(p_session_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 WITH session AS (SELECT round_id FROM public.match_sessions WHERE id=p_session_id),
 candidates AS (
  SELECT member_id FROM public.unmatched_diagnostics WHERE session_id=p_session_id
  UNION SELECT member_id FROM public.match_results r
   CROSS JOIN LATERAL unnest(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)) ids(member_id)
   WHERE r.session_id=p_session_id
 )
 SELECT COALESCE(array_agg(m.id ORDER BY m.id),'{}'::uuid[])
 FROM candidates JOIN public.members m ON m.id=candidates.member_id CROSS JOIN session
 WHERE m.account_status='active' AND m.status='approved' AND m.anonymized_at IS NULL AND m.user_id IS NOT NULL
  AND private.test_account_round_allowed(session.round_id,m.id)
  AND NOT (COALESCE(matching_board.current_layout(p_session_id)->'waitingMultiIds','[]'::jsonb) @> to_jsonb(ARRAY[m.id]))
  AND NOT EXISTS(SELECT 1 FROM public.match_results r WHERE r.session_id=p_session_id AND r.status<>'cancelled'
   AND m.id=ANY(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)))
  AND NOT EXISTS(SELECT 1 FROM public.match_results r WHERE r.session_id=p_session_id AND r.status='cancelled' AND r.publication_version>0
   AND m.id=ANY(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)))
  AND NOT EXISTS(SELECT 1 FROM matching_publication.active_assignments assignment WHERE assignment.round_id=session.round_id AND assignment.member_id=m.id)
$function$;

-- A grouped waiting area contains unassigned candidates, potentially for
-- different dates. Common-time/gender/pairwise checks apply to each final group,
-- never to unrelated people awaiting a group. Legacy single pools are unchanged.
CREATE OR REPLACE FUNCTION matching_board.validate_waiting_multi(p_engine jsonb,p_ids uuid[],p_slot text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE member_id uuid; candidate jsonb;
BEGIN
 FOREACH member_id IN ARRAY p_ids LOOP
  SELECT c INTO candidate FROM jsonb_array_elements(p_engine->'candidates') c WHERE (c->>'submissionId')::uuid=member_id;
  IF candidate IS NULL OR candidate->>'gameTypePref'='双人' THEN
   RAISE EXCEPTION 'MATCH_BOARD_MULTI_CONSTRAINT' USING ERRCODE='PT409';
  END IF;
 END LOOP;
END;
$function$;

-- Patch only named anchors so receipt-first retries, locks, hard validation,
-- audit transactions, test-domain gates and publication authorization survive.
DO $migration$
DECLARE definition text; anchor text; replacement text;
BEGIN
 definition:=pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure);
 anchor:='key NOT IN(''waitingDuoIds'',''brokenPairs'',''multiMode'',''waitingMultiIds'',''multiPoolSlot'',''smallGroupMemberIds'')';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_SAVE_LAYOUT_ANCHOR'; END IF;
 definition:=replace(definition,anchor,'key NOT IN(''waitingDuoIds'',''brokenPairs'',''multiMode'',''waitingMultiIds'',''multiPoolSlot'',''smallGroupMemberIds'',''manualSmallGroupMemberIds'',''unmatchedMessage'')');
 anchor:=' PERFORM matching_board.validate_small_groups(p_layout,v_keep_rows||p_rows,v_capture->''layout'',v_keep_rows);';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_SAVE_EXTRAS_ANCHOR'; END IF;
 definition:=replace(definition,anchor,anchor||E'\n PERFORM matching_board.validate_layout_extras(p_layout,v_capture->''layout'');');
 anchor:=' INSERT INTO matching_board.state(session_id,layout)';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_CANONICAL_MESSAGE_ANCHOR'; END IF;
 definition:=replace(definition,anchor,E' IF p_layout ? ''unmatchedMessage'' THEN p_layout:=jsonb_set(p_layout,''{unmatchedMessage}'',to_jsonb(COALESCE(matching_board.normalize_unmatched_message(p_layout->>''unmatchedMessage''),''''))); END IF;\n'||anchor);
 anchor:=$patch$  IF v_previous_waiting&&v_multi_waiting AND replace(v_previous_slot,' ','_') IS DISTINCT FROM replace(p_layout->>'multiPoolSlot',' ','_') THEN RAISE EXCEPTION 'MATCH_BOARD_MULTI_TIME_CHANGED' USING ERRCODE='PT409'; END IF;$patch$;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_WAITING_ANCHOR'; END IF;
 EXECUTE replace(definition,anchor,'  -- Unassigned candidates need not share the previous waiting-pool slot.');

 definition:=pg_get_functiondef('matching_board.current_layout(uuid)'::regprocedure);
 anchor:='ELSE ''{}''::jsonb END FROM existing';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_CURRENT_LAYOUT_ANCHOR'; END IF;
 replacement:=$patch$ELSE '{}'::jsonb END
  || CASE WHEN value->>'multiMode'='grouped' AND value ? 'manualSmallGroupMemberIds'
   THEN jsonb_build_object('manualSmallGroupMemberIds',matching_board.active_manual_small_groups(p_session_id,value)) ELSE '{}'::jsonb END
  || CASE WHEN value ? 'unmatchedMessage' THEN jsonb_build_object('unmatchedMessage',value->'unmatchedMessage') ELSE '{}'::jsonb END FROM existing$patch$;
 EXECUTE replace(definition,anchor,replacement);

 definition:=pg_get_functiondef('matching_adjustment.revision(uuid)'::regprocedure);
 anchor:='''board_layout'',matching_board.current_layout(s.id))::text)';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_RECIPIENT_REVISION_ANCHOR'; END IF;
 EXECUTE replace(definition,anchor,'''board_layout'',matching_board.current_layout(s.id),''unmatched_message_recipient_ids'',matching_board.unmatched_message_recipient_ids(s.id))::text)');

 definition:=pg_get_functiondef('matching_board.capture(uuid,uuid)'::regprocedure);
 anchor:='''cohort_member_ids'',v_ids,';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_RECIPIENT_CAPTURE_ANCHOR'; END IF;
 EXECUTE replace(definition,anchor,anchor||'''unmatched_message_recipient_ids'',matching_board.unmatched_message_recipient_ids(p_session_id),');

 definition:=pg_get_functiondef('matching_board.assert_groups_ready(uuid)'::regprocedure);
 anchor:=' PERFORM matching_board.validate_small_groups(layout,';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_FINAL_GUARD_ANCHOR'; END IF;
 EXECUTE replace(definition,anchor,E' PERFORM matching_board.validate_layout_extras(layout,''{}''::jsonb);\n'||anchor);

 definition:=pg_get_functiondef('matching_publication_preflight.capture(uuid,integer)'::regprocedure);
 anchor:='''current_rows'',v_rows);';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_PREPARE_MESSAGE_ANCHOR'; END IF;
 EXECUTE replace(definition,anchor,$patch$'current_rows',v_rows,'unmatched_message',matching_board.normalize_unmatched_message(matching_board.current_layout(p_session_id)->>'unmatchedMessage'),'unmatched_message_recipient_ids',matching_board.unmatched_message_recipient_ids(p_session_id));$patch$);

 definition:=pg_get_functiondef('matching_publication.publish_session(uuid,integer,text)'::regprocedure);
 anchor:=$patch$INSERT INTO matching_publication.publications(session_id,round_id,version,round_name,session_name,actor_admin_id,reason)
    VALUES(p_session_id,v_session.round_id,v_session.publication_version+1,v_round.round_name,v_session.session_name,v_admin,btrim(p_reason)) RETURNING * INTO v_pub;$patch$;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_PUBLISH_MESSAGE_ANCHOR'; END IF;
 replacement:=$patch$INSERT INTO matching_publication.publications(session_id,round_id,version,round_name,session_name,actor_admin_id,reason,unmatched_message)
    VALUES(p_session_id,v_session.round_id,v_session.publication_version+1,v_round.round_name,v_session.session_name,v_admin,btrim(p_reason),
     matching_board.normalize_unmatched_message(matching_board.current_layout(p_session_id)->>'unmatchedMessage')) RETURNING * INTO v_pub;$patch$;
 EXECUTE replace(definition,anchor,replacement);

 definition:=pg_get_functiondef('matching_publication.my_outcomes()'::regprocedure);
 anchor:='''status'',COALESCE(chosen.outcome,''waiting''),''result_id'',chosen.result_id)';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_PLAYER_MESSAGE_ANCHOR'; END IF;
 definition:=replace(definition,anchor,'''status'',COALESCE(chosen.outcome,''waiting''),''result_id'',chosen.result_id,''unmatched_message'',CASE WHEN chosen.outcome=''unmatched'' THEN chosen.unmatched_message ELSE NULL END)');
 anchor:='publication.version,publication.published_at,roster.result_id,';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_PLAYER_SOURCE_ANCHOR'; END IF;
 EXECUTE replace(definition,anchor,'publication.version,publication.published_at,publication.unmatched_message,roster.result_id,');

 definition:=pg_get_functiondef('matching_board.erase_anonymized()'::regprocedure);
 anchor:='  UPDATE matching_board.operations SET member_ids=';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_MANUAL_GROUP_PRIVACY_ANCHOR'; END IF;
 replacement:=$patch$  UPDATE matching_board.state s SET layout=jsonb_set(s.layout,'{manualSmallGroupMemberIds}',
   COALESCE((SELECT jsonb_agg(item) FROM jsonb_array_elements(s.layout->'manualSmallGroupMemberIds') item
    WHERE NOT item @> to_jsonb(ARRAY[NEW.id])),'[]'::jsonb)),updated_at=clock_timestamp()
   WHERE s.layout ? 'manualSmallGroupMemberIds' AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.layout->'manualSmallGroupMemberIds') item WHERE item @> to_jsonb(ARRAY[NEW.id]));
$patch$;
 EXECUTE replace(definition,anchor,replacement||anchor);
END;
$migration$;

CREATE FUNCTION matching_publication.guard_unmatched_message()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
BEGIN
 IF NEW.unmatched_message IS DISTINCT FROM OLD.unmatched_message THEN
  RAISE EXCEPTION 'MATCH_PUBLICATION_MESSAGE_IMMUTABLE' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_publication_unmatched_message_immutable BEFORE UPDATE OF unmatched_message
 ON matching_publication.publications FOR EACH ROW EXECUTE FUNCTION matching_publication.guard_unmatched_message();

REVOKE ALL ON FUNCTION matching_board.normalize_unmatched_message(text),matching_board.validate_layout_extras(jsonb,jsonb),matching_board.active_manual_small_groups(uuid,jsonb),matching_board.unmatched_message_recipient_ids(uuid),matching_publication.guard_unmatched_message() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
