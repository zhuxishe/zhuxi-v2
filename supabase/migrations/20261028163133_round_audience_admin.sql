-- Authenticated administrator visibility and super-admin audience edits.
-- Installation does not change any round's type, audience or existing members.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));
DO $dependency$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='test_pool_access.set_round_formal_player_access(uuid,boolean,text,uuid)'::regprocedure) IS DISTINCT FROM 'bd1b3586c25b4dfff963d876a012d184'
  OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='test_pool_access.protect_formal_player_access_audit()'::regprocedure) IS DISTINCT FROM 'ed111a03fad56a2fab39ebe588ad7779'
  OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.test_account_round_allowed(uuid,uuid)'::regprocedure) IS DISTINCT FROM 'cbb492872628b3a0c751e01e1222eb0e'
  OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='test_pool_access.get_my_test_round_ids()'::regprocedure) IS DISTINCT FROM '455988a263b4f2f7091031f775a25610'
  OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.admin_configure_test_round(uuid,uuid,uuid[],text)'::regprocedure) IS DISTINCT FROM 'acd04b43b44a34df830a7a7ca64be5dc'
 THEN RAISE EXCEPTION 'ROUND_AUDIENCE_DEPENDENCY_CHANGED'; END IF;
END;
$dependency$;

CREATE TABLE test_pool_access.audience_admin_operations (
 operation_id uuid PRIMARY KEY,
 round_id uuid NOT NULL,
 round_name_snapshot text NOT NULL,
 actor_admin_id uuid NOT NULL,
 actor_user_id uuid NOT NULL,
 actor_name text NOT NULL,
 request_hash text NOT NULL,
 expected_revision text NOT NULL,
 result_revision text NOT NULL,
 previous_enabled boolean NOT NULL,
 enabled boolean NOT NULL,
 previous_member_ids uuid[] NOT NULL,
 member_ids uuid[] NOT NULL,
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 4 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audience_admin_operations_round_idx ON test_pool_access.audience_admin_operations(round_id,created_at DESC);
ALTER TABLE test_pool_access.audience_admin_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON test_pool_access.audience_admin_operations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER audience_admin_operations_immutable BEFORE UPDATE OR DELETE ON test_pool_access.audience_admin_operations
 FOR EACH ROW EXECUTE FUNCTION test_pool_access.protect_formal_player_access_audit();
CREATE TRIGGER audience_admin_operations_no_truncate BEFORE TRUNCATE ON test_pool_access.audience_admin_operations
 FOR EACH STATEMENT EXECUTE FUNCTION test_pool_access.protect_formal_player_access_audit();

CREATE FUNCTION test_pool_access.audience_admin_actor(p_write boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE actor uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'ROUND_AUDIENCE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT a.id INTO actor FROM public.admin_users a WHERE a.user_id=auth.uid()
  AND a.role IN('admin','super_admin') AND (NOT p_write OR a.role='super_admin')
  AND NOT EXISTS(SELECT 1 FROM public.members m WHERE m.user_id=a.user_id
   AND (m.account_status IS DISTINCT FROM 'active' OR m.anonymized_at IS NOT NULL));
 IF actor IS NULL THEN RAISE EXCEPTION 'ROUND_AUDIENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN actor;
END;
$function$;

CREATE FUNCTION test_pool_access.audience_member_eligible(p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $function$
 SELECT EXISTS(SELECT 1 FROM public.members m WHERE m.id=p_member_id AND m.status='approved'
  AND m.account_status='active' AND m.record_scope='current' AND m.membership_type='player'
  AND m.user_id IS NOT NULL AND m.anonymized_at IS NULL
  AND (NOT m.is_test OR EXISTS(SELECT 1 FROM private.test_accounts t WHERE t.member_id=m.id AND t.user_id=m.user_id AND t.code=m.member_number)))
$function$;

CREATE FUNCTION test_pool_access.audience_participant_ids(p_round_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SET search_path='' AS $function$
 SELECT COALESCE(array_agg(DISTINCT member_id ORDER BY member_id),'{}'::uuid[]) FROM (
  SELECT member_id FROM public.match_round_submissions WHERE round_id=p_round_id
  UNION SELECT ids.member_id FROM public.match_results r JOIN public.match_sessions s ON s.id=r.session_id
   CROSS JOIN LATERAL unnest(matching_publication.member_ids(r.member_a_id,r.member_b_id,r.group_members)) ids(member_id) WHERE s.round_id=p_round_id
  UNION SELECT roster.member_id FROM matching_publication.roster roster JOIN matching_publication.publications publication ON publication.id=roster.publication_id WHERE publication.round_id=p_round_id
  UNION SELECT d.member_id FROM public.unmatched_diagnostics d JOIN public.match_sessions s ON s.id=d.session_id WHERE s.round_id=p_round_id
  UNION SELECT member_id FROM private.round_peer_review_participants WHERE round_id=p_round_id
 ) protected WHERE member_id IS NOT NULL
$function$;

CREATE FUNCTION test_pool_access.audience_admin_revision(p_round_id uuid,p_extra_operations integer DEFAULT 0)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $function$
 SELECT md5(jsonb_build_object(
  'round',jsonb_build_object('id',r.id,'name',r.round_name,'purpose',r.purpose,'status',r.status,'is_test',r.is_test,'deleted_at',r.deleted_at,'config_revision',r.config_revision,'survey_start',r.survey_start,'survey_end',r.survey_end),
  'setting',(SELECT to_jsonb(a) FROM test_pool_access.round_formal_player_access a WHERE a.round_id=r.id),
  'listed',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.member_id) FROM private.test_round_members a WHERE a.round_id=r.id),'[]'::jsonb),
  'participants',test_pool_access.audience_participant_ids(r.id),
  'operations',(SELECT count(*) FROM test_pool_access.audience_admin_operations o WHERE o.round_id=r.id)+p_extra_operations)::text)
 FROM public.match_rounds r WHERE r.id=p_round_id
$function$;

CREATE FUNCTION test_pool_access.admin_get_round_audience(p_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE actor uuid:=test_pool_access.audience_admin_actor(false); r public.match_rounds%ROWTYPE;
 can_manage boolean; enabled boolean; listed_ids uuid[]; participated_ids uuid[]; members jsonb; counts jsonb; operations jsonb;
BEGIN
 SELECT * INTO r FROM public.match_rounds WHERE id=p_round_id AND deleted_at IS NULL;
 IF r.id IS NULL THEN RAISE EXCEPTION 'ROUND_AUDIENCE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 can_manage:=r.is_test AND r.purpose='matching' AND EXISTS(SELECT 1 FROM public.admin_users WHERE id=actor AND role='super_admin');
 enabled:=NOT r.is_test OR COALESCE((SELECT a.enabled FROM test_pool_access.round_formal_player_access a WHERE a.round_id=r.id),false);
 SELECT COALESCE(array_agg(member_id ORDER BY member_id),'{}') INTO listed_ids FROM private.test_round_members WHERE round_id=r.id;
 participated_ids:=test_pool_access.audience_participant_ids(r.id);
 SELECT jsonb_build_object('listed',CASE WHEN r.is_test THEN cardinality(listed_ids) ELSE 0 END,
  'effective',count(*) FILTER(WHERE test_pool_access.audience_member_eligible(m.id) AND private.test_account_round_allowed(r.id,m.id)),
  'formal',count(*) FILTER(WHERE NOT m.is_test AND test_pool_access.audience_member_eligible(m.id) AND private.test_account_round_allowed(r.id,m.id)),
  'test',count(*) FILTER(WHERE m.is_test AND test_pool_access.audience_member_eligible(m.id) AND private.test_account_round_allowed(r.id,m.id)))
 INTO counts FROM public.members m;
 IF r.is_test THEN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,
   'name',CASE WHEN m.anonymized_at IS NOT NULL THEN '已匿名成员' ELSE COALESCE(NULLIF(btrim(i.full_name),''),NULLIF(btrim(i.nickname),''),'未设置姓名') END,
   'memberNumber',CASE WHEN m.anonymized_at IS NULL THEN m.member_number ELSE NULL END,
   'isTest',m.is_test,'listed',m.id=ANY(listed_ids),'participated',m.id=ANY(participated_ids),'eligible',test_pool_access.audience_member_eligible(m.id))
   ORDER BY CASE WHEN m.id=ANY(listed_ids) THEN 0 ELSE 1 END,m.member_number NULLS LAST,m.id),'[]'::jsonb)
  INTO members FROM public.members m LEFT JOIN public.member_identity i ON i.member_id=m.id
   WHERE m.id=ANY(listed_ids) OR m.id=ANY(participated_ids) OR (can_manage AND test_pool_access.audience_member_eligible(m.id));
 ELSE members:='[]'::jsonb; END IF;
 SELECT COALESCE(jsonb_agg(item ORDER BY happened_at DESC),'[]'::jsonb) INTO operations FROM (
  SELECT jsonb_build_object('operationId',o.operation_id,'createdAt',o.created_at,'actorName',o.actor_name,'enabled',o.enabled,'listedCount',cardinality(o.member_ids)) item,o.created_at happened_at
  FROM test_pool_access.audience_admin_operations o WHERE o.round_id=r.id ORDER BY o.created_at DESC LIMIT 10
 ) recent;
 RETURN jsonb_build_object('roundId',r.id,'roundName',r.round_name,'isTest',r.is_test,'purpose',r.purpose,'status',r.status,
  'canManage',can_manage,'enabled',enabled,'revision',test_pool_access.audience_admin_revision(r.id),'members',members,'counts',counts,'operations',operations);
END;
$function$;

CREATE FUNCTION test_pool_access.audience_admin_receipt(p_operation_id uuid,p_already_applied boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE actor uuid:=test_pool_access.audience_admin_actor(false); receipt test_pool_access.audience_admin_operations%ROWTYPE;
BEGIN
 SELECT * INTO receipt FROM test_pool_access.audience_admin_operations WHERE operation_id=p_operation_id;
 IF receipt.operation_id IS NULL THEN RETURN NULL; END IF;
 IF receipt.actor_admin_id<>actor OR receipt.actor_user_id<>auth.uid() THEN RAISE EXCEPTION 'ROUND_AUDIENCE_OPERATION_CONFLICT' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('operationId',receipt.operation_id,'roundId',receipt.round_id,'revision',receipt.result_revision,
  'enabled',receipt.enabled,'listedCount',cardinality(receipt.member_ids),'alreadyApplied',p_already_applied,
  'expectedRevision',receipt.expected_revision,'memberIds',receipt.member_ids,'reason',receipt.reason,'actorAdminId',receipt.actor_admin_id);
END;
$function$;

CREATE FUNCTION test_pool_access.admin_save_round_audience(p_round_id uuid,p_enabled boolean,p_member_ids uuid[],p_expected_revision text,p_operation_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE actor uuid; actor_name text; r public.match_rounds%ROWTYPE; receipt test_pool_access.audience_admin_operations%ROWTYPE;
 selected_ids uuid[]; listed_ids uuid[]; protected_ids uuid[]; prior_enabled boolean; v_reason text:=btrim(p_reason); request_hash text; result_revision text;
BEGIN
 actor:=test_pool_access.audience_admin_actor(true);
 IF p_round_id IS NULL OR p_enabled IS NULL OR p_operation_id IS NULL OR p_member_ids IS NULL
  OR cardinality(p_member_ids)>5000 OR array_position(p_member_ids,NULL) IS NOT NULL
  OR char_length(COALESCE(p_expected_revision,'')) NOT BETWEEN 1 AND 200
  OR char_length(COALESCE(v_reason,'')) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'ROUND_AUDIENCE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg(DISTINCT id ORDER BY id),'{}') INTO selected_ids FROM unnest(p_member_ids) ids(id);
 IF cardinality(selected_ids)<>cardinality(p_member_ids) THEN RAISE EXCEPTION 'ROUND_AUDIENCE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 request_hash:=md5(jsonb_build_object('roundId',p_round_id,'enabled',p_enabled,'memberIds',selected_ids,'expectedRevision',p_expected_revision,'reason',v_reason)::text);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('test-round-audience-operation:'||p_operation_id::text,0)) THEN RAISE EXCEPTION 'ROUND_AUDIENCE_BUSY' USING ERRCODE='PT409'; END IF;
 BEGIN
  PERFORM 1 FROM public.members WHERE user_id=auth.uid() ORDER BY id FOR SHARE NOWAIT;
  PERFORM 1 FROM public.admin_users WHERE user_id=auth.uid() FOR SHARE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'ROUND_AUDIENCE_BUSY' USING ERRCODE='PT409'; END;
 actor:=test_pool_access.audience_admin_actor(true);
 SELECT name INTO actor_name FROM public.admin_users WHERE id=actor;
 SELECT * INTO receipt FROM test_pool_access.audience_admin_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF receipt.actor_admin_id<>actor OR receipt.actor_user_id<>auth.uid() OR receipt.request_hash<>request_hash THEN RAISE EXCEPTION 'ROUND_AUDIENCE_OPERATION_CONFLICT' USING ERRCODE='PT409'; END IF;
  RETURN test_pool_access.audience_admin_receipt(p_operation_id,true);
 END IF;
 IF EXISTS(SELECT 1 FROM test_pool_access.round_formal_player_access_audit WHERE operation_id=p_operation_id) THEN RAISE EXCEPTION 'ROUND_AUDIENCE_OPERATION_CONFLICT' USING ERRCODE='PT409'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('matching-run-job:'||p_round_id::text,0)) THEN RAISE EXCEPTION 'ROUND_AUDIENCE_BUSY' USING ERRCODE='PT409'; END IF;
 BEGIN
  SELECT * INTO r FROM public.match_rounds WHERE id=p_round_id FOR UPDATE NOWAIT;
  PERFORM 1 FROM public.members WHERE id=ANY(selected_ids) ORDER BY id FOR SHARE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'ROUND_AUDIENCE_BUSY' USING ERRCODE='PT409'; END;
 IF r.id IS NULL OR r.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'ROUND_AUDIENCE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 IF NOT r.is_test OR r.purpose<>'matching' THEN RAISE EXCEPTION 'ROUND_AUDIENCE_READ_ONLY' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM matching_run.jobs WHERE round_id=p_round_id AND status='running' AND lease_expires_at>clock_timestamp())
  OR EXISTS(SELECT 1 FROM matching_adjustment.operations o JOIN public.match_sessions s ON s.id=o.session_id WHERE s.round_id=p_round_id AND o.status='running' AND o.lease_expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'ROUND_AUDIENCE_BUSY' USING ERRCODE='PT409'; END IF;
 IF p_expected_revision IS DISTINCT FROM test_pool_access.audience_admin_revision(p_round_id) THEN RAISE EXCEPTION 'ROUND_AUDIENCE_STALE' USING ERRCODE='PT409'; END IF;
 SELECT COALESCE(array_agg(member_id ORDER BY member_id),'{}') INTO listed_ids FROM private.test_round_members WHERE round_id=p_round_id;
 protected_ids:=test_pool_access.audience_participant_ids(p_round_id);
 IF EXISTS(SELECT 1 FROM unnest(selected_ids) ids(id) WHERE NOT EXISTS(SELECT 1 FROM public.members m WHERE m.id=ids.id))
  OR EXISTS(SELECT 1 FROM unnest(selected_ids) ids(id) WHERE NOT id=ANY(listed_ids) AND NOT id=ANY(protected_ids) AND NOT test_pool_access.audience_member_eligible(id)) THEN RAISE EXCEPTION 'ROUND_AUDIENCE_INELIGIBLE' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(protected_ids) ids(id) WHERE id=ANY(listed_ids) AND NOT id=ANY(selected_ids))
  OR (NOT p_enabled AND NOT selected_ids @> protected_ids) THEN RAISE EXCEPTION 'ROUND_AUDIENCE_PARTICIPANTS_REQUIRED' USING ERRCODE='PT409'; END IF;
 prior_enabled:=COALESCE((SELECT enabled FROM test_pool_access.round_formal_player_access WHERE round_id=p_round_id),false);
 -- Apply list first so switching to a restricted scope can retain all prior
 -- participants. The owner setter repeats its existing history preservation.
 DELETE FROM private.test_round_members WHERE round_id=p_round_id AND NOT member_id=ANY(selected_ids);
 INSERT INTO private.test_round_members(round_id,member_id,created_by) SELECT p_round_id,id,actor FROM unnest(selected_ids) ids(id)
  ON CONFLICT(round_id,member_id) DO NOTHING;
 PERFORM test_pool_access.set_round_formal_player_access(p_round_id,p_enabled,v_reason,p_operation_id);
 -- The resulting version includes this immutable operation. Compute it using
 -- the next operation count, without mutating a finished receipt afterwards.
 result_revision:=test_pool_access.audience_admin_revision(p_round_id,1);
 INSERT INTO test_pool_access.audience_admin_operations(operation_id,round_id,round_name_snapshot,actor_admin_id,actor_user_id,actor_name,request_hash,
  expected_revision,result_revision,previous_enabled,enabled,previous_member_ids,member_ids,reason)
 VALUES(p_operation_id,p_round_id,r.round_name,actor,auth.uid(),COALESCE(NULLIF(btrim(actor_name),''),'管理员'),request_hash,
  p_expected_revision,result_revision,prior_enabled,p_enabled,listed_ids,selected_ids,v_reason);
 RETURN test_pool_access.audience_admin_receipt(p_operation_id,false);
END;
$function$;

CREATE FUNCTION public.admin_get_round_audience(p_round_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT test_pool_access.admin_get_round_audience(p_round_id)
$function$;
CREATE FUNCTION public.admin_save_round_audience(p_round_id uuid,p_enabled boolean,p_member_ids uuid[],p_expected_revision text,p_operation_id uuid,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT test_pool_access.admin_save_round_audience(p_round_id,p_enabled,p_member_ids,p_expected_revision,p_operation_id,p_reason)
$function$;
CREATE FUNCTION public.admin_get_round_audience_operation(p_operation_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT test_pool_access.audience_admin_receipt(p_operation_id,true)
$function$;

REVOKE ALL ON FUNCTION test_pool_access.audience_admin_actor(boolean),test_pool_access.audience_member_eligible(uuid),test_pool_access.audience_participant_ids(uuid),test_pool_access.audience_admin_revision(uuid,integer),
 test_pool_access.admin_get_round_audience(uuid),test_pool_access.admin_save_round_audience(uuid,boolean,uuid[],text,uuid,text),test_pool_access.audience_admin_receipt(uuid,boolean),
 public.admin_get_round_audience(uuid),public.admin_save_round_audience(uuid,boolean,uuid[],text,uuid,text),public.admin_get_round_audience_operation(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION test_pool_access.admin_get_round_audience(uuid),test_pool_access.admin_save_round_audience(uuid,boolean,uuid[],text,uuid,text),test_pool_access.audience_admin_receipt(uuid,boolean),
 public.admin_get_round_audience(uuid),public.admin_save_round_audience(uuid,boolean,uuid[],text,uuid,text),public.admin_get_round_audience_operation(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
