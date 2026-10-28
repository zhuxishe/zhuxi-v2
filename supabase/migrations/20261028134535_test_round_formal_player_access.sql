-- Install an opt-in per-round audience. No round is opened by this migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));
DO $dependency$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.test_account_round_allowed(uuid,uuid)'::regprocedure) IS DISTINCT FROM '204fe1d423470c72f2045ebba1e99cc9'
  OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='test_pool_access.get_my_test_round_ids()'::regprocedure) IS DISTINCT FROM '83a57b636a2956bfa220a1ab57a1e31b'
  OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.admin_configure_test_round(uuid,uuid,uuid[],text)'::regprocedure) IS DISTINCT FROM '8fa5cd26e9e983e2cc871774f4b93204'
 THEN RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_DEPENDENCY_CHANGED'; END IF;
END;
$dependency$;

CREATE TABLE test_pool_access.round_formal_player_access (
 round_id uuid PRIMARY KEY REFERENCES public.match_rounds(id) ON DELETE CASCADE,
 enabled boolean NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 database_session_user text NOT NULL,
 database_effective_user text NOT NULL,
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 4 AND 500)
);
CREATE TABLE test_pool_access.round_formal_player_access_audit (
 operation_id uuid PRIMARY KEY,
 round_id uuid NOT NULL,
 round_name_snapshot text NOT NULL,
 previous_enabled boolean NOT NULL,
 enabled boolean NOT NULL,
 changed boolean NOT NULL,
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 4 AND 500),
 database_session_user text NOT NULL,
 database_effective_user text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX round_formal_player_access_audit_round_idx ON test_pool_access.round_formal_player_access_audit(round_id,created_at DESC);
ALTER TABLE test_pool_access.round_formal_player_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_pool_access.round_formal_player_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON test_pool_access.round_formal_player_access,test_pool_access.round_formal_player_access_audit FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION test_pool_access.protect_formal_player_access_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
BEGIN
 RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_AUDIT_IMMUTABLE' USING ERRCODE='42501';
END;
$function$;
CREATE TRIGGER round_formal_player_access_audit_immutable BEFORE UPDATE OR DELETE ON test_pool_access.round_formal_player_access_audit
 FOR EACH ROW EXECUTE FUNCTION test_pool_access.protect_formal_player_access_audit();
CREATE TRIGGER round_formal_player_access_audit_no_truncate BEFORE TRUNCATE ON test_pool_access.round_formal_player_access_audit
 FOR EACH STATEMENT EXECUTE FUNCTION test_pool_access.protect_formal_player_access_audit();

CREATE OR REPLACE FUNCTION private.test_account_round_allowed(p_round_id uuid,p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT COALESCE((SELECT CASE WHEN COALESCE(r.is_test,false)
  THEN EXISTS(SELECT 1 FROM private.test_round_members a WHERE a.round_id=p_round_id AND a.member_id=m.id)
   OR (NOT m.is_test AND m.status='approved' AND m.account_status='active' AND m.record_scope='current'
    AND m.membership_type='player' AND m.user_id IS NOT NULL AND m.anonymized_at IS NULL
    AND EXISTS(SELECT 1 FROM test_pool_access.round_formal_player_access access WHERE access.round_id=r.id AND access.enabled))
  ELSE NOT m.is_test END FROM public.members m LEFT JOIN public.match_rounds r ON r.id=p_round_id
  WHERE m.id=p_member_id),false)
$function$;

-- No time/status filter here: result/history access must survive signup closing.
-- Existing player list and submission guards enforce the registration window.
CREATE OR REPLACE FUNCTION test_pool_access.get_my_test_round_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT COALESCE(array_agg(DISTINCT r.id ORDER BY r.id),'{}'::uuid[])
 FROM public.match_rounds r JOIN public.members m ON m.user_id=auth.uid() AND m.status='approved'
  AND m.account_status='active' AND m.record_scope='current' AND m.anonymized_at IS NULL
 WHERE r.is_test AND r.deleted_at IS NULL AND private.test_account_round_allowed(r.id,m.id)
$function$;

-- The original initializer is intentionally limited to its fixed 33-person pool.
-- It must never silently overwrite the meaning of an independently opened round.
DO $legacy_guard$
DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('public.admin_configure_test_round(uuid,uuid,uuid[],text)'::regprocedure);
 anchor:=' SELECT * INTO v_round FROM public.match_rounds WHERE id=p_round_id FOR UPDATE;';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_CONFIG_DEPENDENCY_CHANGED'; END IF;
 EXECUTE replace(definition,anchor,anchor||E'\n IF EXISTS(SELECT 1 FROM test_pool_access.round_formal_player_access WHERE round_id=p_round_id AND enabled) THEN RAISE EXCEPTION ''TEST_ROUND_DYNAMIC_AUDIENCE_ACTIVE'' USING ERRCODE=''PT409''; END IF;');
END;
$legacy_guard$;

-- Operations-only entry point. No API role receives EXECUTE; it does not accept
-- a fabricated application actor. The actual database identities are audited.
CREATE FUNCTION test_pool_access.set_round_formal_player_access(p_round_id uuid,p_enabled boolean,p_reason text,p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_round public.match_rounds%ROWTYPE; v_previous boolean; v_reason text:=btrim(p_reason);
 v_receipt test_pool_access.round_formal_player_access_audit%ROWTYPE;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_DATABASE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_round_id IS NULL OR p_enabled IS NULL OR p_operation_id IS NULL OR char_length(COALESCE(v_reason,'')) NOT BETWEEN 4 AND 500 THEN
  RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('test-round-audience-operation:'||p_operation_id::text,0)) THEN
  RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_BUSY' USING ERRCODE='PT409';
 END IF;
 SELECT * INTO v_receipt FROM test_pool_access.round_formal_player_access_audit WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF v_receipt.round_id<>p_round_id OR v_receipt.enabled<>p_enabled OR v_receipt.reason<>v_reason
   OR v_receipt.database_session_user<>session_user::text OR v_receipt.database_effective_user<>current_user::text THEN
   RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_OPERATION_CONFLICT' USING ERRCODE='PT409';
  END IF;
  RETURN to_jsonb(v_receipt)||jsonb_build_object('already_applied',true);
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('matching-run-job:'||p_round_id::text,0)) THEN
  RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_BUSY' USING ERRCODE='PT409';
 END IF;
 BEGIN
  SELECT * INTO v_round FROM public.match_rounds WHERE id=p_round_id FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_BUSY' USING ERRCODE='PT409'; END;
 IF v_round.id IS NULL OR v_round.deleted_at IS NOT NULL OR NOT v_round.is_test OR v_round.purpose<>'matching' THEN
  RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_ROUND_UNAVAILABLE' USING ERRCODE='PT409';
 END IF;
 IF EXISTS(SELECT 1 FROM matching_run.jobs WHERE round_id=p_round_id AND status='running' AND lease_expires_at>clock_timestamp())
  OR EXISTS(SELECT 1 FROM matching_adjustment.operations operation JOIN public.match_sessions s ON s.id=operation.session_id
   WHERE s.round_id=p_round_id AND operation.status='running' AND operation.lease_expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_BUSY' USING ERRCODE='PT409';
 END IF;
 SELECT COALESCE((SELECT enabled FROM test_pool_access.round_formal_player_access WHERE round_id=p_round_id),false) INTO v_previous;
 IF NOT p_enabled AND v_previous AND (
  EXISTS(SELECT 1 FROM public.match_round_submissions submission WHERE submission.round_id=p_round_id
   AND NOT EXISTS(SELECT 1 FROM private.test_round_members a WHERE a.round_id=p_round_id AND a.member_id=submission.member_id))
  OR EXISTS(SELECT 1 FROM public.match_results result JOIN public.match_sessions s ON s.id=result.session_id
   CROSS JOIN LATERAL unnest(matching_publication.member_ids(result.member_a_id,result.member_b_id,result.group_members)) ids(member_id)
   WHERE s.round_id=p_round_id AND NOT EXISTS(SELECT 1 FROM private.test_round_members a WHERE a.round_id=p_round_id AND a.member_id=ids.member_id))
  OR EXISTS(SELECT 1 FROM matching_publication.roster participant JOIN matching_publication.publications publication ON publication.id=participant.publication_id
   WHERE publication.round_id=p_round_id AND NOT EXISTS(SELECT 1 FROM private.test_round_members a WHERE a.round_id=p_round_id AND a.member_id=participant.member_id))
  OR EXISTS(SELECT 1 FROM public.unmatched_diagnostics diagnostic JOIN public.match_sessions s ON s.id=diagnostic.session_id
   WHERE s.round_id=p_round_id AND NOT EXISTS(SELECT 1 FROM private.test_round_members a WHERE a.round_id=p_round_id AND a.member_id=diagnostic.member_id))
  OR EXISTS(SELECT 1 FROM private.round_peer_review_participants participant WHERE participant.round_id=p_round_id
   AND NOT EXISTS(SELECT 1 FROM private.test_round_members a WHERE a.round_id=p_round_id AND a.member_id=participant.member_id))
 ) THEN RAISE EXCEPTION 'TEST_ROUND_AUDIENCE_PARTICIPANTS_EXIST' USING ERRCODE='PT409'; END IF;
 IF v_previous IS DISTINCT FROM p_enabled THEN
  INSERT INTO test_pool_access.round_formal_player_access(round_id,enabled,database_session_user,database_effective_user,reason)
  VALUES(p_round_id,p_enabled,session_user::text,current_user::text,v_reason)
  ON CONFLICT(round_id) DO UPDATE SET enabled=excluded.enabled,updated_at=clock_timestamp(),
   database_session_user=excluded.database_session_user,database_effective_user=excluded.database_effective_user,reason=excluded.reason;
 END IF;
 INSERT INTO test_pool_access.round_formal_player_access_audit(operation_id,round_id,round_name_snapshot,previous_enabled,enabled,changed,reason,database_session_user,database_effective_user)
 VALUES(p_operation_id,p_round_id,v_round.round_name,v_previous,p_enabled,v_previous IS DISTINCT FROM p_enabled,v_reason,session_user::text,current_user::text)
 RETURNING * INTO v_receipt;
 RETURN to_jsonb(v_receipt)||jsonb_build_object('already_applied',false);
END;
$function$;
REVOKE ALL ON FUNCTION test_pool_access.protect_formal_player_access_audit(),test_pool_access.set_round_formal_player_access(uuid,boolean,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE test_pool_access.round_formal_player_access IS 'Opt-in test-round registration audience. Absent row preserves the explicit allowlist; enabled adds currently eligible formal players without changing test identity/history isolation.';
COMMENT ON TABLE test_pool_access.round_formal_player_access_audit IS 'Append-only database-operator receipts for explicitly authorized test-round audience changes. No application administrator identity is inferred.';
NOTIFY pgrst,'reload schema';
COMMIT;
