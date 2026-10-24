-- Final publish checks bind trusted server hard-validation to the unchanged
-- authenticated publication transaction. No rescore or business-row backfill.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));
DO $preflight$
BEGIN
 IF md5((SELECT prosrc FROM pg_proc WHERE oid='matching_publication.publish_session(uuid,integer,text)'::regprocedure)) IS DISTINCT FROM '597c3b9e12e0a62f40bf18bd658d67d2' THEN
  RAISE EXCEPTION 'MATCH_PUBLICATION_PREFLIGHT_BASELINE_CHANGED';
 END IF;
END;
$preflight$;

CREATE SCHEMA matching_publication_preflight;
REVOKE ALL ON SCHEMA matching_publication_preflight FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA matching_publication_preflight TO authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA matching_publication_preflight REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE matching_publication_preflight.proofs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES public.match_sessions(id) ON DELETE CASCADE,
 actor_admin_id uuid NOT NULL,
 expected_version integer NOT NULL CHECK(expected_version>=0),
 revision_token text NOT NULL,
 member_ids uuid[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 used_at timestamptz,
 redacted_at timestamptz
);
CREATE INDEX matching_publication_preflight_session ON matching_publication_preflight.proofs(session_id,created_at DESC);
CREATE TABLE matching_publication_preflight.write_context (
 transaction_id bigint NOT NULL,
 backend_pid integer NOT NULL,
 session_id uuid NOT NULL,
 proof_id uuid NOT NULL REFERENCES matching_publication_preflight.proofs(id) ON DELETE CASCADE,
 PRIMARY KEY(transaction_id,backend_pid,session_id)
);
ALTER TABLE matching_publication_preflight.proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_publication_preflight.write_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA matching_publication_preflight FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION matching_publication_preflight.active_ids(p_session_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT COALESCE(array_agg(DISTINCT member_id ORDER BY member_id),'{}'::uuid[])
 FROM public.match_results r CROSS JOIN LATERAL unnest(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)) t(member_id)
 WHERE r.session_id=p_session_id AND r.status<>'cancelled'
$function$;

-- Only values capable of affecting final qualification/hard vetoes are signed.
-- Personality scores, current scoring policy and new activity soft reviews do
-- not enter this token. The stored result revision includes its original score.
CREATE FUNCTION matching_publication_preflight.hard_source(p_source jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 WITH members AS (
  SELECT jsonb_build_object('member_id',s->'member_id','game_type_pref',s->'game_type_pref','gender_pref',s->'gender_pref','availability',s->'availability','interest_tags',s->'interest_tags',
   'account',matching_run.pick(NULLIF(s->'member','null'::jsonb),ARRAY['status','account_status','membership_type','record_scope','user_id','anonymized_at']),
   'identity',matching_run.pick(NULLIF(s#>'{member,member_identity}','null'::jsonb),ARRAY['gender','hobby_tags','personality_self_tags','taboo_tags']),
   'personality',matching_run.pick(NULLIF(s#>'{member,member_personality}','null'::jsonb),ARRAY['expression_style_tags','group_role_tags']),
   'interests',matching_run.pick(NULLIF(s#>'{member,member_interests}','null'::jsonb),ARRAY['scenario_mode_pref','scenario_theme_tags']),
   'boundaries',matching_run.pick(NULLIF(s#>'{member,member_boundaries}','null'::jsonb),ARRAY['taboo_tags','deal_breakers']),
   'legacy_applies',jsonb_typeof(s->'import_metadata')='object'
    AND COALESCE(s#>'{import_metadata,source}','null'::jsonb) NOT IN('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)
    AND COALESCE(s#>'{import_metadata,normalized_name}','null'::jsonb) NOT IN('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb),
   'import',matching_run.pick(NULLIF(s#>'{import_metadata,legacy_profile}','null'::jsonb),ARRAY['gender','interest_tags','social_tags'])) item
  FROM jsonb_array_elements(p_source->'submissions') s
 ), eligibility AS (
  SELECT matching_run.pick(e,ARRAY['member_id','eligible','reasons','import_exempt']) item FROM jsonb_array_elements(p_source->'eligibility') e
 ), history AS (
  SELECT matching_run.pick(h,ARRAY['id','member_a_id','member_b_id','group_members']) item FROM jsonb_array_elements(p_source->'history_results') h
 ), blacklist AS (
  SELECT matching_run.pick(b,ARRAY['member_a_id','member_b_id','status']) item FROM jsonb_array_elements(p_source->'blacklist') b
 )
 SELECT jsonb_build_object('members',COALESCE((SELECT jsonb_agg(item ORDER BY item::text) FROM members),'[]'::jsonb),
  'eligibility',COALESCE((SELECT jsonb_agg(item ORDER BY item::text) FROM eligibility),'[]'::jsonb),
  'history',COALESCE((SELECT jsonb_agg(item ORDER BY item::text) FROM history),'[]'::jsonb),
  'blacklist',COALESCE((SELECT jsonb_agg(item ORDER BY item::text) FROM blacklist),'[]'::jsonb),
  -- Legacy adapter takes the first old review per direction: preserve order.
  'feedbacks',p_source->'feedbacks')
$function$;

CREATE FUNCTION matching_publication_preflight.capture(p_session_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_session public.match_sessions%ROWTYPE; v_ids uuid[]; v_source jsonb; v_rows jsonb; v_token text;
BEGIN
 SELECT * INTO v_session FROM public.match_sessions WHERE id=p_session_id;
 IF v_session.id IS NULL OR v_session.round_id IS NULL THEN RAISE EXCEPTION 'MATCH_PUBLICATION_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 IF p_expected_version IS NULL OR p_expected_version<0 THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
 IF v_session.status='confirmed' AND v_session.publication_version=p_expected_version+1
  AND EXISTS(SELECT 1 FROM matching_publication.publications WHERE session_id=p_session_id AND version=v_session.publication_version AND withdrawn_at IS NULL) THEN
  RETURN jsonb_build_object('already_applied',true,'published',true,'round_id',v_session.round_id,'session_id',p_session_id,'publication_version',v_session.publication_version);
 END IF;
 IF v_session.status<>'draft' OR v_session.publication_version<>p_expected_version THEN RAISE EXCEPTION 'MATCH_PUBLICATION_STALE' USING ERRCODE='PT409'; END IF;
 IF NOT v_session.results_ready THEN RAISE EXCEPTION 'MATCH_PUBLICATION_INCOMPLETE' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.match_rounds WHERE id=v_session.round_id AND purpose='matching' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'MATCH_PUBLICATION_READ_ONLY' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM matching_adjustment.operations WHERE session_id=p_session_id AND status='running' AND lease_expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'MATCH_PUBLICATION_ADJUSTMENT_BUSY' USING ERRCODE='PT409'; END IF;
 PERFORM matching_publication.assert_complete(p_session_id);
 v_ids:=matching_publication_preflight.active_ids(p_session_id);
 -- Current hard inputs only. Reading source_v3 would unnecessarily validate
 -- a newer scoring policy and new soft feedback for an already scored result.
 v_source:=matching_adjustment.scoped_source(matching_run.source(v_session.round_id),v_ids);
 IF EXISTS(SELECT 1 FROM unnest(v_ids) ids(id) WHERE NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_source->'eligibility') e WHERE (e->>'member_id')::uuid=id AND (e->>'eligible')::boolean))
  OR EXISTS(SELECT 1 FROM public.members WHERE id=ANY(v_ids) AND (status<>'approved' OR account_status<>'active' OR anonymized_at IS NOT NULL OR user_id IS NULL)) THEN
  RAISE EXCEPTION 'MATCH_PUBLICATION_INELIGIBLE' USING ERRCODE='PT409';
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'member_a_id',r.member_a_id,'member_b_id',r.member_b_id,'group_members',r.group_members,'best_slot',r.best_slot) ORDER BY r.id),'[]'::jsonb)
 INTO v_rows FROM public.match_results r WHERE r.session_id=p_session_id AND r.status<>'cancelled';
 v_token:=md5(jsonb_build_object('session_revision',matching_adjustment.revision(p_session_id),'hard_source',matching_publication_preflight.hard_source(v_source),'version',p_expected_version)::text);
 RETURN jsonb_build_object('already_applied',false,'round_id',v_session.round_id,'session_id',p_session_id,'revision_token',v_token,
  'capture',jsonb_build_object('snapshot_id',gen_random_uuid(),'captured_at',statement_timestamp(),'source',v_source),'current_rows',v_rows);
END;
$function$;

-- A short publish transaction must freeze canonical subjects strongly enough
-- to conflict with the existing profile/relationship guards' KEY SHARE locks.
-- NOWAIT handles the opposite lock order in existing round operations safely.
CREATE FUNCTION matching_publication_preflight.lock_subjects(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_round uuid;
BEGIN
 SELECT round_id INTO v_round FROM public.match_sessions WHERE id=p_session_id;
 IF v_round IS NULL THEN RAISE EXCEPTION 'MATCH_PUBLICATION_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 BEGIN
  PERFORM 1 FROM public.members WHERE id IN(
   SELECT member_id FROM public.unmatched_diagnostics WHERE session_id=p_session_id
   UNION SELECT member_id FROM public.match_results r CROSS JOIN LATERAL unnest(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)) ids(member_id) WHERE r.session_id=p_session_id
  ) ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.match_rounds WHERE id=v_round FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.match_sessions WHERE id=p_session_id FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'MATCH_PUBLICATION_BUSY' USING ERRCODE='PT409';
 END;
END;
$function$;

CREATE FUNCTION matching_publication_preflight.prepare(p_session_id uuid,p_actor_admin_id uuid,p_expected_publication_version integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 RETURN matching_publication_preflight.capture(p_session_id,p_expected_publication_version);
END;
$function$;

-- Only the trusted server may issue a proof after the pure hard validator.
-- No raw questionnaire, score or actor details are sent to the browser.
CREATE FUNCTION matching_publication_preflight.authorize(p_session_id uuid,p_actor_admin_id uuid,p_expected_publication_version integer,p_revision_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_current jsonb; v_id uuid;
BEGIN
 PERFORM matching_run.require_server_admin(p_actor_admin_id);
 PERFORM matching_publication_preflight.lock_subjects(p_session_id);
 v_current:=matching_publication_preflight.capture(p_session_id,p_expected_publication_version);
 IF (v_current->>'already_applied')::boolean THEN RETURN v_current; END IF;
 IF p_revision_token IS NULL OR p_revision_token IS DISTINCT FROM v_current->>'revision_token' THEN RAISE EXCEPTION 'MATCH_PUBLICATION_PREFLIGHT_STALE' USING ERRCODE='PT409'; END IF;
 INSERT INTO matching_publication_preflight.proofs(session_id,actor_admin_id,expected_version,revision_token,member_ids)
 VALUES(p_session_id,p_actor_admin_id,p_expected_publication_version,p_revision_token,matching_publication_preflight.active_ids(p_session_id)) RETURNING id INTO v_id;
 RETURN jsonb_build_object('already_applied',false,'round_id',v_current->'round_id','preflight_id',v_id);
END;
$function$;

CREATE FUNCTION matching_publication_preflight.assert_context(p_session_id uuid,p_expected_version integer,p_actor uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM matching_publication_preflight.write_context context JOIN matching_publication_preflight.proofs proof ON proof.id=context.proof_id
  WHERE context.transaction_id=txid_current() AND context.backend_pid=pg_backend_pid() AND context.session_id=p_session_id
   AND proof.session_id=p_session_id AND proof.actor_admin_id=p_actor AND proof.expected_version=p_expected_version
   AND proof.redacted_at IS NULL AND proof.used_at IS NULL AND proof.expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'MATCH_PUBLICATION_PREFLIGHT_REQUIRED' USING ERRCODE='PT409';
 END IF;
END;
$function$;

-- Keep the original function OID, administrator auth identity, idempotent branch,
-- assignments, cancellation versions, notices and rollback behavior unchanged.
DO $guard$
DECLARE definition text; anchor text:='  PERFORM matching_publication.assert_complete(p_session_id);';
BEGIN
 definition:=pg_get_functiondef('matching_publication.publish_session(uuid,integer,text)'::regprocedure);
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'MATCH_PUBLICATION_PREFLIGHT_ANCHOR_CHANGED'; END IF;
 definition:=replace(definition,anchor,anchor||E'\n  PERFORM matching_publication_preflight.assert_context(p_session_id,p_expected_publication_version,v_admin);');
 EXECUTE definition;
END;
$guard$;

CREATE FUNCTION matching_publication_preflight.publish_checked(p_session_id uuid,p_expected_publication_version integer,p_reason text,p_preflight_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor uuid:=matching_publication.require_admin(p_reason); v_current jsonb; v_proof matching_publication_preflight.proofs%ROWTYPE; v_result jsonb;
BEGIN
 PERFORM matching_publication_preflight.lock_subjects(p_session_id);
 v_current:=matching_publication_preflight.capture(p_session_id,p_expected_publication_version);
 IF (v_current->>'already_applied')::boolean THEN
  RETURN matching_publication.publish_session(p_session_id,p_expected_publication_version,p_reason);
 END IF;
 SELECT * INTO v_proof FROM matching_publication_preflight.proofs WHERE id=p_preflight_id FOR UPDATE;
 IF v_proof.id IS NULL OR v_proof.session_id<>p_session_id OR v_proof.actor_admin_id<>v_actor OR v_proof.expected_version<>p_expected_publication_version OR v_proof.redacted_at IS NOT NULL OR v_proof.used_at IS NOT NULL THEN RAISE EXCEPTION 'MATCH_PUBLICATION_PREFLIGHT_INVALID' USING ERRCODE='PT409'; END IF;
 IF v_proof.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'MATCH_PUBLICATION_PREFLIGHT_EXPIRED' USING ERRCODE='PT409'; END IF;
 IF v_proof.revision_token IS DISTINCT FROM v_current->>'revision_token' THEN RAISE EXCEPTION 'MATCH_PUBLICATION_PREFLIGHT_STALE' USING ERRCODE='PT409'; END IF;
 INSERT INTO matching_publication_preflight.write_context VALUES(txid_current(),pg_backend_pid(),p_session_id,v_proof.id);
 v_result:=matching_publication.publish_session(p_session_id,p_expected_publication_version,p_reason);
 UPDATE matching_publication_preflight.proofs SET used_at=clock_timestamp() WHERE id=v_proof.id;
 DELETE FROM matching_publication_preflight.write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND session_id=p_session_id;
 RETURN v_result;
END;
$function$;

CREATE FUNCTION matching_publication_preflight.erase_anonymized()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN
  UPDATE matching_publication_preflight.proofs SET member_ids='{}',revision_token='privacy-redacted',redacted_at=clock_timestamp()
   WHERE redacted_at IS NULL AND NEW.id=ANY(member_ids);
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER matching_publication_preflight_member_erasure AFTER UPDATE OF anonymized_at ON public.members FOR EACH ROW EXECUTE FUNCTION matching_publication_preflight.erase_anonymized();

CREATE FUNCTION public.admin_prepare_match_publication(p_session_id uuid,p_actor_admin_id uuid,p_expected_publication_version integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_publication_preflight.prepare(p_session_id,p_actor_admin_id,p_expected_publication_version) $function$;
CREATE FUNCTION public.admin_authorize_match_publication(p_session_id uuid,p_actor_admin_id uuid,p_expected_publication_version integer,p_revision_token text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_publication_preflight.authorize(p_session_id,p_actor_admin_id,p_expected_publication_version,p_revision_token) $function$;
CREATE FUNCTION public.admin_publish_checked_match_session(p_session_id uuid,p_expected_publication_version integer,p_reason text,p_preflight_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$ SELECT matching_publication_preflight.publish_checked(p_session_id,p_expected_publication_version,p_reason,p_preflight_id) $function$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA matching_publication_preflight FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION matching_publication_preflight.prepare(uuid,uuid,integer),matching_publication_preflight.authorize(uuid,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION matching_publication_preflight.publish_checked(uuid,integer,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_prepare_match_publication(uuid,uuid,integer),public.admin_authorize_match_publication(uuid,uuid,integer,text),public.admin_publish_checked_match_session(uuid,integer,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_prepare_match_publication(uuid,uuid,integer),public.admin_authorize_match_publication(uuid,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_checked_match_session(uuid,integer,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
