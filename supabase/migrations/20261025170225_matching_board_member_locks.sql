-- Per-member pins retain people in the duo pool. Two pinned partners also freeze their current pair.
-- Existing result locks and publication rules remain independent.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));

CREATE TABLE matching_board.member_locks (
 session_id uuid NOT NULL REFERENCES public.match_sessions(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
 locked_by uuid NOT NULL,
 locked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,member_id)
);
CREATE INDEX matching_board_member_lock_subject ON matching_board.member_locks(member_id);
CREATE TABLE matching_board.member_lock_operations (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES public.match_sessions(id) ON DELETE CASCADE,
 actor_admin_id uuid NOT NULL,
 member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
 locked boolean NOT NULL,
 request_hash text NOT NULL,
 expected_revision text NOT NULL,
 result_revision text,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 redacted_at timestamptz
);
CREATE INDEX matching_board_member_lock_history ON matching_board.member_lock_operations(session_id,created_at DESC,id);
CREATE INDEX matching_board_member_lock_operation_subject ON matching_board.member_lock_operations(member_id);
ALTER TABLE matching_board.member_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_board.member_lock_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON matching_board.member_locks,matching_board.member_lock_operations FROM PUBLIC,anon,authenticated,service_role;

-- Replacing this small revision function must not discard an independently
-- deployed revision input. Exact source hash is from the preceding migration.
DO $preflight$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('matching_adjustment.revision(uuid)')) IS DISTINCT FROM 'a2464482085b6d3c70b8995d36af4077' THEN
  RAISE EXCEPTION 'MATCH_MEMBER_LOCK_REVISION_DEPENDENCY_CHANGED';
 END IF;
END;
$preflight$;

-- The operation count also detects lock/unlock ABA: returning to the same lock
-- set cannot make an older preview's version valid again.
CREATE OR REPLACE FUNCTION matching_adjustment.revision(p_session_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT md5(jsonb_build_object('session',to_jsonb(s),
  'results',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r WHERE session_id=s.id),'[]'::jsonb),
  'diagnostics',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.unmatched_diagnostics d WHERE session_id=s.id),'[]'::jsonb),
  'member_locks',COALESCE((SELECT jsonb_agg(member_id ORDER BY member_id) FROM matching_board.member_locks WHERE session_id=s.id),'[]'::jsonb),
  'member_lock_revision',(SELECT count(*) FROM matching_board.member_lock_operations WHERE session_id=s.id))::text)
 FROM public.match_sessions s WHERE s.id=p_session_id
$function$;

CREATE FUNCTION matching_board.assert_member_locks(p_session_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM matching_board.member_locks l WHERE l.session_id=p_session_id
  AND NOT EXISTS(SELECT 1 FROM public.match_results r WHERE r.session_id=p_session_id AND r.status<>'cancelled'
   AND r.member_b_id IS NOT NULL AND l.member_id IN(r.member_a_id,r.member_b_id))
  AND NOT (matching_board.current_layout(p_session_id)->'waitingDuoIds' @> to_jsonb(ARRAY[l.member_id]))) THEN
  RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCKED' USING ERRCODE='PT409';
 END IF;
END;
$function$;

-- These additions keep the established capture/save/legacy adjustment logic
-- intact and fail closed if its exact insertion points have changed.
DO $migration$
DECLARE definition text; original text; replacement text;
BEGIN
 definition:=pg_get_functiondef('matching_board.capture(uuid,uuid)'::regprocedure);
 original:=$old$  'capture',jsonb_build_object('snapshot_id',gen_random_uuid(),'captured_at',statement_timestamp(),'source',v_source));$old$;
 replacement:=$new$  'locked_member_ids',COALESCE((SELECT jsonb_agg(member_id ORDER BY member_id) FROM matching_board.member_locks WHERE session_id=p_session_id),'[]'::jsonb),
  'member_lock_operations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'created_at',o.created_at,'locked',o.locked) ORDER BY o.created_at DESC,o.id)
   FROM (SELECT id,created_at,locked FROM matching_board.member_lock_operations WHERE session_id=p_session_id ORDER BY created_at DESC,id LIMIT 50) o),'[]'::jsonb),
  'capture',jsonb_build_object('snapshot_id',gen_random_uuid(),'captured_at',statement_timestamp(),'source',v_source));$new$;
 IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'MATCH_MEMBER_LOCK_CAPTURE_DEPENDENCY_CHANGED'; END IF;
 EXECUTE replace(definition,original,replacement);
 definition:=pg_get_functiondef('matching_board.save(uuid,uuid,uuid,text,text,jsonb,uuid[],jsonb,jsonb,uuid[],text)'::regprocedure);
 original:=$old$ PERFORM matching_publication.assert_complete(p_session_id);$old$;
 replacement:=$new$ PERFORM matching_board.assert_member_locks(p_session_id);
 PERFORM matching_publication.assert_complete(p_session_id);$new$;
 IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'MATCH_MEMBER_LOCK_SAVE_DEPENDENCY_CHANGED'; END IF;
 EXECUTE replace(definition,original,replacement);
 definition:=pg_get_functiondef('matching_adjustment.preview(uuid,uuid,text,uuid[],uuid)'::regprocedure);
 original:=$old$ IF p_kind='split' THEN
  RETURN jsonb_build_object$old$;
 replacement:=$new$ -- The legacy split action sends both people to its cancelled pool, not duo waiting.
 IF p_kind='split' AND EXISTS(SELECT 1 FROM matching_board.member_locks WHERE session_id=p_session_id AND member_id=ANY(v_ids)) THEN
  RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCKED' USING ERRCODE='PT409';
 END IF;
 IF p_kind='split' THEN
  RETURN jsonb_build_object$new$;
 IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'MATCH_MEMBER_LOCK_PREVIEW_DEPENDENCY_CHANGED'; END IF;
 EXECUTE replace(definition,original,replacement);
 -- Keep other waiting members when one subject is anonymized. Clearing the
 -- entire historical layout would otherwise move their independent pins out
 -- of the duo pool and incorrectly veto this unrelated privacy operation.
 definition:=pg_get_functiondef('matching_board.erase_anonymized()'::regprocedure);
 original:=$old$  UPDATE matching_board.state s SET layout='{"waitingDuoIds":[],"brokenPairs":[]}'::jsonb,updated_at=clock_timestamp()
   WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(s.layout->'waitingDuoIds') id WHERE id::uuid=NEW.id);$old$;
 replacement:=$new$  UPDATE matching_board.state s SET layout=jsonb_build_object(
    'waitingDuoIds',COALESCE((SELECT jsonb_agg(id) FROM jsonb_array_elements(s.layout->'waitingDuoIds') id WHERE (id#>>'{}')::uuid<>NEW.id),'[]'::jsonb),
    'brokenPairs',COALESCE((SELECT jsonb_agg(pair) FROM jsonb_array_elements(s.layout->'brokenPairs') pair
     WHERE NOT pair->'memberIds' @> to_jsonb(ARRAY[NEW.id])),'[]'::jsonb)),updated_at=clock_timestamp()
   WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(s.layout->'waitingDuoIds') id WHERE id::uuid=NEW.id);$new$;
 IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'MATCH_MEMBER_LOCK_ERASURE_DEPENDENCY_CHANGED'; END IF;
 EXECUTE replace(definition,original,replacement);
END;
$migration$;

CREATE FUNCTION matching_board.member_lock_receipt(p_operation_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_op matching_board.member_lock_operations%ROWTYPE;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 SELECT * INTO v_op FROM matching_board.member_lock_operations WHERE id=p_operation_id AND actor_admin_id=p_actor_admin_id;
 IF v_op.id IS NULL THEN RETURN NULL; END IF;
 IF v_op.redacted_at IS NOT NULL THEN RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_REDACTED' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('session_id',v_op.session_id,'operation_id',v_op.id,'member_id',v_op.member_id,'locked',v_op.locked,
  'expected_revision',v_op.expected_revision,'base_revision',v_op.result_revision,'already_applied',true);
END;
$function$;

CREATE FUNCTION matching_board.set_member_lock(p_session_id uuid,p_actor_admin_id uuid,p_member_id uuid,p_locked boolean,p_operation_id uuid,p_expected_revision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_op matching_board.member_lock_operations%ROWTYPE; v_session public.match_sessions%ROWTYPE;
 v_round uuid; v_capture jsonb; v_hash text; v_revision text; v_reason text;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 IF p_session_id IS NULL OR p_member_id IS NULL OR p_operation_id IS NULL OR p_locked IS NULL
  OR p_expected_revision IS NULL OR char_length(p_expected_revision) NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 v_hash:=md5(jsonb_build_object('session',p_session_id,'actor',p_actor_admin_id,'member',p_member_id,'locked',p_locked,'revision',p_expected_revision)::text);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('matching-board-member-lock-operation:'||p_operation_id::text,0)) THEN
  RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_BUSY' USING ERRCODE='PT409';
 END IF;
 SELECT * INTO v_op FROM matching_board.member_lock_operations WHERE id=p_operation_id;
 IF v_op.id IS NOT NULL THEN
  IF v_op.redacted_at IS NOT NULL THEN RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_REDACTED' USING ERRCODE='PT409'; END IF;
  IF v_op.actor_admin_id<>p_actor_admin_id OR v_op.session_id<>p_session_id OR v_op.request_hash<>v_hash THEN
   RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_REQUEST_CONFLICT' USING ERRCODE='PT409';
  END IF;
  RETURN matching_board.member_lock_receipt(p_operation_id,p_actor_admin_id);
 END IF;
 SELECT round_id INTO v_round FROM public.match_sessions WHERE id=p_session_id;
 IF v_round IS NULL THEN RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_SESSION_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('matching-run-job:'||v_round::text,0))
  OR NOT pg_try_advisory_xact_lock(hashtextextended('matching-adjustment:'||p_session_id::text,0)) THEN
  RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_BUSY' USING ERRCODE='PT409';
 END IF;
 BEGIN
  PERFORM 1 FROM public.members WHERE id=p_member_id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.match_rounds WHERE id=v_round FOR UPDATE NOWAIT;
  SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_BUSY' USING ERRCODE='PT409'; END;
 IF v_session.status<>'draft' OR NOT v_session.results_ready THEN RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_REQUIRES_DRAFT' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM matching_adjustment.operations WHERE session_id=p_session_id AND status='running' AND lease_expires_at>clock_timestamp())
  OR EXISTS(SELECT 1 FROM matching_run.jobs WHERE round_id=v_round AND status='running' AND lease_expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_BUSY' USING ERRCODE='PT409';
 END IF;
 v_capture:=matching_board.capture(p_session_id,p_actor_admin_id);
 IF p_expected_revision IS DISTINCT FROM v_capture->>'base_revision' THEN RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_STALE' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_member_id AND anonymized_at IS NULL)
  OR NOT (EXISTS(SELECT 1 FROM public.match_results WHERE session_id=p_session_id AND status IN('draft','locked') AND member_b_id IS NOT NULL
   AND p_member_id IN(member_a_id,member_b_id)) OR v_capture#>'{layout,waitingDuoIds}' @> to_jsonb(ARRAY[p_member_id])) THEN
  RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_NOT_IN_DUO' USING ERRCODE='PT409';
 END IF;
 v_reason:=CASE WHEN p_locked THEN '后台锁定双人池成员' ELSE '后台解除双人池成员锁定' END;
 IF p_locked THEN
  INSERT INTO matching_board.member_locks(session_id,member_id,locked_by) VALUES(p_session_id,p_member_id,p_actor_admin_id) ON CONFLICT(session_id,member_id) DO NOTHING;
 ELSE DELETE FROM matching_board.member_locks WHERE session_id=p_session_id AND member_id=p_member_id;
 END IF;
 INSERT INTO matching_board.member_lock_operations(id,session_id,actor_admin_id,member_id,locked,request_hash,expected_revision,reason)
 VALUES(p_operation_id,p_session_id,p_actor_admin_id,p_member_id,p_locked,v_hash,p_expected_revision,v_reason);
 v_revision:=matching_board.capture(p_session_id,p_actor_admin_id)->>'base_revision';
 UPDATE matching_board.member_lock_operations SET result_revision=v_revision WHERE id=p_operation_id;
 RETURN matching_board.member_lock_receipt(p_operation_id,p_actor_admin_id)||jsonb_build_object('already_applied',false);
END;
$function$;

-- Immediate protection freezes an existing pair only when both partners are
-- pinned. One pinned partner may be split to duo waiting or get a new partner.
-- Deferred final-state checks below allow those atomic intermediate changes,
-- but forbid every writer (including service-role/legacy workers) from leaving
-- a pinned member in the unmatched or multi pool.
CREATE FUNCTION matching_board.guard_member_locked_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_id uuid; v_old_ids uuid[]; v_new_ids uuid[];
BEGIN
 FOR v_id IN SELECT DISTINCT id FROM unnest(CASE WHEN TG_OP='INSERT' THEN ARRAY[NEW.session_id] WHEN TG_OP='DELETE' THEN ARRAY[OLD.session_id] ELSE ARRAY[OLD.session_id,NEW.session_id] END) ids(id) ORDER BY id LOOP
  BEGIN PERFORM 1 FROM public.match_sessions WHERE id=v_id FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCK_BUSY' USING ERRCODE='PT409'; END;
 END LOOP;
 IF TG_OP<>'INSERT' THEN v_old_ids:=matching_publication.member_ids(OLD.member_a_id,OLD.member_b_id,OLD.group_members); END IF;
 IF TG_OP<>'DELETE' THEN v_new_ids:=matching_publication.member_ids(NEW.member_a_id,NEW.member_b_id,NEW.group_members); END IF;
 IF (TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.match_sessions WHERE id=OLD.session_id))
  OR (TG_OP<>'INSERT' AND matching_publication.has_context(OLD.session_id))
  OR (TG_OP='INSERT' AND matching_publication.has_context(NEW.session_id)) THEN
  -- A player's approved cancellation must not be vetoed by an administrator's
  -- draft pin. Its audited publication transaction also releases those pins.
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.status<>'cancelled' AND NEW.status='cancelled') THEN
   DELETE FROM matching_board.member_locks WHERE session_id=OLD.session_id AND member_id=ANY(v_old_ids);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP<>'INSERT' AND OLD.status<>'cancelled' AND OLD.member_b_id IS NOT NULL
  AND (SELECT count(*) FROM matching_board.member_locks WHERE session_id=OLD.session_id AND member_id IN(OLD.member_a_id,OLD.member_b_id))=2 THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCKED' USING ERRCODE='PT409'; END IF;
  IF NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.status='cancelled'
   OR NEW.member_a_id IS DISTINCT FROM OLD.member_a_id OR NEW.member_b_id IS DISTINCT FROM OLD.member_b_id
   OR NEW.group_members IS DISTINCT FROM OLD.group_members OR NEW.best_slot IS DISTINCT FROM OLD.best_slot THEN
   RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCKED' USING ERRCODE='PT409';
  END IF;
 END IF;
 IF TG_OP<>'DELETE' AND NEW.status<>'cancelled' AND NEW.member_b_id IS NULL
  AND EXISTS(SELECT 1 FROM matching_board.member_locks WHERE session_id=NEW.session_id AND member_id=ANY(v_new_ids)) THEN
  RAISE EXCEPTION 'MATCH_BOARD_MEMBER_LOCKED' USING ERRCODE='PT409';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;
CREATE TRIGGER matching_board_member_lock_result BEFORE INSERT OR UPDATE OR DELETE ON public.match_results
 FOR EACH ROW EXECUTE FUNCTION matching_board.guard_member_locked_result();

CREATE FUNCTION matching_board.guard_member_locked_final_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_id uuid;
BEGIN
 FOR v_id IN SELECT DISTINCT id FROM unnest(CASE WHEN TG_OP='INSERT' THEN ARRAY[NEW.session_id] WHEN TG_OP='DELETE' THEN ARRAY[OLD.session_id] ELSE ARRAY[OLD.session_id,NEW.session_id] END) ids(id) ORDER BY id LOOP
  PERFORM matching_board.assert_member_locks(v_id);
 END LOOP;
 RETURN NULL;
END;
$function$;
CREATE CONSTRAINT TRIGGER matching_board_member_lock_result_final AFTER INSERT OR UPDATE OR DELETE ON public.match_results
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION matching_board.guard_member_locked_final_state();
CREATE CONSTRAINT TRIGGER matching_board_member_lock_layout_final AFTER INSERT OR UPDATE OR DELETE ON matching_board.state
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION matching_board.guard_member_locked_final_state();

CREATE FUNCTION matching_board.erase_member_locks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN
  DELETE FROM matching_board.member_locks WHERE member_id=NEW.id;
  UPDATE matching_board.member_lock_operations SET member_id=NULL,request_hash='privacy-redacted',expected_revision='privacy-redacted',
   result_revision='privacy-redacted',reason='隐私处理已清除',redacted_at=clock_timestamp() WHERE member_id=NEW.id AND redacted_at IS NULL;
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_board_member_lock_erasure AFTER UPDATE OF anonymized_at ON public.members
 FOR EACH ROW EXECUTE FUNCTION matching_board.erase_member_locks();
CREATE FUNCTION public.admin_set_matching_board_member_lock(p_session_id uuid,p_actor_admin_id uuid,p_member_id uuid,p_locked boolean,p_operation_id uuid,p_expected_revision text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT matching_board.set_member_lock(p_session_id,p_actor_admin_id,p_member_id,p_locked,p_operation_id,p_expected_revision)
$function$;
CREATE FUNCTION public.admin_get_matching_board_member_lock_operation(p_operation_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT matching_board.member_lock_receipt(p_operation_id,p_actor_admin_id)
$function$;
REVOKE ALL ON FUNCTION matching_board.assert_member_locks(uuid),matching_board.member_lock_receipt(uuid,uuid),
 matching_board.set_member_lock(uuid,uuid,uuid,boolean,uuid,text),matching_board.guard_member_locked_result(),matching_board.guard_member_locked_final_state(),matching_board.erase_member_locks()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION matching_board.member_lock_receipt(uuid,uuid),matching_board.set_member_lock(uuid,uuid,uuid,boolean,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_set_matching_board_member_lock(uuid,uuid,uuid,boolean,uuid,text),public.admin_get_matching_board_member_lock_operation(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_matching_board_member_lock(uuid,uuid,uuid,boolean,uuid,text),public.admin_get_matching_board_member_lock_operation(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
