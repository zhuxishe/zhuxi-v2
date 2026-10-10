-- Fixed-time events may collect registrations before or after the event.
-- Confirming the existing attendance roster also records missing registrations.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION private.guard_round_content_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE q jsonb; event_start timestamptz; event_end timestamptz; changed_structure boolean;
BEGIN
  IF NEW.survey_end <= NEW.survey_start OR NEW.activity_end < NEW.activity_start
    OR jsonb_typeof(NEW.content_config) <> 'object' OR octet_length(NEW.content_config::text) > 100000
    OR jsonb_typeof(COALESCE(NEW.content_config->'questions','[]'::jsonb)) <> 'array'
    OR (NEW.purpose <> 'matching' AND NEW.status = 'matched') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_CONFIG_INVALID';
  END IF;
  IF jsonb_array_length(COALESCE(NEW.content_config->'questions','[]'::jsonb)) > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_CONFIG_INVALID';
  END IF;
  FOR q IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.content_config->'questions','[]'::jsonb)) LOOP
    IF COALESCE(q->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$'
      OR q->>'id' IN ('__proto__', 'prototype', 'constructor')
      OR COALESCE(q->>'type','') NOT IN ('single','multi','text')
      OR jsonb_typeof(q->'required') IS DISTINCT FROM 'boolean'
      OR COALESCE(btrim(q #>> '{label,zh}'),'') = ''
      OR jsonb_typeof(q->'options') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_CONFIG_INVALID';
    END IF;
    IF (q->>'type' = 'text' AND jsonb_array_length(q->'options') <> 0)
      OR (q->>'type' <> 'text' AND jsonb_array_length(q->'options') NOT BETWEEN 2 AND 20)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(q->'options') o
        WHERE COALESCE(o->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$' OR o->>'id' IN ('__proto__', 'prototype', 'constructor') OR COALESCE(btrim(o #>> '{label,zh}'),'') = '')
      OR jsonb_array_length(q->'options') <> (SELECT count(DISTINCT o->>'id') FROM jsonb_array_elements(q->'options') o) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_CONFIG_INVALID';
    END IF;
  END LOOP;
  IF jsonb_array_length(COALESCE(NEW.content_config->'questions','[]'::jsonb)) <>
    (SELECT count(DISTINCT configured_question.value->>'id') FROM jsonb_array_elements(COALESCE(NEW.content_config->'questions','[]'::jsonb)) AS configured_question(value)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_CONFIG_INVALID';
  END IF;
  event_start := NULLIF(NEW.content_config->>'eventStart','')::timestamptz;
  event_end := NULLIF(NEW.content_config->>'eventEnd','')::timestamptz;
  IF (event_start IS NULL) <> (event_end IS NULL) OR event_end <= event_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_EVENT_TIME_INVALID';
  END IF;
  IF NEW.purpose = 'registration' AND NEW.status = 'open'
    AND (event_start IS NULL OR COALESCE(btrim(NEW.content_config #>> '{location,zh}'),'') = '') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROUND_EVENT_DETAILS_REQUIRED';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    changed_structure := NEW.purpose IS DISTINCT FROM OLD.purpose
      OR (NEW.purpose <> 'registration' AND (NEW.activity_start IS DISTINCT FROM OLD.activity_start
        OR NEW.activity_end IS DISTINCT FROM OLD.activity_end))
      OR (CASE WHEN NEW.purpose = 'registration' THEN private.round_answer_structure(NEW.content_config) - ARRAY['eventStart','eventEnd']
        ELSE private.round_answer_structure(NEW.content_config) END)
        IS DISTINCT FROM
        (CASE WHEN OLD.purpose = 'registration' THEN private.round_answer_structure(OLD.content_config) - ARRAY['eventStart','eventEnd']
        ELSE private.round_answer_structure(OLD.content_config) END);
    IF changed_structure AND (OLD.status = 'matched'
      OR EXISTS (SELECT 1 FROM public.match_round_submissions WHERE round_id = OLD.id)
      OR EXISTS (SELECT 1 FROM public.match_sessions WHERE round_id = OLD.id)) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ROUND_STRUCTURE_LOCKED';
    END IF;
    IF NEW.content_config IS DISTINCT FROM OLD.content_config OR NEW.purpose IS DISTINCT FROM OLD.purpose
      OR NEW.round_name IS DISTINCT FROM OLD.round_name OR NEW.activity_start IS DISTINCT FROM OLD.activity_start
      OR NEW.activity_end IS DISTINCT FROM OLD.activity_end OR NEW.survey_start IS DISTINCT FROM OLD.survey_start
      OR NEW.survey_end IS DISTINCT FROM OLD.survey_end THEN
      NEW.config_revision := OLD.config_revision + 1;
    ELSE NEW.config_revision := OLD.config_revision;
    END IF;
  ELSE NEW.config_revision := 0;
  END IF;
  RETURN NEW;
END;
$function$;

-- Only this exact roster insertion may bypass the self-service survey window
-- and required answers. The helper has no API grants, and its live admin check
-- prevents a client-controlled setting from authorizing an ordinary player.
CREATE OR REPLACE FUNCTION private.round_roster_signup_authorized(p_round_id uuid,p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT current_setting('app.round_roster_signup',true) = p_round_id::text || ':' || p_member_id::text
    AND EXISTS (SELECT 1 FROM public.match_rounds WHERE id=p_round_id AND purpose='registration' AND deleted_at IS NULL)
    AND EXISTS (SELECT 1 FROM private.round_peer_review_participants WHERE round_id=p_round_id AND member_id=p_member_id AND included)
    AND private.peer_member_eligible(p_round_id,p_member_id)
    AND (
      ((SELECT auth.uid()) IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.admin_users WHERE id=private.member_master_current_admin_id() AND role IN ('admin','super_admin'))
        AND NOT EXISTS (SELECT 1 FROM public.members WHERE user_id=(SELECT auth.uid())
          AND (account_status IS DISTINCT FROM 'active' OR anonymized_at IS NOT NULL)))
      OR ((SELECT auth.uid()) IS NULL AND pg_catalog.pg_has_role(session_user,'postgres','MEMBER')
        AND current_setting('app.round_roster_signup_backfill',true) = 'on')
    )
$function$;
REVOKE ALL ON FUNCTION private.round_roster_signup_authorized(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve deployed lifecycle/soft-deletion guards rather than replacing their
-- full implementations. Fail clearly if the expected baseline has changed.
DO $migration$
DECLARE definition text; original text; replacement text;
BEGIN
  definition := pg_get_functiondef('private.member_master_guard_round_submission_write()'::regprocedure);
  original := $fragment$  v_round public.match_rounds%ROWTYPE;$fragment$;
  replacement := $fragment$  v_roster_signup boolean := TG_OP = 'INSERT' AND private.round_roster_signup_authorized(NEW.round_id,NEW.member_id);
  v_round public.match_rounds%ROWTYPE;$fragment$;
  IF position(original IN definition)=0 OR position('v_round.deleted_at IS NOT NULL' IN definition)=0 THEN
    RAISE EXCEPTION 'ROSTER_SIGNUP_SUBMISSION_BASELINE_MISMATCH';
  END IF;
  definition := replace(definition,original,replacement);
  original := $fragment$  SELECT * INTO v_round FROM public.match_rounds WHERE id = NEW.round_id FOR SHARE;$fragment$;
  replacement := $fragment$  v_is_privileged := v_is_privileged OR COALESCE(v_roster_signup,false);
  SELECT * INTO v_round FROM public.match_rounds WHERE id = NEW.round_id FOR SHARE;$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_SIGNUP_SUBMISSION_BASELINE_MISMATCH'; END IF;
  definition := replace(definition,original,replacement);
  original := $fragment$  ELSE
    PERFORM private.validate_round_custom_answers(v_round.content_config, NEW.custom_answers);$fragment$;
  replacement := $fragment$  ELSIF v_roster_signup THEN
    -- Staff confirms attendance, not answers the member never supplied.
    IF NEW.custom_answers IS DISTINCT FROM '{}'::jsonb THEN
      RAISE EXCEPTION 'ROUND_REGISTRATION_PAYLOAD_INVALID' USING ERRCODE='22023';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND v_round.purpose = 'registration'
    AND OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL
    AND current_setting('app.registration_transition',true) = OLD.id::text || ':cancel'
    AND NEW.custom_answers IS NOT DISTINCT FROM OLD.custom_answers THEN
    -- A cancellation needs no answers the attendee never supplied. The
    -- cancellation trigger still enforces ownership, window and unchanged data.
    NULL;
  ELSE
    PERFORM private.validate_round_custom_answers(v_round.content_config, NEW.custom_answers);$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_SIGNUP_ANSWERS_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition,original,replacement);

  definition := pg_get_functiondef('private.guard_registration_cancellation()'::regprocedure);
  original := $fragment$BEGIN
  -- Trigger privileges permit locking a readable round without granting players admin UPDATE rights.$fragment$;
  replacement := $fragment$BEGIN
  v_privileged := v_privileged OR (TG_OP = 'INSERT' AND COALESCE(private.round_roster_signup_authorized(NEW.round_id,NEW.member_id),false));
  -- Trigger privileges permit locking a readable round without granting players admin UPDATE rights.$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_SIGNUP_CANCELLATION_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition,original,replacement);

  definition := pg_get_functiondef('private.notify_round_submission()'::regprocedure);
  original := $fragment$  -- Only the authenticated member's own submission creates a personal receipt.
  -- Administrative imports and historical backfills must not send new notices.
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS ($fragment$;
  replacement := $fragment$  -- Self-service and explicit attendance registration use the same receipt.
  -- Historical reconciliation and other administrative imports stay silent.
  IF NOT (COALESCE(private.round_roster_signup_authorized(NEW.round_id,NEW.member_id),false)
    AND current_setting('app.round_roster_signup_notify',true) = 'on')
    AND ((SELECT auth.uid()) IS NULL OR NOT EXISTS ($fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_SIGNUP_NOTIFICATION_BASELINE_MISMATCH'; END IF;
  definition := replace(definition,original,replacement);
  original := $fragment$      AND member.anonymized_at IS NULL
  ) THEN$fragment$;
  replacement := $fragment$      AND member.anonymized_at IS NULL
  )) THEN$fragment$;
  IF position(original IN definition)=0 THEN RAISE EXCEPTION 'ROSTER_SIGNUP_NOTIFICATION_BASELINE_MISMATCH'; END IF;
  EXECUTE replace(definition,original,replacement);
END;
$migration$;

CREATE OR REPLACE FUNCTION private.insert_round_roster_registration(p_round_id uuid,p_member_id uuid,p_reason text,p_notify boolean)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE
  v_previous_signup text := COALESCE(current_setting('app.round_roster_signup',true),'');
  v_previous_notify text := COALESCE(current_setting('app.round_roster_signup_notify',true),'');
  v_previous_self_service text := COALESCE(current_setting('app.member_master_submission_self_service',true),'');
  v_previous_reason text := COALESCE(current_setting('app.member_master_audit_reason',true),'');
BEGIN
  -- An existing registration, including a cancelled one, is never overwritten.
  IF EXISTS (SELECT 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=p_member_id) THEN RETURN; END IF;
  PERFORM private.peer_require_reason(p_reason);
  PERFORM set_config('app.round_roster_signup',p_round_id::text || ':' || p_member_id::text,true);
  IF NOT COALESCE(private.round_roster_signup_authorized(p_round_id,p_member_id),false) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.round_roster_signup_notify',CASE WHEN p_notify THEN 'on' ELSE 'off' END,true);
  PERFORM set_config('app.member_master_submission_self_service','off',true);
  PERFORM set_config('app.member_master_audit_reason',btrim(p_reason),true);
  INSERT INTO public.match_round_submissions
    (round_id,member_id,game_type_pref,gender_pref,availability,custom_answers,config_revision,audit_reason)
    SELECT p_round_id,p_member_id,'都可以','都可以','{}'::jsonb,'{}'::jsonb,config_revision,btrim(p_reason)
    FROM public.match_rounds WHERE id=p_round_id AND purpose='registration' AND deleted_at IS NULL
    ON CONFLICT(round_id,member_id) DO NOTHING;
  PERFORM set_config('app.round_roster_signup',v_previous_signup,true);
  PERFORM set_config('app.round_roster_signup_notify',v_previous_notify,true);
  PERFORM set_config('app.member_master_submission_self_service',v_previous_self_service,true);
  PERFORM set_config('app.member_master_audit_reason',v_previous_reason,true);
END;
$function$;
REVOKE ALL ON FUNCTION private.insert_round_roster_registration(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_confirm_round_peer_review_roster(p_round_id uuid,p_member_ids uuid[],p_expected_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_admin uuid:=private.peer_current_admin(); v_setting private.round_peer_review_settings;
  v_before jsonb; v_after jsonb; v_review record; v_member uuid; v_round public.match_rounds%ROWTYPE;
BEGIN
  PERFORM private.peer_lock_admin();
  PERFORM private.peer_require_reason(p_reason);
  IF p_member_ids IS NULL OR cardinality(p_member_ids)<2 OR cardinality(p_member_ids)>2000
    OR array_position(p_member_ids,NULL) IS NOT NULL OR cardinality(p_member_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_member_ids) x) THEN
    RAISE EXCEPTION 'PEER_ROSTER_REQUIRED' USING ERRCODE='22023'; END IF;
  -- Include currently confirmed members being removed, so lifecycle erasure
  -- cannot finish its audit scrub before this roster revision is recorded.
  PERFORM 1 FROM public.members m WHERE m.id=ANY(p_member_ids) OR EXISTS (
    SELECT 1 FROM private.round_peer_review_participants p
    WHERE p.round_id=p_round_id AND p.member_id=m.id AND p.included
  ) ORDER BY m.id FOR SHARE;
  -- Use the same per-member key as self-service before reading submissions.
  -- This avoids racing a player create/cancel while inserting missing rows.
  FOR v_member IN SELECT x FROM unnest(p_member_ids) x ORDER BY x LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('registration:' || p_round_id::text || ':' || v_member::text, 0));
  END LOOP;
  PERFORM 1 FROM public.match_round_submissions WHERE round_id=p_round_id AND member_id=ANY(p_member_ids) ORDER BY member_id FOR SHARE;
  -- Submission triggers lock the round. Acquire it before settings so this
  -- transaction uses the same round/settings order as soft deletion.
  SELECT * INTO v_round FROM public.match_rounds WHERE id=p_round_id AND deleted_at IS NULL AND purpose<>'announcement' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_member_ids) x WHERE NOT private.peer_member_eligible(p_round_id,x)) THEN
    RAISE EXCEPTION 'PEER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_setting FROM private.round_peer_review_settings WHERE round_id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEER_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF p_expected_version IS NULL OR v_setting.version<>p_expected_version THEN RAISE EXCEPTION 'PEER_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.member_id),'[]'::jsonb) INTO v_before FROM private.round_peer_review_participants p WHERE round_id=p_round_id;
  UPDATE private.round_peer_review_participants SET included=false,updated_at=clock_timestamp() WHERE round_id=p_round_id AND NOT(member_id=ANY(p_member_ids));
  INSERT INTO private.round_peer_review_participants(round_id,member_id,included,source)
  SELECT p_round_id,x,true,CASE WHEN EXISTS(SELECT 1 FROM public.match_round_submissions s WHERE s.round_id=p_round_id AND s.member_id=x AND s.cancelled_at IS NULL) THEN 'registered' ELSE 'manual' END
    FROM unnest(p_member_ids) x
  ON CONFLICT(round_id,member_id) DO UPDATE SET included=true,updated_at=clock_timestamp();
  IF v_round.purpose = 'registration' THEN
    FOR v_member IN SELECT x FROM unnest(p_member_ids) x ORDER BY x LOOP
      PERFORM private.insert_round_roster_registration(p_round_id,v_member,p_reason,true);
    END LOOP;
  END IF;
  -- Removal keeps every original record but explicitly invalidates its score.
  FOR v_review IN SELECT * FROM private.round_peer_reviews WHERE round_id=p_round_id AND valid
    AND (NOT(reviewer_id=ANY(p_member_ids)) OR NOT(reviewee_id=ANY(p_member_ids))) FOR UPDATE
  LOOP
    UPDATE private.round_peer_reviews SET valid=false,version=version+1,updated_at=clock_timestamp() WHERE id=v_review.id;
    INSERT INTO private.round_peer_review_audit(round_id,action,subject_id,actor_admin_id,reason,before_values,after_values)
      VALUES(p_round_id,'review_invalidated_roster',v_review.id,v_admin,btrim(p_reason),to_jsonb(v_review),jsonb_build_object('valid',false,'version',v_review.version+1));
  END LOOP;
  UPDATE private.round_peer_review_settings SET roster_confirmed=true,version=version+1,updated_at=clock_timestamp(),
    opened_at=private.peer_effective_opened_at(v_setting) WHERE round_id=p_round_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.member_id),'[]'::jsonb) INTO v_after FROM private.round_peer_review_participants p WHERE round_id=p_round_id;
  INSERT INTO private.round_peer_review_audit(round_id,action,actor_admin_id,reason,before_values,after_values)
    VALUES(p_round_id,'roster_confirmed',v_admin,btrim(p_reason),jsonb_build_object('participants',v_before),jsonb_build_object('participants',v_after));
  RETURN private.peer_settings_json(p_round_id);
END;
$function$;

-- Supabase CLI uses a NOINHERIT login with membership in postgres, then SET ROLE.
-- Check the login membership rather than its temporary name or inherited privileges.
-- Reconcile only the live confirmed manual roster. Never restore cancellations,
-- removed people, inactive accounts or deleted events, and never invent answers.
DO $backfill$
DECLARE person record;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL OR NOT pg_catalog.pg_has_role(session_user,'postgres','MEMBER') THEN
    RAISE EXCEPTION 'ROSTER_SIGNUP_BACKFILL_OWNER_REQUIRED';
  END IF;
  PERFORM set_config('app.round_roster_signup_backfill','on',true);
  FOR person IN
    SELECT p.round_id,p.member_id FROM private.round_peer_review_participants p
    JOIN private.round_peer_review_settings s ON s.round_id=p.round_id AND s.roster_confirmed
    JOIN public.match_rounds r ON r.id=p.round_id AND r.purpose='registration' AND r.deleted_at IS NULL
    JOIN public.members m ON m.id=p.member_id
    WHERE p.included AND p.source='manual' AND private.peer_member_eligible(p.round_id,p.member_id)
      AND NOT EXISTS (SELECT 1 FROM public.match_round_submissions old WHERE old.round_id=p.round_id AND old.member_id=p.member_id)
    ORDER BY p.round_id,p.member_id
    FOR SHARE OF m,r,s,p
  LOOP
    PERFORM private.insert_round_roster_registration(person.round_id,person.member_id,'Reconcile confirmed attendance registration',false);
  END LOOP;
  PERFORM set_config('app.round_roster_signup_backfill','',true);
END;
$backfill$;

-- Retain the existing authenticated RPC grant; private helpers are not APIs.
REVOKE ALL ON FUNCTION public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_confirm_round_peer_review_roster(uuid,uuid[],integer,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
