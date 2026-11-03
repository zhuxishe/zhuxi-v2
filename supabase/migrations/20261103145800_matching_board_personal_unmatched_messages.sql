-- Per-player unmatched messages. Schema/functions only: no existing round,
-- submission, matching result, board, publication or notification is backfilled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));

DO $dependency$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='matching_board.validate_layout_extras(jsonb,jsonb)'::regprocedure) IS DISTINCT FROM 'c77a3faadfe8da7384b38a67fd2b05b0' THEN RAISE EXCEPTION 'MATCH_PERSONAL_MESSAGE_DEPENDENCY_CHANGED: validate_layout_extras'; END IF;
END; $dependency$;

-- SQL NULL means a legacy row, retaining its publication-level common message.
-- JSON null means an explicitly frozen absence; a JSON string is one player's
-- frozen effective message. Privacy erasure redacts only this private field,
-- preserving the historical roster structure.
ALTER TABLE matching_publication.roster ADD COLUMN unmatched_message jsonb
 CHECK (unmatched_message IS NULL OR jsonb_typeof(unmatched_message)='null'
  OR (jsonb_typeof(unmatched_message)='string' AND char_length(unmatched_message#>>'{}')<=300));

CREATE FUNCTION matching_board.normalize_unmatched_member_messages(p_messages jsonb,p_member_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $function$
DECLARE item record; member_id uuid; member_key text; message text; result jsonb:='{}'::jsonb; seen uuid[]:='{}'::uuid[];
BEGIN
 IF p_messages IS NULL THEN RETURN result; END IF;
 IF jsonb_typeof(p_messages) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_messages))>10000 THEN
  RAISE EXCEPTION 'MATCH_BOARD_MEMBER_MESSAGES_INVALID' USING ERRCODE='22023';
 END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_messages) LOOP
  IF item.key!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'MATCH_BOARD_MEMBER_MESSAGES_INVALID' USING ERRCODE='22023';
  END IF;
  member_id:=item.key::uuid;member_key:=member_id::text;
  IF member_id=ANY(seen) OR (p_member_ids IS NOT NULL AND NOT member_id=ANY(p_member_ids)) THEN
   RAISE EXCEPTION 'MATCH_BOARD_MEMBER_MESSAGES_INVALID' USING ERRCODE='22023';
  END IF;
  seen:=seen||member_id;
  IF jsonb_typeof(item.value)='null' THEN result:=result||jsonb_build_object(member_key,NULL);
  ELSIF jsonb_typeof(item.value)='string' THEN
   message:=matching_board.normalize_unmatched_message(item.value#>>'{}');
   IF char_length(message)>300 THEN RAISE EXCEPTION 'MATCH_BOARD_MEMBER_MESSAGES_INVALID' USING ERRCODE='22023'; END IF;
   IF message IS NOT NULL THEN result:=result||jsonb_build_object(member_key,message); END IF;
  ELSE RAISE EXCEPTION 'MATCH_BOARD_MEMBER_MESSAGES_INVALID' USING ERRCODE='22023';
  END IF;
 END LOOP;
 RETURN result;
END;
$function$;

CREATE FUNCTION matching_board.resolve_unmatched_member_message(p_common text,p_messages jsonb,p_member_id uuid)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT CASE WHEN p_messages ? p_member_id::text AND p_messages->p_member_id::text='null'::jsonb THEN NULL
  ELSE COALESCE(matching_board.normalize_unmatched_message(p_messages->>p_member_id::text),matching_board.normalize_unmatched_message(p_common)) END
$function$;

CREATE OR REPLACE FUNCTION matching_board.validate_layout_extras(p_layout jsonb,p_previous_layout jsonb)
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
 IF matching_board.normalize_unmatched_member_messages(p_previous_layout->'unmatchedMemberMessages')<>'{}'::jsonb
  AND NOT (p_layout ? 'unmatchedMemberMessages') THEN
  RAISE EXCEPTION 'MATCH_BOARD_MEMBER_MESSAGES_REQUIRED' USING ERRCODE='PT409';
 END IF;
 PERFORM matching_board.normalize_unmatched_member_messages(p_layout->'unmatchedMemberMessages');
END;
$function$;

-- A new publication may freeze each newly inserted roster row once. Changing a
-- prior publication, including a withdrawn one, is never an edit operation.
CREATE FUNCTION matching_publication.guard_roster_unmatched_message()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_session_id uuid; v_publication_version integer; v_withdrawn_at timestamptz; v_can_freeze boolean:=false;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.unmatched_message IS NULL THEN RETURN NEW; END IF;
  v_can_freeze:=true;
 ELSE
  IF NEW.unmatched_message IS NOT DISTINCT FROM OLD.unmatched_message THEN RETURN NEW; END IF;
  IF NEW.unmatched_message='null'::jsonb AND NEW.member_id=OLD.member_id AND NEW.publication_id=OLD.publication_id
   AND EXISTS(SELECT 1 FROM public.members m WHERE m.id=OLD.member_id AND m.anonymized_at IS NOT NULL) THEN RETURN NEW; END IF;
  v_can_freeze:=OLD.unmatched_message IS NULL;
 END IF;
 SELECT p.session_id,p.version,p.withdrawn_at INTO v_session_id,v_publication_version,v_withdrawn_at
  FROM matching_publication.publications p WHERE p.id=NEW.publication_id;
 IF v_can_freeze AND v_withdrawn_at IS NULL
  AND EXISTS(SELECT 1 FROM public.match_sessions s WHERE s.id=v_session_id AND s.status='draft'
   AND v_publication_version=s.publication_version+1)
  AND EXISTS(SELECT 1 FROM matching_publication.write_context c WHERE c.transaction_id=txid_current()
   AND c.backend_pid=pg_backend_pid() AND c.session_id=v_session_id AND c.operation='publish') THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'MATCH_PUBLICATION_MEMBER_MESSAGE_IMMUTABLE' USING ERRCODE='PT409';
END;
$function$;
CREATE TRIGGER matching_publication_roster_message_immutable BEFORE INSERT OR UPDATE OF unmatched_message
 ON matching_publication.roster FOR EACH ROW EXECUTE FUNCTION matching_publication.guard_roster_unmatched_message();

DO $migration$
DECLARE definition text; anchor text; replacement text;
BEGIN
 definition:=pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure);
 anchor:='''manualSmallGroupMemberIds'',''unmatchedMessage'')';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_PERSONAL_MESSAGE_SAVE_LAYOUT_ANCHOR'; END IF;
 definition:=replace(definition,anchor,'''manualSmallGroupMemberIds'',''unmatchedMessage'',''unmatchedMemberMessages'')');
 anchor:=' PERFORM matching_board.validate_layout_extras(p_layout,v_capture->''layout'');';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_PERSONAL_MESSAGE_SAVE_COHORT_ANCHOR'; END IF;
 definition:=replace(definition,anchor,anchor||E'\n PERFORM matching_board.normalize_unmatched_member_messages(p_layout->''unmatchedMemberMessages'',v_ids);');
 anchor:=' INSERT INTO matching_board.state(session_id,layout)';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_PERSONAL_MESSAGE_SAVE_CANONICAL_ANCHOR'; END IF;
 EXECUTE replace(definition,anchor,E' IF p_layout ? ''unmatchedMemberMessages'' THEN p_layout:=jsonb_set(p_layout,''{unmatchedMemberMessages}'',matching_board.normalize_unmatched_member_messages(p_layout->''unmatchedMemberMessages'',v_ids)); END IF;\n'||anchor);

 definition:=pg_get_functiondef('matching_board.current_layout(uuid)'::regprocedure);
 anchor:='ELSE ''{}''::jsonb END FROM existing';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_PERSONAL_MESSAGE_CURRENT_LAYOUT_ANCHOR'; END IF;
 EXECUTE replace(definition,anchor,$patch$ELSE '{}'::jsonb END
  || CASE WHEN value ? 'unmatchedMemberMessages' THEN jsonb_build_object('unmatchedMemberMessages',value->'unmatchedMemberMessages') ELSE '{}'::jsonb END FROM existing$patch$);

 definition:=pg_get_functiondef('matching_board.assert_groups_ready(uuid)'::regprocedure);
 anchor:=' PERFORM matching_board.validate_layout_extras(layout,''{}''::jsonb);';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_PERSONAL_MESSAGE_PUBLICATION_COHORT_ANCHOR'; END IF;
 EXECUTE replace(definition,anchor,anchor||E'\n PERFORM matching_board.normalize_unmatched_member_messages(layout->''unmatchedMemberMessages'',matching_board.cohort_ids(p_session_id));');

 definition:=pg_get_functiondef('matching_publication_preflight.capture(uuid,integer)'::regprocedure);
 anchor:='''unmatched_message_recipient_ids'',matching_board.unmatched_message_recipient_ids(p_session_id));';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_PERSONAL_MESSAGE_PREPARE_ANCHOR'; END IF;
 EXECUTE replace(definition,anchor,$patch$'unmatched_message_recipient_ids',matching_board.unmatched_message_recipient_ids(p_session_id),
  'unmatched_member_messages',matching_board.normalize_unmatched_member_messages(matching_board.current_layout(p_session_id)->'unmatchedMemberMessages',matching_board.cohort_ids(p_session_id)));$patch$);

 definition:=pg_get_functiondef('matching_publication.publish_session(uuid,integer,text)'::regprocedure);
 anchor:='  SELECT count(*) FILTER(WHERE outcome=''matched''),count(*) FILTER(WHERE outcome<>''matched'') INTO v_count,v_unmatched FROM matching_publication.roster WHERE publication_id=v_pub.id;';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_PERSONAL_MESSAGE_PUBLISH_FREEZE_ANCHOR'; END IF;
 replacement:=$patch$  UPDATE matching_publication.roster recipient SET unmatched_message=CASE
   WHEN recipient.outcome='unmatched' AND recipient.member_id=ANY(matching_board.unmatched_message_recipient_ids(p_session_id))
    THEN COALESCE(to_jsonb(matching_board.resolve_unmatched_member_message(v_pub.unmatched_message,
     matching_board.normalize_unmatched_member_messages(matching_board.current_layout(p_session_id)->'unmatchedMemberMessages',matching_board.cohort_ids(p_session_id)),recipient.member_id)),'null'::jsonb)
   ELSE 'null'::jsonb END
   WHERE recipient.publication_id=v_pub.id;
$patch$;
 EXECUTE replace(definition,anchor,replacement||anchor);

 definition:=pg_get_functiondef('matching_publication.my_outcomes()'::regprocedure);
 anchor:='publication.published_at,publication.unmatched_message,roster.result_id,';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_PERSONAL_MESSAGE_OWN_SCALAR_ANCHOR'; END IF;
 EXECUTE replace(definition,anchor,$patch$publication.published_at,CASE WHEN roster.unmatched_message IS NULL THEN publication.unmatched_message ELSE roster.unmatched_message#>>'{}' END AS unmatched_message,roster.result_id,$patch$);

 definition:=pg_get_functiondef('matching_board.erase_anonymized()'::regprocedure);
 anchor:='  UPDATE matching_board.operations SET member_ids=';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'MATCH_PERSONAL_MESSAGE_PRIVACY_ANCHOR'; END IF;
 replacement:=$patch$  UPDATE matching_board.state s SET layout=jsonb_set(s.layout,'{unmatchedMemberMessages}',(s.layout->'unmatchedMemberMessages')-NEW.id::text),updated_at=clock_timestamp()
   WHERE s.layout ? 'unmatchedMemberMessages' AND (s.layout->'unmatchedMemberMessages') ? NEW.id::text;
  UPDATE matching_publication.roster SET unmatched_message='null'::jsonb
   WHERE member_id=NEW.id AND unmatched_message IS NOT NULL AND unmatched_message<>'null'::jsonb;
$patch$;
 EXECUTE replace(definition,anchor,replacement||anchor);
END;
$migration$;

REVOKE ALL ON FUNCTION matching_board.normalize_unmatched_member_messages(jsonb,uuid[]),matching_board.resolve_unmatched_member_message(text,jsonb,uuid),matching_publication.guard_roster_unmatched_message() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
