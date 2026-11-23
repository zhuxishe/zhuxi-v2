-- New rounds opt into v2. Every existing legacy/v1 round (including drafts)
-- keeps its current policy. Explicit interaction confirmation and private
-- no-match requests do not change published scores or matching algorithms.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';

ALTER TABLE private.round_review_versions DROP CONSTRAINT round_review_versions_review_system_check;
ALTER TABLE private.round_review_versions ADD CONSTRAINT round_review_versions_review_system_check
 CHECK(review_system IN('legacy','unified_v1','unified_v2'));
CREATE FUNCTION unified_peer_review.policy(p_round_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT COALESCE((SELECT review_system FROM private.round_review_versions WHERE round_id=p_round_id),'legacy')
$function$;
CREATE OR REPLACE FUNCTION unified_peer_review.is_unified(p_round_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT unified_peer_review.policy(p_round_id) IN('unified_v1','unified_v2')
$function$;
CREATE FUNCTION unified_peer_review.freeze_policy()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
 IF TG_OP='DELETE' OR NEW.round_id IS DISTINCT FROM OLD.round_id OR NEW.review_system IS DISTINCT FROM OLD.review_system THEN
   RAISE EXCEPTION 'PEER_POLICY_IMMUTABLE' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER unified_review_policy_immutable BEFORE UPDATE OR DELETE ON private.round_review_versions
FOR EACH ROW EXECUTE FUNCTION unified_peer_review.freeze_policy();
CREATE OR REPLACE FUNCTION unified_peer_review.track_round()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF TG_OP='INSERT' THEN
   INSERT INTO private.round_review_versions(round_id,review_system,automatic_window) VALUES(NEW.id,'unified_v2',true);
 END IF;
 PERFORM unified_peer_review.initialize_round(NEW.id);
 RETURN NEW;
END;
$function$;

-- A protected transaction row, never a caller-settable GUC, permits the old
-- internal score writer only while the explicitly confirmed v2 RPC is executing.
CREATE TABLE private.unified_peer_feedback_context (
 transaction_id bigint NOT NULL,backend_pid integer NOT NULL,round_id uuid NOT NULL,
 reviewer_id uuid NOT NULL,reviewee_id uuid NOT NULL,confirmed_at timestamptz NOT NULL,
 PRIMARY KEY(transaction_id,backend_pid,round_id,reviewer_id,reviewee_id)
);
CREATE TABLE private.peer_interaction_confirmations (
 review_id uuid PRIMARY KEY REFERENCES private.round_peer_reviews(id) ON DELETE RESTRICT,
 round_id uuid NOT NULL REFERENCES public.match_rounds(id),
 reviewer_id uuid NOT NULL REFERENCES public.members(id),reviewee_id uuid NOT NULL REFERENCES public.members(id),
 confirmed_at timestamptz NOT NULL, CHECK(reviewer_id<>reviewee_id)
);
ALTER TABLE private.unified_peer_feedback_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.peer_interaction_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.unified_peer_feedback_context,private.peer_interaction_confirmations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION unified_peer_review.interaction_confirmed_at(p_review private.round_peer_reviews)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT COALESCE((SELECT confirmed_at FROM private.peer_interaction_confirmations WHERE review_id=p_review.id),
   (SELECT confirmed_at FROM private.unified_peer_feedback_context WHERE transaction_id=pg_catalog.txid_current_if_assigned()
     AND backend_pid=pg_backend_pid() AND round_id=p_review.round_id AND reviewer_id=p_review.reviewer_id AND reviewee_id=p_review.reviewee_id))
$function$;
CREATE OR REPLACE FUNCTION private.peer_review_json(p_review private.round_peer_reviews)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT jsonb_build_object('id',p_review.id,'reviewee_id',p_review.reviewee_id,'score',p_review.score,
   'comment',p_review.comment,'valid',p_review.valid,'version',p_review.version,'created_at',p_review.created_at,'updated_at',p_review.updated_at)
 || CASE WHEN unified_peer_review.policy(p_review.round_id)='unified_v2' THEN jsonb_build_object(
   'interaction_confirmed',unified_peer_review.interaction_confirmed_at(p_review) IS NOT NULL,
   'interaction_confirmed_at',unified_peer_review.interaction_confirmed_at(p_review)) ELSE '{}'::jsonb END
$function$;

DO $patch$
DECLARE d text; needle text;
BEGIN
 d:=pg_get_functiondef('public.player_save_round_peer_review(uuid,uuid,numeric,text,integer)'::regprocedure);
 needle:='  PERFORM private.peer_lock_pair(p_round_id,v_player,p_reviewee_id);';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'PEER_V2_SCORE_LOCK_BASELINE_CHANGED'; END IF;
 d:=replace(d,needle,$replace$  IF unified_peer_review.policy(p_round_id)='unified_v2' AND NOT EXISTS(
   SELECT 1 FROM private.unified_peer_feedback_context WHERE transaction_id=pg_catalog.txid_current_if_assigned()
     AND backend_pid=pg_backend_pid() AND round_id=p_round_id AND reviewer_id=v_player AND reviewee_id=p_reviewee_id
 ) THEN RAISE EXCEPTION 'PEER_INTERACTION_CONFIRMATION_REQUIRED' USING ERRCODE='22023'; END IF;
$replace$||needle);
 needle:='IF unified_peer_review.is_unified(p_round_id) AND p_score=1 AND NOT EXISTS(';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'PEER_V2_ONE_STAR_BASELINE_CHANGED'; END IF;
 EXECUTE replace(d,needle,'IF unified_peer_review.policy(p_round_id)=''unified_v1'' AND p_score=1 AND NOT EXISTS(');
END;
$patch$;

CREATE FUNCTION unified_peer_review.submit_feedback_v2(p_round_id uuid,p_reviewee_id uuid,p_score numeric,
 p_comment text,p_review_version integer,p_report_category text,p_report_details text,p_report_version integer,
 p_request_id uuid,p_interaction_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_player uuid:=private.peer_current_player(); v_result jsonb; v_at timestamptz:=clock_timestamp(); v_review uuid; v_inserted uuid;
BEGIN
 IF unified_peer_review.policy(p_round_id)<>'unified_v2' THEN RAISE EXCEPTION 'PEER_POLICY_MISMATCH' USING ERRCODE='55000'; END IF;
 IF p_score IS NOT NULL AND p_interaction_confirmed IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'PEER_INTERACTION_CONFIRMATION_REQUIRED' USING ERRCODE='22023';
 END IF;
 IF p_score IS NOT NULL THEN
   INSERT INTO private.unified_peer_feedback_context(transaction_id,backend_pid,round_id,reviewer_id,reviewee_id,confirmed_at)
   VALUES(txid_current(),pg_backend_pid(),p_round_id,v_player,p_reviewee_id,v_at);
 END IF;
 -- This writer retains the existing idempotent receipt, current roster and
 -- publication checks, row locks, half-point validation and late-once gate.
 v_result:=public.player_submit_round_peer_feedback(p_round_id,p_reviewee_id,p_score,p_comment,p_review_version,
   p_report_category,p_report_details,p_report_version,p_request_id);
 IF p_score IS NOT NULL THEN
   v_review:=(v_result#>>'{review,id}')::uuid;
   INSERT INTO private.peer_interaction_confirmations(review_id,round_id,reviewer_id,reviewee_id,confirmed_at)
   VALUES(v_review,p_round_id,v_player,p_reviewee_id,v_at) ON CONFLICT(review_id) DO NOTHING RETURNING review_id INTO v_inserted;
   IF v_inserted IS NOT NULL THEN
     INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_member_id,after_values)
     VALUES(p_round_id,'interaction_confirmed',v_review,v_player,jsonb_build_object('confirmed_at',v_at));
   END IF;
   DELETE FROM private.unified_peer_feedback_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid()
     AND round_id=p_round_id AND reviewer_id=v_player AND reviewee_id=p_reviewee_id;
 END IF;
 RETURN v_result;
END;
$function$;
CREATE FUNCTION public.player_submit_round_peer_feedback_v2(p_round_id uuid,p_reviewee_id uuid,p_score numeric,
 p_comment text DEFAULT '',p_review_version integer DEFAULT 0,p_report_category text DEFAULT NULL,
 p_report_details text DEFAULT NULL,p_report_version integer DEFAULT 0,p_request_id uuid DEFAULT NULL,
 p_interaction_confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT unified_peer_review.submit_feedback_v2(p_round_id,p_reviewee_id,p_score,p_comment,p_review_version,
   p_report_category,p_report_details,p_report_version,p_request_id,p_interaction_confirmed)
$function$;

CREATE TABLE private.peer_no_match_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid NOT NULL REFERENCES public.match_rounds(id),
 requester_id uuid NOT NULL REFERENCES public.members(id),target_member_id uuid NOT NULL REFERENCES public.members(id),
 reason text NOT NULL DEFAULT '' CHECK(char_length(reason)<=1000),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','resolved','closed')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),interaction_confirmed_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 client_request_id uuid,payload_hash text,processed_at timestamptz,processed_by uuid,processed_by_name text,
 internal_note text CHECK(char_length(internal_note)<=2000),processing_reason text CHECK(char_length(processing_reason)<=500),
 UNIQUE(round_id,requester_id,target_member_id),CHECK(requester_id<>target_member_id),
 CHECK((status='pending' AND processed_at IS NULL) OR (status IN('resolved','closed') AND processed_at IS NOT NULL))
);
CREATE UNIQUE INDEX peer_no_match_request_retry_idx ON private.peer_no_match_requests(requester_id,client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX peer_no_match_request_queue_idx ON private.peer_no_match_requests(status,created_at DESC,id);
CREATE TABLE private.peer_no_match_request_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,request_id uuid NOT NULL REFERENCES private.peer_no_match_requests(id),
 action text NOT NULL CHECK(action IN('created','resolved','closed')),actor_member_id uuid,actor_admin_id uuid,actor_admin_name text,
 reason text,before_values jsonb NOT NULL DEFAULT '{}'::jsonb,after_values jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX peer_no_match_request_audit_request_idx ON private.peer_no_match_request_audit(request_id,id DESC);
ALTER TABLE private.peer_no_match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.peer_no_match_request_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.peer_no_match_requests,private.peer_no_match_request_audit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE private.peer_no_match_request_audit_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION unified_peer_review.player_no_match_json(p_request private.peer_no_match_requests)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 WITH visible AS (SELECT private.peer_participant_eligible(p_request.round_id,p_request.requester_id)
   AND private.peer_participant_eligible(p_request.round_id,p_request.target_member_id)
   AND EXISTS(SELECT 1 FROM private.round_peer_review_settings setting WHERE setting.round_id=p_request.round_id
     AND private.peer_effective_opened_at(setting) IS NOT NULL) AS allowed)
 SELECT jsonb_build_object('id',p_request.id,'target_member_id',p_request.target_member_id,'reason',p_request.reason,
   'target_name',CASE WHEN visible.allowed THEN COALESCE(NULLIF(btrim(identity.full_name),''),'未填写姓名') END,
   'target_nickname',CASE WHEN visible.allowed THEN NULLIF(btrim(identity.nickname),'') END,
   'status',p_request.status,'version',p_request.version,'created_at',p_request.created_at,'updated_at',p_request.updated_at)
 FROM visible LEFT JOIN public.member_identity identity ON identity.member_id=p_request.target_member_id
$function$;
CREATE FUNCTION unified_peer_review.own_no_match_requests(p_round_id uuid,p_member_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT COALESCE(jsonb_agg(unified_peer_review.player_no_match_json(r) ORDER BY r.created_at DESC,r.id),'[]'::jsonb)
 FROM private.peer_no_match_requests r WHERE r.round_id=p_round_id AND r.requester_id=p_member_id
$function$;
CREATE FUNCTION unified_peer_review.can_request_no_match(p_round_id uuid,p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT unified_peer_review.policy(p_round_id)='unified_v2' AND private.peer_participant_eligible(p_round_id,p_member_id)
   AND EXISTS(SELECT 1 FROM private.round_peer_review_settings s WHERE s.round_id=p_round_id AND private.peer_effective_opened_at(s) IS NOT NULL)
   AND EXISTS(SELECT 1 FROM private.round_peer_review_participants p WHERE p.round_id=p_round_id AND p.member_id<>p_member_id
     AND private.peer_participant_eligible(p_round_id,p.member_id))
$function$;
CREATE FUNCTION unified_peer_review.submit_no_match_request(p_round_id uuid,p_target_member_id uuid,p_reason text,
 p_request_id uuid,p_interaction_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_member uuid:=private.peer_current_player(); v_existing private.peer_no_match_requests; v_row private.peer_no_match_requests;
 v_hash text; v_setting private.round_peer_review_settings; v_reason text:=btrim(COALESCE(p_reason,''));
BEGIN
 IF unified_peer_review.policy(p_round_id)<>'unified_v2' THEN RAISE EXCEPTION 'PEER_POLICY_MISMATCH' USING ERRCODE='55000'; END IF;
 IF p_interaction_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'PEER_INTERACTION_CONFIRMATION_REQUIRED' USING ERRCODE='22023'; END IF;
 IF char_length(v_reason)>1000 THEN RAISE EXCEPTION 'PEER_NO_MATCH_REASON_INVALID' USING ERRCODE='22023'; END IF;
 v_hash:=md5(jsonb_build_array(p_round_id,p_target_member_id,v_reason)::text);
 IF p_request_id IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('peer-no-match:'||v_member::text||':'||p_request_id::text,0));
   SELECT * INTO v_existing FROM private.peer_no_match_requests WHERE requester_id=v_member AND client_request_id=p_request_id;
   IF FOUND THEN
     IF v_existing.payload_hash IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'PEER_REQUEST_CONFLICT' USING ERRCODE='40001'; END IF;
     RETURN unified_peer_review.player_no_match_json(v_existing);
   END IF;
 END IF;
 PERFORM private.peer_lock_pair(p_round_id,v_member,p_target_member_id);
 SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
 IF NOT FOUND OR private.peer_effective_opened_at(v_setting) IS NULL THEN RAISE EXCEPTION 'PEER_NO_MATCH_UNAVAILABLE' USING ERRCODE='55000'; END IF;
 IF NOT private.peer_participant_eligible(p_round_id,v_member) OR NOT private.peer_participant_eligible(p_round_id,p_target_member_id) THEN
   RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_existing FROM private.peer_no_match_requests WHERE round_id=p_round_id AND requester_id=v_member AND target_member_id=p_target_member_id;
 IF FOUND THEN
   IF v_existing.reason IS DISTINCT FROM v_reason THEN RAISE EXCEPTION 'PEER_NO_MATCH_ALREADY_REQUESTED' USING ERRCODE='55000'; END IF;
   RETURN unified_peer_review.player_no_match_json(v_existing);
 END IF;
 INSERT INTO private.peer_no_match_requests(round_id,requester_id,target_member_id,reason,interaction_confirmed_at,client_request_id,payload_hash)
 VALUES(p_round_id,v_member,p_target_member_id,v_reason,clock_timestamp(),p_request_id,v_hash) RETURNING * INTO v_row;
 INSERT INTO private.peer_no_match_request_audit(request_id,action,actor_member_id,after_values)
 VALUES(v_row.id,'created',v_member,unified_peer_review.player_no_match_json(v_row));
 RETURN unified_peer_review.player_no_match_json(v_row);
END;
$function$;
CREATE FUNCTION public.player_submit_peer_no_match_request(p_round_id uuid,p_target_member_id uuid,p_reason text DEFAULT '',
 p_request_id uuid DEFAULT NULL,p_interaction_confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT unified_peer_review.submit_no_match_request(p_round_id,p_target_member_id,p_reason,p_request_id,p_interaction_confirmed)
$function$;

CREATE FUNCTION unified_peer_review.admin_no_match_json(p_request private.peer_no_match_requests)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT jsonb_build_object('id',p_request.id,'round_id',p_request.round_id,'round_name',round.round_name,
   'requester_id',p_request.requester_id,'requester_name',COALESCE(NULLIF(btrim(a.full_name),''),'未填写姓名'),
   'target_member_id',p_request.target_member_id,'target_name',COALESCE(NULLIF(btrim(b.full_name),''),'未填写姓名'),
   'reason',p_request.reason,'status',p_request.status,'version',p_request.version,'created_at',p_request.created_at,'updated_at',p_request.updated_at,
   'processed_at',p_request.processed_at,'processed_by_name',p_request.processed_by_name,
   'internal_note',p_request.internal_note,'processing_reason',p_request.processing_reason)
 FROM public.match_rounds round LEFT JOIN public.member_identity a ON a.member_id=p_request.requester_id
 LEFT JOIN public.member_identity b ON b.member_id=p_request.target_member_id WHERE round.id=p_request.round_id
$function$;
CREATE FUNCTION unified_peer_review.admin_list_no_match_requests(p_status text,p_page integer,p_page_size integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_total bigint; v_rows jsonb;
BEGIN
 PERFORM private.peer_current_admin();
 IF p_status IS NULL OR p_status NOT IN('pending','resolved','closed','all') THEN RAISE EXCEPTION 'PEER_NO_MATCH_STATUS_INVALID' USING ERRCODE='22023'; END IF;
 IF p_page IS NULL OR p_page<1 OR p_page>1000000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'PEER_PAGINATION_INVALID' USING ERRCODE='22023'; END IF;
 WITH filtered AS MATERIALIZED (
   SELECT r.* FROM private.peer_no_match_requests r JOIN public.members a ON a.id=r.requester_id
   JOIN public.members b ON b.id=r.target_member_id JOIN public.match_rounds round ON round.id=r.round_id
   WHERE a.anonymized_at IS NULL AND b.anonymized_at IS NULL AND NOT a.is_test AND NOT b.is_test AND NOT round.is_test
     AND (p_status='all' OR r.status=p_status)
 ), page_rows AS (SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size)
 SELECT (SELECT count(*) FROM filtered),COALESCE((SELECT jsonb_agg(unified_peer_review.admin_no_match_json(p) ORDER BY p.created_at DESC,p.id) FROM page_rows p),'[]'::jsonb)
 INTO v_total,v_rows;
 RETURN jsonb_build_object('requests',v_rows,'total',v_total,'page',p_page,'page_size',p_page_size);
END;
$function$;
CREATE FUNCTION public.admin_list_peer_no_match_requests(p_status text DEFAULT 'pending',p_page integer DEFAULT 1,p_page_size integer DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT unified_peer_review.admin_list_no_match_requests(p_status,p_page,p_page_size)
$function$;
CREATE FUNCTION unified_peer_review.resolve_no_match_request(p_request_id uuid,p_status text,p_internal_note text,p_expected_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_admin uuid; v_name text; v_before private.peer_no_match_requests; v_after private.peer_no_match_requests;
BEGIN
 PERFORM private.peer_lock_admin();v_admin:=private.peer_current_admin();
 PERFORM private.peer_require_reason(p_reason);
 IF p_status IS NULL OR p_status NOT IN('resolved','closed') THEN RAISE EXCEPTION 'PEER_NO_MATCH_STATUS_INVALID' USING ERRCODE='22023'; END IF;
 IF char_length(btrim(COALESCE(p_internal_note,''))) NOT BETWEEN 4 AND 2000 THEN RAISE EXCEPTION 'PEER_NO_MATCH_NOTE_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_before FROM private.peer_no_match_requests WHERE id=p_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'PEER_NO_MATCH_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.members WHERE id IN(v_before.requester_id,v_before.target_member_id) ORDER BY id FOR SHARE;
 IF EXISTS(SELECT 1 FROM public.members WHERE id IN(v_before.requester_id,v_before.target_member_id) AND (anonymized_at IS NOT NULL OR is_test))
   OR EXISTS(SELECT 1 FROM public.match_rounds WHERE id=v_before.round_id AND is_test) THEN RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_before FROM private.peer_no_match_requests WHERE id=p_request_id FOR UPDATE;
 IF v_before.status<>'pending' THEN
   IF v_before.status=p_status AND v_before.internal_note=btrim(p_internal_note) AND v_before.processing_reason=btrim(p_reason) THEN
     RETURN unified_peer_review.admin_no_match_json(v_before);
   END IF;
   RAISE EXCEPTION 'PEER_NO_MATCH_NOT_PENDING' USING ERRCODE='55000';
 END IF;
 IF p_expected_version IS NULL OR v_before.version<>p_expected_version THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
 SELECT name INTO v_name FROM public.admin_users WHERE id=v_admin;
 UPDATE private.peer_no_match_requests SET status=p_status,version=version+1,updated_at=clock_timestamp(),processed_at=clock_timestamp(),
   processed_by=v_admin,processed_by_name=v_name,internal_note=btrim(p_internal_note),processing_reason=btrim(p_reason)
 WHERE id=p_request_id RETURNING * INTO v_after;
 INSERT INTO private.peer_no_match_request_audit(request_id,action,actor_admin_id,actor_admin_name,reason,before_values,after_values)
 VALUES(p_request_id,p_status,v_admin,v_name,btrim(p_reason),to_jsonb(v_before),to_jsonb(v_after));
 -- No pair_relationships update, score invalidation or notification occurs here.
 RETURN unified_peer_review.admin_no_match_json(v_after);
END;
$function$;
CREATE FUNCTION public.admin_resolve_peer_no_match_request(p_request_id uuid,p_status text,p_internal_note text,p_expected_version integer,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT unified_peer_review.resolve_no_match_request(p_request_id,p_status,p_internal_note,p_expected_version,p_reason)
$function$;

-- Add only capability metadata and the requesting player's own private records.
CREATE OR REPLACE FUNCTION private.peer_settings_json(p_round_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT unified_peer_review.legacy_settings_json(p_round_id)||jsonb_build_object(
   'review_system',CASE WHEN unified_peer_review.is_unified(p_round_id) THEN 'unified' ELSE 'legacy' END,
   'review_policy',unified_peer_review.policy(p_round_id))
$function$;
DO $patch$
DECLARE d text; needle text;
BEGIN
 d:=pg_get_functiondef('private.save_round_peer_review_settings(uuid,boolean,timestamptz,timestamptz,integer,text,boolean)'::regprocedure);
 needle:=$needle$WHERE round_id=p_round_id AND review_system='unified_v1';$needle$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'PEER_V2_MANUAL_WINDOW_BASELINE_CHANGED'; END IF;
 EXECUTE replace(d,needle,$replace$WHERE round_id=p_round_id AND review_system IN('unified_v1','unified_v2');$replace$);
 d:=pg_get_functiondef('public.player_get_round_peer_reviews(uuid,text,integer,integer)'::regprocedure);
 needle:='RETURN jsonb_build_object(''review_system'',';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'PEER_V2_CONTEXT_BASELINE_CHANGED'; END IF;
 EXECUTE replace(d,needle,$replace$RETURN jsonb_build_object('review_policy',unified_peer_review.policy(p_round_id),
   'no_match_requests',unified_peer_review.own_no_match_requests(p_round_id,v_player),
   'can_request_no_match',unified_peer_review.can_request_no_match(p_round_id,v_player),'review_system',$replace$);
 d:=pg_get_functiondef('public.player_list_round_peer_review_events()'::regprocedure);
 needle:='''review_system'',CASE WHEN unified_peer_review.is_unified(r.id)';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'PEER_V2_EVENTS_BASELINE_CHANGED'; END IF;
 EXECUTE replace(d,needle,$replace$'review_policy',unified_peer_review.policy(r.id),'review_system',CASE WHEN unified_peer_review.is_unified(r.id)$replace$);
 d:=pg_get_functiondef('unified_peer_review.match_review_route(uuid)'::regprocedure);
 needle:='RETURN jsonb_build_object(''review_system'',';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'PEER_V2_ROUTE_BASELINE_CHANGED'; END IF;
 EXECUTE replace(d,needle,'RETURN jsonb_build_object(''review_policy'',unified_peer_review.policy(v_round),''review_system'',');
END;
$patch$;

CREATE FUNCTION unified_peer_review.scrub_confirmation_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NEW.anonymized_at IS NULL OR OLD.anonymized_at IS NOT NULL THEN RETURN NEW; END IF;
 DELETE FROM private.peer_interaction_confirmations WHERE NEW.id IN(reviewer_id,reviewee_id);
 UPDATE private.peer_no_match_request_audit SET reason=NULL,before_values='{}'::jsonb,after_values='{}'::jsonb
 WHERE request_id IN(SELECT id FROM private.peer_no_match_requests WHERE NEW.id IN(requester_id,target_member_id));
 UPDATE private.peer_no_match_requests SET reason='',internal_note=NULL,processing_reason=NULL,payload_hash=NULL,
   processed_by=NULL,processed_by_name=NULL,status='closed',processed_at=COALESCE(processed_at,clock_timestamp()),
   updated_at=clock_timestamp(),version=version+1 WHERE NEW.id IN(requester_id,target_member_id);
 RETURN NEW;
END;
$function$;
CREATE TRIGGER peer_scrub_confirmation_requests AFTER UPDATE OF anonymized_at ON public.members
FOR EACH ROW EXECUTE FUNCTION unified_peer_review.scrub_confirmation_requests();

REVOKE ALL ON FUNCTION unified_peer_review.policy(uuid),unified_peer_review.freeze_policy(),
 unified_peer_review.interaction_confirmed_at(private.round_peer_reviews),
 unified_peer_review.submit_feedback_v2(uuid,uuid,numeric,text,integer,text,text,integer,uuid,boolean),
 unified_peer_review.player_no_match_json(private.peer_no_match_requests),unified_peer_review.own_no_match_requests(uuid,uuid),
 unified_peer_review.can_request_no_match(uuid,uuid),unified_peer_review.submit_no_match_request(uuid,uuid,text,uuid,boolean),
 unified_peer_review.admin_no_match_json(private.peer_no_match_requests),unified_peer_review.admin_list_no_match_requests(text,integer,integer),
 unified_peer_review.resolve_no_match_request(uuid,text,text,integer,text),unified_peer_review.scrub_confirmation_requests()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION unified_peer_review.submit_feedback_v2(uuid,uuid,numeric,text,integer,text,text,integer,uuid,boolean),
 unified_peer_review.submit_no_match_request(uuid,uuid,text,uuid,boolean),unified_peer_review.admin_list_no_match_requests(text,integer,integer),
 unified_peer_review.resolve_no_match_request(uuid,text,text,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.player_submit_round_peer_feedback_v2(uuid,uuid,numeric,text,integer,text,text,integer,uuid,boolean),
 public.player_submit_peer_no_match_request(uuid,uuid,text,uuid,boolean),public.admin_list_peer_no_match_requests(text,integer,integer),
 public.admin_resolve_peer_no_match_request(uuid,text,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.player_submit_round_peer_feedback_v2(uuid,uuid,numeric,text,integer,text,text,integer,uuid,boolean),
 public.player_submit_peer_no_match_request(uuid,uuid,text,uuid,boolean),public.admin_list_peer_no_match_requests(text,integer,integer),
 public.admin_resolve_peer_no_match_request(uuid,text,text,integer,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
