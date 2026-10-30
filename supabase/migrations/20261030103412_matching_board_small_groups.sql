-- Persist an explicit 4-6-person group classification inside the existing board
-- layout. Ordinary time groups and all pre-existing results keep their rules.
-- This migration changes functions only; it never rewrites or publishes a result.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));

DO $dependency$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure) IS DISTINCT FROM '2bd1321fc0d0f4df3c8b3f9b046d473f' THEN RAISE EXCEPTION 'MATCH_SMALL_GROUP_DEPENDENCY_CHANGED: save'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='matching_board.current_layout(uuid)'::regprocedure) IS DISTINCT FROM 'd1cc75c58745d28f9416fa11fbf99669' THEN RAISE EXCEPTION 'MATCH_SMALL_GROUP_DEPENDENCY_CHANGED: current_layout'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='matching_board.erase_anonymized()'::regprocedure) IS DISTINCT FROM '0b58ff9c02529d3e9fd71f576a581c0c' THEN RAISE EXCEPTION 'MATCH_SMALL_GROUP_DEPENDENCY_CHANGED: erase_anonymized'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='matching_board.assert_groups_ready(uuid)'::regprocedure) IS DISTINCT FROM '8db214f2eda19771941d83c77c53d25d' THEN RAISE EXCEPTION 'MATCH_SMALL_GROUP_DEPENDENCY_CHANGED: assert_groups_ready'; END IF;
END;
$dependency$;

-- The caller already validates every result with the existing matching rules.
-- This additional validator checks only the explicit small-group classification,
-- never guesses it from group size, and cannot downgrade a kept small result.
CREATE FUNCTION matching_board.validate_small_groups(p_layout jsonb,p_rows jsonb,p_previous_layout jsonb,p_keep_rows jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $function$
DECLARE groups jsonb:=COALESCE(p_layout->'smallGroupMemberIds','[]'::jsonb); item jsonb; row jsonb;
 ids uuid[]; seen uuid[]:='{}'; row_ids uuid[];
BEGIN
 -- A cached client without this feature must not replace all marked rows and
 -- silently discard their classification. New clients explicitly send [] when
 -- the administrator has dissolved every small group.
 IF jsonb_array_length(COALESCE(p_previous_layout->'smallGroupMemberIds','[]'::jsonb))>0
  AND NOT (p_layout ? 'smallGroupMemberIds') THEN
  RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_REQUIRED' USING ERRCODE='PT409';
 END IF;
 IF jsonb_typeof(groups) IS DISTINCT FROM 'array' OR jsonb_array_length(groups)>5000
  OR (p_layout ? 'smallGroupMemberIds' AND p_layout->>'multiMode' IS DISTINCT FROM 'grouped') THEN
  RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_LAYOUT_INVALID' USING ERRCODE='22023';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(groups) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_LAYOUT_INVALID' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(item) NOT BETWEEN 4 AND 6 THEN RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_SIZE' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(item) member WHERE jsonb_typeof(member) IS DISTINCT FROM 'string') THEN
   RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_LAYOUT_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(item);
  IF cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) members(id)) OR seen&&ids THEN
   RAISE EXCEPTION 'MATCH_BOARD_SMALL_GROUP_LAYOUT_INVALID' USING ERRCODE='22023';
  END IF;
  seen:=seen||ids;
  IF (SELECT count(*) FROM jsonb_array_elements(p_rows) r
   WHERE r->>'member_b_id' IS NULL AND jsonb_typeof(r->'group_members')='array'
   AND ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(r->'group_members')) @> ids
   AND ids @> ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(r->'group_members')) )<>1 THEN
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
 END LOOP;
END;
$function$;

-- A cancelled group is no longer an assignment. Keep classifications only while
-- an exact active result exists; ordinary groups never acquire a marker by size.
CREATE FUNCTION matching_board.active_small_groups(p_session_id uuid,p_layout jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT COALESCE(jsonb_agg(item ORDER BY ord),'[]'::jsonb)
 FROM jsonb_array_elements(COALESCE(p_layout->'smallGroupMemberIds','[]'::jsonb)) WITH ORDINALITY entries(item,ord)
 WHERE EXISTS(SELECT 1 FROM public.match_results r WHERE r.session_id=p_session_id AND r.status<>'cancelled'
  AND r.member_b_id IS NULL
  AND r.group_members @> ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(item))
  AND ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(item)) @> r.group_members)
$function$;

-- Surgical edits keep the existing receipt-first retries, locks, source and
-- revision checks, scoring validation, publication proofs and audit unchanged.
DO $migration$
DECLARE definition text; anchor text; replacement text;
BEGIN
 definition:=pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure);
 anchor:='key NOT IN(''waitingDuoIds'',''brokenPairs'',''multiMode'',''waitingMultiIds'',''multiPoolSlot'')';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_SMALL_GROUP_SAVE_LAYOUT_ANCHOR'; END IF;
 definition:=replace(definition,anchor,'key NOT IN(''waitingDuoIds'',''brokenPairs'',''multiMode'',''waitingMultiIds'',''multiPoolSlot'',''smallGroupMemberIds'')');
 anchor:=' PERFORM set_config(''app.member_master_audit_reason'',btrim(p_reason),true);';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_SMALL_GROUP_SAVE_VALIDATE_ANCHOR'; END IF;
 definition:=replace(definition,anchor,E' PERFORM matching_board.validate_small_groups(p_layout,v_keep_rows||p_rows,v_capture->''layout'',v_keep_rows);\n'||anchor);
 EXECUTE definition;

 definition:=pg_get_functiondef('matching_board.current_layout(uuid)'::regprocedure);
 anchor:='ELSE ''{}''::jsonb END FROM existing';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_SMALL_GROUP_LAYOUT_ANCHOR'; END IF;
 replacement:=$patch$ELSE '{}'::jsonb END
  || CASE WHEN value->>'multiMode'='grouped' AND value ? 'smallGroupMemberIds'
   THEN jsonb_build_object('smallGroupMemberIds',matching_board.active_small_groups(p_session_id,value)) ELSE '{}'::jsonb END FROM existing$patch$;
 EXECUTE replace(definition,anchor,replacement);

 definition:=pg_get_functiondef('matching_board.assert_groups_ready(uuid)'::regprocedure);
 anchor:=E' END IF;\nEND;';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_SMALL_GROUP_PUBLICATION_ANCHOR'; END IF;
 replacement:=$patch$ END IF;
 PERFORM matching_board.validate_small_groups(layout,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('member_b_id',member_b_id,'group_members',group_members))
   FROM public.match_results WHERE session_id=p_session_id AND status<>'cancelled'),'[]'::jsonb),'{}'::jsonb,'[]'::jsonb);
END;$patch$;
 EXECUTE replace(definition,anchor,replacement);

 -- Remove the whole classification when a member is erased. The normal privacy
 -- path separately removes or cancels their result; no identity survives here.
 definition:=pg_get_functiondef('matching_board.erase_anonymized()'::regprocedure);
 anchor:='  UPDATE matching_board.operations SET member_ids=';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_SMALL_GROUP_PRIVACY_ANCHOR'; END IF;
 replacement:=$patch$  UPDATE matching_board.state s SET layout=jsonb_set(s.layout,'{smallGroupMemberIds}',
   COALESCE((SELECT jsonb_agg(item) FROM jsonb_array_elements(s.layout->'smallGroupMemberIds') item
    WHERE NOT item @> to_jsonb(ARRAY[NEW.id])),'[]'::jsonb)),updated_at=clock_timestamp()
   WHERE s.layout ? 'smallGroupMemberIds' AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.layout->'smallGroupMemberIds') item WHERE item @> to_jsonb(ARRAY[NEW.id]));
$patch$;
 EXECUTE replace(definition,anchor,replacement||anchor);
END;
$migration$;

REVOKE ALL ON FUNCTION matching_board.validate_small_groups(jsonb,jsonb,jsonb,jsonb),matching_board.active_small_groups(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
