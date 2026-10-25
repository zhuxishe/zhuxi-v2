-- A separately registered, least-privilege test account pool. Existing members,
-- numbers, questionnaires, scores and matching rules are never rewritten here.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));
ALTER TABLE public.members ADD COLUMN is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.match_rounds ADD COLUMN is_test boolean NOT NULL DEFAULT false;
GRANT SELECT(is_test) ON public.members TO authenticated,service_role;
GRANT SELECT(is_test) ON public.match_rounds TO authenticated,service_role;

CREATE TABLE private.test_accounts(
 code text PRIMARY KEY CHECK(code ~ '^TST_(00[1-9]|01[0-9]|02[0-7])$'),
 member_id uuid NOT NULL UNIQUE REFERENCES public.members(id) DEFERRABLE INITIALLY DEFERRED,
 user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
 batch text NOT NULL CHECK(char_length(btrim(batch)) BETWEEN 4 AND 100),
 display_name text NOT NULL CHECK(char_length(btrim(display_name)) BETWEEN 2 AND 100),
 created_by uuid NOT NULL REFERENCES public.admin_users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 4 AND 500)
);
CREATE TABLE private.test_round_members(
 round_id uuid NOT NULL REFERENCES public.match_rounds(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES public.admin_users(id),
 PRIMARY KEY(round_id,member_id)
);
CREATE INDEX test_round_members_member_idx ON private.test_round_members(member_id,round_id);
CREATE TABLE private.test_pool_write_context(
 transaction_id bigint NOT NULL,backend_pid integer NOT NULL,round_id uuid NOT NULL,
 PRIMARY KEY(transaction_id,backend_pid,round_id)
);
ALTER TABLE private.test_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.test_round_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.test_pool_write_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.test_accounts,private.test_round_members,private.test_pool_write_context FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.test_pool_require_server_admin(p_actor uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role'
  OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role='super_admin' AND user_id IS NOT NULL)
 THEN RAISE EXCEPTION 'TEST_POOL_SERVER_SUPER_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 4 AND 500
 THEN RAISE EXCEPTION 'TEST_POOL_REASON_INVALID' USING ERRCODE='22023'; END IF;
END;
$function$;
CREATE FUNCTION private.test_account_round_allowed(p_round_id uuid,p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT COALESCE((SELECT CASE WHEN COALESCE(r.is_test,false)
  THEN EXISTS(SELECT 1 FROM private.test_round_members a WHERE a.round_id=p_round_id AND a.member_id=m.id)
  ELSE NOT m.is_test END FROM public.members m LEFT JOIN public.match_rounds r ON r.id=p_round_id
  WHERE m.id=p_member_id),false)
$function$;
CREATE FUNCTION private.test_round_same_domain(p_round_id uuid,p_history_round_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT COALESCE((SELECT is_test FROM public.match_rounds WHERE id=p_round_id),false)
  =COALESCE((SELECT is_test FROM public.match_rounds WHERE id=p_history_round_id),false)
$function$;
CREATE FUNCTION private.test_review_same_domain(p_round_id uuid,p_result_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT private.test_round_same_domain(p_round_id,(SELECT s.round_id FROM public.match_results r JOIN public.match_sessions s ON s.id=r.session_id WHERE r.id=p_result_id))
$function$;
CREATE FUNCTION public.get_my_test_round_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT COALESCE(array_agg(a.round_id ORDER BY a.round_id),'{}'::uuid[])
 FROM private.test_round_members a JOIN public.match_rounds r ON r.id=a.round_id AND r.is_test AND r.deleted_at IS NULL
 JOIN public.members m ON m.id=a.member_id AND m.user_id=auth.uid() AND m.status='approved'
  AND m.account_status='active' AND m.record_scope='current' AND m.anonymized_at IS NULL
$function$;
CREATE FUNCTION private.test_round_visible_to_current_user(p_round_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT NOT COALESCE((SELECT is_test FROM public.match_rounds WHERE id=p_round_id),false)
  OR p_round_id=ANY(public.get_my_test_round_ids())
$function$;
REVOKE ALL ON FUNCTION public.get_my_test_round_ids() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_test_round_ids() TO authenticated;
-- This narrowly scoped predicate is needed by the authenticated table policy;
-- its only result is whether the caller may see the supplied round UUID.
REVOKE ALL ON FUNCTION private.test_round_visible_to_current_user(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.test_round_visible_to_current_user(uuid) TO authenticated,anon;
CREATE POLICY test_pool_round_visibility ON public.match_rounds AS RESTRICTIVE FOR SELECT
 USING(public.is_admin() OR private.test_round_visible_to_current_user(id));
CREATE POLICY test_pool_session_visibility ON public.match_sessions AS RESTRICTIVE FOR SELECT
 USING(public.is_admin() OR private.test_round_visible_to_current_user(round_id));
CREATE POLICY test_pool_result_visibility ON public.match_results AS RESTRICTIVE FOR SELECT
 USING(public.is_admin() OR EXISTS(SELECT 1 FROM public.match_sessions s WHERE s.id=session_id AND private.test_round_visible_to_current_user(s.round_id)));


CREATE FUNCTION private.test_pool_guard_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF TG_OP='UPDATE' AND NEW.is_test IS DISTINCT FROM OLD.is_test
 THEN RAISE EXCEPTION 'TEST_ACCOUNT_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF NEW.is_test THEN
  IF NOT EXISTS(SELECT 1 FROM private.test_accounts a WHERE a.member_id=NEW.id AND (a.code=NEW.member_number OR (NEW.member_number IS NULL AND (NEW.account_status='closed' OR NEW.anonymized_at IS NOT NULL)))
    AND (a.user_id=NEW.user_id OR (NEW.user_id IS NULL AND (NEW.account_status='closed' OR NEW.anonymized_at IS NOT NULL))))
   OR NEW.record_scope<>'current' OR NEW.record_source<>'app' OR NEW.membership_type<>'player'
  THEN RAISE EXCEPTION 'TEST_ACCOUNT_REGISTRATION_REQUIRED' USING ERRCODE='42501'; END IF;
 ELSIF upper(btrim(COALESCE(NEW.member_number,''))) LIKE 'TST_%' THEN
  RAISE EXCEPTION 'TEST_ACCOUNT_REGISTRATION_REQUIRED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$function$;
-- This guard precedes the existing numbering trigger lexically. The existing
-- historical-import binding prohibition stays enabled and unchanged.
CREATE TRIGGER a_test_pool_member_identity BEFORE INSERT OR UPDATE ON public.members
 FOR EACH ROW EXECUTE FUNCTION private.test_pool_guard_member();
ALTER TABLE public.members DROP CONSTRAINT members_current_member_number_format_check;
ALTER TABLE public.members ADD CONSTRAINT members_current_member_number_format_check CHECK(
 record_scope<>'current' OR record_source IN('legacy','import') OR account_status='closed' OR anonymized_at IS NOT NULL OR member_number IS NULL
 OR (NOT is_test AND member_number ~ '^ZXS_[0-9]{3,18}$')
 OR (is_test AND member_number ~ '^TST_(00[1-9]|01[0-9]|02[0-7])$')
);
DO $migration$
DECLARE definition text:=pg_get_functiondef('private.member_number_before_write()'::regprocedure); original text:='  IF NEW.record_scope <> ''current'' OR NEW.record_source IN (''legacy'', ''import'') THEN RETURN NEW; END IF;';
BEGIN
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_NUMBER_GUARD_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,$patch$
  IF NEW.is_test THEN
    IF NOT EXISTS(SELECT 1 FROM private.test_accounts a WHERE a.member_id=NEW.id AND (a.code=NEW.member_number OR (NEW.member_number IS NULL AND (NEW.account_status='closed' OR NEW.anonymized_at IS NOT NULL))))
    THEN RAISE EXCEPTION 'TEST_ACCOUNT_REGISTRATION_REQUIRED' USING ERRCODE='42501'; END IF;
    -- TST values never enter ZXS canonicalization, roster allocation or setval.
    RETURN NEW;
  END IF;
$patch$||original);
END;
$migration$;

CREATE FUNCTION public.admin_provision_test_account(p_actor_admin_id uuid,p_member_id uuid,p_user_id uuid,p_code text,p_name text,p_batch text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_existing private.test_accounts%ROWTYPE; v_email text;
BEGIN
 PERFORM private.test_pool_require_server_admin(p_actor_admin_id,p_reason);
 IF p_member_id IS NULL OR p_user_id IS NULL OR p_code IS NULL OR p_code !~ '^TST_(00[1-9]|01[0-9]|02[0-7])$'
  OR char_length(btrim(COALESCE(p_name,''))) NOT BETWEEN 2 AND 100
  OR char_length(btrim(COALESCE(p_batch,''))) NOT BETWEEN 4 AND 100
 THEN RAISE EXCEPTION 'TEST_ACCOUNT_PAYLOAD_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('test-account-pool-provision',0));
 SELECT email INTO v_email FROM auth.users WHERE id=p_user_id AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<clock_timestamp());
 IF v_email IS DISTINCT FROM 'zhuxi-tst-'||substring(p_code FROM 5)||'@example.invalid'
  OR EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=p_user_id)
 THEN RAISE EXCEPTION 'TEST_ACCOUNT_AUTH_INVALID' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_existing FROM private.test_accounts WHERE code=p_code OR member_id=p_member_id OR user_id=p_user_id LIMIT 1;
 IF FOUND THEN
  IF v_existing.code=p_code AND v_existing.member_id=p_member_id AND v_existing.user_id=p_user_id AND v_existing.batch=btrim(p_batch)
   AND EXISTS(SELECT 1 FROM public.members WHERE id=p_member_id AND user_id=p_user_id AND is_test AND member_number=p_code)
  THEN RETURN jsonb_build_object('member_id',p_member_id,'user_id',p_user_id,'code',p_code,'already_applied',true); END IF;
  RAISE EXCEPTION 'TEST_ACCOUNT_IDENTITY_CONFLICT' USING ERRCODE='PT409';
 END IF;
 IF EXISTS(SELECT 1 FROM public.members WHERE id=p_member_id OR user_id=p_user_id OR member_number=p_code)
 THEN RAISE EXCEPTION 'TEST_ACCOUNT_IDENTITY_CONFLICT' USING ERRCODE='PT409'; END IF;
 INSERT INTO private.test_accounts(code,member_id,user_id,batch,display_name,created_by,reason)
  VALUES(p_code,p_member_id,p_user_id,btrim(p_batch),btrim(p_name),p_actor_admin_id,btrim(p_reason));
 PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
 INSERT INTO public.members(id,user_id,email,member_number,is_test,status,account_status,record_scope,record_source,membership_type,profile_stage,account_linked_at)
  VALUES(p_member_id,p_user_id,v_email,p_code,true,'pending','active','current','app','player','not_started',clock_timestamp());
 RETURN jsonb_build_object('member_id',p_member_id,'user_id',p_user_id,'code',p_code,'already_applied',false);
END;
$function$;

CREATE FUNCTION public.admin_activate_test_account(p_actor_admin_id uuid,p_member_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_member public.members%ROWTYPE; v_account private.test_accounts%ROWTYPE;
BEGIN
 PERFORM private.test_pool_require_server_admin(p_actor_admin_id,p_reason);
 SELECT * INTO v_account FROM private.test_accounts WHERE member_id=p_member_id;
 SELECT * INTO v_member FROM public.members WHERE id=p_member_id FOR UPDATE;
 IF v_account.member_id IS NULL OR NOT v_member.is_test OR v_member.user_id IS DISTINCT FROM v_account.user_id
  OR v_member.member_number IS DISTINCT FROM v_account.code OR v_member.anonymized_at IS NOT NULL OR v_member.account_status<>'active'
  OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_account.user_id AND deleted_at IS NULL AND email='zhuxi-tst-'||substring(v_account.code FROM 5)||'@example.invalid')
  OR EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=v_account.user_id)
 THEN RAISE EXCEPTION 'TEST_ACCOUNT_AUTH_INVALID' USING ERRCODE='42501'; END IF;
 IF v_member.status='approved' AND v_member.profile_stage='complete'
 THEN RETURN jsonb_build_object('member_id',p_member_id,'activated',true,'already_applied',true); END IF;
 IF v_member.status<>'pending' OR v_member.profile_stage<>'submitted' OR v_member.submitted_at IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.member_identity WHERE member_id=p_member_id AND full_name=v_account.display_name)
  OR NOT EXISTS(SELECT 1 FROM public.questionnaire_assignments a JOIN public.questionnaire_responses r ON r.id=a.response_id
    WHERE a.member_id=p_member_id AND a.kind='interview' AND r.member_id=p_member_id AND r.kind='interview' AND r.completed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'TEST_ACCOUNT_INTERVIEW_INCOMPLETE' USING ERRCODE='PT409'; END IF;
 PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
 UPDATE public.members SET status='approved',profile_stage='complete' WHERE id=p_member_id;
 RETURN jsonb_build_object('member_id',p_member_id,'activated',true,'already_applied',false);
END;
$function$;

CREATE FUNCTION private.test_pool_guard_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM private.test_accounts a WHERE a.user_id=NEW.user_id)
  OR EXISTS(SELECT 1 FROM public.members m WHERE m.user_id=NEW.user_id AND m.is_test)
 THEN RAISE EXCEPTION 'TEST_ACCOUNT_PLAYER_ONLY' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER test_pool_admin_identity BEFORE INSERT OR UPDATE OF user_id ON public.admin_users FOR EACH ROW EXECUTE FUNCTION private.test_pool_guard_admin();

CREATE FUNCTION private.test_pool_guard_round()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF (TG_OP='INSERT' AND NEW.is_test) OR (TG_OP='UPDATE' AND NEW.is_test IS DISTINCT FROM OLD.is_test) THEN
  IF NOT EXISTS(SELECT 1 FROM private.test_pool_write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND round_id=NEW.id)
  THEN RAISE EXCEPTION 'TEST_ROUND_CONFIGURATION_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER a_test_pool_round_identity BEFORE INSERT OR UPDATE OF is_test ON public.match_rounds FOR EACH ROW EXECUTE FUNCTION private.test_pool_guard_round();
CREATE FUNCTION public.admin_configure_test_round(p_actor_admin_id uuid,p_round_id uuid,p_member_ids uuid[],p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_round public.match_rounds%ROWTYPE; v_ids uuid[]; v_count integer;
BEGIN
 PERFORM private.test_pool_require_server_admin(p_actor_admin_id,p_reason);
 SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids FROM unnest(p_member_ids) ids(id) WHERE id IS NOT NULL;
 IF cardinality(v_ids) IS DISTINCT FROM 33 OR cardinality(p_member_ids) IS DISTINCT FROM 33
 THEN RAISE EXCEPTION 'TEST_ROUND_ROSTER_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_round FROM public.match_rounds WHERE id=p_round_id FOR UPDATE;
 IF v_round.id IS NULL OR v_round.deleted_at IS NOT NULL OR v_round.purpose<>'matching'
 THEN RAISE EXCEPTION 'TEST_ROUND_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM public.match_sessions s WHERE s.round_id=p_round_id AND (s.publication_version>0 OR s.status<>'draft'))
  OR EXISTS(SELECT 1 FROM matching_run.jobs WHERE round_id=p_round_id AND status IN('running','staged'))
 THEN RAISE EXCEPTION 'TEST_ROUND_HAS_ACTIVE_STATE' USING ERRCODE='PT409'; END IF;
 SELECT count(*) INTO v_count FROM public.members m WHERE m.id=ANY(v_ids) AND m.status='approved' AND m.account_status='active'
  AND m.record_scope='current' AND m.anonymized_at IS NULL AND m.membership_type='player' AND m.user_id IS NOT NULL
  AND ((m.is_test AND EXISTS(SELECT 1 FROM private.test_accounts a WHERE a.member_id=m.id AND a.user_id=m.user_id AND a.code=m.member_number))
   OR (NOT m.is_test AND m.member_number IN('ZXS_000','ZXS_001','ZXS_006','ZXS_016','ZXS_081','ZXS_250')));
 IF v_count<>33 OR (SELECT count(*) FROM public.members WHERE id=ANY(v_ids) AND is_test)<>27
 THEN RAISE EXCEPTION 'TEST_ROUND_ROSTER_INVALID' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM private.round_peer_review_participants WHERE round_id=p_round_id AND included AND NOT(member_id=ANY(v_ids)))
 THEN RAISE EXCEPTION 'TEST_ROUND_HAS_FOREIGN_PEER_PARTICIPANTS' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND NOT(member_id=ANY(v_ids)))
 THEN RAISE EXCEPTION 'TEST_ROUND_HAS_FOREIGN_SUBMISSIONS' USING ERRCODE='PT409'; END IF;
 INSERT INTO private.test_pool_write_context VALUES(txid_current(),pg_backend_pid(),p_round_id);
 DELETE FROM private.test_round_members WHERE round_id=p_round_id;
 INSERT INTO private.test_round_members(round_id,member_id,created_by) SELECT p_round_id,id,p_actor_admin_id FROM unnest(v_ids) ids(id);
 UPDATE public.match_rounds SET is_test=true WHERE id=p_round_id;
 DELETE FROM private.test_pool_write_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND round_id=p_round_id;
 RETURN jsonb_build_object('round_id',p_round_id,'is_test',true,'allowed_count',33,'test_account_count',27);
END;
$function$;

CREATE FUNCTION private.test_pool_guard_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NOT private.test_account_round_allowed(NEW.round_id,NEW.member_id)
 THEN RAISE EXCEPTION 'TEST_ROUND_MEMBER_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER test_pool_submission_scope BEFORE INSERT OR UPDATE ON public.match_round_submissions FOR EACH ROW EXECUTE FUNCTION private.test_pool_guard_submission();
CREATE FUNCTION private.test_pool_assert_session_scope(p_session_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_round uuid;
BEGIN
 SELECT round_id INTO v_round FROM public.match_sessions WHERE id=p_session_id;
 IF EXISTS(SELECT 1 FROM (
  SELECT member_id FROM public.match_results r CROSS JOIN LATERAL unnest(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)) x(member_id) WHERE r.session_id=p_session_id AND r.status<>'cancelled'
  UNION SELECT member_id FROM public.unmatched_diagnostics WHERE session_id=p_session_id
 ) ids WHERE NOT private.test_account_round_allowed(v_round,ids.member_id))
 THEN RAISE EXCEPTION 'TEST_ROUND_MEMBER_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
END;
$function$;
CREATE FUNCTION private.test_pool_guard_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_round uuid; v_ids uuid[];
BEGIN
 SELECT round_id INTO v_round FROM public.match_sessions WHERE id=NEW.session_id;
 IF TG_TABLE_NAME='match_results' THEN v_ids:=matching_publication.member_ids(NEW.member_a_id,NEW.member_b_id,NEW.group_members);
 ELSE v_ids:=ARRAY[NEW.member_id]; END IF;
 IF EXISTS(SELECT 1 FROM unnest(v_ids) ids(id) WHERE NOT private.test_account_round_allowed(v_round,id))
 THEN RAISE EXCEPTION 'TEST_ROUND_MEMBER_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER test_pool_result_scope BEFORE INSERT OR UPDATE OF session_id,member_a_id,member_b_id,group_members ON public.match_results FOR EACH ROW EXECUTE FUNCTION private.test_pool_guard_result();
CREATE TRIGGER test_pool_diagnostic_scope BEFORE INSERT OR UPDATE OF session_id,member_id ON public.unmatched_diagnostics FOR EACH ROW EXECUTE FUNCTION private.test_pool_guard_result();
CREATE FUNCTION private.test_pool_guard_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NEW.notification_type LIKE 'matching_%' AND NOT private.test_account_round_allowed(NEW.round_id,NEW.recipient_member_id)
 THEN RAISE EXCEPTION 'TEST_ROUND_NOTIFICATION_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER test_pool_notification_scope BEFORE INSERT OR UPDATE OF recipient_member_id,round_id ON public.community_notifications FOR EACH ROW EXECUTE FUNCTION private.test_pool_guard_notification();

-- Guarded surgical changes retain the complete existing matching algorithm,
-- readiness requirements, publishing CAS and all established weights.
DO $migration$
DECLARE definition text; original text; replacement text;
BEGIN
 definition:=pg_get_functiondef('matching_run.source(uuid)'::regprocedure);
 original:='  CASE WHEN s.cancelled_at IS NOT NULL THEN ''cancelled'' END,';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_SOURCE_ELIGIBILITY_BASELINE_CHANGED'; END IF;
 definition:=replace(definition,original,'  CASE WHEN NOT private.test_account_round_allowed(p_round_id,s.member_id) THEN ''test_scope_mismatch'' END,'||chr(10)||original);
 original:=' WHERE r.status=''confirmed'' AND session.status=''confirmed''';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_SOURCE_HISTORY_BASELINE_CHANGED'; END IF;
 definition:=replace(definition,original,original||' AND private.test_round_same_domain(p_round_id,session.round_id)');
 original:='WHERE r.reviewer_id IN(SELECT member_id FROM member_ids) OR r.reviewee_id IN(SELECT member_id FROM member_ids)';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_SOURCE_FEEDBACK_BASELINE_CHANGED'; END IF;
 definition:=replace(definition,original,'WHERE (r.reviewer_id IN(SELECT member_id FROM member_ids) OR r.reviewee_id IN(SELECT member_id FROM member_ids)) AND private.test_review_same_domain(p_round_id,r.match_result_id)');
 EXECUTE definition;
 definition:=pg_get_functiondef('matching_run.source_v3(uuid)'::regprocedure);
 original:='JOIN public.match_rounds review_round ON review_round.id=r.round_id AND review_round.deleted_at IS NULL';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_SOURCE_V3_FEEDBACK_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,original||' AND private.test_round_same_domain(p_round_id,review_round.id) AND private.test_account_round_allowed(review_round.id,r.reviewer_id) AND private.test_account_round_allowed(review_round.id,r.reviewee_id)');
 definition:=pg_get_functiondef('matching_publication.assert_complete(uuid)'::regprocedure);
 original:='BEGIN';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_PUBLICATION_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,original||chr(10)||'  PERFORM private.test_pool_assert_session_scope(p_session_id);');
 definition:=pg_get_functiondef('matching_publication_preflight.capture(uuid,integer)'::regprocedure);
 original:=' PERFORM matching_publication.assert_complete(p_session_id);';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_PUBLICATION_PREFLIGHT_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,' PERFORM private.test_pool_assert_session_scope(p_session_id);'||chr(10)||original);
END;
$migration$;

DO $migration$
DECLARE definition text; original text;
BEGIN
 definition:=pg_get_functiondef('private.peer_member_eligible(uuid,uuid)'::regprocedure);
 original:='SELECT EXISTS (SELECT 1 FROM public.match_rounds r WHERE r.id = p_round_id AND r.deleted_at IS NULL)';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_PEER_ELIGIBILITY_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,'SELECT private.test_account_round_allowed(p_round_id,p_member_id) AND EXISTS (SELECT 1 FROM public.match_rounds r WHERE r.id = p_round_id AND r.deleted_at IS NULL)');
 definition:=pg_get_functiondef('public.player_list_round_peer_review_events()'::regprocedure);
 original:='WHERE r.deleted_at IS NULL;';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_PEER_LIST_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,'WHERE r.deleted_at IS NULL AND private.test_account_round_allowed(r.id,v_player);');
 definition:=pg_get_functiondef('public.player_get_round_peer_reviews(uuid,text,integer,integer)'::regprocedure);
 original:='  SELECT * INTO v_settings FROM private.round_peer_review_settings WHERE round_id=p_round_id;';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_PEER_DETAIL_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,'  IF NOT private.test_account_round_allowed(p_round_id,v_player) THEN RAISE EXCEPTION ''PEER_NOT_ELIGIBLE'' USING ERRCODE=''42501''; END IF;'||chr(10)||original);
END;
$migration$;

DO $migration$
DECLARE definition text:=pg_get_functiondef('private.community_can_interact()'::regprocedure);
 original text:='WHERE m.id = private.community_approved_member_id()';
 replacement text:='WHERE m.id = private.community_approved_member_id() AND NOT m.is_test';
BEGIN
 IF position(original IN definition)=0 OR length(definition)-length(replace(definition,original,''))<>length(original)
 THEN RAISE EXCEPTION 'TEST_COMMUNITY_INTERACTION_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,replacement);
END;
$migration$;

DO $migration$
DECLARE definition text; original text;
BEGIN
 definition:=pg_get_functiondef('public.update_review_stats()'::regprocedure);
 original:='BEGIN';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_REVIEW_STATS_BASELINE_CHANGED'; END IF;
 definition:=replace(definition,original,original||chr(10)||$patch$
  -- A test result never updates real players' persisted growth/review scores.
  IF NOT private.test_review_same_domain(NULL,NEW.match_result_id) THEN RETURN NEW; END IF;
$patch$);
 original:='WHERE reviewee_id = NEW.reviewee_id';
 IF length(definition)-length(replace(definition,original,''))<>3*length(original)
 THEN RAISE EXCEPTION 'TEST_REVIEW_AGGREGATE_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,original||' AND private.test_review_same_domain(NULL,match_result_id)');
END;
$migration$;

DO $migration$
DECLARE definition text; original text;
BEGIN
 definition:=pg_get_functiondef('public.admin_list_member_directory(integer,integer,text,text,text,text,text)'::regprocedure);
 original:='WHERE (p_status IS NULL OR member.status = p_status)';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_DIRECTORY_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,'WHERE NOT member.is_test AND (p_status IS NULL OR member.status = p_status)');
 definition:=pg_get_functiondef('public.admin_list_member_directory_filtered(integer,integer,text,text,text,text,text,text[],text,text)'::regprocedure);
 original:='WHERE member.record_scope = ''current''';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_FILTERED_DIRECTORY_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,original||' AND NOT member.is_test');
 definition:=pg_get_functiondef('public.admin_member_dashboard_metrics()'::regprocedure);
 original:='WHERE member.record_scope = ''current''';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_DASHBOARD_BASELINE_CHANGED'; END IF;
 EXECUTE replace(definition,original,original||' AND NOT member.is_test');
 definition:=pg_get_functiondef('matching_import.preview_state(uuid,uuid)'::regprocedure);
 original:='FROM public.members m WHERE m.anonymized_at IS NULL';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_IMPORT_PREVIEW_BASELINE_CHANGED'; END IF;
 definition:=replace(definition,original,'FROM public.members m WHERE private.test_account_round_allowed(r.id,m.id) AND m.anonymized_at IS NULL');
 original:='WHERE m.anonymized_at IS NULL AND m.account_status<>''closed''';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_IMPORT_LEGACY_BASELINE_CHANGED'; END IF;
 definition:=replace(definition,original,'WHERE NOT r.is_test AND m.anonymized_at IS NULL AND m.account_status<>''closed''');
 original:='WHERE m.anonymized_at IS NULL AND m.membership_type=''player'' AND m.status=''approved'' AND m.record_source=''import''';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'TEST_IMPORT_TEMP_BASELINE_CHANGED'; END IF;
 definition:=replace(definition,original,'WHERE NOT r.is_test AND m.anonymized_at IS NULL AND m.membership_type=''player'' AND m.status=''approved'' AND m.record_source=''import''');
 EXECUTE definition;
END;
$migration$;

REVOKE ALL ON FUNCTION private.test_pool_require_server_admin(uuid,text),private.test_account_round_allowed(uuid,uuid),private.test_round_same_domain(uuid,uuid),private.test_review_same_domain(uuid,uuid),private.test_pool_guard_member(),private.test_pool_guard_round(),private.test_pool_guard_submission(),private.test_pool_assert_session_scope(uuid),private.test_pool_guard_result(),private.test_pool_guard_notification(),private.test_pool_guard_admin() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_provision_test_account(uuid,uuid,uuid,text,text,text,text),public.admin_configure_test_round(uuid,uuid,uuid[],text),public.admin_activate_test_account(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_provision_test_account(uuid,uuid,uuid,text,text,text,text),public.admin_configure_test_round(uuid,uuid,uuid[],text),public.admin_activate_test_account(uuid,uuid,text) TO service_role;
COMMENT ON COLUMN public.members.is_test IS 'Protected registered TST identity; excluded from formal membership and numbering. Not a user-editable profile flag.';
COMMENT ON COLUMN public.match_rounds.is_test IS 'Protected allowlisted test domain: test-only history/reviews; same matching and publication rules.';
NOTIFY pgrst,'reload schema';
COMMIT;
