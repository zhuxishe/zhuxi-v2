-- Append/update Excel imports with a durable request receipt. No old answer,
-- questionnaire definition, matching plan, publication or reopen rule is rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='2min';
SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration',0));

CREATE SCHEMA matching_import;
REVOKE ALL ON SCHEMA matching_import FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA matching_import TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA matching_import REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE matching_import.receipts(
 id uuid PRIMARY KEY,
 round_id uuid NOT NULL REFERENCES public.match_rounds(id),
 actor_admin_id uuid NOT NULL,
 request_hash text,
 file_sha256 text,
 plan_digest text,
 status text NOT NULL CHECK(status IN('succeeded','failed')),
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 4 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 error_code text,
 error_message text,
 -- Counts and batch locators only. No names, answers, profiles, file or plan.
 summary jsonb NOT NULL DEFAULT '{}',
 CHECK((request_hash IS NOT NULL AND request_hash ~ '^[0-9a-f]{64}$') OR (request_hash IS NULL AND error_code IS NOT DISTINCT FROM 'IMPORT_REQUEST_CANCELLED')),
 CHECK((file_sha256 IS NOT NULL AND file_sha256 ~ '^[0-9a-f]{64}$') OR (file_sha256 IS NULL AND error_code IS NOT DISTINCT FROM 'IMPORT_REQUEST_CANCELLED')),
 CHECK((plan_digest IS NOT NULL AND plan_digest ~ '^[0-9a-f]{32}$') OR (plan_digest IS NULL AND error_code IS NOT DISTINCT FROM 'IMPORT_REQUEST_CANCELLED')),
 CHECK((status='succeeded')=(error_code IS NULL))
);
CREATE INDEX matching_import_receipts_round_idx ON matching_import.receipts(round_id,created_at DESC,id);
ALTER TABLE matching_import.receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON matching_import.receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE matching_import.identities(
 round_id uuid NOT NULL REFERENCES public.match_rounds(id),
 identity_key text NOT NULL CHECK(identity_key ~ '^[0-9a-f]{64}$'),
 member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
 source text NOT NULL CHECK(source IN('temp','legacy-temp')),
 created_by_request_id uuid NOT NULL REFERENCES matching_import.receipts(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(round_id,identity_key),
 UNIQUE(round_id,member_id)
);
CREATE INDEX matching_import_identity_member_idx ON matching_import.identities(member_id);
ALTER TABLE matching_import.identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON matching_import.identities FROM PUBLIC,anon,authenticated,service_role;

-- A digest mapping is also a tombstone after erasure/hard deletion. It carries
-- no raw name/legacy ID and cannot silently recreate or relink an erased person.
-- Existing historical imports are deliberately not backfilled or merged.
CREATE FUNCTION matching_import.require_server_super_admin(p_actor_admin_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role'
  OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor_admin_id AND user_id IS NOT NULL AND role='super_admin') THEN
  RAISE EXCEPTION 'IMPORT_SERVER_SUPER_ADMIN_REQUIRED' USING ERRCODE='42501';
 END IF;
END;
$function$;

CREATE FUNCTION matching_import.round_token(p_round_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT md5(jsonb_build_object('id',r.id,'purpose',r.purpose,'status',r.status,'deleted_at',r.deleted_at,
  'survey_start',r.survey_start,'survey_end',r.survey_end,'activity_start',r.activity_start,'activity_end',r.activity_end,
  'config_revision',r.config_revision,'content_config',r.content_config)::text)
 FROM public.match_rounds r WHERE r.id=p_round_id
$function$;

CREATE FUNCTION matching_import.member_token(p_member_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT md5(jsonb_build_object('member',to_jsonb(m),'identity',to_jsonb(i))::text)
 FROM public.members m LEFT JOIN public.member_identity i ON i.member_id=m.id WHERE m.id=p_member_id
$function$;

CREATE FUNCTION matching_import.legacy_token(p_legacy_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT md5(jsonb_build_object('legacy',to_jsonb(l),'canonical_token',matching_import.member_token(m.id))::text)
 FROM public.legacy_members l JOIN public.members m ON m.id=l.canonical_member_id
 WHERE l.id=p_legacy_id AND m.anonymized_at IS NULL AND m.account_status<>'closed'
$function$;

CREATE FUNCTION matching_import.receipt_metadata(p_request_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT jsonb_build_object('id',id,'round_id',round_id,'status',status,'created_at',created_at,'completed_at',completed_at,
  'reason',reason,'error_code',error_code,'error_message',error_message,'summary',summary)
 FROM matching_import.receipts WHERE id=p_request_id
$function$;

CREATE FUNCTION matching_import.preview_state(p_round_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_state jsonb;
BEGIN
 PERFORM matching_import.require_server_super_admin(p_actor_admin_id);
 -- One statement snapshot binds the parser window, configuration, identities
 -- and answer versions shown in the signed server preview.
 SELECT jsonb_build_object('round',to_jsonb(r),'round_token',matching_import.round_token(r.id),
  'member_tokens',COALESCE((SELECT jsonb_object_agg(m.id::text,matching_import.member_token(m.id))
   FROM public.members m WHERE m.anonymized_at IS NULL AND m.membership_type='player' AND m.status='approved'
    AND ((m.record_scope='current' AND m.account_status='active' AND COALESCE(m.member_number,'') NOT LIKE 'IMP-%')
     OR (m.record_source='import' AND m.account_status='unbound' AND m.user_id IS NULL
      AND m.record_scope IN('current','historical') AND m.member_number LIKE 'IMP-'||left(r.id::text,8)||'-%'
      AND (EXISTS(SELECT 1 FROM public.match_round_submissions s WHERE s.round_id=r.id AND s.member_id=m.id)
       OR EXISTS(SELECT 1 FROM matching_import.identities x WHERE x.round_id=r.id AND x.member_id=m.id))))),'{}'::jsonb),
  'legacy_tokens',COALESCE((SELECT jsonb_object_agg(l.id::text,matching_import.legacy_token(l.id))
   FROM public.legacy_members l JOIN public.members m ON m.id=l.canonical_member_id WHERE m.anonymized_at IS NULL AND m.account_status<>'closed'),'{}'::jsonb),
  'temporary_members',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'member_number',m.member_number,'full_name',i.full_name,'nickname',i.nickname,'temporary',true) ORDER BY m.member_number,m.id)
   FROM public.members m LEFT JOIN public.member_identity i ON i.member_id=m.id
   WHERE m.anonymized_at IS NULL AND m.membership_type='player' AND m.status='approved' AND m.record_source='import'
    AND m.account_status='unbound' AND m.user_id IS NULL AND m.record_scope IN('current','historical')
    AND m.member_number LIKE 'IMP-'||left(r.id::text,8)||'-%'
    AND (EXISTS(SELECT 1 FROM public.match_round_submissions s WHERE s.round_id=r.id AND s.member_id=m.id)
     OR EXISTS(SELECT 1 FROM matching_import.identities x WHERE x.round_id=r.id AND x.member_id=m.id))),'[]'::jsonb),
  'affected_batch_ids',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM (
   SELECT j.id FROM matching_run.jobs j WHERE j.round_id=r.id
   UNION SELECT s.id FROM public.match_sessions s WHERE s.round_id=r.id AND NOT EXISTS(SELECT 1 FROM matching_run.jobs j WHERE j.original_session_id=s.id)
  ) plans),'[]'::jsonb),
  'identities',COALESCE((SELECT jsonb_agg(jsonb_build_object('identity_key',identity_key,'member_id',member_id) ORDER BY identity_key)
   FROM matching_import.identities WHERE round_id=r.id),'[]'::jsonb),
  'submissions',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at,s.id) FROM public.match_round_submissions s WHERE s.round_id=r.id),'[]'::jsonb))
 INTO v_state FROM public.match_rounds r WHERE r.id=p_round_id AND r.deleted_at IS NULL;
 IF v_state IS NULL THEN RAISE EXCEPTION 'IMPORT_ROUND_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
 RETURN v_state;
END;
$function$;

CREATE FUNCTION matching_import.apply_request(
 p_request_id uuid,p_round_id uuid,p_actor_admin_id uuid,p_request_hash text,p_file_sha256 text,p_reason text,p_expected_round_token text,p_rows jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_receipt matching_import.receipts%ROWTYPE; v_round public.match_rounds%ROWTYPE;
 v_row jsonb; v_answers jsonb; v_profile jsonb; v_member public.members%ROWTYPE; v_submission public.match_round_submissions%ROWTYPE;
 v_identity matching_import.identities%ROWTYPE; v_identity_exists boolean; v_member_id uuid; v_user_id uuid;
 v_legacy_source public.legacy_members%ROWTYPE; v_legacy_ids uuid[];
 v_member_ids uuid[]; v_seen uuid[]:='{}'; v_changed_members uuid[]:='{}'; v_before jsonb; v_after jsonb; v_changed_fields text[];
 v_created boolean; v_exists boolean; v_prefix text; v_number bigint; v_summary jsonb; v_affected jsonb;
 v_inserted integer:=0; v_updated integer:=0; v_unchanged integer:=0; v_current integer:=0; v_legacy integer:=0; v_temp integer:=0; v_warnings integer:=0;
 v_error_code text; v_error_message text; v_admin_user uuid; v_admin_name text;
 v_plan_digest text:=md5(jsonb_build_object('rows',p_rows,'round_token',p_expected_round_token,'reason',p_reason)::text);
 v_previous_reason text:=COALESCE(current_setting('app.member_master_audit_reason',true),'');
 v_previous_source text:=COALESCE(current_setting('app.member_master_audit_source',true),'');
BEGIN
 PERFORM matching_import.require_server_super_admin(p_actor_admin_id);
 IF p_request_id IS NULL OR p_round_id IS NULL OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$'
  OR p_file_sha256 IS NULL OR p_file_sha256 !~ '^[0-9a-f]{64}$'
  OR char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 4 AND 500 THEN
  RAISE EXCEPTION 'IMPORT_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 -- Capture and completion use this same lock. A run observes either all of
 -- the import or none of it; no lock survives this short transaction.
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-run-job:'||p_round_id::text,0));
 SELECT * INTO v_receipt FROM matching_import.receipts WHERE id=p_request_id FOR UPDATE;
 IF v_receipt.id IS NOT NULL THEN
  IF v_receipt.round_id<>p_round_id OR v_receipt.actor_admin_id<>p_actor_admin_id THEN
   RAISE EXCEPTION 'IMPORT_REQUEST_REUSED' USING ERRCODE='PT409';
  END IF;
  -- Cancellation reserves a lost-response request ID before any future retry.
  IF v_receipt.error_code='IMPORT_REQUEST_CANCELLED' THEN RETURN matching_import.receipt_metadata(p_request_id); END IF;
  IF v_receipt.request_hash IS DISTINCT FROM p_request_hash OR v_receipt.file_sha256 IS DISTINCT FROM p_file_sha256 OR v_receipt.plan_digest IS DISTINCT FROM v_plan_digest THEN
   RAISE EXCEPTION 'IMPORT_REQUEST_REUSED' USING ERRCODE='PT409';
  END IF;
  RETURN matching_import.receipt_metadata(p_request_id);
 END IF;
 -- Reserve the receipt outside the savepoint. Any answer/profile/audit fault
 -- rolls back the entire inner block and leaves only this safe failure receipt.
 INSERT INTO matching_import.receipts(id,round_id,actor_admin_id,request_hash,file_sha256,plan_digest,status,reason,error_code,error_message)
 VALUES(p_request_id,p_round_id,p_actor_admin_id,p_request_hash,p_file_sha256,v_plan_digest,'failed',btrim(p_reason),'IMPORT_WRITE_FAILED','本次导入未写入，请重新预览后重试');
 BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 10000
   OR octet_length(p_rows::text)>16777216 THEN RAISE EXCEPTION 'IMPORT_ROW_INVALID' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) row WHERE jsonb_typeof(row) IS DISTINCT FROM 'object'
    OR row->>'row_number' IS NULL OR row->>'row_number' !~ '^[1-9][0-9]{0,6}$'
    OR row->>'source' IS NULL OR row->>'source' NOT IN('current','temp','legacy-temp')
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(row) k WHERE k NOT IN('row_number','source','identity_key','existing_member_id','expected_member_token','expected_submission','expected_legacy','answers','temp_profile')))
   OR (SELECT count(DISTINCT row->>'row_number') FROM jsonb_array_elements(p_rows) row)<>jsonb_array_length(p_rows) THEN
   RAISE EXCEPTION 'IMPORT_ROW_INVALID' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) row WHERE row->'expected_legacy' IS NOT NULL AND row->'expected_legacy'<>'null'::jsonb
   AND (row->>'source'<>'legacy-temp' OR jsonb_typeof(row->'expected_legacy') IS DISTINCT FROM 'object'
    OR row#>>'{expected_legacy,id}' IS NULL OR row#>>'{expected_legacy,token}' IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(row->'expected_legacy') k WHERE k NOT IN('id','token')))) THEN
   RAISE EXCEPTION 'IMPORT_ROW_INVALID' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(array_agg(DISTINCT (row#>>'{expected_legacy,id}')::uuid ORDER BY (row#>>'{expected_legacy,id}')::uuid),'{}'::uuid[])
   INTO v_legacy_ids FROM jsonb_array_elements(p_rows) row WHERE row#>>'{expected_legacy,id}' IS NOT NULL;
  SELECT COALESCE(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO v_member_ids FROM (
   SELECT (row->>'existing_member_id')::uuid AS id FROM jsonb_array_elements(p_rows) row WHERE row->>'existing_member_id' IS NOT NULL
   UNION SELECT canonical_member_id FROM public.legacy_members WHERE id=ANY(v_legacy_ids) AND canonical_member_id IS NOT NULL
  ) subjects;
  -- Follow account/privacy writers' shared auth lock, then member -> answer ->
  -- round SHARE order. Never take a round UPDATE lock before a member lock.
  FOR v_user_id IN SELECT DISTINCT user_id FROM public.members WHERE id=ANY(v_member_ids) AND user_id IS NOT NULL ORDER BY user_id LOOP
   PERFORM pg_advisory_xact_lock_shared(hashtextextended('member:'||v_user_id::text,0));
  END LOOP;
  PERFORM 1 FROM public.members WHERE id=ANY(v_member_ids) ORDER BY id FOR UPDATE;
  -- Existing legacy editing locks legacy first; privacy scrubs lock member
  -- first. Do not wait on that inverse edge while holding a canonical member.
  -- A busy source safely fails the whole import and requires a fresh preview.
  BEGIN
   PERFORM 1 FROM public.legacy_members WHERE id=ANY(v_legacy_ids) ORDER BY id FOR SHARE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
   RAISE EXCEPTION 'IMPORT_LEGACY_CHANGED' USING ERRCODE='PT409';
  END;
  FOR v_member_id IN SELECT unnest(v_member_ids) LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended('matching-submission:'||p_round_id::text||':'||v_member_id::text,0));
  END LOOP;
  PERFORM 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=ANY(v_member_ids) ORDER BY member_id FOR UPDATE;
  SELECT * INTO v_round FROM public.match_rounds WHERE id=p_round_id FOR SHARE;
  IF v_round.id IS NULL OR v_round.deleted_at IS NOT NULL OR v_round.purpose<>'matching' OR v_round.status='matched' THEN
   RAISE EXCEPTION 'IMPORT_ROUND_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
  IF p_expected_round_token IS NULL OR p_expected_round_token IS DISTINCT FROM matching_import.round_token(p_round_id) THEN
   RAISE EXCEPTION 'IMPORT_PREVIEW_STALE' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_round.content_config->'questions')='array' THEN v_round.content_config->'questions' ELSE '[]'::jsonb END) q WHERE q->'required'='true'::jsonb) THEN
   RAISE EXCEPTION 'IMPORT_REQUIRED_QUESTIONS' USING ERRCODE='PT409'; END IF;
  SELECT user_id,name INTO v_admin_user,v_admin_name FROM public.admin_users WHERE id=p_actor_admin_id;
  PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
  PERFORM set_config('app.member_master_audit_source','import',true);
  v_prefix:='IMP-'||left(p_round_id::text,8)||'-';
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   v_member_id:=NULLIF(v_row->>'existing_member_id','')::uuid; v_created:=false;
   IF v_row->'expected_legacy' IS NOT NULL AND v_row->'expected_legacy'<>'null'::jsonb THEN
    SELECT * INTO v_legacy_source FROM public.legacy_members WHERE id=(v_row#>>'{expected_legacy,id}')::uuid;
    IF v_legacy_source.id IS NULL OR v_legacy_source.canonical_member_id IS NULL OR NOT(v_legacy_source.canonical_member_id=ANY(v_member_ids))
     OR v_row#>>'{expected_legacy,token}' IS DISTINCT FROM matching_import.legacy_token(v_legacy_source.id)
     OR matching_import.legacy_token(v_legacy_source.id) IS NULL THEN
     RAISE EXCEPTION 'IMPORT_LEGACY_CHANGED' USING ERRCODE='PT409'; END IF;
   ELSIF v_member_id IS NULL AND v_row->>'source'='legacy-temp' THEN
    RAISE EXCEPTION 'IMPORT_LEGACY_CHANGED' USING ERRCODE='PT409';
   END IF;
   IF v_row->>'source'='current' THEN v_current:=v_current+1;
   ELSIF v_row->>'source'='legacy-temp' THEN v_legacy:=v_legacy+1; ELSE v_temp:=v_temp+1; END IF;
   IF v_row->>'identity_key' IS NOT NULL THEN
    IF v_row->>'source'='current' OR v_row->>'identity_key' !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'IMPORT_IDENTITY_CONFLICT' USING ERRCODE='PT409'; END IF;
    SELECT * INTO v_identity FROM matching_import.identities WHERE round_id=p_round_id AND identity_key=v_row->>'identity_key';
    v_identity_exists:=FOUND;
    IF (v_identity_exists AND (v_identity.member_id IS NULL OR v_member_id IS DISTINCT FROM v_identity.member_id OR v_identity.source IS DISTINCT FROM v_row->>'source'))
      OR (NOT v_identity_exists AND v_member_id IS NOT NULL) THEN RAISE EXCEPTION 'IMPORT_IDENTITY_CONFLICT' USING ERRCODE='PT409'; END IF;
   ELSIF v_member_id IS NULL OR v_row->>'source'='current' AND v_row->>'temp_profile' IS NOT NULL THEN
    RAISE EXCEPTION 'IMPORT_ROW_INVALID' USING ERRCODE='22023';
   END IF;
   v_answers:=v_row->'answers';
   IF jsonb_typeof(v_answers) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_answers) k WHERE k NOT IN('game_type_pref','gender_pref','availability','message','import_metadata'))
    OR v_answers->>'game_type_pref' IS NULL OR v_answers->>'game_type_pref' NOT IN('双人','多人','都可以')
    OR v_answers->>'gender_pref' IS NULL OR v_answers->>'gender_pref' NOT IN('男','女','都可以')
    OR jsonb_typeof(v_answers->'availability') IS DISTINCT FROM 'object'
    OR NOT EXISTS(SELECT 1 FROM jsonb_object_keys(v_answers->'availability'))
    OR (v_answers->'message' IS NOT NULL AND v_answers->'message'<>'null'::jsonb AND (jsonb_typeof(v_answers->'message')<>'string' OR char_length(v_answers->>'message')>2000))
    OR (v_answers->'import_metadata' IS NOT NULL AND v_answers->'import_metadata'<>'null'::jsonb AND jsonb_typeof(v_answers->'import_metadata')<>'object') THEN
    RAISE EXCEPTION 'IMPORT_ROW_INVALID' USING ERRCODE='22023'; END IF;
   IF v_member_id IS NULL THEN
    IF v_row->>'source'='current' OR v_row->>'expected_member_token' IS NOT NULL OR v_row->'expected_submission' IS DISTINCT FROM 'null'::jsonb THEN
     RAISE EXCEPTION 'IMPORT_MEMBER_CHANGED' USING ERRCODE='PT409'; END IF;
    v_profile:=v_row->'temp_profile';
    IF jsonb_typeof(v_profile) IS DISTINCT FROM 'object' OR char_length(btrim(COALESCE(v_profile->>'full_name',''))) NOT BETWEEN 1 AND 100
     OR v_profile->>'gender' IS NULL OR v_profile->>'gender' NOT IN('male','female','other')
     OR jsonb_typeof(v_profile->'interest_tags') IS DISTINCT FROM 'array' OR jsonb_typeof(v_profile->'social_tags') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_profile->'interest_tags')>50 OR jsonb_array_length(v_profile->'social_tags')>50
     OR char_length(COALESCE(v_profile->>'school',''))>120 OR char_length(COALESCE(v_profile->>'department',''))>120
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_profile) k WHERE k NOT IN('full_name','gender','school','department','interest_tags','social_tags','game_mode','compatibility_score','session_count')) THEN
     RAISE EXCEPTION 'IMPORT_ROW_INVALID' USING ERRCODE='22023'; END IF;
    -- The shared prefix lock only guards the legacy display-number allocator;
    -- member UUID and round+identity digest are the durable import identity.
    PERFORM pg_advisory_xact_lock(hashtextextended('matching-import-temp-prefix:'||left(p_round_id::text,8),0));
    SELECT COALESCE(max((substring(member_number FROM '-([0-9]+)$'))::bigint),0)+1 INTO v_number
     FROM public.members WHERE member_number LIKE v_prefix||'%' AND member_number ~ '-[0-9]+$';
    v_member_id:=gen_random_uuid();
    INSERT INTO public.members(id,member_number,membership_type,status,account_status,profile_stage,record_source,onboarding_step,attractiveness_score)
     VALUES(v_member_id,v_prefix||lpad(v_number::text,greatest(3,char_length(v_number::text)),'0'),'player','approved','unbound','complete','import',0,(v_profile->>'compatibility_score')::integer);
    INSERT INTO public.member_identity(member_id,full_name,gender,age_range,nationality,current_city,school_name,department,hobby_tags,personality_self_tags)
     VALUES(v_member_id,v_profile->>'full_name',v_profile->>'gender','未填写','未填写','未填写',v_profile->>'school',v_profile->>'department',
      ARRAY(SELECT jsonb_array_elements_text(v_profile->'interest_tags')),ARRAY(SELECT jsonb_array_elements_text(v_profile->'social_tags')));
    IF v_row->>'source'='legacy-temp' THEN
     INSERT INTO public.member_interests(member_id,scenario_mode_pref) VALUES(v_member_id,CASE WHEN v_profile->>'game_mode' IS NULL THEN '{}'::text[] ELSE ARRAY[v_profile->>'game_mode'] END);
     INSERT INTO public.member_dynamic_stats(member_id,activity_count) VALUES(v_member_id,COALESCE((v_profile->>'session_count')::integer,0));
    END IF;
    INSERT INTO matching_import.identities(round_id,identity_key,member_id,source,created_by_request_id)
     VALUES(p_round_id,v_row->>'identity_key',v_member_id,v_row->>'source',p_request_id);
    v_created:=true;
   ELSE
    SELECT * INTO v_member FROM public.members WHERE id=v_member_id;
    IF v_member.id IS NULL OR v_member.anonymized_at IS NOT NULL OR v_member.membership_type<>'player' OR v_member.status<>'approved'
     OR (v_row->>'source'='current' AND (v_member.record_scope<>'current' OR v_member.account_status<>'active' OR COALESCE(v_member.member_number,'') LIKE 'IMP-%'))
     OR (v_row->>'source'<>'current' AND (v_member.record_source<>'import' OR v_member.account_status<>'unbound' OR v_member.user_id IS NOT NULL
      OR v_member.record_scope NOT IN('current','historical') OR v_member.member_number NOT LIKE v_prefix||'%'
      OR NOT (EXISTS(SELECT 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=v_member_id)
       OR EXISTS(SELECT 1 FROM matching_import.identities WHERE round_id=p_round_id AND member_id=v_member_id))))
     OR v_row->>'expected_member_token' IS NULL OR v_row->>'expected_member_token' IS DISTINCT FROM matching_import.member_token(v_member_id) THEN
     RAISE EXCEPTION 'IMPORT_MEMBER_CHANGED' USING ERRCODE='PT409'; END IF;
   END IF;
   IF v_member_id=ANY(v_seen) THEN RAISE EXCEPTION 'IMPORT_IDENTITY_CONFLICT' USING ERRCODE='PT409'; END IF;
   v_seen:=array_append(v_seen,v_member_id);
   SELECT * INTO v_submission FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=v_member_id;
   v_exists:=FOUND;
   IF (v_exists AND (jsonb_typeof(v_row->'expected_submission') IS DISTINCT FROM 'object'
      OR (v_row#>>'{expected_submission,id}')::uuid IS DISTINCT FROM v_submission.id
      OR (v_row#>>'{expected_submission,updated_at}')::timestamptz IS DISTINCT FROM v_submission.updated_at))
     OR (NOT v_exists AND v_row->'expected_submission' IS DISTINCT FROM 'null'::jsonb) THEN
    RAISE EXCEPTION 'IMPORT_SUBMISSION_CHANGED' USING ERRCODE='PT409'; END IF;
   v_before:=CASE WHEN v_exists THEN jsonb_build_object('game_type_pref',v_submission.game_type_pref,'gender_pref',v_submission.gender_pref,
    'availability',v_submission.availability,'message',v_submission.message,'import_metadata',v_submission.import_metadata) ELSE NULL END;
   v_after:=jsonb_build_object('game_type_pref',v_answers->'game_type_pref','gender_pref',v_answers->'gender_pref','availability',v_answers->'availability',
    'message',COALESCE(v_answers->'message','null'::jsonb),'import_metadata',COALESCE(v_answers->'import_metadata','null'::jsonb));
   IF v_exists AND v_before IS NOT DISTINCT FROM v_after THEN
    v_unchanged:=v_unchanged+1;
   ELSE
    IF v_exists THEN
     UPDATE public.match_round_submissions SET game_type_pref=v_answers->>'game_type_pref',gender_pref=v_answers->>'gender_pref',availability=v_answers->'availability',
      message=v_answers->>'message',import_metadata=NULLIF(v_answers->'import_metadata','null'::jsonb),audit_reason=btrim(p_reason)
      WHERE id=v_submission.id;
     v_updated:=v_updated+1;
    ELSE
     INSERT INTO public.match_round_submissions(round_id,member_id,game_type_pref,gender_pref,availability,message,import_metadata,interest_tags,social_style,custom_answers,config_revision,audit_reason)
      VALUES(p_round_id,v_member_id,v_answers->>'game_type_pref',v_answers->>'gender_pref',v_answers->'availability',v_answers->>'message',NULLIF(v_answers->'import_metadata','null'::jsonb),
       '{}'::text[],NULL,'{}'::jsonb,v_round.config_revision,btrim(p_reason));
     v_inserted:=v_inserted+1;
    END IF;
    v_changed_members:=array_append(v_changed_members,v_member_id);
    SELECT array_agg(k ORDER BY k) INTO v_changed_fields FROM jsonb_object_keys(v_after) k WHERE v_before IS NULL OR v_before->k IS DISTINCT FROM v_after->k;
    -- Existing audit/erasure projection understands this action. The explicit
    -- event names the real initiating admin and commits with the answer write.
    INSERT INTO private.member_profile_audit_log(member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,
     reason,source,actor_user_id,actor_admin_id,actor_name,actor_role_snapshot,request_id,metadata)
    VALUES(v_member_id,v_member_id,'round_submission_import_snapshot','related_match_round_submissions',v_changed_fields,
     jsonb_build_object('submission',v_before-'import_metadata'),jsonb_build_object('submission',v_after-'import_metadata'),btrim(p_reason),'import',
     v_admin_user,p_actor_admin_id,v_admin_name,'super_admin',p_request_id,
     jsonb_build_object('event_scope','round_excel_member_import','round_id',p_round_id,'row_number',(v_row->>'row_number')::integer,
      'file_sha256',p_file_sha256,'operation',CASE WHEN v_exists THEN 'append_update' ELSE 'append_insert' END,'member_created',v_created,'atomic_with_import_write',true));
   END IF;
   IF v_row->>'source'<>'current' THEN v_warnings:=v_warnings+1; END IF;
  END LOOP;
  SELECT COALESCE(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO v_affected FROM (
   SELECT j.id FROM matching_run.jobs j WHERE j.round_id=p_round_id AND cardinality(v_changed_members)>0
   UNION SELECT s.id FROM public.match_sessions s WHERE s.round_id=p_round_id AND cardinality(v_changed_members)>0
    AND NOT EXISTS(SELECT 1 FROM matching_run.jobs j WHERE j.original_session_id=s.id)
  ) affected;
  v_summary:=jsonb_build_object('totalRows',jsonb_array_length(p_rows),'currentCount',v_current,'legacyCount',v_legacy,'tempCount',v_temp,'warningCount',v_warnings,
   'insertedCount',v_inserted,'updatedCount',v_updated,'unchangedCount',v_unchanged,'affectedBatchIds',v_affected);
  UPDATE matching_import.receipts SET status='succeeded',completed_at=clock_timestamp(),error_code=NULL,error_message=NULL,summary=v_summary WHERE id=p_request_id;
 EXCEPTION WHEN OTHERS THEN
  v_error_code:=CASE WHEN SQLERRM IN('IMPORT_PREVIEW_STALE','IMPORT_MEMBER_CHANGED','IMPORT_SUBMISSION_CHANGED','IMPORT_LEGACY_CHANGED','IMPORT_ROW_INVALID','IMPORT_IDENTITY_CONFLICT','IMPORT_ROUND_UNAVAILABLE','IMPORT_REQUIRED_QUESTIONS') THEN SQLERRM ELSE 'IMPORT_WRITE_FAILED' END;
  v_error_message:=CASE v_error_code WHEN 'IMPORT_PREVIEW_STALE' THEN '轮次配置已变化，本次未写入，请重新预览'
   WHEN 'IMPORT_MEMBER_CHANGED' THEN '成员身份或状态已变化，本次未写入，请重新预览'
   WHEN 'IMPORT_LEGACY_CHANGED' THEN '历史资料已变化、不可用或正在处理，本次未写入，请重新预览'
   WHEN 'IMPORT_SUBMISSION_CHANGED' THEN '线上答卷已变化，本次未写入，请重新预览并处理差异'
   WHEN 'IMPORT_IDENTITY_CONFLICT' THEN '成员身份重复或已变化，本次未写入，请重新确认身份'
   WHEN 'IMPORT_ROUND_UNAVAILABLE' THEN '轮次当前不支持导入，本次未写入'
   WHEN 'IMPORT_REQUIRED_QUESTIONS' THEN '本轮有必填补充问题，需要成员自行填写，本次未写入'
   WHEN 'IMPORT_ROW_INVALID' THEN '导入内容不完整或格式错误，本次未写入，请重新预览'
   ELSE '本次导入未写入，请重新预览后重试' END;
  UPDATE matching_import.receipts SET status='failed',completed_at=clock_timestamp(),error_code=v_error_code,error_message=v_error_message,
   summary=jsonb_build_object('totalRows',CASE WHEN jsonb_typeof(p_rows)='array' THEN jsonb_array_length(p_rows) ELSE 0 END,
    'currentCount',0,'legacyCount',0,'tempCount',0,'warningCount',0,'insertedCount',0,'updatedCount',0,'unchangedCount',0,'affectedBatchIds','[]'::jsonb)
   WHERE id=p_request_id;
 END;
 PERFORM set_config('app.member_master_audit_reason',v_previous_reason,true);
 PERFORM set_config('app.member_master_audit_source',v_previous_source,true);
 RETURN matching_import.receipt_metadata(p_request_id);
END;
$function$;

CREATE FUNCTION matching_import.get_receipt(p_request_id uuid,p_round_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM matching_import.require_server_super_admin(p_actor_admin_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-run-job:'||p_round_id::text,0));
 IF EXISTS(SELECT 1 FROM matching_import.receipts WHERE id=p_request_id AND round_id<>p_round_id) THEN
  RAISE EXCEPTION 'IMPORT_REQUEST_REUSED' USING ERRCODE='PT409'; END IF;
 RETURN (SELECT matching_import.receipt_metadata(id) FROM matching_import.receipts WHERE id=p_request_id AND round_id=p_round_id);
END;
$function$;

CREATE FUNCTION matching_import.list_receipts(p_round_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM matching_import.require_server_super_admin(p_actor_admin_id);
 RETURN COALESCE((SELECT jsonb_agg(matching_import.receipt_metadata(id) ORDER BY created_at DESC,id) FROM matching_import.receipts WHERE round_id=p_round_id),'[]'::jsonb);
END;
$function$;

CREATE FUNCTION matching_import.cancel_request(p_request_id uuid,p_round_id uuid,p_actor_admin_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_receipt matching_import.receipts%ROWTYPE;
BEGIN
 PERFORM matching_import.require_server_super_admin(p_actor_admin_id);
 IF p_request_id IS NULL OR p_round_id IS NULL OR char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 4 AND 500 THEN
  RAISE EXCEPTION 'IMPORT_REQUEST_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('matching-run-job:'||p_round_id::text,0));
 SELECT * INTO v_receipt FROM matching_import.receipts WHERE id=p_request_id FOR UPDATE;
 IF v_receipt.id IS NOT NULL THEN
  IF v_receipt.round_id<>p_round_id THEN RAISE EXCEPTION 'IMPORT_REQUEST_REUSED' USING ERRCODE='PT409'; END IF;
  RETURN matching_import.receipt_metadata(p_request_id);
 END IF;
 INSERT INTO matching_import.receipts(id,round_id,actor_admin_id,status,reason,error_code,error_message,summary)
 VALUES(p_request_id,p_round_id,p_actor_admin_id,'failed',btrim(p_reason),'IMPORT_REQUEST_CANCELLED','本编号已终止，未执行导入；请重新预览后使用新编号',
  jsonb_build_object('totalRows',0,'currentCount',0,'legacyCount',0,'tempCount',0,'warningCount',0,'insertedCount',0,'updatedCount',0,'unchangedCount',0,'affectedBatchIds','[]'::jsonb));
 RETURN matching_import.receipt_metadata(p_request_id);
END;
$function$;

CREATE FUNCTION public.admin_preview_round_import_state(p_round_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT matching_import.preview_state(p_round_id,p_actor_admin_id)
$function$;
CREATE FUNCTION public.admin_apply_round_import(p_request_id uuid,p_round_id uuid,p_actor_admin_id uuid,p_request_hash text,p_file_sha256 text,p_reason text,p_expected_round_token text,p_rows jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT matching_import.apply_request(p_request_id,p_round_id,p_actor_admin_id,p_request_hash,p_file_sha256,p_reason,p_expected_round_token,p_rows)
$function$;
CREATE FUNCTION public.admin_get_round_import(p_request_id uuid,p_round_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT matching_import.get_receipt(p_request_id,p_round_id,p_actor_admin_id)
$function$;
CREATE FUNCTION public.admin_list_round_imports(p_round_id uuid,p_actor_admin_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT matching_import.list_receipts(p_round_id,p_actor_admin_id)
$function$;
CREATE FUNCTION public.admin_cancel_round_import_request(p_request_id uuid,p_round_id uuid,p_actor_admin_id uuid,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT matching_import.cancel_request(p_request_id,p_round_id,p_actor_admin_id,p_reason)
$function$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA matching_import FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_preview_round_import_state(uuid,uuid),public.admin_apply_round_import(uuid,uuid,uuid,text,text,text,text,jsonb),
 public.admin_get_round_import(uuid,uuid,uuid),public.admin_list_round_imports(uuid,uuid),public.admin_cancel_round_import_request(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION matching_import.preview_state(uuid,uuid),matching_import.apply_request(uuid,uuid,uuid,text,text,text,text,jsonb),
 matching_import.get_receipt(uuid,uuid,uuid),matching_import.list_receipts(uuid,uuid),matching_import.cancel_request(uuid,uuid,uuid,text),
 public.admin_preview_round_import_state(uuid,uuid),public.admin_apply_round_import(uuid,uuid,uuid,text,text,text,text,jsonb),
 public.admin_get_round_import(uuid,uuid,uuid),public.admin_list_round_imports(uuid,uuid),public.admin_cancel_round_import_request(uuid,uuid,uuid,text) TO service_role;

DO $postflight$
DECLARE v_role text; v_table text; v_function text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['matching_import.receipts','matching_import.identities'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=v_table::regclass) THEN RAISE EXCEPTION 'IMPORT_RLS_POSTFLIGHT_FAILED'; END IF;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(v_role,v_table,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'IMPORT_TABLE_ACL_POSTFLIGHT_FAILED'; END IF;
  END LOOP;
 END LOOP;
 FOREACH v_function IN ARRAY ARRAY[
  'public.admin_preview_round_import_state(uuid,uuid)',
  'public.admin_apply_round_import(uuid,uuid,uuid,text,text,text,text,jsonb)',
  'public.admin_get_round_import(uuid,uuid,uuid)',
  'public.admin_list_round_imports(uuid,uuid)',
  'public.admin_cancel_round_import_request(uuid,uuid,uuid,text)'
 ] LOOP
  IF has_function_privilege('anon',v_function,'EXECUTE') OR has_function_privilege('authenticated',v_function,'EXECUTE')
   OR NOT has_function_privilege('service_role',v_function,'EXECUTE') THEN RAISE EXCEPTION 'IMPORT_RPC_ACL_POSTFLIGHT_FAILED'; END IF;
 END LOOP;
END;
$postflight$;
COMMIT;
